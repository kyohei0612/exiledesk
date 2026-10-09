<!--
  CraftStage.vue — クラフトステージ (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)

  オーナー:「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」「クラフトステージでいこう」
  「操作は Craft of Exile 仕様 (カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用)」。
  4 つの枠: アイテム枠 ([[StageItemCard.vue]]) / カレンシー棚 ([[CurrencyShelf.vue]]) / 直前の変化 / 工程履歴 ([[StageHistory.vue]])。
  持っている間はカーソルにアイコンが付く。Esc / 右クリックで手放す。Ctrl+Z で 1 手戻す。
  再生モード: URL の ?stage-plan=<手順 JSON>&step=N で、その手まで進めた状態 (POE2Tube の撮影用)。
  状態と操作は [[craft-stage.ts]]、1 手の中身は services/craft-stage (計算機と同じ規則)。
-->
<script setup lang="ts">
import { forceKey } from "../../services/craft-stage/apply-force";
import { LOG_KEEP, type SimRecipe } from "../../state/craft-stage";
import StageRecipeStart from "./StageRecipeStart.vue";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { toCss } from "../../utils/zoom";
import StageItemCard from "./StageItemCard.vue";
import StageItemMini from "./StageItemMini.vue";
import StageAimPanel from "./StageAimPanel.vue";
import StageAimPicker from "./StageAimPicker.vue";
import CurrencyShelf from "./CurrencyShelf.vue";
import StageHistory from "./StageHistory.vue";
import RevealPanel from "./RevealPanel.vue";
import { useStageFx } from "./use-stage-fx";
import { stageAdds, stageHelp } from "../../state/craft-stage-help";
import VideoStage from "./VideoStage.vue";
import StageBasePicker from "./StageBasePicker.vue";
import StageModList from "./StageModList.vue";
import StageSimPanel from "./StageSimPanel.vue";
import VideoExtra from "./VideoExtra.vue";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import pkg from "../../../package.json";
import { isRune, runeNameOf, RUNE_PREFIX } from "../../services/craft-stage/stage-runes";
import { kindOf, whittleTargets } from "../../services/craft-stage/apply-currency";
import { OMEN_FOR } from "../../services/craft-stage/omens";
import { socketCapOf } from "../../services/craft-stage/stage-runes";
import ShelfButton from "./ShelfButton.vue";
import HelpTip from "../../components/ui/HelpTip.vue";
import Icon from "../../components/ui/Icon.vue";
import { searchModGroups, type ModGroup } from "../../services/craft-stage/trade-search";
import type { StageMod } from "../../services/craft-stage/types";

const s = craftStage;
/** ルーンを持ってルーンの入ったソケットを押した: そのソケットを置き換える手 (`rune:<名前>@<n>`)。ルーン以外はアイテムを押したのと同じ */
function useAtSocket(n: number): void {
  const k = s.held.value;
  if (k && isRune(k)) s.use(`${RUNE_PREFIX}${runeNameOf(k)}@${n}`);
  else s.use();
}
onMounted(() => void s.init());

const ILVLS = [45, 65, 75, 82, 86];

/** 持っているカレンシーのアイコンをカーソルに付ける */
const mouse = ref({ x: 0, y: 0 });
// マウスの位置は拡大前の CSS ピクセルに直して持つ (fixed の left/top に入れるため)。1660 幅より広い窓 (全画面 1920 で zoom 1.157) で
// カーソルに付く絵と波紋が右下にずれていた (2026-10-08 POE2Tube 要望 ㊳。clientX は実ピクセル、fixed の left は CSS ピクセル)
const onMove = (e: MouseEvent) => (mouse.value = { x: toCss(e.clientX), y: toCss(e.clientY) });
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") s.hold(null);
  // シミュレーションの時は StageSimPanel.vue が「1 つ戻す」に使う
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && (s.mode.value === "hand" || s.replay.value)) { e.preventDefault(); s.undo(); }
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
  return whittleTargets(it).map((m) => m.modId);
});
/** 打った瞬間の演出 (波紋・枠の光・「レアに!」など) */
const fx = useStageFx(mouse);
const fxCls = computed(() => (fx.value ? { hit: "stage-hit", up: "stage-up", shake: "stage-shake" }[fx.value.kind] : ""));
/** 付いた / 消えた MOD を光らせ直すための番号 (手ごとに変わる) */
const flashKey = computed(() => s.log.value[s.log.value.length - 1]?.out.index ?? 0);

/** JSON をコピー (POE2Tube に渡す / CLI の --prices に使う) */
const copied = ref("");
async function copy(label: string, v: unknown): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(v, null, 2));
    copied.value = `${label}をコピーしました`;
  } catch {
    copied.value = "コピーできませんでした";
  }
  setTimeout(() => (copied.value = ""), 2500);
}
/** シミュレーションでまだベースを選んでいない (ベース選びだけを出す) */
/**
 * シミュレーションは開くたびにまっさら (ベースを選ぶ所) から。前回閉じた途中は戻さない
 * (2026-10-08 オーナー「前回閉じたクラフトの名残が残るから毎回リセットでおｋ」。途中は writeSimSession で要望・バグの添付にだけ残す。レシピは別に残る)
 */
