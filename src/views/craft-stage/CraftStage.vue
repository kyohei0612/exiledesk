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
import { LOG_KEEP, TUTORIAL_LOCKED } from "../../state/craft-stage";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { computed, defineAsyncComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { usePhone } from "../../utils/use-phone";
import { useDismiss } from "../../utils/use-dismiss";
import { toCss } from "../../utils/zoom";
import StagePhoneBar from "./StagePhoneBar.vue";
import BusyTag from "../../components/ui/BusyTag.vue";
import StageSettings from "./StageSettings.vue";
import { useStageBase } from "./use-stage-base";
import StageItemCard from "../../components/for-share/item/StageItemCard.vue";
import StageQualityBar from "./StageQualityBar.vue";
import StageSanctifyBar from "./StageSanctifyBar.vue";
import { flag } from "../../web/release-flags";
import StageItemMini from "./StageItemMini.vue";
import StageAimPanel from "./StageAimPanel.vue";
import StageForesight from "./StageForesight.vue";
import StageBasePage from "./StageBasePage.vue";
import ModeTabs from "../../components/for-share/ModeTabs.vue";
import { PAGES_ON, basePage, baseUnpicked, openRoutes } from "../../state/web-page"; // Web のページ (ベース選び。web/page.ts)
import { openSharedRecipe } from "../../state/for-share/sim-links";
import StageAimPicker from "./StageAimPicker.vue";
import CurrencyShelf from "../../components/for-share/shelf/CurrencyShelf.vue";
import StageHistory from "./StageHistory.vue";
import { forceKey, isRune, type StageMod, isSanctifySet, runeNameOf, RUNE_PREFIX, IMPLICIT_SET, isCatalystSet, isQualitySet, QUALITY_CAP } from "../../services/craft-stage/engine";
import { previewUse, unsocketKey, sanctifySetKey, catalystSetKey, implicitSetKey, qualityCapKey, qualitySetKey } from "../../services/craft-stage/engine-emu";
import { courseActive as inLesson, courseHidesEmulator, courseHidesShelf, endLesson, CourseHost } from "../tutorial/course-entry"; // チュートリアルのコースの間 (2026-10-17)。隠す判定は course-host に 1 か所 (R4 手 2)
import RevealPanel from "./RevealPanel.vue";
import { useStageFx } from "../../components/for-share/use-stage-fx";
import StageModList from "./StageModList.vue";
// 部ごとの差し込み口 (2026-10-20 R4): シミュレーターと使い方・コースの中身は各部の部品が持つ
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import HeldOmens from "../../components/for-share/shelf/HeldOmens.vue";
import { heldOmensOf } from "../../components/for-share/shelf/held-omens";
import ModalShell from "../../components/ui/ModalShell.vue";
import Icon from "../../components/ui/Icon.vue";
import { encodeShare, SHARE_ENABLED, shareUrl, xIntentUrl } from "../../services/craft-stage/share";
import { openExternal } from "../../services/trade2/open-external";
import { track } from "../../utils/track";
import { gemCorruptPage } from "../../web/page";

const s = craftStage;
/** ルーンを持ってルーンの入ったソケットを押した: そのソケットを置き換える手 (`rune:<名前>@<n>`)。ルーン以外はアイテムを押したのと同じ */
function useAtSocket(n: number): void {
  const k = s.held.value;
  if (k && isRune(k)) s.use(`${RUNE_PREFIX}${runeNameOf(k)}@${n}`);
  else s.use();
}
onMounted(() => void s.init());
// シミュレーターのレシピの URL (#recipe=、recipe-share.ts) から来た時・同じタブに貼った時は、そのレシピで始める
// ジェムコラプトの画面を開いていたら閉じる (開いたままだと上に残り、URL はシミュレーターなのにジェムコラプトが見えていた。2026-10-19 モンキーテスト)
const openRecipeUrl = (): void => { if (location.hash.startsWith("#recipe=")) { setGemCorrupt(false); openSharedRecipe(); } };
onMounted(() => { openRecipeUrl(); window.addEventListener("hashchange", openRecipeUrl); });
onBeforeUnmount(() => window.removeEventListener("hashchange", openRecipeUrl));
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
const self = getCurrentInstance();
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") s.hold(null);
  // ジェムコラプトを開いている時は、隠れているエミュレーターの手 (R で 1 手戻す・Tab で MOD 一覧) を動かさない
  if (gemCorrupt.value) return;
  // ほかのページ (ツリー・スパムシミュ・デイリー・要望・レシピ) の後ろで隠れている時も動かさない (WebApp.vue の v-show。2026-10-22 ツリーで Tab を押すと MOD 一覧が開いた)
  const root = self?.proxy?.$el as HTMLElement | undefined;
  if (root instanceof HTMLElement && root.getClientRects().length === 0) return;
  // 入力欄の中 (MOD 一覧・ベースの検索) と窓を開いている時は、文字の取り消しや窓の物に任せる (2026-10-10 点検: 文字ではなく 1 手戻っていた)
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
  const dialog = !!document.querySelector("[role=dialog], [aria-modal=true]");
  // MOD 一覧の窓: Tab でいつでも開け閉め (2026-10-11 オーナー)。Esc は ModalShell が窓だけ閉じる (持っている物は離さない)
  const otherDialog = document.querySelectorAll("[role=dialog], [aria-modal=true]").length > (s.modOverlay.value ? 1 : 0);
  if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey && !typing && !otherDialog && s.item.value && (s.mode.value === "hand" || s.replay.value) && !phone.value) { e.preventDefault(); s.modOverlay.value = !s.modOverlay.value; return; }
  // 1 手戻す: R (2026-10-11 オーナー「Ctrl+Z はデフォルトみたいな存在だから R でいい」)。Ctrl+Z も残す
  const undoKey = (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "r") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z");
  if (undoKey && !e.repeat && !typing && !dialog && (s.mode.value === "hand" || s.replay.value)) { e.preventDefault(); if (!inLesson.value) s.undo(); } // コースの間は戻さない (もう一度で)
}
onMounted(() => { window.addEventListener("mousemove", onMove); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { window.removeEventListener("mousemove", onMove); window.removeEventListener("keydown", onKey); s.hold(null); });
function hold(k: string): void { s.hold(s.held.value === k ? null : k); }
/** カレンシーの枠 (棚)。持っている間に、棚・アイテムのカード・スマホの下の帯・窓・小窓の外を押したら離す (2026-10-22 オーナー「キャンセルは枠の外をクリックで」。押した物には届ける) */
const shelfEl = ref<HTMLElement | null>(null);
useDismiss(() => !!s.held.value && !s.replay.value, [shelfEl, () => cardEl.value], () => s.hold(null), { swallow: false, keep: "[data-bottom-bar], [role=dialog], [aria-modal=true], [data-mod-add-menu], [data-helptip-pop], [data-mod-list]" });
/** 持っている物に掛けられるお告げ (欄は HeldOmens.vue。ここは slot を出すかだけ) */
const heldOmens = computed(() => heldOmensOf(s.held.value));
/** 持っている物を打つ前に光らせる: 変わる候補の MOD (オレンジの文字) と付く空き (緑の枠)。エンジンの previewUse から (2026-10-17 オーナー、前は削減のカオスだけ) */
const preview = computed(() => (s.held.value && s.item.value && s.data.value && !s.replay.value ? previewUse(s.data.value, s.item.value, s.held.value, s.omens.value) : null));
const doomed = computed(() => preview.value?.change ?? []);
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
// 共有の欄は枠の外を押す・Esc で閉じる (2026-10-22 オーナー、全部の画面の決まり。前は閉じる手段が無かった)
const shareEl = ref<HTMLElement | null>(null);
useDismiss(() => !!shareOpen.value, [shareEl], () => { shareOpen.value = null; });
/** 道具の帯のボタン (ゲームの 3 枚ボタン、src/styles/game-ui.css) */
const btn = "g-btn sm";
/**
 * スマホ (幅 768 CSS px 未満): 棚からアイテムまで縦に遠いので、何か持っている間は画面の下に「持っている物 → アイテムに使う」の帯を出す
 * (2026-10-08 オーナー「タップして使う時はアイテムに再度付けるような動作で。押した瞬間付けるだとお告げが使えない」。お告げは掛けてから「アイテムに使う」)
 */
const phone = usePhone();
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
/** 聖別の数値 (聖別の帯)。続けて変えた分は 1 手にまとめる (品質と同じ) */
/** 聖別の帯は本番では OK まで出さない (release-flags の sanctifyBar。v0.1.589 から本番は帯の所だけ隠していた) */
const SANCTIFY_BAR = flag("sanctifyBar");
function setSanctify(k: number | "max" | "min"): void {
  const last = s.log.value[s.log.value.length - 1];
  if (last && isSanctifySet(last.out.currency)) s.undo();
  s.use(sanctifySetKey(k));
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
  if (m.fractured) { s.use(forceKey(m.modId, null, "u")); return; } // フラクチャー済みは右クリックで外す (2026-10-18 オーナー)
  const n = s.data.value?.mods.get(m.modId)?.tiers.length ?? 0; s.use(forceKey(m.modId, n ? `T${n - m.tierIndex}` : null, "f"));
}
/** 発現の候補が出ている時: 帯を「発現する MOD を選ぶ ↑」にしてパネルへ送る (骨 → 発現の流れ。2026-10-08 レビュー A3) */
function scrollToReveal(): void { scrollToTop(document.querySelector("[data-reveal-panel]"), "smooth", "center"); }
/**
 * 手で打つ画面の今のアイテムをそのままシミュレーションの始めの状態に (2026-10-08 オーナー「その MOD が付いた状態以降を確認したい時があるから、
 * 手打ちからそのまま持っていくコース」)。ベース・アイテムレベルは同じ、ベース代の既定は 手打ちの累計 + 白ベース代
 */
/** アプリ版だけ (Web 版は POE2Tube 用の JSON・動画モードを出さない) */
const inApp = isTauriRuntime();
const guidePage = computed(() => !inApp && s.mode.value === "tutorial" && !inLesson.value && !s.replay.value); // Web の使い方・コツのページ (コース一覧)
// ベースを選んだか・選ぶ (設定の欄と共通、use-stage-base.ts)
const { handNoBase } = useStageBase();
// Web はベース選びを別のページに (?page=base、StageBasePage.vue)。まだ選んでいない時もそのページ (エミュレーターだけ。シミュレーターは今まで通り)
watch(() => PAGES_ON && !s.replay.value && s.mode.value === "hand" && handNoBase.value, (u) => { baseUnpicked.value = u; }, { immediate: true });
const subPage = computed(() => PAGES_ON && !s.replay.value && s.mode.value === "hand" && !inLesson.value && (basePage.value || baseUnpicked.value));
/**
 * ジェムコラプト (Web 版だけ、2026-10-16 ロードマップの土台)。エミュレーター・シミュレーターのタブの並びに置く。開いた時に読む。
 * 計算はアプリのヴァールの天秤と同じ関数 (views/gem-corrupt/model.ts)、入力は売値 3 つの手入力
 */
const GemCorruptWebPanel = defineAsyncComponent(() => import("../gem-corrupt/GemCorruptWebPanel.vue"));
// 開いているかは page.ts (?page=gem-corrupt、リロードでもジェムコラプトに。10-25 デザイン 6 本目)
const gemCorruptOn = gemCorruptPage;
watch(() => s.mode.value === "tutorial" || inLesson.value, (v) => { if (v) gemCorruptOn.value = false; }); // 使い方・コツを開いたらジェムコラプトは閉じる (web/page.ts)
/** 本番には出さない (2026-10-16 オーナー「ジェムコラプトは内緒」)。スイッチ gemCorrupt (開発版・手元の dev だけタブを出す) */
const GEM_CORRUPT_SHOWN = flag("gemCorrupt");
const gemCorrupt = computed(() => GEM_CORRUPT_SHOWN && !inApp && gemCorruptOn.value && !s.replay.value);
function pickMode(m: typeof s.mode.value): void {
  s.hold(null); endLesson(); s.mode.value = m; setGemCorrupt(false);
}
function setGemCorrupt(v: boolean): void { if (v && !gemCorruptOn.value) track("mode:gem-corrupt"); gemCorruptOn.value = v; }
</script>

<template>
  <!-- スクロールバーの分の幅は常に取っておく (出たり消えたりで横幅が変わり、ぎりぎりの高さでベースの並びが組み直されて跳んだ。2026-10-10 オーナー) -->
  <div data-stage-root class="h-full overflow-auto p-4 @container [scrollbar-gutter:stable]" :class="phone && s.mode.value === 'hand' && (s.held.value || s.offers.value) ? 'pb-32' : ''" @contextmenu.prevent="s.hold(null)">
    <!-- スマホ: 持っている物の帯 (画面の下に固定)。アイテムに使う / 離す (StagePhoneBar.vue) -->
    <StagePhoneBar v-if="phone && s.mode.value === 'hand' && (s.held.value || s.offers.value) && !s.replay.value && !gemCorrupt" @scroll-to-reveal="scrollToReveal" />
    <div v-show="!subPage"><!-- ベース選びのページの間は中身を隠す (消さないので戻ると元のまま) -->
    <div class="mb-3 flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1" data-rec-part="title">
        <!-- 画面名は他の画面と同じ窓の題の帯 (TabBar の .g-tabbar) -->
        <h1 class="g-tabbar g-brush flex items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ guidePage ? tr("使い方・コツ", "Guide & Tips") : tr("クラフトステージ", "Craft Stage") }}</h1>
        <p v-if="gemCorrupt" class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("ジェムをコラプトして レベル 21 · 品質 23% を狙う時の収支。売値 3 つを入れるだけ (素材はカレンシーの相場)", "Profit of corrupting a gem for level 21 / 23% quality. Just enter 3 sell prices (materials use currency market prices)") }}</p>
        <CourseHost v-else-if="(s.mode.value === 'tutorial' || inLesson) && !s.replay.value && !TUTORIAL_LOCKED" part="header" :guide-page="guidePage" />
        <p v-else class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">{{ tr("カレンシー・骨・エッセンスを押して持ち、アイテムを押すと 1 回使います (持ったまま連打できます)。お告げは持っている物の下に出るので、押して掛けます。確率はクラフト計算機と同じ規則です。", "Click a currency, Abyssal Bone or essence to hold it, then click the item to use it once (keep clicking while holding). Omens for it appear below the held item; click to apply. Chances follow the craft calculator's rules.") }}</p>
      </div>
      <!-- シミュレーションの時はシミュレーションだけの表示通貨 (タブの行の右端) を使う。スマホは縦に積む (横に並べると題が 2 行に折れる) -->
      <div v-show="!gemCorrupt" class="flex shrink-0 items-center gap-2 max-md:flex-col-reverse max-md:items-end">
        <!-- 使った時の音のオン / オフ (2026-10-16 ゲームと同じ音。端末に覚える) -->
        <button v-show="s.mode.value === 'hand' && !s.replay.value" type="button" data-sfx-toggle class="g-btn sm shrink-0 !px-1 max-md:min-h-10" :aria-pressed="!sfxOff" :aria-label="sfxOff ? tr('使った時の音を出す', 'Turn use sounds on') : tr('使った時の音を消す', 'Turn use sounds off')" :title="sfxOff ? tr('使った時の音を出す', 'Turn use sounds on') : tr('使った時の音を消す', 'Turn use sounds off')" @click="setSfxOff(!sfxOff)"><Icon :name="sfxOff ? 'volume-x' : 'volume'" class="size-4" :class="sfxOff ? 'opacity-50' : ''" /></button>
        <CurrencyPicker v-show="s.mode.value === 'hand' || !!s.replay.value" data-rec-part="display-currency" />
      </div>
    </div>

    <!-- 手で打つ / シミュレーション (2026-10-05、実験。オーナー「ステージにもう 1 個タブ作ってやってみるか」) -->
    <!-- 再生中も消さずに隠す -->
    <div v-show="!s.replay.value" data-rec-part="tabs" class="mb-4 flex flex-wrap items-center gap-1.5">
      <!-- スマホは 2 つで横幅を分ける (170px ずつだと 375px の画面からはみ出した。2026-10-13) -->
      <!-- Web の使い方・コツ・コースのページはタブではなく、ほかのページと同じ「← クラフトへ戻る」(2026-10-18 オーナー) -->
      <button v-if="!inApp && (guidePage || inLesson)" type="button" data-guide-back class="g-btn sm max-md:min-h-10" @click="s.hold(null); endLesson(); s.mode.value = 'hand'; setGemCorrupt(false)">{{ tr("← クラフトへ戻る", "← Back to craft") }}</button>
      <!-- エミュレーター / シミュレーターの帯は共通の部品 (ModeTabs、2026-10-23 オーナー「帯を 1 つにして両方に」)。ここだけのタブは slot に -->
      <ModeTabs v-else :active="s.mode.value === 'hand' && !gemCorrupt && !inLesson ? 'hand' : null" @pick="(m) => m === 'hand' && pickMode('hand')">
        <!-- ジェムコラプト (Web 版だけ、2026-10-16) -->
        <button v-if="!inApp && GEM_CORRUPT_SHOWN" type="button" role="tab" :aria-selected="gemCorrupt" data-rec="tab-gem-corrupt" class="g-tab min-w-[170px] !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]" :class="gemCorrupt ? 'on' : ''" @click="s.hold(null); if (s.mode.value === 'tutorial' || inLesson) { endLesson(); s.mode.value = 'hand'; } setGemCorrupt(true)">{{ tr("ジェムコラプト", "Gem Corruption") }}</button>
        <!-- Web はタブに出さず、ヘッダーの「使い方・コツ」のページへ (2026-10-18 オーナー「1 回きりでしょこんなもん使うの、使い方にしまう」) -->
        <button v-if="!TUTORIAL_LOCKED && inApp" type="button" role="tab" :aria-selected="(s.mode.value === 'tutorial' || inLesson) && !gemCorrupt" class="g-tab min-w-[170px] gap-1.5 !inline-flex max-md:min-w-0 max-md:flex-1 max-md:!px-1 max-md:!text-[12px]" :class="(s.mode.value === 'tutorial' || inLesson) && !gemCorrupt ? 'on' : ''" @click="s.hold(null); endLesson(); s.mode.value = 'tutorial'; setGemCorrupt(false)">{{ tr("チュートリアル", "Tutorial") }}</button><!-- β は外した (入門〜中級の 6 コースを公開。2026-10-18 オーナーの UI 点検) -->
      </ModeTabs>
      <!-- 本番の作りだけ: 前の旧シミュの「1 つ戻す」の置き場 (#sim-tools、中身は空) の箱を戻す。スマホで全幅の 2 行目になり、行の間 6px が下の中身の位置を決めていた (本番と照らした差、シミュ部長 18 本目 10-24) -->
      <div v-if="!flag('sim')" v-show="!gemCorrupt" class="ml-auto flex items-center gap-1.5 text-[12px] max-md:w-full max-md:flex-wrap" aria-hidden="true" />
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
    <p v-if="!s.ready.value && !s.error.value" class="py-12 text-center"><BusyTag :text="tr('クラフトのデータを読み込み中', 'Loading craft data')" /></p>

    <!-- 使い方とコースの本体 (差し込み口、CourseHost.vue。旧シミュレーターの工程ページは 10-22 にツリーへ置き換えて消した) -->
    <CourseHost part="main" :guide-page="guidePage" />
    <!-- ベースを選んだ後に出る中身はふわっと出す (2026-10-10 オーナー「切り替えがワープみたい」) -->
    <Transition name="stage-fade" appear>
    <div v-if="s.ready.value && ((s.mode.value === 'hand' && !handNoBase) || s.replay.value)" class="grid gap-4 @5xl:grid-cols-[auto_1fr]">
      <!-- アイテム枠 + 直前の変化 -->
      <div class="flex min-w-0 flex-col items-center gap-8 max-md:items-stretch">
        <!-- 品質を変える帯はアイテムの説明の窓の外、すぐ上 (2026-10-10)。カードの上の帯: 左に「MOD 一覧へ」、右に品質 (2026-10-10 オーナー「アイテムカードの枠左上に MOD 一覧へ、行ったり来たり、ワープでいい」) -->
        <div v-if="!courseHidesEmulator" class="-mb-6 flex w-full max-w-[480px] items-center gap-2">
          <button type="button" data-rec="mod-list-open" data-rec-part="mod-list-button" class="tbtn-top shrink-0" :title="tr('このベースに付く MOD の一覧へ (Tab でも開く)', 'Go to the mod list (Tab also opens it)')" @click="toModList">{{ tr("MOD 一覧", "Mod list") }}</button><!-- Tab の札は説明へ (品質の帯が 1 行に入らなかった。2026-10-18) -->
          <StageQualityBar v-if="s.item.value && !s.replay.value" data-rec-part="quality" :item="s.item.value" class="flex-1" @quality="setQuality" @cap="setQualityCap" @catalyst="setCatalyst" />
        </div>
        <!-- 聖別の数値を決める帯 (聖別したアイテムだけ、品質の帯の下。2026-10-20) -->
        <div v-if="SANCTIFY_BAR && !courseHidesEmulator && s.item.value?.sanctified && !s.replay.value" class="-mb-6 w-full max-w-[480px]"><StageSanctifyBar data-rec-part="sanctify" :item="s.item.value" @set="setSanctify" /></div>
        <div ref="cardEl" class="relative" :class="[fxCls]" :style="fx ? { '--fx': fx.color } : undefined">
        <StageItemCard
          :doomed="doomed" :open="preview?.open"
          :item="s.item.value!"
          :added="s.last.value?.added ?? []"
          :removed="s.last.value?.removed ?? []"
          :holding="!!s.held.value && !s.replay.value"
          :flash-key="flashKey"
          @use="s.use()"
          :removable="!s.replay.value && !courseHidesEmulator"
          @remove="(id: string) => s.use(forceKey(id, null, 'x'))"
          @fracture="fractureMod"
          @jump="(id: string) => { s.modOverlay.value = true; s.modJump.value = { modId: id, n: (s.modJump.value?.n ?? 0) + 1 }; }"
          @socket="useAtSocket"
          @unsocket="(n: number) => s.use(unsocketKey(n))"
          @implicit="setImplicit"
        />
        <span v-if="fx?.text" :key="fx.n" class="stage-float" :class="fx.kind === 'shake' ? 'stage-float-plate text-sm' : 'text-2xl'">{{ fx.text }}</span>
        </div>
        <!-- カオス (普通・上級・完全) を持っている時: カオススパム計算機へ (2026-10-16 オーナー「カオス持った時にアイテムの下にボタン、押したら MOD 選択から」) -->
        <RevealPanel />
        <StageForesight /><!-- ヒネコラの髪束の予見 (StageForesight.vue) -->
        <!-- 工程 (累計と新しい手が上。2026-10-10 オーナー)。上の行との間はカードとの間と同じ mt-2、枠に近く p-1 (10-11)。コースの間は出さない (10-17) -->
        <CourseHost part="under-item" :phone="phone" /><!-- コースの案内はアイテムの下。スマホは今の手もアイテムのすぐ下 (2026-10-17 オーナー) -->
        <div v-if="!courseHidesEmulator" data-rec-part="history" class="g-panel mt-2 w-[480px] max-md:w-full p-1 text-[12px]">
          <p class="g-sec-head"><b class="g-sec-title">{{ tr("工程", "Steps") }}</b><span class="g-sec-sub">{{ inApp || s.replay.value ? "" : tr(`最近 ${LOG_KEEP} 手まで`, `last ${LOG_KEEP} steps`) }}</span>
            <!-- 手順の共有 (2026-10-12)。押せない時は理由を title に (打ち始めた後の手で足した MOD は下にも 1 行) -->
            <span v-if="SHARE_ENABLED" :title="s.shareWhy.value ?? tr('この手順を URL で共有 (受け取った人は同じベースから同じ結果を再生できる)', 'Share these steps as a URL (others can replay them with the same results)')"><button type="button" class="g-btn sm inline-flex items-center gap-1 max-md:min-h-9" :disabled="!!s.shareWhy.value" :aria-expanded="!!shareOpen" @click="shareOpen ? (shareOpen = null) : openShare()"><Icon name="link" class="size-3.5" />{{ tr("共有", "Share") }}</button></span>
            <span class="ml-auto tabular-nums opacity-70" data-rec-part="history-cost">{{ tr("累計", "Total") }} {{ displayCurrency.money(s.total.value) }} · {{ tr(`${s.last.value?.out.index ?? 0} 手`, `${s.last.value?.out.index ?? 0} step${(s.last.value?.out.index ?? 0) === 1 ? "" : "s"}`) }}</span></p>
          <p v-if="SHARE_ENABLED && s.shareWhy.value && s.log.value.length && !shareOpen" class="-mt-1 mb-1 px-1 text-[11px] text-amber-200/80">{{ tr("共有できない", "Can't share") }}: {{ s.shareWhy.value }}</p>
          <div v-if="SHARE_ENABLED && shareOpen" ref="shareEl" class="mb-2 rounded-lg border border-white/10 bg-black/30 p-2">
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
        <CourseHost part="above-shelf" :phone="phone" /><!-- コースの今の手 (棚のすぐ上) -->
        <StageAimPanel v-if="!s.replay.value && !courseHidesEmulator" data-rec-part="aim-panel" />
        <StageAimPicker v-if="s.aimPicker.value && s.item.value" />
        <section v-show="!courseHidesShelf" ref="shelfEl" class="g-panel relative p-2">
          <p class="g-sec-head">
            <b class="g-sec-title">{{ tr("カレンシー", "Currency") }}</b>
            <span v-if="s.held.value" class="whitespace-nowrap rounded-full bg-amber-500/20 px-2 text-amber-200">{{ tr("持っている", "Holding") }}: {{ nameOf(s.held.value) }}</span>
            <span v-else class="g-sec-sub whitespace-nowrap">{{ tr("押して持つ → アイテムを押す", "Click to hold → click the item") }}</span>
            <span v-for="o in s.omens.value" :key="o" class="cursor-pointer whitespace-nowrap rounded-full bg-violet-500/20 px-2 text-violet-200 max-md:px-3 max-md:py-1.5" :title="tr('押すと外す', 'Click to remove')" @click="s.toggleOmen(o)">{{ nameOf(o) }} ×</span><button v-if="PAGES_ON && s.mode.value === 'hand' && !courseHidesEmulator && s.item.value" type="button" data-routes-open class="g-btn sm ml-auto" :title="tr('MOD を 1 つ選んで、増強・カオス・高貴のどのスパムが一番安く着くかを比べる', 'Pick one mod and compare which spam (augment / chaos / exalt) gets there cheapest')" @click="openRoutes">{{ tr("スパムシミュレーター", "Spam simulator") }}</button>
          </p>
          <CurrencyShelf @hold="hold">
            <!-- 棚の中の「神〜ヴァールオーブ」の段の下に出る (置き場は CurrencyShelf が決める。上に出すと持っているカレンシーがずれる、オーナー 2026-10-04) -->
            <template v-if="heldOmens.length" #held>
              <HeldOmens mod-list @mod-list="toModList" />
            </template>
          </CurrencyShelf>
        </section>

      </div>
    </div>
    </Transition>
    <!-- このベースに付く MOD (StageModList.vue、2026-09-29) -->
    <!-- 手で打つ画面は重ね (後ろを暗く) で出す。枠の外を押す・閉じる・Esc・Tab で閉じる。持っている物はそのまま (2026-10-11 オーナー) -->
    <!-- 大きさは後ろの画面の 75% (縦横とも。2026-10-11 オーナー「MOD 枠は後ろのウィンドウの大きさで決まる、75%」) -->
    <!-- ページの下にも同じ一覧 (同じ部品 = 同じエンジン。窓はすぐ見るための便利機能。2026-10-11 オーナー「スクロールした下に配置してていい」) -->
    <Transition name="stage-fade" appear><StageModList v-if="s.ready.value && s.item.value && ((s.mode.value === 'hand' && !handNoBase && !courseHidesEmulator) || s.replay.value)" data-rec-part="mod-list-bottom" /></Transition>
    </div>
    </div>
    <StageBasePage v-if="subPage" :phone="phone" />
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
    <!-- 動画モードと動画用の別の画面 (CourseHost.vue) -->
    <CourseHost part="overlay" />
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
