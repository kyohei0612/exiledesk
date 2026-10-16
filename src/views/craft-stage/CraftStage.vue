<!--
  CraftStage.vue — クラフトステージ (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)

  オーナー:「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」「クラフトステージでいこう」
  「操作は Craft of Exile 仕様 (カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用)」。
  4 つの枠: アイテム枠 ([[StageItemCard.vue]]) / カレンシー棚 ([[CurrencyShelf.vue]]) / 直前の変化 / 工程履歴 ([[StageHistory.vue]])。
  持っている間はカーソルにアイコンが付く。Esc / 右クリックで手放す。R (Ctrl+Z も) で 1 手戻す。
  再生モード: URL の ?stage-plan=<手順 JSON>&step=N で、その手まで進めた状態 (POE2Tube の撮影用)。
  状態と操作は [[craft-stage.ts]]、1 手の中身は services/craft-stage (計算機と同じ規則)。
-->
<script setup lang="ts">
import { useFlash } from "../../utils/use-flash";
import { preloadSfx, setSfxOff, sfxOff } from "../../utils/sfx";
import { scrollToTop } from "../../utils/keep-place";
import { baseNameOf, tr } from "../../i18n/lang";
import { forceKey } from "../../services/craft-stage/apply-force";
import { unsocketKey } from "../../services/craft-stage/stage-runes";
import { LOG_KEEP, SIM_LOCKED } from "../../state/craft-stage";
import StageRecipeStart from "./StageRecipeStart.vue";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { toCss } from "../../utils/zoom";
import StagePhoneBar from "./StagePhoneBar.vue";
import StageSettings from "./StageSettings.vue";
import { useStageBase } from "./use-stage-base";
import StageItemCard from "./StageItemCard.vue";
import StageQualityBar from "./StageQualityBar.vue";
import StageItemMini from "./StageItemMini.vue";
import StageAimPanel from "./StageAimPanel.vue";
import { SPAM_KEYS } from "../../services/craft-stage/chaos-spam";
import { spamAims, spamKey, spamPending } from "../../state/chaos-spam";
import StageChaosSpam from "./StageChaosSpam.vue";
import StageAimPicker from "./StageAimPicker.vue";
import CurrencyShelf from "./CurrencyShelf.vue";
import StageHistory from "./StageHistory.vue";
import RevealPanel from "./RevealPanel.vue";
import { useStageFx } from "./use-stage-fx";
import VideoStage from "./VideoStage.vue";
import StageModList from "./StageModList.vue";
import StageSimPanel from "./StageSimPanel.vue";
import StageTutorial from "./StageTutorial.vue";
import VideoExtra from "./VideoExtra.vue";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { isRune, runeNameOf, RUNE_PREFIX } from "../../services/craft-stage/stage-runes";
import { catalystSetKey, IMPLICIT_SET, implicitSetKey, isCatalystSet, isQualitySet, kindOf, QUALITY_CAP, qualityCapKey, qualitySetKey, whittleTargets } from "../../services/craft-stage/apply-currency";
import { OMEN_FOR } from "../../services/craft-stage/omens";
import ShelfButton from "./ShelfButton.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import ModalShell from "../../components/ui/ModalShell.vue";
import Icon from "../../components/ui/Icon.vue";
import { encodeShare, SHARE_ENABLED, shareUrl, xIntentUrl } from "../../services/craft-stage/share";
import { openExternal } from "../../services/trade2/open-external";
import { track } from "../../utils/track";
import type { StageMod } from "../../services/craft-stage/types";

const s = craftStage;
/** ルーンを持ってルーンの入ったソケットを押した: そのソケットを置き換える手 (`rune:<名前>@<n>`)。ルーン以外はアイテムを押したのと同じ */
function useAtSocket(n: number): void {
  const k = s.held.value;
  if (k && isRune(k)) s.use(`${RUNE_PREFIX}${runeNameOf(k)}@${n}`);
  else s.use();
}
onMounted(() => void s.init());
// 使った時の音を先に読んでおく (初めて使うカレンシーで遅れないように)
onMounted(preloadSfx);
/** 読めなかった時の「もう一度」 */
function retryInit(): void { s.error.value = null; void s.init(); }

/**
 * ジュエルはアイテムレベルの欄を出さない (2026-10-12 オーナー「ジュエルにアイテムレベルって意味あるんか、なかったら表示しなくていい」:
 * MOD は全部レベル 1・重みは全部同じで、付く物はアイテムレベルで変わらない)。カレンシー・骨の制限も掛けない (apply-currency の noIlvl)
 */