/** 手で打つ画面の今のアイテムの MOD 群 (未発現は除く。固定・冒涜も同じ条件で、種類は問わない) */
const stageModGroups = computed<ModGroup[]>(() => {
  const it = s.item.value;
  if (!it) return [];
  return [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed).map((m) => ({ picks: [{ modId: m.modId, minTierIndex: m.tierIndex }] }));
});
async function searchStageMods(): Promise<void> {
  const d = s.data.value, it = s.item.value;
  // 今のアイテムそのものを探すので、ベース・アイテムレベル・ソケット・各 MOD の段の下限まで入れる
  // (2026-10-08 オーナー「今の MOD で検索なんだからベースからベースレベルからなにから。ティアだけは下限でおｋ」)
  if (d && it && stageModGroups.value.length) await searchModGroups(d, { groups: stageModGroups.value, exact: { baseType: it.base, ilvlMin: it.itemLevel, socketsMin: it.sockets ?? 0 } });
}
const simNoBase = computed(() => s.mode.value === "sim" && !s.replay.value && !s.simPicked.value);
/** シミュレーションのソケットの上限 (熟練工の上限と、その + 1 = 規格外) */
const simCraftCap = computed(() => (s.item.value ? socketCapOf(s.base.value, s.item.value.cls.category) : 0));
const simSocketCap = computed(() => (simCraftCap.value > 0 ? simCraftCap.value + 1 : 0));
/** 道具の帯のボタン (ゲームの 3 枚ボタン、src/styles/game-ui.css) */
const btn = "g-btn sm";
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
/** 帯から打った直後の結果 (1.8 秒だけ帯に出す。カードと直前の変化は画面の上で見えないため。2026-10-08 レビュー A1) */
const barMsg = ref<{ text: string; tone: string } | null>(null);
let barTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * 持っている物の短い説明 (帯に箇条書き。PC の説明カードと同じ元 = craft-stage-help の stageHelp / stageAdds)。
 * 2026-10-08 オーナー「説明文は小さくてもいいからタップした際付けた方がいい、箇条書きでいい。増強とかアイテムレベルの加減あるでしょ」
 */
const helpOpen = ref(false);
const heldHelp = computed((): string[] => {
  const k = s.held.value;
  if (!k) return [];
  const strip = (t: string): string => t.replace(/\*\*/g, "");
  const lines = stageHelp(k, s.data.value, s.item.value).map(strip);
  const adds = stageAdds(k, s.data.value, s.item.value);
  return [...lines, ...(adds ? [`${adds.head}: ${adds.lines.slice(0, 3).join(" / ")}${adds.lines.length > 3 ? " …" : ""}`] : [])];
});
watch(() => s.held.value, () => { helpOpen.value = false; });
/** 持っている物が今打てない理由 (帯のボタンを灰色に。2026-10-08 レビュー A2) */
const heldWhy = computed(() => (s.held.value ? s.usable(s.held.value) : null));
function useFromBar(): void {
  if (heldWhy.value) return;
  s.use();
  const last = s.last.value;
  const parts: string[] = [];
  if (last) {
    if (!last.out.applied) parts.push(`打てない: ${last.out.reason ?? ""}`);
    for (const m of last.added) parts.push(`＋ ${m.textJa}`);
    for (const m of last.removed) parts.push(`－ ${m.textJa}`);
    if (last.out.note) parts.push(String(last.out.note));
    if (!parts.length) parts.push("MOD は変わらない");
  }
  barMsg.value = { text: parts.join("  "), tone: last && !last.out.applied ? "text-rose-300" : last?.removed.length && !last.added.length ? "text-rose-300" : "text-emerald-300" };
  clearTimeout(barTimer);
  // 2 行まで出して、次の操作 (持つ / 離す) か 5 秒で消す (1 行 1.8 秒だとカオスの ＋/－ が読めなかった。2026-10-08 レビュー)
  barTimer = setTimeout(() => { barMsg.value = null; }, 5000);
}
watch(() => s.held.value, () => { barMsg.value = null; });
// 発現 (3 つから選ぶ) で付いた物も帯に出す (帯から打った時しか出ていなかった)
watch(() => s.log.value[s.log.value.length - 1]?.out.index ?? 0, (n, o) => {
  const last = s.last.value;
  if (!phone.value || n <= (o ?? 0) || !last || !String(last.out.currency).startsWith("reveal")) return;
  barMsg.value = { text: last.added.map((m) => `＋ ${m.textJa}`).join("  ") || "発現した", tone: "text-emerald-300" };
  clearTimeout(barTimer);
  barTimer = setTimeout(() => { barMsg.value = null; }, 5000);
});
/**
 * アイテムの MOD を右クリックでフラクチャー (今の段のまま固定。2026-10-09 オーナー「MOD 右クリックでフラクチャー化させてあげてもいいかも」)。
 * MOD 一覧の「フラクチャー」と同じ手 (レアだけ・1 つまで。打てない時は理由が出る)
 */