/** 持っているカレンシーのアイコンをカーソルに付ける */
const mouse = ref({ x: 0, y: 0 });
// マウスの位置は拡大前の CSS ピクセルに直して持つ (fixed の left/top に入れるため)。1660 幅より広い窓 (全画面 1920 で zoom 1.157) で
// カーソルに付く絵と波紋が右下にずれていた (2026-10-08 POE2Tube 要望 ㊳。clientX は実ピクセル、fixed の left は CSS ピクセル)
const onMove = (e: MouseEvent) => (mouse.value = { x: toCss(e.clientX), y: toCss(e.clientY) });
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") s.hold(null);
  // ジェムコラプトを開いている時は、隠れているエミュレーターの手 (R で 1 手戻す・Tab で MOD 一覧) を動かさない
  if (gemCorrupt.value) return;
  // シミュレーションの時は StageSimPanel.vue が「1 つ戻す」に使う
  // 入力欄の中 (MOD 一覧・ベースの検索) と窓を開いている時は、文字の取り消しや窓の物に任せる (2026-10-10 点検: 文字ではなく 1 手戻っていた)
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
  const dialog = !!document.querySelector("[role=dialog], [aria-modal=true]");
  // MOD 一覧の窓: Tab でいつでも開け閉め (2026-10-11 オーナー)。Esc は ModalShell が窓だけ閉じる (持っている物は離さない)
  const otherDialog = document.querySelectorAll("[role=dialog], [aria-modal=true]").length > (s.modOverlay.value ? 1 : 0);
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey && !typing && !otherDialog && s.item.value && (s.mode.value === "hand" || s.replay.value) && !phone.value) { e.preventDefault(); s.modOverlay.value = !s.modOverlay.value; return; }
  // 1 手戻す: R (2026-10-11 オーナー「Ctrl+Z はデフォルトみたいな存在だから R でいい」)。Ctrl+Z も残す
  const undoKey = (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z");
  if (undoKey && !e.repeat && !typing && !dialog && (s.mode.value === "hand" || s.replay.value)) { e.preventDefault(); s.undo(); }
}
onMounted(() => { window.addEventListener("mousemove", onMove); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { window.removeEventListener("mousemove", onMove); window.removeEventListener("keydown", onKey); s.hold(null); });
function hold(k: string): void {
  s.hold(s.held.value === k ? null : k);
}
/**
 * 持っているカレンシーに掛けられるお告げ (オーナー 2026-10-04「オーブ使う時、下に使えるお告げを出して、持ったまま使えるように」)。
 * 押すと持ったまま掛ける / 外す (お告げのタブに切り替えなくてよい)
 */
/**
 * 骨 (冒涜) を持った時は、後の発現で使うアビスの反響も並べる (2026-10-05 オーナー「アビス系だけど、骨持った瞬間に反響のお告げも
 * ON にできるように下に表示しないと」)。掛けるだけで、使われるのは発現の手 (OMEN_FOR の決まりは変えない)
 */
const heldOmens = computed(() => {
  if (!s.held.value) return [];
  const kind = kindOf(s.held.value);
  return [...(OMEN_FOR[kind] ?? []), ...(kind === "desecrate" ? OMEN_FOR.reveal ?? [] : [])];
});
/** 削減のお告げを掛けてカオスを持っている時に消える候補 (ゲームと同じく打つ前に色を付ける、オーナー 2026-10-04) */
const doomed = computed(() => {
  const it = s.item.value;
  if (!it || !s.held.value || kindOf(s.held.value) !== "chaos" || it.rarity !== "rare" || !s.omens.value.includes("OmenofWhittling")) return [];
  const o = s.omens.value;
  return whittleTargets(it, o.includes("OmenofSinistralErasure") ? "prefix" : o.includes("OmenofDextralErasure") ? "suffix" : null).map((m) => m.modId);
});
/** 打った瞬間の演出 (波紋・枠の光・「レアに!」など) */
const fx = useStageFx(mouse);
const fxCls = computed(() => (fx.value ? { hit: "stage-hit", up: "stage-up", shake: "stage-shake" }[fx.value.kind] : ""));
/** 付いた / 消えた MOD を光らせ直すための番号 (手ごとに変わる) */
const flashKey = computed(() => s.log.value[s.log.value.length - 1]?.out.index ?? 0);

/** 共有の URL を作れなかった時の知らせ */
const copyNote = useFlash();
/**
 * 手順の共有 (2026-10-12)。手順を全部 URL の # に縮めて入れる (サーバー・KV は使わない、[[share.ts]])。
 * 押すと URL をコピーして、X に投稿するボタンも出す。最初のカレンシーの後に手で MOD を足していたら押せない (理由を出す)
 */
const shareOpen = ref<{ url: string; copied: boolean } | null>(null);
async function openShare(): Promise<void> {
  if (s.shareWhy.value) return;
  try {
    const url = shareUrl(await encodeShare(s.sharePlan()), inApp);
    let ok = true;
    try { await navigator.clipboard.writeText(url); } catch { ok = false; }
    shareOpen.value = { url, copied: ok };
    track("share:copy");
  } catch {
    copyNote.flash(tr("共有の URL を作れませんでした", "Couldn't make the share URL"));
  }
}
async function copyShare(): Promise<void> {
  const o = shareOpen.value;
  if (!o) return;
  try { await navigator.clipboard.writeText(o.url); o.copied = true; } catch { o.copied = false; }
}
function postToX(e: MouseEvent, url: string): void {
  if (!inApp) return;
  e.preventDefault();
  void openExternal(xIntentUrl(url));
}
watch(() => s.log.value, () => { shareOpen.value = null; });
/** シミュレーションでまだベースを選んでいない (ベース選びだけを出す) */
/**
 * シミュレーションは開くたびにまっさら (ベースを選ぶ所) から。前回閉じた途中は戻さない
 * (2026-10-08 オーナー「前回閉じたクラフトの名残が残るから毎回リセットでおｋ」。途中は writeSimSession で要望・バグの添付にだけ残す。レシピは別に残る)
 */
/** 道具の帯のボタン (ゲームの 3 枚ボタン、src/styles/game-ui.css) */
const btn = "g-btn sm";
/** カオス (普通・上級・完全) を持っているか (アイテムの下の「カオススパム確率機へ」) */
const heldChaos = computed(() => !s.replay.value && !!s.held.value && (SPAM_KEYS as readonly string[]).includes(s.held.value));
/** 狙いがまだ無ければ MOD を選ぶ窓から。あればカオススパムの欄へ */
function openChaosSpam(): void {
  spamKey.value = s.held.value;
  spamPending.value = true;
  // 手に持っている物は離す (スマホの「使う」の帯と、カオススパムの帯がぶつからないように。2026-10-16 オーナー)
  s.hold(null);
  // 「次の手で狙う」は閉じる (確率機と狙うは別ルート、同時には出さない。2026-10-16 オーナー「狙いボタンを押さない限り出なければおけ、逆もまた然り」)
  s.aims.value = [];
  // 狙いがあれば欄を真ん中へ (StageChaosSpam の arrive が spamPending を見て送る)
  if (!spamAims.value.length) s.aimPicker.value = { seed: null, spam: true };
}
// 選ぶ窓を狙い無しで閉じた時は、送る予約を消す
watch(() => s.aimPicker.value, (v, old) => { if (!v && old?.spam && !spamAims.value.length) { spamPending.value = false; spamKey.value = null; } });
// 狙いが空になったら確率機の印も外す (狙いの欄の × で閉じた後、普段の「狙う」が確率機の形で開いていた。2026-10-16)
watch(() => spamAims.value.length, (n) => { if (!n && !s.aimPicker.value) spamKey.value = null; });
/**
 * スマホ (幅 768 CSS px 未満): 棚からアイテムまで縦に遠いので、何か持っている間は画面の下に「持っている物 → アイテムに使う」の帯を出す
 * (2026-10-08 オーナー「タップして使う時はアイテムに再度付けるような動作で。押した瞬間付けるだとお告げが使えない」。お告げは掛けてから「アイテムに使う」)
 */
const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
const onResize = (): void => { phone.value = window.innerWidth < 768; };
/** アイテムのカードが画面に見えているか (スマホで外に出たら StageItemMini を上に貼る) */
const cardEl = ref<HTMLElement | null>(null);
const cardOnScreen = ref(true);
let cardIo: IntersectionObserver | null = null;
watch(cardEl, (el) => {
  cardIo?.disconnect();
  if (!el || typeof IntersectionObserver === "undefined") { cardOnScreen.value = true; return; }
  cardIo = new IntersectionObserver(([e]) => { cardOnScreen.value = !!e?.isIntersecting; }, { threshold: 0.25 });
  cardIo.observe(el);
});
onBeforeUnmount(() => cardIo?.disconnect());
onMounted(() => window.addEventListener("resize", onResize));
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
/**
 * アイテムの MOD を右クリックでフラクチャー (今の段のまま固定。2026-10-09 オーナー「MOD 右クリックでフラクチャー化させてあげてもいいかも」)。
 * MOD 一覧の「フラクチャー」と同じ手 (レアだけ・1 つまで。打てない時は理由が出る)
 */
/** 品質の欄: 続けて押した分は 1 手にまとめる (前の手も品質の手なら戻してから) */
function setQuality(n: number, tag?: string): void {
  // 種類は戻す前に読む (前の手が種類を付けた手なら、戻すと消える)
  const keep = tag ?? s.item.value?.qualityTag ?? null;
  const last = s.log.value[s.log.value.length - 1];
  if (last && isQualitySet(last.out.currency)) s.undo();
  s.use(qualitySetKey(n, keep));
}
/** カタリストの品質の欄 (ベースの品質とは別に持つグラスピングメイル)。続けて押した分は 1 手にまとめる (品質と同じ) */
function setCatalyst(n: number, tag: string): void {
  const last = s.log.value[s.log.value.length - 1];
  if (last && isCatalystSet(last.out.currency)) s.undo();
  s.use(catalystSetKey(n, tag));
}
/** 暗黙の値を手で上下 (カードの ▲▼)。同じ行を続けて変えた分は 1 手にまとめる (品質と同じ) */
function setImplicit(line: number, values: number[]): void {
  const last = s.log.value[s.log.value.length - 1];
  if (last && last.out.currency.startsWith(`${IMPLICIT_SET}${line}:`)) s.undo();
  s.use(implicitSetKey(line, values));
}
/** 品質の上限 (プルダウン)。続けて変えた分は 1 手にまとめる */
function setQualityCap(n: number): void {
  const last = s.log.value[s.log.value.length - 1];
  if (last && last.out.currency.startsWith(QUALITY_CAP)) s.undo();
  s.use(qualityCapKey(n));
}
/** MOD 一覧を重ねて開く (飛ばない。2026-10-11 オーナー「ジャンプしなくていいから MOD 一覧が全て画面に出て」) */
function toModList(): void { s.modOverlay.value = true; }
watch(() => s.item.value, (it) => { if (!it) s.modOverlay.value = false; });
function fractureMod(m: StageMod): void {
  const n = s.data.value?.mods.get(m.modId)?.tiers.length ?? 0;
  s.use(forceKey(m.modId, n ? `T${n - m.tierIndex}` : null, "f"));
}
/** 発現の候補が出ている時: 帯を「発現する MOD を選ぶ ↑」にしてパネルへ送る (骨 → 発現の流れ。2026-10-08 レビュー A3) */
function scrollToReveal(): void { scrollToTop(document.querySelector("[data-reveal-panel]"), "smooth", "center"); }
/**
 * 手で打つ画面の今のアイテムをそのままシミュレーションの始めの状態に (2026-10-08 オーナー「その MOD が付いた状態以降を確認したい時があるから、
 * 手打ちからそのまま持っていくコース」)。ベース・アイテムレベルは同じ、ベース代の既定は 手打ちの累計 + 白ベース代
 */
/** アプリ版だけ (Web 版は POE2Tube 用の JSON・動画モードを出さない) */
const inApp = isTauriRuntime();
// ベースを選んだか・選ぶ (設定の欄と共通、use-stage-base.ts)
const { handNoBase, simNoBase, preRecipeOpen, startFromRecipe } = useStageBase();
/** モードのタブ。Web はシミュレーターを作っている途中なのでタブごと出さない (2026-10-16 オーナー「まだシミュレーター開発してないから出さなくておけ、エミュレーターと掲示板のみ」) */
const MODE_TABS = SIM_LOCKED ? ([["hand", "エミュレーター"]] as const) : ([["hand", "エミュレーター"], ["sim", "シミュレーター"]] as const);
/**
 * ジェムコラプト (Web 版だけ、2026-10-16 ロードマップの土台)。エミュレーター・シミュレーターのタブの並びに置く。開いた時に読む。
 * 計算はアプリのヴァールの天秤と同じ関数 (views/gem-corrupt/model.ts)、入力は売値 3 つの手入力
 */
const GemCorruptWebPanel = defineAsyncComponent(() => import("../gem-corrupt/GemCorruptWebPanel.vue"));
const gemCorruptOn = ref(false);
/** 本番には出さない (2026-10-16 オーナー「ジェムコラプトは内緒」)。開発版 (pnpm dev:web) だけタブを出す */
const GEM_CORRUPT_SHOWN = import.meta.env.DEV;
const gemCorrupt = computed(() => GEM_CORRUPT_SHOWN && !inApp && gemCorruptOn.value && !s.replay.value);
function setGemCorrupt(v: boolean): void { if (v && !gemCorruptOn.value) track("mode:gem-corrupt"); gemCorruptOn.value = v; }
</script>

<template>
  <!-- スクロールバーの分の幅は常に取っておく (出たり消えたりで横幅が変わり、ぎりぎりの高さでベースの並びが組み直されて跳んだ。2026-10-10 オーナー) -->
  <div data-stage-root class="h-full overflow-auto p-4 @container [scrollbar-gutter:stable]" :class="phone && s.mode.value === 'hand' && (s.held.value || s.offers.value) ? (heldChaos && !s.offers.value ? 'pb-44' : 'pb-32') : phone && spamKey ? 'pb-48' : ''" @contextmenu.prevent="s.hold(null)">
    <!-- スマホ: 持っている物の帯 (画面の下に固定)。アイテムに使う / 離す (StagePhoneBar.vue) -->
    <StagePhoneBar v-if="phone && s.mode.value === 'hand' && (s.held.value || s.offers.value) && !s.replay.value && !gemCorrupt" :held-chaos="heldChaos" @open-chaos-spam="openChaosSpam" @scroll-to-reveal="scrollToReveal" />
    <div class="mb-3 flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1" data-rec-part="title">
        <!-- 画面名は他の画面と同じ窓の題の帯 (TabBar の .g-tabbar) -->
        <h1 class="g-tabbar g-brush flex items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("クラフトステージ", "Craft Stage") }}</h1>
        <p v-if="gemCorrupt" class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("ジェムをコラプトして レベル 21 · 品質 23% を狙う時の収支。売値 3 つを入れるだけ (素材はカレンシーの相場)", "Profit of corrupting a gem for level 21 / 23% quality. Just enter 3 sell prices (materials use currency market prices)") }}</p>
        <p v-else-if="s.mode.value === 'sim' && !s.replay.value" class="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("ベースと狙う MOD を決めて打ち方を組み、何百人分も作って 1 個あたりの費用を出す", "Pick a base and target mods, plan the steps, then craft hundreds of copies to get the cost per item") }}
          <HelpTip :title="tr('シミュレーター', 'Simulator')" :width="320">
            <p>{{ tr("1 ベース → 2 狙う MOD → 始め方と順番 → 打ち方 (パターン) の順に決めて「回す」。", "Set 1 Base → 2 Target mods → start and order → steps (pattern), then press “Run”.") }}</p>
            <p class="mt-1 text-[var(--exile-color-text-secondary)]">{{ tr("確率はクラフト計算機と同じ規則。値段は今の相場。", "Chances follow the craft calculator's rules. Prices are current market prices.") }}</p>
          </HelpTip>
        </p>
        <p v-else-if="s.mode.value === 'tutorial' && !s.replay.value" class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("見本のクラフトを 1 手ずつ、次に打つ物を選んで進めます", "Walk through a sample craft, choosing what to use at each step") }}</p>
        <p v-else class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("カレンシー・骨・エッセンスを押して持ち、アイテムを押すと 1 回使います (持ったまま連打できます)。お告げは持っている物の下に出るので、押して掛けます。確率はクラフト計算機と同じ規則です。", "Click a currency, Abyssal Bone or essence to hold it, then click the item to use it once (keep clicking while holding). Omens for it appear below the held item; click to apply. Chances follow the craft calculator's rules.") }}</p>
      </div>
      <!-- シミュレーションの時はシミュレーションだけの表示通貨 (タブの行の右端) を使う -->
      <!-- スマホは縦に積む (横に並べると題が 2 行に折れる) -->
      <div v-show="!gemCorrupt" class="flex shrink-0 items-center gap-2 max-md:flex-col-reverse max-md:items-end">
        <!-- 使った時の音のオン / オフ (2026-10-16 ゲームと同じ音。端末に覚える) -->
        <button v-show="s.mode.value === 'hand' && !s.replay.value" type="button" data-sfx-toggle class="g-btn sm shrink-0 !px-1 max-md:min-h-10" :aria-pressed="!sfxOff" :aria-label="sfxOff ? tr('使った時の音を出す', 'Turn use sounds on') : tr('使った時の音を消す', 'Turn use sounds off')" :title="sfxOff ? tr('使った時の音を出す', 'Turn use sounds on') : tr('使った時の音を消す', 'Turn use sounds off')" @click="setSfxOff(!sfxOff)"><Icon :name="sfxOff ? 'volume-x' : 'volume'" class="size-4" :class="sfxOff ? 'opacity-50' : ''" /></button>
        <CurrencyPicker v-show="s.mode.value === 'hand' || !!s.replay.value" data-rec-part="display-currency" />
      </div>
    </div>

    <!-- 手で打つ / シミュレーション (2026-10-05、実験。オーナー「ステージにもう 1 個タブ作ってやってみるか」) -->
    <!-- 再生中も消さずに隠す (シミュレーションの「1 つ戻す」の置き場 #sim-tools を残す) -->
    <div v-show="!s.replay.value" data-rec-part="tabs" class="mb-4 flex flex-wrap items-center gap-1.5">
      <!-- スマホは 2 つで横幅を分ける (170px ずつだと 375px の画面からはみ出した。2026-10-13) -->
      <div class="inline-flex gap-1 max-md:flex max-md:w-full" role="tablist">
        <button v-for="t in MODE_TABS" :key="t[0]" type="button" role="tab" :aria-selected="s.mode.value === t[0] && !gemCorrupt" class="g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-3 disabled:cursor-not-allowed disabled:opacity-50 max-md:!px-1 max-md:!text-[12px]" :class="s.mode.value === t[0] && !gemCorrupt ? 'on' : ''" :disabled="t[0] === 'sim' && SIM_LOCKED" :title="t[0] === 'sim' && SIM_LOCKED ? tr('調整中です。しばらくお待ちください', 'Work in progress. Please check back later') : undefined" @click="s.hold(null); s.mode.value = t[0]; setGemCorrupt(false)">{{ tr(t[1], t[0] === 'hand' ? 'Emulator' : 'Simulator') }}<span v-if="t[0] === 'sim' && SIM_LOCKED" class="text-[11px] font-normal max-md:hidden">{{ tr("(調整中)", "(WIP)") }}</span><span v-else-if="t[0] === 'sim'" class="text-[10px] font-normal opacity-70" :title="tr('作り込み中の機能。数字は今の相場と確率の目安', 'Still in development. Numbers are rough estimates from current prices and chances')">β</span></button>
        <!-- ジェムコラプト (Web 版だけ、2026-10-16) -->
        <button v-if="!inApp && GEM_CORRUPT_SHOWN" type="button" role="tab" :aria-selected="gemCorrupt" data-rec="tab-gem-corrupt" class="g-tab min-w-[170px] !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]" :class="gemCorrupt ? 'on' : ''" @click="s.hold(null); setGemCorrupt(true)">{{ tr("ジェムコラプト", "Gem Corruption") }}</button>
        <!-- クイズのチュートリアル (2026-10-16)。開発版だけ (本番はシミュレーターと同じく閉じたまま出さない) -->
        <button v-if="!SIM_LOCKED" type="button" role="tab" :aria-selected="s.mode.value === 'tutorial' && !gemCorrupt" class="g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-3" :class="s.mode.value === 'tutorial' && !gemCorrupt ? 'on' : ''" @click="s.hold(null); s.mode.value = 'tutorial'; setGemCorrupt(false)">{{ tr("チュートリアル", "Tutorial") }}<span class="text-[10px] font-normal opacity-70" :title="tr('開発版だけの画面', 'Dev build only')">β</span></button>
      </div>
      <!-- シミュレーションの「1 つ戻す」「説明」(StageSimPanel.vue が Teleport で置く) -->
      <div v-show="!gemCorrupt" id="sim-tools" class="ml-auto flex items-center gap-1.5 text-[12px] max-md:w-full max-md:flex-wrap">
        <!-- ベースを選ぶ前も同じ帯を出す (2026-10-09 オーナー「ここはずっと出してていい」)。選んだ後は StageSimPanel の物に替わる -->
        <template v-if="s.mode.value === 'sim' && simNoBase">
          <CurrencyPicker sim />
          <span class="relative">
            <button type="button" class="g-btn sm inline-flex items-center gap-1 max-md:min-h-10" :aria-expanded="preRecipeOpen" :title="tr('保存したレシピから始める', 'Start from a saved recipe')" @click="preRecipeOpen = !preRecipeOpen">{{ tr("レシピ", "Recipes") }}<Icon :name="preRecipeOpen ? 'chevron-up' : 'chevron-down'" class="size-4" /></button>
            <div v-if="preRecipeOpen" class="fixed inset-0 z-30 bg-black/60 md:hidden" @click="preRecipeOpen = false"></div>
            <div v-if="preRecipeOpen" class="absolute right-0 top-full z-40 mt-1 w-[26rem] rounded-xl border border-white/15 bg-[#14110d] p-3 text-[12px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-14 max-md:w-auto max-md:max-h-[80vh] max-md:overflow-y-auto">
              <StageRecipeStart compact @start="startFromRecipe" />
            </div>
          </span>
          <button type="button" disabled class="g-btn sm inline-flex items-center gap-1.5 max-md:min-h-10" :title="tr('ベースを選んでから', 'Choose a base first')"><Icon name="rotate" class="size-4" /><span class="max-md:hidden">{{ tr("リセット", "Reset") }}</span></button>
          <button type="button" disabled class="g-btn sm inline-flex items-center gap-1.5 max-md:min-h-10" :title="tr('戻せる操作がまだ無い', 'Nothing to undo yet')"><Icon name="undo" class="size-4" /><span class="max-md:hidden">{{ tr("1 つ戻す", "Undo") }}</span></button>
        </template>
      </div>
    </div>

    <!-- ジェムコラプト (Web 版だけ)。エミュレーター・シミュレーターの中身は消さずに隠す (戻った時に打っていた物が残る) -->
    <GemCorruptWebPanel v-if="gemCorrupt" class="mb-4" />
    <div v-show="!gemCorrupt">
    <!-- 再生モード -->
    <div v-if="s.replay.value?.shared" class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[12px]">
      <b class="text-sky-200">{{ tr("共有された手順", "Shared steps") }}</b>
      <span class="tabular-nums">{{ s.item.value ? baseNameOf(s.item.value) : s.replay.value.plan.base }} · {{ tr(`${s.log.value.length} / ${s.replayLength.value} 手目`, `step ${s.log.value.length} / ${s.replayLength.value}`) }}</span>
      <span class="flex items-center gap-1">
        <button type="button" :class="btn" class="max-md:min-h-10" :disabled="!s.log.value.length" :title="tr('始めへ', 'To the start')" @click="s.replayTo(0)">|◀</button>
        <button type="button" :class="btn" class="max-md:min-h-10" :disabled="!s.log.value.length" :title="tr('1 手戻す', 'Back 1 step')" @click="s.replayTo(s.log.value.length - 1)">◀</button>
        <button type="button" :class="btn" class="max-md:min-h-10" :disabled="s.log.value.length >= s.replayLength.value" :title="tr('1 手進める', 'Forward 1 step')" @click="s.replayTo(s.log.value.length + 1)">▶</button>
        <button type="button" :class="btn" class="max-md:min-h-10" :disabled="s.log.value.length >= s.replayLength.value" :title="tr('最後へ', 'To the end')" @click="s.replayTo(s.replayLength.value)">▶|</button>
      </span>
      <span class="ml-auto flex items-center gap-1.5 max-md:ml-0">
        <button type="button" :class="btn" class="max-md:min-h-10" :title="tr('今の手から自分で打つ (工程はそのまま)', 'Craft on from this step (steps are kept)')" @click="s.continueFromReplay()">{{ tr("ここから打つ", "Craft from here") }}</button>
        <button type="button" :class="btn" class="max-md:min-h-10" @click="s.leaveReplay()">{{ tr("白から打つ", "Start fresh") }}</button>
      </span>
    </div>
    <div v-else-if="s.replay.value" class="mb-3 flex items-center gap-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[12px]">
      <b class="text-sky-200">{{ tr("再生中", "Replaying") }}</b>
      <span>{{ s.replay.value.plan.title ?? s.replay.value.plan.base }} · {{ tr(`${s.log.value.length} 手目まで`, `up to step ${s.log.value.length}`) }} (seed {{ s.replay.value.plan.seed }})</span>
      <button v-if="inApp" type="button" :class="btn" class="ml-auto max-md:hidden" @click="s.video.value = { from: 0, autoplay: false, controls: true }">{{ tr("動画モード", "Video mode") }}</button>
      <button type="button" :class="btn" @click="s.leaveReplay()">{{ tr("エミュレーターへ", "To Emulator") }}</button>
    </div>

    <!-- 設定と操作 (StageSettings.vue) -->
    <StageSettings :phone="phone" />

    <!-- スマホ: アイテムのカードが画面の外に出たら上に要約を貼る (2026-10-09 オーナー「下にスクロールしても MOD 付いても見えん」) -->
    <StageItemMini v-if="phone && !cardOnScreen && s.item.value && (s.mode.value === 'hand' || s.replay.value)" :item="s.item.value" :added="s.last.value?.added ?? []" :removed="s.last.value?.removed ?? []" />
    <!-- 読めなかった時は「もう一度」(web/MarketNotice.vue と同じ。2026-10-10 動きの揃え 8) -->
    <p v-if="s.error.value" class="mb-3 flex items-center gap-3 rounded-lg bg-rose-500/10 px-3 py-2 text-rose-300"><span class="min-w-0 flex-1">{{ s.error.value }}</span><button v-if="!s.data.value" type="button" class="g-btn sm shrink-0" @click="retryInit">{{ tr("もう一度", "Retry") }}</button></p>
    <p v-if="!s.ready.value && !s.error.value" class="py-12 text-center opacity-50">{{ tr("読み込み中…", "Loading…") }}</p>

    <!-- 手で打つ画面と行き来しても入れた物が残るように、一度ベースを選んだら消さずに隠す (2026-10-05 オーナー「ステージと実験行き来できるように、行き来したらもっかい最初からになった」) -->
    <StageSimPanel v-if="s.ready.value && s.simPicked.value" v-show="s.mode.value === 'sim' && !s.replay.value" class="mb-4" />
    <!-- クイズのチュートリアル (見本のレシピを 1 手ずつ。StageTutorial.vue) -->
    <StageTutorial v-if="s.ready.value && s.mode.value === 'tutorial' && !s.replay.value && !SIM_LOCKED" class="mb-4" />
    <!-- ベースを選んだ後に出る中身はふわっと出す (2026-10-10 オーナー「切り替えがワープみたい」) -->
    <Transition name="stage-fade" appear>
    <div v-if="s.ready.value && ((s.mode.value === 'hand' && !handNoBase) || s.replay.value)" class="grid gap-4 @5xl:grid-cols-[auto_1fr]">
      <!-- アイテム枠 + 直前の変化 -->
      <div class="flex min-w-0 flex-col items-center gap-8 max-md:items-stretch">
        <!-- 品質を変える帯 (アイテムの説明の窓の外、すぐ上。2026-10-10) -->
        <!-- カードの上の帯: 左に「MOD 一覧へ」、右に品質 (2026-10-10 オーナー「アイテムカードの枠左上に MOD 一覧へ、行ったり来たり、ワープでいい」) -->
        <div class="-mb-6 flex w-full max-w-[480px] items-start gap-2">
          <button type="button" data-rec="mod-list-open" data-rec-part="mod-list-button" class="tbtn-top" :title="tr('このベースに付く MOD の一覧へ', 'Go to the mod list')" @click="toModList">{{ tr("MOD 一覧", "Mod list") }}<kbd class="kbd max-md:hidden">Tab</kbd></button>
          <StageQualityBar v-if="s.item.value && !s.replay.value" data-rec-part="quality" :item="s.item.value" class="flex-1" @quality="setQuality" @cap="setQualityCap" @catalyst="setCatalyst" />
        </div>
        <div ref="cardEl" class="relative" :class="[fxCls]" :style="fx ? { '--fx': fx.color } : undefined">
        <StageItemCard
          :doomed="doomed"
          :item="s.item.value!"
          :added="s.last.value?.added ?? []"
          :removed="s.last.value?.removed ?? []"
          :holding="!!s.held.value && !s.replay.value"
          :flash-key="flashKey"
          @use="s.use()"
          :removable="!s.replay.value"
          @remove="(id: string) => s.use(forceKey(id, null, 'x'))"
          @fracture="fractureMod"
          @jump="(id: string) => { s.modOverlay.value = true; s.modJump.value = { modId: id, n: (s.modJump.value?.n ?? 0) + 1 }; }"
          @socket="useAtSocket"
          @unsocket="(n: number) => s.use(unsocketKey(n))"
          @implicit="setImplicit"
        />
        <span v-if="fx?.text" :key="fx.n" class="stage-float" :class="fx.kind === 'shake' ? 'stage-float-plate text-sm' : 'text-2xl'">{{ fx.text }}</span>
        </div>
        <!-- カオス (普通・上級・完全) を持っている時: カオススパム確率機へ (2026-10-16 オーナー「カオス持った時にアイテムの下にボタン、押したら MOD 選択から」) -->
        <button v-if="heldChaos && !phone" type="button" data-chaos-spam-open class="g-btn sm" @click="openChaosSpam">{{ tr("カオススパム確率機へ", "Chaos spam calculator") }}</button>
        <RevealPanel />
        <!-- ヒネコラの髪束の予見: 持っているカレンシーを打った時の結果 (次の手の seed で引くので、打つとこの通りになる) -->
        <div v-if="s.foresight.value" class="w-[380px] max-md:w-full rounded-xl border border-violet-400/50 bg-violet-500/10 p-3 text-[12px]">
          <p class="mb-1 font-bold text-violet-200">{{ tr(`予見: ${nameOf(s.foresight.value.key)} を使うと`, `Foreseen: using ${nameOf(s.foresight.value.key)}`) }}</p>
          <p v-if="!s.foresight.value.applied" class="text-rose-300">{{ tr("使えない", "Can't use") }} — {{ s.foresight.value.reason }}</p>
          <template v-else>
            <p v-for="(t, i) in s.foresight.value.added" :key="'fa' + i" class="text-emerald-300">{{ tr('＋', '+') }} {{ t }}</p>
            <p v-for="(t, i) in s.foresight.value.removed" :key="'fr' + i" class="text-rose-300 line-through">{{ tr('－', '-') }} {{ t }}</p>
            <p v-if="s.foresight.value.after.destroyed" class="font-bold text-rose-400">{{ tr("壊れる", "Destroyed") }}</p>
            <p v-if="s.foresight.value.after.corrupted && !s.item.value?.corrupted" class="font-bold text-[#d20000]">{{ tr("コラプトする", "Corrupted") }}</p>
            <p v-if="!s.foresight.value.added.length && !s.foresight.value.removed.length && !s.foresight.value.after.destroyed" class="opacity-60">{{ tr("MOD は変わらない", "No mod change") }}</p>
          </template>
        </div>
        <!-- 工程 (直前の変化の欄は外して累計だけ。新しい手が上。2026-10-10 オーナー「直前の変化いらんな、累計でおｋ、並び順は上が最新」) -->
        <!-- 上の説明の行との間をカードとの間と同じに (mt-2)、中身は枠に少し近く (p-1)。2026-10-11 オーナー -->
        <div data-rec-part="history" class="g-panel mt-2 w-[480px] max-md:w-full p-1 text-[12px]">
          <p class="g-sec-head"><b class="g-sec-title">{{ tr("工程", "Steps") }}</b><span class="g-sec-sub">{{ inApp || s.replay.value ? "" : tr(`最近 ${LOG_KEEP} 手まで`, `last ${LOG_KEEP} steps`) }}</span>
            <!-- 手順の共有 (2026-10-12)。押せない時は理由を title に (打ち始めた後の手で足した MOD は下にも 1 行) -->
            <span v-if="SHARE_ENABLED" :title="s.shareWhy.value ?? tr('この手順を URL で共有 (受け取った人は同じベースから同じ結果を再生できる)', 'Share these steps as a URL (others can replay them with the same results)')"><button type="button" class="g-btn sm inline-flex items-center gap-1 max-md:min-h-9" :disabled="!!s.shareWhy.value" :aria-expanded="!!shareOpen" @click="shareOpen ? (shareOpen = null) : openShare()"><Icon name="link" class="size-3.5" />{{ tr("共有", "Share") }}</button></span>
            <span class="ml-auto tabular-nums opacity-70" data-rec-part="history-cost">{{ tr("累計", "Total") }} {{ displayCurrency.money(s.total.value) }} · {{ tr(`${s.last.value?.out.index ?? 0} 手`, `${s.last.value?.out.index ?? 0} step${(s.last.value?.out.index ?? 0) === 1 ? "" : "s"}`) }}</span></p>
          <p v-if="SHARE_ENABLED && s.shareWhy.value && s.log.value.length && !shareOpen" class="-mt-1 mb-1 px-1 text-[11px] text-amber-200/80">{{ tr("共有できない", "Can't share") }}: {{ s.shareWhy.value }}</p>
          <div v-if="SHARE_ENABLED && shareOpen" class="mb-2 rounded-lg border border-white/10 bg-black/30 p-2">
            <p class="mb-1.5 flex items-center gap-2"><span :class="shareOpen.copied ? 'text-emerald-300' : 'text-amber-200'">{{ shareOpen.copied ? tr("URL をコピーしました", "URL copied") : tr("下の URL をコピーしてください", "Copy the URL below") }}</span><button type="button" class="g-plain ml-auto px-1 opacity-60 hover:opacity-100" :title="tr('閉じる', 'Close')" @click="shareOpen = null">×</button></p>
            <input :value="shareOpen.url" readonly class="mb-1.5 w-full truncate rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-[var(--exile-color-text-secondary)]" @focus="($event.target as HTMLInputElement).select()" />
            <span class="flex gap-1.5">
              <button type="button" class="g-btn sm max-md:min-h-10" @click="copyShare">{{ tr("URL をコピー", "Copy URL") }}</button>
              <a :href="xIntentUrl(shareOpen.url)" target="_blank" rel="noopener" class="g-btn sm max-md:min-h-10" @click="postToX($event, shareOpen.url)">{{ tr("X に投稿", "Post on X") }}</a>
            </span>
          </div>
          <!-- 中で送るのはここだけ。伸びるのは 3 手ぶんくらいまで (2026-10-11 オーナー「工程はでかくなる必要ない、ここで固定値」) -->
          <div class="max-h-[200px] overflow-y-auto pr-1"><StageHistory /></div>
        </div>
      </div>

      <!-- カレンシー棚 (横並びの時は上をカードの枠に揃える: 左はカードの上に「MOD 一覧へ・品質」の帯 24px + 間 8px があり、枠の絵は外へ 8px はみ出すので 40px。
           2026-10-11 オーナー「枠の高さが違うのが気に食わん、カレンシーの方が高く感じる」) -->
      <div class="min-w-0 space-y-4 @5xl:pt-10">
        <!-- 狙う (MOD 一覧の「狙う」で出る。打ち方ごとの付く確率) -->
        <StageAimPanel v-if="!s.replay.value" data-rec-part="aim-panel" />
        <!-- カオススパム確率機 (「次の手で狙う」とは別の欄・別の狙い。2026-10-16 オーナー「別ルートとして扱って」) -->
        <StageChaosSpam v-if="!s.replay.value" />
        <StageAimPicker v-if="s.aimPicker.value && s.item.value" />
        <section class="g-panel p-2">
          <p class="g-sec-head">
            <b class="g-sec-title">{{ tr("カレンシー", "Currency") }}</b>
            <span v-if="s.held.value" class="whitespace-nowrap rounded-full bg-amber-500/20 px-2 text-amber-200">{{ tr("持っている", "Holding") }}: {{ nameOf(s.held.value) }}</span>
            <span v-else class="g-sec-sub whitespace-nowrap">{{ tr("押して持つ → アイテムを押す", "Click to hold → click the item") }}</span>
            <span v-for="o in s.omens.value" :key="o" class="cursor-pointer whitespace-nowrap rounded-full bg-violet-500/20 px-2 text-violet-200 max-md:px-3 max-md:py-1.5" :title="tr('押すと外す', 'Click to remove')" @click="s.toggleOmen(o)">{{ nameOf(o) }} ×</span>
          </p>
          <CurrencyShelf @hold="hold">
            <!-- 棚の中の「神〜ヴァールオーブ」の段の下に出る (置き場は CurrencyShelf が決める。上に出すと持っているカレンシーがずれる、オーナー 2026-10-04) -->
            <template v-if="heldOmens.length" #held>
              <div class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2" data-held-omens>
                <!-- 横に「MOD 一覧へ」(お告げを選びながら付く MOD を見に行ける。2026-10-11 オーナー「お告げの横にも MOD 一覧へ、楽だ」) -->
                <p class="mb-1 flex items-center gap-2 text-[11px] text-violet-200/80">{{ tr(`${nameOf(s.held.value ?? "")} に掛けられるお告げ`, `Omens for ${nameOf(s.held.value ?? "")}`) }}<button type="button" data-rec="mod-list-open" data-rec-part="mod-list-button" class="tbtn-top ml-auto" :title="tr('このベースに付く MOD の一覧へ', 'Go to the mod list')" @click.stop="toModList">{{ tr("MOD 一覧", "Mod list") }}<kbd class="kbd max-md:hidden">Tab</kbd></button></p>
                <div class="flex flex-wrap gap-1.5">
                  <ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="s.toggleOmen($event)" />
                </div>
              </div>
            </template>
          </CurrencyShelf>
        </section>

      </div>
    </div>
    </Transition>
    <!-- このベースに付く MOD (StageModList.vue、2026-09-29) -->
    <!-- シミュレーションでは ① 狙う MOD の枠の中に出す (StageSimPanel.vue) -->
    <!-- 手で打つ画面は重ね (後ろを暗く) で出す。枠の外を押す・閉じる・Esc・Tab で閉じる。持っている物はそのまま (2026-10-11 オーナー) -->
    <!-- 大きさは後ろの画面の 75% (縦横とも。2026-10-11 オーナー「MOD 枠は後ろのウィンドウの大きさで決まる、75%」) -->
    <!-- ページの下にも同じ一覧 (同じ部品 = 同じエンジン。窓はすぐ見るための便利機能。2026-10-11 オーナー「スクロールした下に配置してていい」) -->
    <Transition name="stage-fade" appear><StageModList v-if="s.ready.value && s.item.value && ((s.mode.value === 'hand' && !handNoBase) || s.replay.value)" data-rec-part="mod-list-bottom" /></Transition>
    </div>
    <!-- 窓の動きは ModalShell (Esc・後ろを押す・× で閉じる、後ろのページは止める)。Tab でも開け閉め -->
    <ModalShell :open="s.modOverlay.value && s.ready.value && !!s.item.value && ((s.mode.value === 'hand' && !handNoBase) || !!s.replay.value)" rec="mod-list" :title="tr('このベースに付く MOD', 'Mods for this base')" :close-title="tr('閉じる (Esc / Tab / 枠の外を押す)', 'Close (Esc / Tab / click outside)')" width="w-[75%] h-[75%] max-md:h-auto" full-on-phone body-class="px-3 pb-3" @close="s.modOverlay.value = false">
      <template #header><span class="g-sec-sub max-md:hidden">{{ s.item.value ? baseNameOf(s.item.value) : "" }}</span></template>
      <StageModList overlay />
    </ModalShell>

    <!-- 押した所の波紋と、吸い込まれるアイコン -->
    <template v-if="fx && fx.kind !== 'shake'">
      <span :key="'r' + fx.n" class="stage-ripple" :style="{ left: `${fx.x}px`, top: `${fx.y}px`, '--fx': fx.color }" />
      <img v-if="fx.icon" :key="'d' + fx.n" :src="fx.icon" alt="" class="stage-drop object-contain" :style="{ left: `${fx.x}px`, top: `${fx.y}px` }" />
    </template>
    <!-- カーソルに付いたカレンシー -->
    <img
      v-if="s.held.value && iconOf(s.held.value) && !phone"
      :src="iconOf(s.held.value)"
      alt=""
      data-rec-part="held-icon"
      class="pointer-events-none fixed z-[200] h-10 w-10 object-contain drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]"
      :style="{ left: `${mouse.x + 8}px`, top: `${mouse.y + 8}px` }"
    />
    <VideoStage v-if="s.video.value && s.ready.value" />
    <!-- 動画用の別の画面 (URL の view=、要望 ⑪) -->
    <VideoExtra v-if="s.extra.value && s.ready.value" />
    <!-- ページの一番下に置く物 (Web の決まり事の footer。2026-10-10 オーナー「固定バーは許されん、一番下に動かさず」) -->
    <slot name="footer" />
  </div>
</template>

<style scoped>
/* 行き来のボタン (MOD 一覧へ / クラフトへ): 小さく平たい (段表の tbtn と同じ見た目) */
.tbtn-top { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 4px; background: rgba(0, 0, 0, 0.35); font-size: 11px; color: rgba(255, 255, 255, 0.82); }
.tbtn-top .kbd { margin-left: 6px; padding: 0 4px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 3px; font-size: 9.5px; line-height: 14px; opacity: 0.6; }
.tbtn-top:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(232, 200, 120, 0.55); color: #f3e2b8; }
</style>