function fractureMod(m: StageMod): void {
  const n = s.data.value?.mods.get(m.modId)?.tiers.length ?? 0;
  s.use(forceKey(m.modId, n ? `T${n - m.tierIndex}` : null, "f"));
}
/** 発現の候補が出ている時: 帯を「発現する MOD を選ぶ ↑」にしてパネルへ送る (骨 → 発現の流れ。2026-10-08 レビュー A3) */
function scrollToReveal(): void { document.querySelector("[data-reveal-panel]")?.scrollIntoView({ block: "center", behavior: "smooth" }); }
/**
 * シミュレーションのベースを選んだ時は、狙い・順番・パターンを空に戻す (前のベースの手が残って変になっていた。
 * 2026-10-07 オーナー「腕のキャッシュで表示されてた、一回やり直したらシミュレーションの所はリセットだね」)
 */
function pickSimBase(en: string): void {
  s.base.value = en;
  s.simTargets.value = [];
  s.simOrder.value = [];
  s.simPatterns.value = [{ name: "パターン 1", steps: [], play: { v: 2, moves: [] } }];
  s.simStart.value = "white";
  s.simStartItem.value = null;
  s.simPicked.value = true;
  s.reset();
  // スマホ: 選んだ所 (下の方) から一番上の見出しまで飛ばず、ベースの欄 (次に決めるアイテムレベル・始め方) を画面の上に (2026-10-09)
  if (phone.value) void nextTick(() => document.querySelector("[data-stage-settings]")?.scrollIntoView({ block: "start" }));
}
/**
 * 手で打つ画面の今のアイテムをそのままシミュレーションの始めの状態に (2026-10-08 オーナー「その MOD が付いた状態以降を確認したい時があるから、
 * 手打ちからそのまま持っていくコース」)。ベース・アイテムレベルは同じ、ベース代の既定は 手打ちの累計 + 白ベース代
 */
/** アプリ版だけ (Web 版は POE2Tube 用の JSON・動画モードを出さない) */
const inApp = isTauriRuntime();
/** 白に戻す (2 回押し) */
const resetArmed = ref(false);
let resetArmTimer: ReturnType<typeof setTimeout> | undefined;
function armReset(): void {
  if (!resetArmed.value) { resetArmed.value = true; clearTimeout(resetArmTimer); resetArmTimer = setTimeout(() => { resetArmed.value = false; }, 3000); return; }
  resetArmed.value = false;
  s.reset();
}
/** 直前の手でルーンをはめた中身 (置き換えた物) */
const augChange = computed(() => (s.last.value?.out as { augment_change?: { socket: number; put: { ja: string }; replaced: { ja: string } | null } } | undefined)?.augment_change ?? null);
/** ベースを選ぶ前の右上の「レシピ」(シミュレーターの帯は StageSimPanel が出すが、ベースを選ぶ前はまだ無い) */
const preRecipeOpen = ref(false);
function startFromRecipe(r: SimRecipe): void {
  preRecipeOpen.value = false;
  s.simPendingRecipe.value = r.id;
  pickSimBase(r.session.base);
}
function simFromHand(): void {
  const it = s.item.value;
  if (!it) return;
  s.simStartItem.value = { ...it, prefixes: it.prefixes.map((m) => ({ ...m })), suffixes: it.suffixes.map((m) => ({ ...m })) };
  s.simStartCost.value = s.total.value;
  // 付いている MOD は狙いに入れておく (その段以上。消えたら取り直す)。足したい MOD を 2 で足して決めたら、そのままツリー (3〜5 は飛ばす)
  s.simTargets.value = [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed).map((m) => ({ modId: m.modId, minTierIndex: m.tierIndex, ...(m.fractured ? { method: "fracture" as const } : m.desecrated ? { method: "desecrate" as const } : {}) }));
  s.simOrder.value = [];
  s.simPatterns.value = [{ name: "パターン 1", steps: [], play: { v: 2, moves: [] } }];
  s.simSockets.value = it.sockets ?? 0;
  s.simStart.value = "item";
  s.simPicked.value = true;
  s.mode.value = "sim";
}
/** 手打ちの状態の MOD (1 ベースの札の下に 1 行) */
const startItemMods = computed(() => {
  const it = s.simStartItem.value;
  return it ? [...it.prefixes, ...it.suffixes].map((m) => `${m.fractured ? "🔒 " : ""}${m.textJa} (${m.tierName})`) : [];
});
/** 始め方の札 (1 ベース)。白以外は 2 狙う MOD の最初の 1 つが固定 MOD になる */
const START_KINDS: Array<{ k: "white" | "fractured" | "four"; label: string; hint: string }> = [
  { k: "white", label: "白ベースから", hint: "白のベースを買って 1 から作る" },
  { k: "fractured", label: "フラクチャー済みを買う", hint: "フラクチャーの MOD が 1 つ付いたベースを買う。フラクチャーの MOD は 2 狙う MOD で最初に足した物" },
  { k: "four", label: "4 MOD のレアを買う", hint: "3 MOD + 狙い 1 のレアを買って、骨の壁を足してからフラクチャー (当たり 1/3)" },
];
/** 手打ちから持ってきた時だけ出る札 */
const ITEM_KIND = { k: "item" as const, label: "エミュレーターの状態から", hint: "エミュレーターの今のアイテムから先を回す" };
</script>

<template>
  <div class="h-full overflow-auto p-4 @container" :class="phone && s.mode.value === 'hand' && (s.held.value || s.offers.value) ? 'pb-32' : ''" @contextmenu.prevent="s.hold(null)">
    <!-- スマホ: 持っている物の帯 (画面の下に固定)。アイテムに使う / 離す -->
    <div v-if="phone && s.mode.value === 'hand' && (s.held.value || s.offers.value) && !s.replay.value" class="fixed inset-x-0 bottom-0 z-[150] border-t border-amber-400/40 bg-[#14110d]/95 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[13px] shadow-[0_-6px_20px_rgba(0,0,0,0.6)]">
      <!-- 発現の候補が出ている間は、選ぶ所へ送る案内だけ -->
      <div v-if="s.offers.value" class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate text-rose-200">発現する MOD を 3 つから選ぶ</span>
        <button type="button" class="min-h-11 rounded-lg bg-rose-500/30 px-3 py-2 font-bold text-rose-50 ring-1 ring-rose-400/70" @click="scrollToReveal">選ぶ ↑</button>
      </div>
      <template v-else>
        <!-- 打った直後は結果を 1 行 (1.8 秒)。その後は持っている物と掛けたお告げ -->
        <p v-if="barMsg" class="mb-1 line-clamp-2 text-[12px] font-bold leading-snug" :class="barMsg.tone">{{ barMsg.text }}</p>
        <!-- 結果を出している間も、次が打てない理由は出す (「使う」が灰色の訳が見えなかった。2026-10-08 使い倒しテスト) -->
        <p v-if="heldWhy" class="mb-1 truncate text-[12px] text-rose-300">{{ heldWhy }}</p>
        <!-- 持っている物の説明 (箇条書き、既定は 2 行まで。押すと全部) -->
        <div v-else-if="heldHelp.length && !barMsg" class="mb-1 flex items-start gap-2">
          <ul class="min-w-0 flex-1 list-disc pl-4 text-[11px] leading-snug text-white/70" :class="helpOpen ? '' : 'max-h-[2.6em] overflow-hidden'" @click="helpOpen = !helpOpen">
            <li v-for="(l, i) in (helpOpen ? heldHelp : heldHelp.slice(0, 2))" :key="i" class="pr-1" :class="helpOpen ? '' : 'truncate'">{{ l }}</li>
          </ul>
          <button type="button" class="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-[11px] opacity-80" @click="helpOpen = !helpOpen">{{ helpOpen ? "閉じる ▴" : "説明 ▾" }}</button>
        </div>
        <div class="flex items-center gap-2">
          <img v-if="iconOf(s.held.value!)" :src="iconOf(s.held.value!)" alt="" class="h-9 w-9 object-contain" />
          <span class="min-w-0 flex-1 truncate"><b class="text-amber-100">{{ nameOf(s.held.value!) }}</b><span v-if="s.omens.value.length" class="ml-1 text-orange-200">+ {{ s.omens.value.map((o) => nameOf(o)).join("・") }}</span></span>
          <button v-if="s.log.value.length" type="button" class="min-h-11 whitespace-nowrap rounded-lg border border-white/20 px-2.5 py-2 opacity-80" title="直前の 1 手を取り消す" @click="s.undo()">1 手戻す</button>
          <button type="button" class="min-h-11 rounded-lg bg-amber-500/30 px-3 py-2 font-bold text-amber-50 ring-1 ring-amber-400/70 active:bg-amber-500/50 disabled:opacity-35" :disabled="!!heldWhy" @click="useFromBar">使う</button>
          <!-- 離す = 大きめの × (2026-10-08 オーナー「バツボタン割とデカく」) -->
          <button type="button" class="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/25 text-[22px] leading-none opacity-80" title="離す" @click="s.hold(null)">×</button>
        </div>
      </template>
    </div>
    <div class="mb-3 flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <!-- 画面名は他の画面と同じ窓の題の帯 (TabBar の .g-tabbar) -->
        <h1 class="g-tabbar g-brush flex items-center px-8 text-[22px] max-md:!min-h-[40px] max-md:px-6 max-md:text-[17px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">クラフトステージ</h1>
        <p v-if="s.mode.value === 'sim' && !s.replay.value" class="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--exile-color-text-secondary)] max-md:hidden">ベースと狙う MOD を決めて打ち方を組み、何百人分も作って 1 個あたりの費用を出す
          <HelpTip title="シミュレーター" :width="320">
            <p>1 ベース → 2 狙う MOD → 始め方と順番 → 打ち方 (パターン) の順に決めて「回す」。</p>
            <p class="mt-1 text-[var(--exile-color-text-secondary)]">確率はクラフト計算機と同じ規則。値段は今の相場。</p>
          </HelpTip>
        </p>
        <p v-else class="mt-1 text-xs text-[var(--exile-color-text-secondary)] max-md:hidden">カレンシー・骨・エッセンス・カタリストを押して持ち、アイテムを押すと 1 回使います (持ったまま連打できます)。お告げは掛けておくと次の関係する手で使われます。確率はクラフト計算機と同じ規則です。</p>
      </div>
      <!-- シミュレーションの時はシミュレーションだけの表示通貨 (タブの行の右端) を使う -->
      <CurrencyPicker v-show="s.mode.value === 'hand' || !!s.replay.value" />
    </div>

    <!-- 手で打つ / シミュレーション (2026-10-05、実験。オーナー「ステージにもう 1 個タブ作ってやってみるか」) -->
    <!-- 再生中も消さずに隠す (シミュレーションの「1 つ戻す」の置き場 #sim-tools を残す) -->
    <div v-show="!s.replay.value" class="mb-4 flex flex-wrap items-center gap-1.5">
      <div class="inline-flex gap-1" role="tablist">
        <button v-for="t in ([['hand', 'エミュレーター'], ['sim', 'シミュレーター']] as const)" :key="t[0]" type="button" role="tab" :aria-selected="s.mode.value === t[0]" class="g-tab min-w-[170px] gap-1.5 !inline-flex" :class="s.mode.value === t[0] ? 'on' : ''" @click="s.hold(null); s.mode.value = t[0]">{{ t[1] }}<span v-if="t[0] === 'sim'" class="text-[10px] font-normal opacity-70" title="作り込み中の機能。数字は今の相場と確率の目安">β</span></button>
      </div>
      <!-- シミュレーションの「1 つ戻す」「説明」(StageSimPanel.vue が Teleport で置く) -->
      <div id="sim-tools" class="ml-auto flex items-center gap-1.5 text-[12px] max-md:w-full max-md:flex-wrap">
        <!-- ベースを選ぶ前も同じ帯を出す (2026-10-09 オーナー「ここはずっと出してていい」)。選んだ後は StageSimPanel の物に替わる -->
        <template v-if="s.mode.value === 'sim' && simNoBase">
          <CurrencyPicker sim />
          <span class="relative">
            <button type="button" class="inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-[13px] transition max-md:h-10" :class="preRecipeOpen ? 'border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-text-primary)]' : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'" title="保存したレシピから始める" @click="preRecipeOpen = !preRecipeOpen">レシピ<Icon :name="preRecipeOpen ? 'chevron-up' : 'chevron-down'" class="size-4" /></button>
            <div v-if="preRecipeOpen" class="fixed inset-0 z-30 bg-black/60 md:hidden" @click="preRecipeOpen = false"></div>
            <div v-if="preRecipeOpen" class="absolute right-0 top-full z-40 mt-1 w-[26rem] rounded-xl border border-white/15 bg-[#14110d] p-3 text-[12px] shadow-2xl max-md:fixed max-md:inset-x-3 max-md:top-14 max-md:w-auto max-md:max-h-[80vh] max-md:overflow-y-auto">
              <StageRecipeStart compact @start="startFromRecipe" />
            </div>
          </span>
          <button type="button" disabled class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-[var(--exile-color-text-secondary)] opacity-30 max-md:h-10" title="ベースを選んでから"><Icon name="rotate" class="size-4" /><span class="max-md:hidden">リセット</span></button>
          <button type="button" disabled class="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-[var(--exile-color-text-secondary)] opacity-30 max-md:h-10" title="戻せる操作がまだ無い"><Icon name="undo" class="size-4" /><span class="max-md:hidden">1 つ戻す</span></button>
        </template>
      </div>
    </div>

    <!-- 再生モード -->
    <div v-if="s.replay.value" class="mb-3 flex items-center gap-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[12px]">
      <b class="text-sky-200">再生中</b>
      <span>{{ s.replay.value.plan.title ?? s.replay.value.plan.base }} · {{ s.log.value.length }} 手目まで (seed {{ s.replay.value.plan.seed }})</span>
      <button v-if="inApp" type="button" :class="btn" class="ml-auto max-md:hidden" @click="s.video.value = { from: 0, autoplay: false, controls: true }">動画モード</button>
      <button type="button" :class="btn" @click="s.leaveReplay()">エミュレーターへ</button>
    </div>

    <!-- 設定と操作 -->
    <section v-if="!s.replay.value" data-stage-settings class="g-panel mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-1 text-[12px]">
      <!-- ベース (押すと種類 → ベースのカードが開く。StageBasePicker.vue) -->
      <span v-if="s.mode.value === 'sim'" class="flex items-center gap-2.5">
        <span class="grid size-6 place-items-center rounded-full text-[12px] font-bold" :class="simNoBase ? 'bg-[var(--exile-color-accent-focus)] text-black' : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40'">{{ simNoBase ? 1 : "✓" }}</span>
        <h3 class="text-[15px] font-bold text-[var(--exile-color-text-primary)]">ベース</h3>
        <HelpTip text="作るアイテムの種類 (ベース) とアイテムレベル。ソケットと始め方 (白から作るか、フラクチャー済みを買うか) もここで" />
      </span>
      <!-- ベースを選ぶ前は、保存したレシピから始めるのを先に (2026-10-09 オーナー「ここの時点でレシピとかの選択させるような UI じゃないと」) -->
      <StageRecipeStart v-if="s.mode.value === 'sim' && simNoBase" class="mb-1 border-b border-white/10 pb-3" @start="startFromRecipe" />
      <StageBasePicker :base="s.base.value" :data="s.data.value" :unpicked="simNoBase" @pick="pickSimBase" />
      <span v-if="!simNoBase" class="flex items-center gap-1">
        <span class="mr-1 whitespace-nowrap text-[12px] text-[var(--exile-color-text-secondary)]">{{ phone ? "iLv" : "アイテムレベル" }}</span>
        <button v-for="lv in ILVLS" :key="lv" type="button" class="g-tab !min-h-[30px] !px-3 tabular-nums max-md:!min-h-10" :class="s.itemLevel.value === lv ? 'on' : ''" @click="s.itemLevel.value = lv; s.reset()">{{ lv }}</button>
      </span>
      <!-- シミュレーション: 白のベースのソケットの数 (規格外 = 熟練工の上限 + 1 まで) -->
      <span v-if="s.mode.value === 'sim' && !simNoBase && simSocketCap > 0" class="flex items-center gap-1">
        <span class="mr-1 text-[12px] text-[var(--exile-color-text-secondary)]">ソケット</span>
        <button v-for="n in simSocketCap + 1" :key="n" type="button" class="g-tab !min-h-[30px] !px-3 tabular-nums max-md:!min-h-10" :class="s.simSockets.value === n - 1 ? 'on' : ''" @click="s.simSockets.value = n - 1">{{ n - 1 }}<span v-if="n - 1 > simCraftCap" class="ml-1 text-[11px] text-[var(--exile-color-text-tertiary)]" title="熟練工のオーブの上限より多い (規格外の品だけ)">規格外</span></button>
        <span v-if="s.simSockets.value == null" class="text-amber-200/80">ソケットの数を選ぶ</span>
      </span>
      <!-- 始め方 (白 / 固定済みを買う / 4 MOD を買う)。2026-10-08 オーナー「最初の段階から選択式がいい」 -->
      <span v-if="s.mode.value === 'sim' && !simNoBase" class="flex flex-wrap items-center gap-1 max-md:grid max-md:w-full max-md:grid-cols-1">
        <span class="mr-1 text-[12px] text-[var(--exile-color-text-secondary)]">始め方</span>
        <button v-for="x in (s.simStartItem.value ? [...START_KINDS, ITEM_KIND] : START_KINDS)" :key="x.k" type="button" class="g-tab !min-h-[30px] !px-3 max-md:!min-h-10" :class="s.simStart.value === x.k ? 'on' : ''" :title="x.hint" @click="s.simStart.value = x.k"><Icon v-if="x.k === 'fractured'" name="lock" class="size-3.5 shrink-0" />{{ x.label }}</button>
        <span v-if="s.simStart.value === 'item'" class="text-[11px] opacity-70 max-md:w-full">{{ s.simStartItem.value?.rarity === "rare" ? "レア" : s.simStartItem.value?.rarity === "magic" ? "マジック" : "ノーマル" }} · {{ startItemMods.length ? startItemMods.join(" / ") : "MOD なし" }}</span>
        <HelpTip v-else-if="s.simStart.value !== 'white'" text="フラクチャー (固定) される MOD は、2 狙う MOD で最初に足した物" />
      </span>
      <template v-if="s.mode.value === 'hand'">
      <!-- 白に戻すは 1 手戻すでは戻せないので 2 回押し (2026-10-08 完成判定: 9 手分が確認無しで消えた) -->
      <button type="button" :class="resetArmed ? 'g-btn-red sm' : btn" :disabled="!s.log.value.length && !s.startMods.value.length" @click="armReset">{{ resetArmed ? "もう一度押すと白に戻す" : "白に戻す" }}</button>
      <button type="button" :class="btn" :disabled="!s.log.value.length && !s.startMods.value.length" title="Ctrl+Z (まだ打っていない時は始めの MOD を 1 つ外す)" @click="s.undo()">1 手戻す</button>
      <!-- 今のアイテムをそのままシミュレーションの始めの状態に (2026-10-08) -->
      <button type="button" :class="btn" title="今のアイテム (付いている MOD・固定・ソケット) を始めの状態にしてシミュレーターへ。ベース代は エミュレーターの累計 + 白ベース代" @click="simFromHand">この状態からシミュレーター →</button>
      <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :disabled="!s.log.value.length" title="打った手を 16:9 の撮影用画面で 1 手ずつ再生 (Space 再生 / ← → 1 手 / Esc 閉じる)" @click="s.hold(null); s.video.value = { from: 0, autoplay: false, controls: true }">動画モード</button>
      <span class="ml-auto flex flex-wrap items-center gap-1.5">
        <span v-if="copied" class="text-emerald-300">{{ copied }}</span>
        <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :disabled="!s.log.value.length" title="今までの手を手順 JSON に (同じ seed なので craft-stage-run.mjs に流すと同じ結果)" @click="copy('手順 JSON', s.plan())">手順 JSON</button>
        <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" :disabled="!s.log.value.length" title="POE2Tube に渡す結果 JSON (今の相場の値段で)" @click="copy('結果 JSON', s.result(pkg.version))">結果 JSON</button>
        <button v-if="inApp" type="button" :class="btn" class="max-md:hidden" title="craft-stage-run.mjs の --prices に渡す相場 (高貴建て)" @click="copy('相場 JSON', s.prices())">相場 JSON</button>
        <!-- 今のアイテムの MOD 群を取引所 (JP) で (シミュレーションと同じ trade-search.ts。2026-10-07 オーナー「ステージでも同じエンジンで実装しておｋ」) -->
        <button type="button" :class="btn" :disabled="!stageModGroups.length" title="今のアイテムに付いている MOD の組み合わせで取引所 (JP) を開く (ベース・アイテムレベル・ソケット・段の下限まで)" @click="searchStageMods">今の MOD を取引所で検索 ↗</button>
      </span>
      </template>
    </section>

    <!-- スマホ: アイテムのカードが画面の外に出たら上に要約を貼る (2026-10-09 オーナー「下にスクロールしても MOD 付いても見えん」) -->
    <StageItemMini v-if="phone && !cardOnScreen && s.item.value && (s.mode.value === 'hand' || s.replay.value)" :item="s.item.value" :added="s.last.value?.added ?? []" :removed="s.last.value?.removed ?? []" />
    <p v-if="s.error.value" class="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-rose-300">{{ s.error.value }}</p>
    <p v-if="!s.ready.value && !s.error.value" class="py-12 text-center opacity-50">データを読んでいます…</p>

    <!-- 手で打つ画面と行き来しても入れた物が残るように、一度ベースを選んだら消さずに隠す (2026-10-05 オーナー「ステージと実験行き来できるように、行き来したらもっかい最初からになった」) -->
    <StageSimPanel v-if="s.ready.value && s.simPicked.value" v-show="s.mode.value === 'sim' && !s.replay.value" class="mb-4" />
    <div v-if="s.ready.value && (s.mode.value === 'hand' || s.replay.value)" class="grid gap-4 @5xl:grid-cols-[auto_1fr]">
      <!-- アイテム枠 + 直前の変化 -->
      <div class="flex flex-col items-center gap-8 max-md:items-stretch">
        <div ref="cardEl" class="relative" :class="[fxCls, fx?.text ? 'stage-fx-on' : '']" :style="fx ? { '--fx': fx.color } : undefined">
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
          @socket="useAtSocket"
        />
        <span v-if="fx?.text" :key="fx.n" class="stage-float" :class="fx.kind === 'shake' ? 'stage-float-plate text-sm' : 'text-2xl'">{{ fx.text }}</span>
        </div>
        <RevealPanel />
        <!-- ヒネコラの髪束の予見: 持っているカレンシーを打った時の結果 (次の手の seed で引くので、打つとこの通りになる) -->
        <div v-if="s.foresight.value" class="w-[380px] max-md:w-full rounded-xl border border-violet-400/50 bg-violet-500/10 p-3 text-[12px]">
          <p class="mb-1 font-bold text-violet-200">予見: {{ nameOf(s.foresight.value.key) }} を使うと</p>
          <p v-if="!s.foresight.value.applied" class="text-rose-300">使えない — {{ s.foresight.value.reason }}</p>
          <template v-else>
            <p v-for="(t, i) in s.foresight.value.added" :key="'fa' + i" class="text-emerald-300">＋ {{ t }}</p>
            <p v-for="(t, i) in s.foresight.value.removed" :key="'fr' + i" class="text-rose-300 line-through">－ {{ t }}</p>
            <p v-if="s.foresight.value.after.destroyed" class="font-bold text-rose-400">壊れる</p>
            <p v-if="s.foresight.value.after.corrupted && !s.item.value?.corrupted" class="font-bold text-[#d20000]">コラプトする</p>
            <p v-if="!s.foresight.value.added.length && !s.foresight.value.removed.length && !s.foresight.value.after.destroyed" class="opacity-60">MOD は変わらない</p>
          </template>
        </div>
        <div class="g-panel w-[380px] max-md:w-full p-2 text-[12px]">
          <p class="mb-1 flex items-center justify-between"><b class="g-antique text-[15px] font-normal text-[var(--exile-color-text-title)]">直前の変化</b><span class="tabular-nums opacity-70">累計 {{ displayCurrency.money(s.total.value) }} · {{ s.last.value?.out.index ?? 0 }} 手</span></p>
          <template v-if="s.last.value">
            <p class="opacity-80">{{ s.last.value.out.currency_ja }}<span v-if="s.last.value.out.omen_ja" class="ml-1 text-violet-300">+ {{ s.last.value.out.omen_ja }}</span><span v-if="!s.last.value.out.applied" class="ml-1 text-rose-300/80">— {{ s.last.value.out.reason }}</span></p>
            <p v-if="s.last.value.out.note" class="text-sky-200/90">{{ String(s.last.value.out.note) }}</p>
            <!-- ルーンを置き換えた時 (置き換えた方は壊れる。2026-10-08 完成判定: 直前の変化では分からなかった) -->
            <p v-if="augChange?.replaced" class="text-rose-300">{{ augChange.socket }} 番目の <span class="line-through">{{ augChange.replaced.ja }}</span> を {{ augChange.put.ja }} に置き換え (外した方は壊れる)</p>
            <p v-for="m in s.last.value.added" :key="'a' + m.modId" class="text-emerald-300">＋ {{ m.textJa }}</p>
            <p v-for="m in s.last.value.removed" :key="'r' + m.modId" class="text-rose-300 line-through">－ {{ m.textJa }}</p>
          </template>
          <p v-else class="opacity-50">まだ何も使っていません</p>
          <!-- 工程 (直前の変化の下、固定の高さで中だけ送る。2026-10-08 オーナー「工程はスクロールでいいから直前の変化の所に入れて固定枠で」) -->
          <div v-if="s.log.value.length" class="mt-3 border-t border-white/10 pt-2">
            <p class="mb-1 flex items-center gap-2"><b class="g-antique text-[15px] font-normal text-[var(--exile-color-text-title)]">工程</b><span class="text-[10px] opacity-50">{{ inApp ? "" : `最近 ${LOG_KEEP} 手まで` }}</span></p>
            <div class="max-h-72 overflow-y-auto pr-1 max-md:max-h-64"><StageHistory /></div>
          </div>
        </div>
      </div>

      <!-- カレンシー棚 + 工程履歴 -->
      <div class="min-w-0 space-y-4">
        <!-- 狙う (MOD 一覧の「狙う」で出る。打ち方ごとの付く確率) -->
        <StageAimPanel v-if="!s.replay.value" />
        <StageAimPicker v-if="s.aimPicker.value && s.item.value" />
        <section class="g-panel p-2">
          <p class="mb-2 flex items-center gap-2 text-[12px]">
            <b class="g-brush text-[20px] tracking-[0.14em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_0_#000]">カレンシー</b>
            <span v-if="s.held.value" class="rounded-full bg-amber-500/20 px-2 text-amber-200">持っている: {{ nameOf(s.held.value) }}</span>
            <span v-else class="opacity-50">押して持つ → アイテムを押す</span>
            <span v-for="o in s.omens.value" :key="o" class="cursor-pointer rounded-full bg-violet-500/20 px-2 text-violet-200 max-md:px-3 max-md:py-1.5" title="押すと外す" @click="s.toggleOmen(o)">{{ nameOf(o) }} ×</span>
          </p>
          <CurrencyShelf @hold="hold">
            <!-- 棚の中の「神〜ヴァールオーブ」の段の下に出る (置き場は CurrencyShelf が決める。上に出すと持っているカレンシーがずれる、オーナー 2026-10-04) -->
            <template v-if="heldOmens.length" #held>
              <div class="rounded-lg border border-violet-400/25 bg-violet-500/[0.06] p-2" data-held-omens>
                <p class="mb-1 text-[11px] text-violet-200/80">{{ nameOf(s.held.value ?? "") }} に掛けられるお告げ</p>
                <div class="flex flex-wrap gap-1.5">
                  <ShelfButton v-for="k in heldOmens" :key="k" :k="k" omen @pick="s.toggleOmen($event)" />
                </div>
              </div>
            </template>
          </CurrencyShelf>
        </section>

      </div>
    </div>
    <!-- このベースに付く MOD (StageModList.vue、2026-09-29) -->
    <!-- シミュレーションでは ① 狙う MOD の枠の中に出す (StageSimPanel.vue) -->
    <StageModList v-if="s.ready.value && s.item.value && (s.mode.value === 'hand' || s.replay.value)" />

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
      class="pointer-events-none fixed z-[200] h-10 w-10 object-contain drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]"
      :style="{ left: `${mouse.x + 8}px`, top: `${mouse.y + 8}px` }"
    />
    <VideoStage v-if="s.video.value && s.ready.value" />
    <!-- 動画用の別の画面 (URL の view=、要望 ⑪) -->
    <VideoExtra v-if="s.extra.value && s.ready.value" />
  </div>
</template>
