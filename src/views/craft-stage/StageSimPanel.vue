<!--
  StageSimPanel.vue — クラフトステージのシミュレーション (2026-10-05、実験)

  オーナー「この MOD 群をクラフトした場合にいくらかかるのか見たい」「ステージでタブ切り替えでエミュレーター作ってよくね」
  「どういう順番で付けるかを最初に選ばせて、それぞれフラクチャー・冒涜をする箇所を選ばせて、順番通りに作る」
  「取引所関連は設定だけしてあげて検索ボタンで自分で拾いに行かせる。値段設定とかも手動で」。
  狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)。狙いの順番と付け方 (高貴 / カオス / 冒涜 / エッセンス /
  フラクチャー) を決めて、ステージの 1 手で何百回も打つ ([[recipe-sim.ts]])。真ん中くらいの 1 回を「手で打つ」で再生できる。
  半自動 (2026-10-05 オーナー「自動化はやめておこうか、半自動化で、カオススパムやら消去リロールやらの仕組みは自動化」): 作り方を
  探す自動 (計算機の自動のツリー) は外した。計算機 (htc-craft) はそのまま。
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { craftStage, iconOf, nameOf, priceOf, readSimSession, writeSimSession } from "../../state/craft-stage";
import { CRAFT_RUNES_EN } from "../../services/htc/sockets";
import { rateOf, simCurrency } from "../../state/display-currency";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { runRecipe, type RecipeMethod, type RecipeResult, type RecipeSpec } from "../../services/craft-stage/recipe-sim";
import { tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../services/trade2/query/spec";
import { openTradeQuery } from "../../services/pob-check/trade-links";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import StageFracturePicker from "./StageFracturePicker.vue";
import StageTargetSummary from "./StageTargetSummary.vue";
import StageModList from "./StageModList.vue";
import PriceInput from "../../components/PriceInput.vue";
import { marketStore, MARKET_MAX_AGE_MS } from "../../state/market-store";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
import { hasStatKind, type StatKind } from "../../services/trade2/stat-kinds";
import { RUNES, runeEffectFor, socketCapOf } from "../../services/craft-stage/stage-runes";
import { checkSet, checkTarget, checkRune, patternSets, runeEnForId, setByKey, stateBefore, type CheckCtx, type Pattern, ANY_TARGET, checkAny, isDouble, singleKeyOf, hasCands, isRest, restMembers } from "../../services/craft-stage/pattern";
import type { CompiledStep } from "../../services/craft-stage/recipe-sim";
import StagePatternEditor from "./StagePatternEditor.vue";
import { planByRedoCost, type RedoPlan } from "../htc-craft/redo-cost";

const s = craftStage;
/** 回す回数は 1500 (2026-10-07 オーナー「デフォ 1500 でおｋ、後から回転数は決める」。その前は 500 / 1500 / 3000 / 1000) */
const runs = ref<number>(1500);

/** 付け方の名前 (2026-10-05 オーナー「カオスはカオススパム、高貴はガチャなので高貴ガチャ」) */
const METHOD_JA: Record<RecipeMethod, string> = { exalt: "高貴ガチャ", chaos: "カオススパム", desecrate: "冒涜", essence: "エッセンス", fracture: "フラクチャー" };
/** その MOD に使える付け方 (最初が既定) */
function methodsFor(modId: string): RecipeMethod[] {
  const m = s.data.value?.mods.get(modId);
  if (!m) return ["exalt"];
  if (m.source === "desecrated") return ["desecrate"];
  if (CRAFTED_SOURCES.has(m.source)) return ["essence"];
  return ["exalt", "chaos", "desecrate"];
}
const methodOf = (t: { modId: string; method?: RecipeMethod }): RecipeMethod => (t.method === "fracture" ? "fracture" : t.method && methodsFor(t.modId).includes(t.method) ? t.method : methodsFor(t.modId)[0]!);

/** 狙いの行 (文は狙いの段の値、「T2 以上」) */
const rows = computed(() => {
  const d = s.data.value;
  if (!d) return [];
  return s.simTargets.value.map((t) => {
    const m = d.mods.get(t.modId);
    const tier = m?.tiers[t.minTierIndex];
    return {
      ...t,
      method: methodOf(t),
      methods: methodsFor(t.modId),
      side: m?.type === "suffix" ? "サフィ" : "プレ",
      tone: m?.source === "desecrated" ? "text-lime-200/90" : m && CRAFTED_SOURCES.has(m.source) ? "text-sky-200" : "text-[#c8c8ff]",
      text: m ? fillHashes(jaOfMod(m), tier ? tierDisplayRanges(tier) : []).replace(/\n/g, " / ") : t.modId,
      rank: m ? `T${m.tiers.length - t.minTierIndex}` : "",
      /** 「どれか」の候補 (この手順はどれか 1 つが付けば当たり) */
      alts: (t.alts ?? []).map((a) => {
        const am = d.mods.get(a.modId);
        const at = am?.tiers[a.minTierIndex];
        return { modId: a.modId, text: am ? fillHashes(jaOfMod(am), at ? tierDisplayRanges(at) : []).replace(/\n/g, " / ") : a.modId, rank: am ? `T${am.tiers.length - a.minTierIndex}` : "" };
      }),
      /** 候補のうちいくつ付けば当たりか (どれか N つ。候補の数まで) */
      need: 1, // グループは 1 MOD (2 つ欲しい時はコピーして並べる)
    };
  });
});
/** 狙いの全部の MOD の印 (段も、どれかの候補も) */
const targetsSig = (): string => s.simTargets.value.map((t) => `${t.modId}:${t.minTierIndex}${t.need && t.need > 1 ? `x${t.need}` : ""}${(t.alts ?? []).map((a) => `|${a.modId}:${a.minTierIndex}`).join("")}`).join(",");
/** ③ 付ける順番 (フラクチャー以外、上から順) */
const restRows = computed(() => rows.value.filter((r) => r.method !== "fracture"));
/**
 * 5 順番計画の並び (2026-10-06 オーナー「5 番は指標、順番計画。付ける MOD を選ぶ時のプルダウンの順番をこれどおりに」
 * 「ルーンとかも付けていく順番を考えないといけないから順に表示」)。狙う MOD (フラクチャー以外) + 狙いのルーンの MOD に要るルーン + 足したルーン。
 * 並びは simOrder (無い物は後ろに)
 */
const runeNeeded = computed(() => {
  const out = new Set<string>();
  for (const t of s.simTargets.value) for (const x of [t, ...(t.alts ?? [])]) {
    const r = s.data.value?.mods.get(x.modId)?.rune;
    const en = r ? runeEnForId(r) : null;
    if (en) out.add(`rune:${en}`);
  }
  return out;
});
const orderKeys = computed(() => {
  const all = [...new Set([...restRows.value.map((r) => `mod:${r.modId}`), ...runeNeeded.value, ...s.simOrder.value.filter((k) => k.startsWith("rune:"))])];
  const pos = (k: string): number => { const i = s.simOrder.value.indexOf(k); return i < 0 ? 1e6 + all.indexOf(k) : i; };
  return all.sort((a, b) => pos(a) - pos(b));
});
function moveOrder(k: string, d: -1 | 1): void {
  const list = [...orderKeys.value];
  const i = list.indexOf(k), j = i + d;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  s.simOrder.value = list;
}
function addRune(en: string): void {
  if (en) s.simOrder.value = [...orderKeys.value, `rune:${en}`];
}
const removeRune = (k: string): void => { s.simOrder.value = orderKeys.value.filter((x) => x !== k); };
/**
 * 順番計画に足せるルーン: クラフトに関わるルーンだけ (クラフトステージの棚と同じ CRAFT_RUNES_EN)、このベースに効く物。
 * 選び方はステージの棚と同じ札 (2026-10-07 オーナー「基本クラフトルーンだけ表示、プルダウンじゃなくてステージの選ばせ方が好き」)
 */
const runeChoices = computed(() => {
  const it = s.item.value;
  if (!it) return [];
  return CRAFT_RUNES_EN.flatMap((en) => {
    const r = RUNES[en];
    const eff = r ? runeEffectFor(r, it.cls.category) : null;
    if (!r || r.available === false || !eff) return [];
    const k = `rune:${en}`;
    const inOrder = orderKeys.value.includes(k);
    const used = orderKeys.value.filter((x) => x.startsWith("rune:")).length;
    const why = runeNeeded.value.has(k) ? "狙いの MOD に要る (外せない)" : !inOrder && used >= socketCount.value ? `ソケットが足りない (${socketCount.value} つ)` : null;
    return [{ en, k, ja: r.ja, effect: eff.ja, inOrder, why }];
  });
});
function toggleRune(x: { en: string; k: string; inOrder: boolean; why: string | null }): void {
  if (x.why) return;
  if (x.inOrder) removeRune(x.k); else addRune(x.en);
}
const orderRow = (k: string) => restRows.value.find((r) => `mod:${r.modId}` === k);
const runeJa = (k: string): string => RUNES[k.slice(5)]?.ja ?? k.slice(5);

/**
 * やり直しの費用 (計算機の redo-cost.ts をそのまま使う。2026-10-06 オーナー「消去で消す MOD はカオススパムがつらいほどアカン、
 * 一回付いたらやり直せないみたいな基準によってリロール方法が変わる」)。狙いごとの取り方・1 回の値段・当たる確率・
 * 外れ 1 回のやり直し費用・見込み (取り直すといくらか) と、側ごとの外れの消し方 (素の消去 / 側のお告げ)。値段は高貴建て
 */
const redoPlan = computed<RedoPlan | null>(() => {
  const d = s.data.value, it = s.item.value;
  if (!d || !it || !rows.value.length) return null;
  // 計算機の値段の表の形 (無い物は undefined = 使えない)。値段はステージと同じ相場 (高貴建て)
  const px = new Proxy({} as Record<string, number>, { get: (_t, k) => { if (typeof k !== "string") return undefined; const v = priceOf(k); return v > 0 ? v : undefined; } });
  const fixedIds = fractureRows.value.map((r) => r.modId);
  const fside = fractureRow.value ? (fractureRow.value.side === "サフィ" ? "suffix" : "prefix") : null;
  try {
    return planByRedoCost({
      data: d, prices: { currency: px, omens: px, bones: px },
      targets: s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex })),
      fixedIds, qualityTag: null, chaosOk: true,
      limits: { prefix: it.cls.limits?.prefixes ?? 3, suffix: it.cls.limits?.suffixes ?? 3 },
      fixedSides: fside ? [fside] : [],
    }, it.cls, s.itemLevel.value);
  } catch {
    return null;
  }
});
/** 狙いごとのやり直しの見積もり (5 順番計画・6 パターンに出す) */
const redoOf = computed(() => new Map((redoPlan.value?.rows ?? []).map((r) => [r.modId, r])));
const redoCostMap = computed<Record<string, number>>(() => Object.fromEntries((redoPlan.value?.rows ?? []).map((r) => [r.modId, r.expected])));
const REDO_METHOD_JA: Record<string, string> = { chaos: "カオス", exalt: "高貴", desecrate: "冒涜", essence: "エッセンス" };

/** 6 パターンの始めの状態 (フラクチャー済みのレアか白) */
const patternStart = computed<CheckCtx["start"]>(() => ({
  rarity: fractureRow.value ? "rare" : "normal",
  fracturedSide: fractureRow.value ? (fractureRow.value.side === "サフィ" ? "suffix" : "prefix") : null,
  sockets: socketCount.value,
}));
/** パターンの打てない手 (回す前に止める。最初の 1 つ) */
function patternProblem(p: Pattern): string | null {
  const d = s.data.value, it = s.item.value;
  if (!d || !it) return null;
  const sets = patternSets(it.cls);
  const ctx: CheckCtx = { data: d, cls: it.cls, targets: s.simTargets.value, sets, runeJa: (en) => RUNES[en]?.ja ?? en, start: patternStart.value };
  for (let i = 0; i < p.steps.length; i++) {
    const st = stateBefore(ctx, p.steps, i);
    const x = setByKey(sets, p.steps[i]!.set);
    if (!x) return `${i + 1} 手目: カレンシーを選ぶ`;
    const w = checkSet(ctx, st, x);
    if (w) return `${i + 1} 手目: ${w}`;
    const tg = p.steps[i]!.target;
    if (x.kind === "annul") continue;
    if (!tg) return `${i + 1} 手目: 付ける物を選ぶ`;
    const tgc = isRest(tg) ? restMembers(p.steps, tg)[0] ?? tg : tg;
    const tw = tg === ANY_TARGET ? checkAny(st, x) : isRest(tg) ? (() => { const t = s.simTargets.value.find((y) => y.modId === tgc); return t ? checkTarget(ctx, { ...st, placed: new Set([...st.placed].filter((id) => !restMembers(p.steps, tg).includes(id))) }, x, t) : "残りの候補が無い"; })() : x.kind === "rune" ? checkRune(ctx, st, tg) : (() => { const t = s.simTargets.value.find((y) => y.modId === tg); return t ? checkTarget(ctx, st, x, t) : "狙う MOD に無い"; })();
    if (tw) return `${i + 1} 手目: ${tw}`;
    if (isDouble(x) && tg !== ANY_TARGET) {
      const t2 = p.steps[i]!.target2;
      if (!t2) return `${i + 1} 手目: 一緒に狙う MOD を選ぶ`;
      const t = s.simTargets.value.find((y) => y.modId === t2);
      const w2 = t ? checkTarget(ctx, stateBefore(ctx, [...p.steps.slice(0, i), { ...p.steps[i]!, target2: null, target3: null }], i + 1), x, t) : "狙う MOD に無い";
      if (w2) return `${i + 1} 手目 (2 つ目): ${w2}`;
    }
  }
  return null;
}

/** フラクチャーの狙いの始め方。付いた状態のベースの値段は手で (神) */
const fractureRows = computed(() => rows.value.filter((r) => r.method === "fracture"));
/**
 * フラクチャーの候補を 1 つずつに (あるいは付きの手順は候補を全部。2026-10-05 オーナー「フラクチャーは複数あったら全部で 1 つのグループで
 * いい、全部フラクチャー予定として」)。どれか 1 つが固定されれば良い (どれか N つの N はフラクチャーでは見ない)
 */
const fracMembers = computed(() => fractureRows.value.flatMap((r) => {
  const t = s.simTargets.value.find((x) => x.modId === r.modId);
  return [
    { modId: r.modId, minTierIndex: r.minTierIndex, text: r.text, rank: r.rank, side: r.side, tone: r.tone },
    ...r.alts.map((a) => ({ modId: a.modId, minTierIndex: t?.alts?.find((x) => x.modId === a.modId)?.minTierIndex ?? 0, text: a.text, rank: a.rank, side: r.side, tone: r.tone })),
  ];
}));
const fractureRow = computed(() => fractureRows.value[0] ?? null);
/**
 * 作り方は 変成・増強ガチャ → 王者 → 骨の壁 (4 つ目を骨の未発現の冒涜に、候補が 1 つ減る) だけ
 * (2026-10-05 オーナー「基本これする時骨壁するから他の選択肢いらない」。錬金 → カオス・壁なしは recipe-sim.ts には残す)
 */
const makeRoute = ref<"alch" | "magic">("magic");
const blocker = ref(true);
const boughtDivine = ref<number | null>(null);
/**
 * 白のベースの値段 (神、手で入れる。規格外のソケット付きならその値段)。白から始める時・作り直す時に数え、マジックで外れた時の
 * 「消去」と「白を買い直して変成」の比べに使う (2026-10-05 オーナー「消去もバカにならんが」「ベースの規格外の値段次第」)
 */
const whiteDivine = ref<number | null>(null);
/** 4 MOD・当たり 1 (フラクチャーの狙いが付いた、固定していないレア) のベースの値段 (神、手で入れる) */
const fourDivine = ref<number | null>(null);

/**
 * 値段の変わりに付いていく (2026-10-05 オーナー「価格変動に対応できる仕組みがいいね、カレンシーとベースの。結局 1 からでも白ベースは買う」)。
 *   - カレンシー: 相場 (カレンシーランキングと同じ) をいつの値段か出し、取り直せる。取り直すと計算も回した結果も出し直す
 *   - ベース: 手で入れた値段 (白 / 4 MOD / 固定済み) をベースとアイテムレベルごとに覚え、いつ入れたかを出す (1 日以上前は色を変える)。
 *     取引所は自動で取らない (サーバーに置く前提、[[sim-no-trade-fetch]])
 */
/**
 * 手で入れる値段は全部 高貴建てで持つ。欄は共通の [[PriceInput.vue]] (数字 + 単位のプルダウン、欄ごとに単位を覚える、最初はカオス。
 * 2026-10-05 オーナー「こういう所も単位選べるようにでしょ」)。覚えた値段は { v: 高貴建て, u: "exalt" }。
 * 前の形 (入れた単位 u ごと、u が無ければ神) は読む時に今の相場で高貴建てに直す
 */
type OldUnit = "exalt" | "chaos" | "divine";
const exOf = (u: OldUnit): number => (u === "exalt" ? 1 : priceOf(u) || 1);
const toExalt = (k: { v: number; u?: OldUnit } | undefined): number | null => {
  const v = num(k?.v);
  return v == null ? null : v * exOf(k?.u ?? "divine");
};
type Kept = { v: number; at: number; u?: OldUnit };
/** 入れた値段 (空欄・負は未入力) */
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const PRICE_KEY = "exiledesk.craftStageSim.basePrices";
const keptAll = ref<Record<string, Partial<Record<"white" | "four" | "bought", Kept>>>>({});
try { keptAll.value = JSON.parse(localStorage.getItem(PRICE_KEY) ?? "{}"); } catch { /* 無くてよい */ }
/**
 * 白のベースのソケットの数 (2026-10-05 オーナー「ベース選択後ソケットの数を 0 / 1 / 2 で選ばせて、これだとただの通常品のベース」)。
 * 選べる数は規格外まで = 熟練工の上限 + 1 (胴・両手 3 / ほか 2。2026-10-05 オーナー「規格外計算でやってくれ、マックスの +1 まであるでしょ」)。
 * 付けられない部位 (装飾品など) は 0 で選ばない
 */
const craftCap = computed(() => (s.item.value ? socketCapOf(s.base.value, s.item.value.cls.category) : 0));
const socketCap = computed(() => (craftCap.value > 0 ? craftCap.value + 1 : 0));
/** ソケットの数は 1 ベースの枠 (CraftStage.vue) で選ぶので状態に置く */
const sockets = s.simSockets;
const socketsOk = computed(() => socketCap.value === 0 || sockets.value != null);
const socketCount = computed(() => (socketCap.value === 0 ? 0 : sockets.value ?? 0));
watch(() => s.base.value, () => { sockets.value = null; });
/** ソケットの数だけ下限にした取引所の条件 (0 なら付けない) */
const socketQuery = (): { socketsMin?: number } => (socketCount.value > 0 ? { socketsMin: socketCount.value } : {});
const keptKey = computed(() => `${s.base.value}|${s.itemLevel.value}${socketCount.value ? `|s${socketCount.value}` : ""}`);
const kept = computed(() => keptAll.value[keptKey.value] ?? {});
let loadingKept = false;
function loadKept(): void {
  loadingKept = true;
  whiteDivine.value = toExalt(kept.value.white);
  fourDivine.value = toExalt(kept.value.four);
  boughtDivine.value = toExalt(kept.value.bought);
  void Promise.resolve().then(() => { loadingKept = false; });
}
function saveKept(which: "white" | "four" | "bought", v: number | null): void {
  if (loadingKept) return;
  const cur = { ...(keptAll.value[keptKey.value] ?? {}) };
  const n = num(v);
  if (n == null) delete cur[which];
  else cur[which] = { v: n, at: Date.now(), u: "exalt" };
  keptAll.value = { ...keptAll.value, [keptKey.value]: cur };
  try { localStorage.setItem(PRICE_KEY, JSON.stringify(keptAll.value)); } catch { /* 無くてよい */ }
}
/** 「1 つ戻す」で状態を戻している間 (ソケットを戻した時に値段の読み込み・工程のリセットで上書きしない) */
let restoring = false;
watch(keptKey, () => { if (!restoring) loadKept(); }, { immediate: true });
watch(whiteDivine, (v) => saveKept("white", v));
watch(fourDivine, (v) => saveKept("four", v));
watch(boughtDivine, (v) => saveKept("bought", v));
/** いつ入れた値段か (「3 時間前」)。1 日以上前は old */
function ageOf(which: "white" | "four" | "bought"): { text: string; old: boolean } | null {
  const k = kept.value[which];
  if (!k) return null;
  const min = Math.floor((Date.now() - k.at) / 60000);
  const text = min < 1 ? "今入れた" : min < 60 ? `${min} 分前に入れた` : min < 1440 ? `${Math.floor(min / 60)} 時間前に入れた` : `${Math.floor(min / 1440)} 日前に入れた`;
  return { text, old: min >= 1440 };
}
/** 相場 (カレンシー) */
const market = marketStore;
async function refreshPrices(): Promise<void> {
  await market.refreshMarket();
}
onMounted(() => void market.ensureMarket(MARKET_MAX_AGE_MS));
/** 4 MOD のベースを取引所で探す (狙いの MOD が付いたレア。固定済みは除く。開くだけ) */
/**
 * 取引所で探すアイテムレベルの下限 = 狙う MOD (候補も) のうち、狙いの段 (T○ 以上の一番下の段) を付けられるアイテムレベルの一番高い物
 * (2026-10-06 オーナー「最安値スタートは狙ってる MOD の最大値のアイテムレベルで探しておｋ」)。前は 1 で選んだアイテムレベルそのまま (82 など)。
 * 狙いが無ければ選んだアイテムレベル
 */
const searchIlvl = computed(() => {
  const d = s.data.value;
  // エッセンスの MOD はアイテムレベルに関係なく付くので数えない (2026-10-07)
  const need = s.simTargets.value.flatMap((t) => [t, ...(t.alts ?? [])]).map((x) => {
    const m = d?.mods.get(x.modId);
    return m && m.source !== "essence" && m.source !== "perfect_essence" ? m.tiers[x.minTierIndex]?.ilvl ?? 0 : 0;
  });
  const n = Math.max(0, ...need);
  return n > 0 ? Math.min(n, s.itemLevel.value) : s.itemLevel.value;
});
async function searchFour(): Promise<void> {
  const q = fracQuery("explicit");
  if (q) await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: searchIlvl.value, ...q, fracturedItem: false, noSanctified: true, ...socketQuery() }));
}
/**
 * フラクチャーの候補の取引所の条件。候補が 2 つ以上なら「どれか 1 つ」のグループ (取引所の count、1 つ以上)
 * (2026-10-05 オーナー「フラクチャーどれか 1 つで検索かけるのに、これだと火耐性しか出ない、どれかの検索方法ないか」: 前は最初の候補だけで探していた)。
 * kind: 普通 (explicit) か固定済み (fractured)
 */
function fracQuery(kind: "explicit" | "fractured"): { stats: { id: string; min?: number }[]; anyOf: { filters: { id: string; min?: number }[]; count: number }[] } | null {
  const d = s.data.value;
  if (!d || !fracMembers.value.length) return null;
  const fs = fracMembers.value.flatMap((m) => tradeFiltersFor(d, [{ modId: m.modId, minTierIndex: m.minTierIndex }]).filters
    .map((x) => ({ id: x.id.replace(/^explicit\./, `${kind}.`), ...(x.min != null ? { min: x.min } : {}) })));
  if (!fs.length) return null;
  return fs.length === 1 ? { stats: fs, anyOf: [] } : { stats: [], anyOf: [{ filters: fs, count: 1 }] };
}
/** 白のベースを取引所で探す (開くだけ) */
async function searchWhite(): Promise<void> {
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "normal", ilvlMin: searchIlvl.value, stats: [], noSanctified: true, ...socketQuery() }));
}
/** フラクチャーの候補が違う側に分かれている (作り方が変わるので今は止める) */
/** フラクチャーの候補が両側に分かれている (選べるが、同じ側を推奨する) */
const mixedSides = computed(() => new Set(fractureRows.value.map((r) => r.side)).size > 1);
const makeSpec = computed(() => ({ kind: "make" as const, route: makeRoute.value, blocker: makeRoute.value === "magic" && blocker.value }));
/** 付いた状態のベースを取引所で探す (開くだけ。値段は手で入れる) */
async function searchBought(): Promise<void> {
  const q = fracQuery("fractured");
  if (q) await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: searchIlvl.value, ...q, fracturedItem: true, noSanctified: true, ...socketQuery() }));
}

/**
 * 完成品の値段 (神、手で入れる)。2026-10-05 オーナー「完成品はトレードへ案内させる URL でおけ、手動で入れてもらおう」。
 * ベース・アイテムレベル・狙い (段) の組ごとに覚える
 */
const doneDivine = ref<number | null>(null);
const DONE_KEY = "exiledesk.craftStageSim.donePrices";
const doneAll = ref<Record<string, Kept>>({});
try { doneAll.value = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}"); } catch { /* 無くてよい */ }
const doneKey = computed(() => `${keptKey.value}|${targetsSig().split(",").sort().join(",")}`);
let loadingDone = false;
watch(doneKey, () => {
  loadingDone = true;
  doneDivine.value = toExalt(doneAll.value[doneKey.value]);
  void Promise.resolve().then(() => { loadingDone = false; });
}, { immediate: true });
watch(doneDivine, (v) => {
  if (loadingDone) return;
  const cur = { ...doneAll.value };
  const n = num(v);
  if (n == null) delete cur[doneKey.value];
  else cur[doneKey.value] = { v: n, at: Date.now(), u: "exalt" };
  doneAll.value = cur;
  try { localStorage.setItem(DONE_KEY, JSON.stringify(cur)); } catch { /* 無くてよい */ }
});
const doneAge = computed(() => {
  const k = doneAll.value[doneKey.value];
  if (!k) return null;
  const min = Math.floor((Date.now() - k.at) / 60000);
  const text = min < 1 ? "今入れた" : min < 60 ? `${min} 分前に入れた` : min < 1440 ? `${Math.floor(min / 60)} 時間前に入れた` : `${Math.floor(min / 1440)} 日前に入れた`;
  return { text, old: min >= 1440 };
});
/**
 * 完成品を取引所で探す (開くだけ)。一番ゆるく: どの MOD も 普通 / 固定済み / 冒涜 のどれでもいい。
 * フラクチャーの候補が 2 つ以上なら「そのどれか」を 1 つのグループに
 */
async function searchDone(): Promise<void> {
  const d = s.data.value;
  if (!d) return;
  const KINDS: StatKind[] = ["explicit", "fractured", "desecrated"];
  const kindsOf = (t: { modId: string; minTierIndex: number }): { id: string; min?: number }[] =>
    tradeFiltersFor(d, [t]).filters.flatMap((f) => {
      if (!/^explicit\./.test(f.id)) return [{ id: f.id, ...(f.min != null ? { min: f.min } : {}) }];
      const key = f.id.replace(/^explicit\./, "");
      return KINDS.filter((k) => hasStatKind(key, k)).map((k) => ({ id: `${k}.${key}`, ...(f.min != null ? { min: f.min } : {}) }));
    });
  const stats: { id: string; min?: number }[] = [];
  const anyOf: { filters: { id: string; min?: number }[]; count?: number }[] = [];
  const put = (fs: { id: string; min?: number }[], count = 1): void => { if (fs.length === 1) stats.push(fs[0]!); else if (fs.length > 1) anyOf.push({ filters: fs, ...(count > 1 ? { count } : {}) }); };
  if (fracMembers.value.length) put(fracMembers.value.flatMap(kindsOf));
  for (const r of restRows.value) put([r, ...(s.simTargets.value.find((t) => t.modId === r.modId)?.alts ?? [])].flatMap(kindsOf), r.need);
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: searchIlvl.value, stats, anyOf, noSanctified: true, ...socketQuery() }));
}

/**
 * そのパターンの組めている所まで (付ける MOD と固定) が付いた物を取引所で探す (開くだけ、JP)。2026-10-07 オーナー「回すの横あたりに、
 * ここまでを trade2 へそのまま JP で検索できるボタン」。完成品の検索と同じくゆるく (普通 / 固定済み / 冒涜のどれでも)。
 * 候補の手 (どれか N つ) はグループに、残りの手があれば候補ぜんぶ。打つだけ・ルーンの手は入れない
 */
async function searchPattern(k: number): Promise<void> {
  const d = s.data.value, it = s.item.value, p = s.simPatterns.value[k];
  if (!d || !it || !p) return;
  const sets = patternSets(it.cls);
  const KINDS: StatKind[] = ["explicit", "fractured", "desecrated"];
  const kindsOf = (t: { modId: string; minTierIndex: number }): { id: string; min?: number }[] =>
    tradeFiltersFor(d, [t]).filters.flatMap((f) => {
      if (!/^explicit\./.test(f.id)) return [{ id: f.id, ...(f.min != null ? { min: f.min } : {}) }];
      const key = f.id.replace(/^explicit\./, "");
      return KINDS.filter((kk) => hasStatKind(key, kk)).map((kk) => ({ id: `${kk}.${key}`, ...(f.min != null ? { min: f.min } : {}) }));
    });
  const stats: { id: string; min?: number }[] = [];
  const anyOf: { filters: { id: string; min?: number }[]; count?: number }[] = [];
  const put = (fs: { id: string; min?: number }[], count = 1): void => { if (fs.length === 1 && count <= 1) stats.push(fs[0]!); else if (fs.length) anyOf.push({ filters: fs, ...(count > 1 ? { count } : {}) }); };
  const tOf = (id: string) => s.simTargets.value.find((t) => t.modId === id);
  const withAlts = (id: string) => { const t = tOf(id); return t ? [t, ...(t.alts ?? [])] : []; };
  if (fracMembers.value.length) put(fracMembers.value.flatMap(kindsOf));
  const restOfStep = new Set(p.steps.filter((st) => isRest(st.target)).map((st) => Number(st.target!.slice(5))));
  p.steps.forEach((st, j) => {
    const x = setByKey(sets, st.set);
    if (!x || !st.target || st.target === ANY_TARGET || x.kind === "rune" || isRest(st.target)) return;
    const ids = [st.target, st.target2, st.target3].filter((y): y is string => !!y);
    if (ids.length > 1 && hasCands(x)) {
      // 候補の手: 残りの手が後にあれば候補ぜんぶ、無ければどれか N つ (偉大は 2)
      put(ids.flatMap((id) => withAlts(id)).flatMap(kindsOf), restOfStep.has(j) ? ids.length : isDouble(x) ? 2 : 1);
    } else put(withAlts(st.target).flatMap(kindsOf), 1);
  });
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: searchIlvl.value, stats, anyOf, noSanctified: true, ...socketQuery() }));
}

/**
 * フラクチャー済みのベースを自分で作ったらいくらか (買うかの分かれ目)。2026-10-05 オーナー「ベースって買った方がええよな、基準は」→
 * 「作るとこのくらい → これより安ければ買う方が得」。錬金 → カオス → フラクチャー (外れたら白から) → 消去で固定した 1 個だけ、を回す
 */
const makeCost = ref<{ key: string; perDone: number; p50: number; p90: number; pDone: number; fractures: number; magic: number; chaos: number; bases: number } | null>(null);
const makeBusy = ref(false);
let makeGen = 0;
const makeKey = computed(() => (fractureRow.value
  ? `${s.base.value}|${s.itemLevel.value}|${fracMembers.value.map((f) => `${f.modId}:${f.minTierIndex}`).join(",")}|${makeRoute.value}|${makeSpec.value.blocker}|${whiteDivine.value ?? 0}|s${socketCount.value}|${market.fetchedAt.value ?? 0}` : ""));
watch(makeKey, async (key) => {
  const d = s.data.value, f = fractureRow.value;
  const my = ++makeGen;
  if (!key || !d || !f) { makeCost.value = null; makeBusy.value = false; return; }
  // 入力を打っている間は待つ
  await new Promise((r) => setTimeout(r, 300));
  if (my !== makeGen) return;
  if (makeCost.value?.key === key) return;
  makeBusy.value = true;
  const memo = new Map<string, number>();
  const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
  const r = await runRecipe({
    data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: 500, price, fractureStart: makeSpec.value,
    whiteBasePrice: num(whiteDivine.value) ?? 0, sockets: socketCount.value,
    targets: fracMembers.value.map((x) => ({ modId: x.modId, minTierIndex: x.minTierIndex, method: "fracture" as const })),
  }, undefined, () => my !== makeGen);
  if (my !== makeGen) return;
  makeBusy.value = false;
  // 指標 (2026-10-05 オーナー「結局指標が欲しいよね、4 回に 1 回フラクチャー成功なんだっけ」「1/3 の場合ね」): 1 個できるまでの平均の回数
  const n = (re: RegExp): number => (r?.usage ?? []).filter((u) => re.test(u.key)).reduce((a, u) => a + u.count, 0);
  makeCost.value = r ? { key, perDone: r.perDone, p50: r.p50, p90: r.p90, pDone: r.pDone, fractures: n(/^fracture$/), magic: n(/^(transmute|augment)/), chaos: n(/^(alchemy|chaos)/), bases: r.bases } : null;
}, { immediate: true });
/**
 * 計算の費用 (2026-10-05 オーナー「3 個買って 1 個成功品と仮定して、最低完全変成 3、次の完全増強、消去はセットで使う、フラクチャー 3 つは
 * 絶対にいる。深淵エッセンスは 3 個、ネクロマンシー、結晶化、骨それぞれ 3 回、確率的に計算してくれ。平均コスト 1 個作るコスト分かれば 3 倍」
 * 「完全やね消去 2 つ使うのは」)。
 *   1 回分 = 白 + 完全の変成 + (完全の増強 + 消去 × 2) × リロールの回数 + 王者 (無印) + 高貴 × (1 − p) + 骨 (壁) + フラクチャー
 *   リロールの回数 = 1 ÷ (完全の増強 1 回で狙いが付く確率)。確率はその側の普通の置き場の重み (下限 = 完全の増強の段の下限)
 *   1 個 = 1 回分 × 3 (骨の壁でフラクチャーが 1/3) + 固定できた後の消去 × 2 (2026-10-05 オーナー「消去 2 は必ずいるよ、完成後」)
 * お告げの側は、壁を置く側 = 狙いの反対側
 */
const calc = computed(() => {
  const d = s.data.value, it = s.item.value, f = fractureRow.value;
  if (!d || !it || !f) return null;
  const m = d.mods.get(f.modId);
  if (!m) return null;
  /**
   * 変成・増強の等級は完全 (オーナー「最低完全変成、次の完全増強」)。完全の段の下限で狙いの段が出ない時 (兜のライフ T2 以上など) は
   * 上級 → 無印に落とす (2026-10-05、前は 0% と「—」で止まって見えた)
   */
  const pAt = (floor: number) => {
    const w = (id: string, minIdx: number): number => {
      const x = d.mods.get(id);
      return x ? x.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl >= floor && t.ilvl <= s.itemLevel.value ? t.weight : 0), 0) : 0;
    };
    // 候補ごとに自分の側の重みで割る (候補は両側でも良い)
    const totalOf = (k: "prefixes" | "suffixes"): number => it.cls.pools.normal[k].reduce((a, id) => a + w(id, 0), 0);
    const each = fracMembers.value.map((r) => {
      const total = totalOf(d.mods.get(r.modId)?.type === "suffix" ? "suffixes" : "prefixes");
      return { name: `${r.text} (${r.rank} 以上)`, p: total > 0 ? w(r.modId, r.minTierIndex) / total : 0 };
    });
    return { each, pHit: Math.min(1, each.reduce((a, x) => a + x.p, 0)) };
  };
  const grades = [
    { g: "perfect", floor: CURRENCY_FLOOR.augment.perfect, aug: "augment_perfect", tra: "transmute_perfect", ja: "完全" },
    { g: "greater", floor: CURRENCY_FLOOR.augment.greater, aug: "augment_greater", tra: "transmute_greater", ja: "上級" },
    { g: "base", floor: CURRENCY_FLOOR.augment.base, aug: "augment", tra: "transmute", ja: "無印" },
  ] as const;
  const gr = grades.find((x) => pAt(x.floor).pHit > 0) ?? grades[0];
  // 候補ごとの付きやすさと合計 (どれか 1 つで良い)
  const { each, pHit } = pAt(gr.floor);
  const wall: "prefix" | "suffix" = m.type === "suffix" ? "prefix" : "suffix";
  const abyss = `essence:perfect:${it.cls.id}/PerfectEssence_EssenceAbyss`;
  const rerolls = pHit > 0 ? 1 / pHit : Infinity;
  const white = num(whiteDivine.value) ?? 0;
  // buy = 4 MOD のベースを買っても要る物 (壁とフラクチャー)
  // 1 から (自前): 壁は王者の後に骨 1 本だけ (側を選ばないのでお告げも深淵のエッセンスも要らない)。増強のリロールで狙いの 1 つだけ
  // になった時 (最初の増強で付かなかった時、確率 1 − p) は、王者で 2 つにしかならないので高貴で 3 つにしてから骨
  // (2026-10-05 オーナー「1 からの場合骨壁は単純で王者後は骨 1 個でいい、選ぶ必要ない」「増強リロールで 1 個だけ付いたら王者すると 1 個足りないから高貴打って 3 つに」)
  const lines: Array<{ name: string; n: number; each: number }> = [
    { name: "白のベース", n: 1, each: white },
    { name: nameOf(gr.tra), n: 1, each: priceOf(gr.tra) },
    { name: `${nameOf(gr.aug)} (リロール)`, n: rerolls, each: priceOf(gr.aug) },
    { name: `${nameOf("annul")} (リロールに 2 つ)`, n: rerolls * 2, each: priceOf("annul") },
    // マジック → レアにする王者 (等級は問わないので無印。2026-10-05 オーナー「適当な王者がいるのか、レア化に。チャレンジ品作る時だから 3 個か」)
    { name: nameOf("regal"), n: 1, each: priceOf("regal") },
    { name: `${nameOf("exalt")} (リロールで 1 つだけの時)`, n: Math.max(0, 1 - pHit), each: priceOf("exalt") },
    { name: `${nameOf("desecrate")} (壁)`, n: 1, each: priceOf("desecrate") },
    { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
  ];
  const once = lines.reduce((a, l) => a + l.n * l.each, 0);
  /** 固定できた後に 1 度だけ: 消去 × 2 (固定した物と骨の壁のほかの外れ 2 つ) */
  const after = 2 * priceOf("annul");
  // 4 MOD のベースを買う時は満杯なので、壁は 深淵のエッセンス (結晶化で消す側を選ぶ) → 骨 (ネクロマンシー) で印を置き換える
  const buyLines: Array<{ name: string; n: number; each: number }> = [
    { name: nameOf(abyss), n: 1, each: priceOf(abyss) },
    { name: nameOf(wall === "prefix" ? "OmenofSinistralCrystallisation" : "OmenofDextralCrystallisation"), n: 1, each: priceOf(wall === "prefix" ? "OmenofSinistralCrystallisation" : "OmenofDextralCrystallisation") },
    { name: nameOf("desecrate"), n: 1, each: priceOf("desecrate") },
    { name: nameOf(wall === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy"), n: 1, each: priceOf(wall === "prefix" ? "OmenofSinistralNecromancy" : "OmenofDextralNecromancy") },
    { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
  ];
  /**
   * 4 MOD・当たり 1 のベースを買う時の 1 回分 (2026-10-05 オーナー「ベース買うか自前でするかの指標は? 4 MOD で当たり 1 のベース買って、
   * フラクチャーはどのみちかかるけど、消去が 2 個でいい、あとベース代」)。ベース代 + 消去 × 2 + 壁 (深淵のエッセンス・結晶化・骨・ネクロマンシー) + フラクチャー。
   * 分かれ目 = 自前の 1 回分 − ベース代以外 (これより安いベースなら買う方が得)
   */
  const buyRest = buyLines.reduce((a, l) => a + l.n * l.each, 0);
  const breakEven = once - buyRest;
  const fourN = num(fourDivine.value);
  const fourB = fourN;
  const buyOnce = fourB != null ? fourB + buyRest : null;
  return { pHit, each, rerolls, lines, buyLines, once, after, total: once * 3 + after, noAbyss: !(priceOf(abyss) > 0), cantRoll: pHit === 0, grade: gr.ja, buyRest, breakEven, buyOnce };
});
const busy = ref(false);
const phase = ref("");
const progress = ref<[number, number] | null>(null);
const error = ref("");
const recipeOut = ref<{ r: RecipeResult; spec: RecipeSpec } | null>(null);
/** フラクチャー済みから残りを作る費用 (ベース代 0 で回した平均)。買う側の比べに足す */
const restCost = ref<number | null>(null);
/** フラクチャー済みのベースを手に入れる一番安い始め方 (4 最安値スタート、値段の有る物だけ) */
const startMin = computed((): number | null => {
  const xs = routes.value.list.map((x) => x.cost).filter((x): x is number => x != null && Number.isFinite(x));
  return xs.length ? Math.min(...xs) : null;
});
/** パターンごとの結果 (回した後)。見ている物を recipeOut / restCost に出す */
const results = ref<Array<{ name: string; out: { r: RecipeResult; spec: RecipeSpec }; rest: number | null }>>([]);
const shown = ref(0);
/** パターンの名前で結果を引く (一覧はパターンの並びで出す) */
const resultOf = (name: string) => results.value.find((x) => x.name === name) ?? null;
const shownName = computed(() => results.value[shown.value]?.name ?? "");
const cheapestName = computed(() => (results.value.length > 1 ? results.value.reduce((b, y) => (y.out.r.perDone < b.out.r.perDone ? y : b)).name : ""));
function showResultByName(name: string): void {
  const i = results.value.findIndex((x) => x.name === name);
  if (i >= 0) showResult(i);
}
/** 回していないパターンの一言 (未完成なら最初の打てない手) */
function patternNote(p: Pattern): string {
  if (!p.steps.length) return "手が無い";
  const w = patternProblem(p);
  return w ? `未完成 (${w})` : "未実行";
}
function togglePatternOff(i: number): void {
  s.simPatterns.value = s.simPatterns.value.map((p, k) => (k === i ? { ...p, off: !p.off } : p));
}
function showResult(i: number): void {
  const x = results.value[i];
  if (!x) return;
  shown.value = i;
  recipeOut.value = x.out;
  restCost.value = x.rest;
}
const ranFor = ref("");
const sig = computed(() => `${market.fetchedAt.value ?? 0}|${s.base.value}|s${socketCount.value}|${s.itemLevel.value}|${makeRoute.value}|${blocker.value}|${whiteDivine.value}|${s.simTargets.value.map((t) => methodOf(t)).join(",")}|${targetsSig()}|${JSON.stringify(s.simPatterns.value)}`);
let gen = 0;

/**
 * 全部まとめて回すパターン = 手があってチェックの入った物。組みかけでも組めている所までを完成品として回す
 * (2026-10-07 オーナー「回すパターンを選択できるように」「そこまでを完成品とする」)
 */
const patternChecks = computed(() => s.simPatterns.value.filter((p) => p.steps.length).map((p) => ({ p, why: patternProblem(p) })));
const runnable = computed(() => s.simPatterns.value.filter((p) => p.steps.length && !p.off));
const blocked = computed((): string | null => {
  if (!rows.value.length) return "狙いがありません";
  if (!patternChecks.value.length) return "6 パターンに手がありません";
  if (!runnable.value.length) return "回すパターンにチェックが入っていません";
  return null;
});

/**
 * only: そのパターンだけ回す (未完成でも組めている所まで、1500 回。2026-10-07 オーナー「パターンを自分で追加して未完成の状態で 1500 回回したら
 * どんだけ付くのか実験したい、手動では個別に回す感じで、結果を下に」)。無ければ出来ているパターンを全部
 */
const ONE_RUNS = 1500;
async function run(only?: number): Promise<void> {
  const it = s.item.value, d = s.data.value;
  if (!it || !d) return;
  if (only == null && blocked.value) return;
  if (only != null && (!rows.value.length || !s.simPatterns.value[only]?.steps.length)) return;
  const my = ++gen;
  busy.value = true;
  error.value = "";
  progress.value = null;
  try {
    phase.value = "試しています";
    const divine = 1; // 手で入れた値段は高貴建て
    // 値段は 1 回引いたら覚える (相場の一覧を毎手引くと、500 回で 46 秒かかっていた)
    const memo = new Map<string, number>();
    const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
    const spec: RecipeSpec = {
      data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: only != null ? ONE_RUNS : runs.value, price,
      targets: s.simTargets.value.flatMap((t) => (methodOf(t) === "fracture"
        ? [{ modId: t.modId, minTierIndex: t.minTierIndex, method: "fracture" as const }, ...(t.alts ?? []).map((a) => ({ ...a, method: "fracture" as const }))]
        : [{ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t), ...(t.alts?.length ? { alts: t.alts } : {}) }])),
      whiteBasePrice: (num(whiteDivine.value) ?? 0) * divine, sockets: socketCount.value,
      ...(fractureRow.value ? { fractureStart: makeSpec.value } : {}),
    };
    // パターンごとに回す (2026-10-06 オーナー「パターンで回す」)。白から作る + (フラクチャーがあれば) 固定済みから残りを作る (ベース代 0) の 2 本。
    // 始め方の比べに使う
    const sets = patternSets(it.cls);
    /**
     * 偉大の手の候補 (2〜3 つ) を「どれか 2 つ付けば当たり」の 1 つの狙いにまとめる (2 狙う MOD の「どれか N つ」と同じ仕組み)
     */
    const groupOf = (st: Pattern["steps"][number], x: NonNullable<ReturnType<typeof setByKey>>): RecipeSpec["targets"][number] | null => {
      if (!hasCands(x) || !st.target || st.target === ANY_TARGET || !st.target2) return null;
      const ms = [st.target, st.target2, st.target3].filter((id): id is string => !!id).map((id) => spec.targets.find((y) => y.modId === id)).filter((y): y is RecipeSpec["targets"][number] => !!y);
      if (ms.length < 2) return null;
      const [a, ...rest] = ms;
      return { ...a!, method: "exalt", alts: [...(a!.alts ?? []), ...rest.flatMap((y) => [{ modId: y.modId, minTierIndex: y.minTierIndex }, ...(y.alts ?? [])])], need: isDouble(x) ? 2 : 1 };
    };
    /** 「残り」の手: 元の手の候補ぜんぶ (全部揃ったら当たり) */
    const restOf = (steps: Pattern["steps"], st: Pattern["steps"][number]): RecipeSpec["targets"][number] | null => {
      if (!isRest(st.target)) return null;
      const ms = restMembers(steps, st.target).map((id) => spec.targets.find((y) => y.modId === id)).filter((y): y is RecipeSpec["targets"][number] => !!y);
      if (!ms.length) return null;
      const [a, ...rest] = ms;
      return { ...a!, method: "exalt", alts: [...(a!.alts ?? []), ...rest.map((y) => ({ modId: y.modId, minTierIndex: y.minTierIndex }))], need: ms.length };
    };
    const compile = (p: Pattern): CompiledStep[] => {
      // 打てる手だけ並べるので、「MOD が消えたら N 手目」の N を並べた後の番号に直す
      const at: number[] = [];
      let n = 0;
      for (const st of p.steps) { at.push(n); if (setByKey(sets, st.set)) n++; }
      return p.steps.flatMap((st) => {
      const x = setByKey(sets, st.set);
      const lostGoto = st.lostGoto ? Object.fromEntries(Object.entries(st.lostGoto).map(([id, g]) => [id, at[g] ?? g])) : undefined;
      if (!x) return [];
      const t = x.kind === "rune" || !st.target ? null : spec.targets.find((y) => y.modId === st.target) ?? null;
      const ms = st.miss ? setByKey(sets, st.miss) : undefined;
      const grp = groupOf(st, x) ?? restOf(p.steps, st);
      const one = grp && isDouble(x) ? setByKey(sets, st.single ?? singleKeyOf(x)) : undefined;
      return [{ kind: x.kind, currency: x.currency, omens: x.omens, target: grp ?? t, ...(one ? { single: { kind: one.kind, currency: one.currency, omens: [...one.omens] } } : {}), ...(x.kind === "rune" && st.target ? { rune: st.target } : {}), onMiss: st.onMiss, ...(ms ? { miss: { kind: ms.kind, currency: ms.currency, omens: [...ms.omens] } } : {}), ...(lostGoto ? { lostGoto } : {}) }];
      });
    };
    // フラクチャーがある時は、フラクチャー済みのベースを手に入れるまでは 4 最安値スタートの計算で固定し (自作は 1 回分 × 3 + 消去 × 2)、
    // 回すのはフラクチャー済みから先だけ (2026-10-06 オーナー「白ベースでもフラクチャーまでの平均はほぼ一緒、3 回に 1 回当たる予算で
    // そこまでは固定で出しておｋ、他の選択肢も」)。始め方ごとの合計 = その始め方の費用 + 固定済みから先の平均
    const ps = only != null ? [s.simPatterns.value[only]!] : runnable.value;
    const total = spec.runs * ps.length;
    const out: typeof results.value = [];
    for (const [k, p] of ps.entries()) {
      // 完成の判定は、そのパターンで付ける物 + 固定する物だけ (狙い全部だと、一部だけ試すパターンが絶対に完成しなかった。2026-10-07)
      // 偉大の手の候補は「どれか 2 つ」の 1 つの狙いとして数える (3 つ目は付かなくても当たり)
      // 「残り」の手がある時は、元の手の「どれか N つ」は数えない (残りの手の「全部」に含まれる。両方数えると MOD が足りなくなる)
      const restRefs = new Set(p.steps.filter((st) => isRest(st.target)).map((st) => Number(st.target!.slice(5))));
      const groups = p.steps.flatMap((st, j) => { if (restRefs.has(j)) return []; const x = setByKey(sets, st.set); const g = x ? groupOf(st, x) ?? restOf(p.steps, st) : null; return g ? [{ g, ids: isRest(st.target) ? restMembers(p.steps, st.target) : [st.target, st.target2, st.target3] }] : []; });
      const inGroup = new Set(groups.flatMap((x) => x.ids).filter((x): x is string => !!x));
      // カレンシーが決まっていない手 (未完成) の MOD は数えない: 組めている所までを完成品とする (2026-10-07 オーナー「そこまでを完成品とする」)
      const used = new Set(p.steps.filter((st) => !!setByKey(sets, st.set)).flatMap((st) => [st.target]).filter((x): x is string => !!x && !inGroup.has(x)));
      const goal = [...spec.targets.filter((t) => t.method === "fracture" || used.has(t.modId)), ...groups.map((x) => x.g)];
      const pspec: RecipeSpec = { ...spec, targets: goal, pattern: compile(p), ...(redoPlan.value?.annulSides ? { annulSides: redoPlan.value.annulSides } : {}), ...(fractureRow.value ? { fractureStart: { kind: "bought" as const, price: 0 } } : {}) };
      const base = k * spec.runs;
      const r = await runRecipe(pspec, (done) => { if (my === gen) progress.value = [base + done, total]; }, () => my !== gen);
      if (my !== gen || !r) return;
      out.push({ name: p.name, out: { r, spec: pspec }, rest: fractureRow.value ? r.perDone : null });
    }
    if (only != null) {
      // 1 つだけ回した時は、前の結果のそのパターンだけ入れ替える (他のパターンの結果は残す)
      const x = out[0]!;
      const list = results.value.filter((y) => y.name !== x.name);
      results.value = [...list, x];
      showResult(results.value.length - 1);
    } else {
      results.value = out;
      showResult(out.reduce((b, x, i) => (x.out.r.perDone < out[b]!.out.r.perDone ? i : b), 0));
    }
    ranFor.value = sig.value;
  } catch (e) {
    if (my === gen) error.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (my === gen) { busy.value = false; phase.value = ""; }
  }
}
function stop(): void {
  gen++;
  busy.value = false;
  phase.value = "";
}
watch(() => s.base.value, () => { recipeOut.value = null; restCost.value = null; results.value = []; });

/**
 * 説明・内訳は閉じておき、要る時に開く (2026-10-05 オーナー「UI とにかく文字が多いから説明とかは閉じてデフォで、必要な時に開く感じで最低限に。活字疲れる」)。
 * 開け閉めは覚える
 */
const FOLD_KEY = "exiledesk.craftStageSim.open";
const open = ref<Record<string, boolean>>({});
try { open.value = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}"); } catch { /* 無くてよい */ }
function toggle(k: "help" | "calc" | "usage" | "more"): void {
  open.value = { ...open.value, [k]: !open.value[k] };
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(open.value)); } catch { /* 無くてよい */ }
}
const help = computed(() => !!open.value.help);

/**
 * 1 つずつ進む (2026-10-05 オーナー「まだ決めてないところは表示させないでね、1 個 1 個進んで行く形で」
 * 「先に MOD 決めからでしょ」「フラクチャーは 2 番目で 1 番目は MOD 決め」)。
 *   白ベースの値段「進む」→ ① 狙う MOD (下の一覧から、「決めた」) → ② フラクチャー (① の中から固定する物、か「しない」)
 *   → ③ 付ける順番と付け方 (「決めた」) → 相場・回す → 比べ・結果 (回した後)
 * 前の段を直しても後ろは消さない。狙いが空になった時とベースを変えた時だけ始めに戻る
 */
/** 白ベースの値段を入れて「進む」を押した */
const whiteOk = ref(false);
const modsDone = ref(false);
const fracDone = ref(false);
const orderDone = ref(false);
/** 4 最安値スタートを決めた (フラクチャーがある時だけの工程) */
const startDone = ref(false);
/**
 * 工程 (2026-10-05 オーナーと組み直し「狙う MOD が 2 工程目、次が白ベース設定で増強消去スパムで狙う MOD (フラクチャー予定)、
 * ルートは 3 つ (自作の増強スパム / レアのフラクチャー無しベース / フラクチャー済み)、流れが一緒になるのはフラクチャー後。最安値クラフト設定」):
 *   1 ベース → 2 狙う MOD → 3 白ベース設定 (値段 + 増強・消去スパムで狙う = フラクチャー予定) → 4 最安値スタート (回さずに 3 ルートの計算)
 *   → 5 付ける順番と付け方 (フラクチャー後は共通) → 6 回す
 */
const step3 = computed(() => modsDone.value && rows.value.length > 0);
const whiteDone = computed(() => step3.value && whiteOk.value && fracDone.value && num(whiteDivine.value) != null);
const stepStart = computed(() => whiteDone.value && fractureRows.value.length > 0);
const stepOrder = computed(() => whiteDone.value && (fractureRows.value.length === 0 || startDone.value));
/** 6 パターンを決めた */
const patternDone = ref(false);
/** 途中を覚える (変わるたびに)。開き直した時は CraftStage がベース・狙い・パターンを、ここが「決めた」を戻す */
const sessionNow = () => ({
  base: s.base.value, itemLevel: s.itemLevel.value, targets: s.simTargets.value, sockets: s.simSockets.value, order: s.simOrder.value, patterns: s.simPatterns.value,
  flags: { whiteOk: whiteOk.value, modsDone: modsDone.value, fracDone: fracDone.value, startDone: startDone.value, orderDone: orderDone.value, patternDone: patternDone.value },
});
watch(() => JSON.stringify(sessionNow()), () => { if (s.simPicked.value) writeSimSession(sessionNow()); });
onMounted(() => {
  const ses = readSimSession();
  if (!ses || ses.base !== s.base.value || !s.simTargets.value.length) return;
  restoring = true;
  whiteOk.value = !!ses.flags.whiteOk; modsDone.value = !!ses.flags.modsDone; fracDone.value = !!ses.flags.fracDone;
  startDone.value = !!ses.flags.startDone; orderDone.value = !!ses.flags.orderDone;
  // patternDone は orderDone の watch で落ちるので、その後に戻す
  void nextTick(() => { patternDone.value = !!ses.flags.patternDone; restoring = false; });
});
const step4pre = computed(() => stepOrder.value && orderDone.value);
/** 6 パターンの「付ける MOD」の行に出す物 (5 順番計画の行と同じ: 側・色・段・付け方・取り直し) */
const orderInfo = computed(() => Object.fromEntries(orderKeys.value.map((k) => {
  const r = orderRow(k);
  if (!r) return [k, { side: "ルーン", tone: "text-amber-100", text: runeJa(k), rank: "", how: "", redo: "" }];
  const rd = redoOf.value.get(r.modId);
  return [k, { side: r.side, tone: r.tone, text: r.text, rank: r.rank, how: METHOD_JA[r.method], redo: rd ? `取り直し 約 ${money(rd.expected)}` : "" }];
})));
/** 2〜5 を 1 行に畳む (6 パターンを作る間) */
const fold = ref(true);
const step4 = computed(() => step4pre.value);
watch(orderDone, (v) => { if (!v) patternDone.value = false; });
watch(() => rows.value.length, (n) => { if (n === 0) { modsDone.value = false; whiteOk.value = false; fracDone.value = false; startDone.value = false; orderDone.value = false; } });
watch(keptKey, () => { if (restoring) return; modsDone.value = false; fracDone.value = false; startDone.value = false; orderDone.value = false; whiteOk.value = false; s.simAltFor.value = null; });
// 下の MOD 一覧は ① で選んでいる間だけ。「決めた」で閉じる (2026-10-05 オーナー「役目終えたらこのベースに付く MOD はしまっていい、最初以外使わん」)。
// 足し直す時は ① の「直す」で開き直す
watch(() => socketsOk.value && !modsDone.value, (v) => { s.simShowMods.value = v; }, { immediate: true });
/**
 * 工程を押すとそこからやり直す (後ろの工程は決め直し)。「1 つ戻す」は今の 1 つ前の工程へ
 * (2026-10-05 オーナー「各工程クリックでそこからやり直させて欲しい。ミスクリックもあるから 1 つ戻すボタンも」)
 */
type Stage = "mods" | "white" | "start" | "order";
function goTo(st: Stage): void {
  if (st === "mods") modsDone.value = false;
  if (st === "mods" || st === "white") { whiteOk.value = false; fracDone.value = false; }
  if (st !== "order") startDone.value = false;
  orderDone.value = false;
}
/**
 * リセット: シミュレーションを最初 (1 ベースを選ぶ所) に戻す。選んだ MOD・工程・結果は消し、入れた値段 (ベースごとに覚えている) は残す。
 * 1 つ戻すでも戻せないので、2 回押した時だけ (2026-10-05 オーナー「シンプルにリセットボタン上に作って」)
 */
const resetArmed = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | undefined;
function resetAll(): void {
  if (!resetArmed.value) {
    resetArmed.value = true;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { resetArmed.value = false; }, 3000);
    return;
  }
  resetArmed.value = false;
  s.simTargets.value = [];
  s.simAltFor.value = null;
  modsDone.value = false; whiteOk.value = false; fracDone.value = false; startDone.value = false; orderDone.value = false;
  recipeOut.value = null;
  restCost.value = null;
  results.value = [];
  s.simOrder.value = [];
  s.simPatterns.value = [{ name: "パターン 1", steps: [] }];
  s.simSockets.value = null;
  // 覚えていた途中も消す (リセットはベースを選ぶ所から)
  void nextTick(() => writeSimSession(null));
  // ベースを選ぶ所から (この画面は一度消えて、選び直すと新しく始まる)
  s.simPicked.value = false;
}
/** 3 白ベース設定の「決めた」: 値段とフラクチャー予定 (無ければ「しない」) */
function whiteDecide(): void {
  whiteOk.value = true;
  fracDone.value = true;
}
/**
 * 「1 つ戻す」= 直前の操作を 1 つ取り消す (工程ではなく、1 つ前の状態に。2026-10-05 オーナー「1 つ戻すは手じゃなくて行動、1 つ前の作業の状態」)。
 * 狙い (MOD・段・あるいは・どれか N つ・フラクチャー・付け方・順番)・工程の決めた / 戻した・ソケット・白ベースの値段を、変わるたびに前の形を積む
 */
type Snap = { targets: string; whiteOk: boolean; modsDone: boolean; fracDone: boolean; startDone: boolean; orderDone: boolean; sockets: number | null; white: number | null };
const snapNow = (): Snap => ({ targets: JSON.stringify(s.simTargets.value), whiteOk: whiteOk.value, modsDone: modsDone.value, fracDone: fracDone.value, startDone: startDone.value, orderDone: orderDone.value, sockets: sockets.value, white: whiteDivine.value });
const undoStack = ref<Snap[]>([]);
let lastSnap = snapNow();
watch(() => JSON.stringify(snapNow()), () => {
  const cur = snapNow();
  if (!restoring && JSON.stringify(cur) !== JSON.stringify(lastSnap)) undoStack.value = [...undoStack.value.slice(-49), lastSnap];
  lastSnap = cur;
});
// ベースを変えたら積んだ物は捨てる (別のアイテムの状態に戻さない)
watch(() => s.base.value, () => { undoStack.value = []; lastSnap = snapNow(); });
// Ctrl+Z (手で打つ画面と同じ)。シミュレーションを開いている時はこちらの「1 つ戻す」(CraftStage.vue は手で打つ時だけ)
function onKey(e: KeyboardEvent): void {
  if (s.mode.value !== "sim" || s.replay.value) return; // 手で打つ画面にいる間も消さずに隠しているので
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); undo(); }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
function undo(): void {
  const prev = undoStack.value[undoStack.value.length - 1];
  if (!prev) return;
  undoStack.value = undoStack.value.slice(0, -1);
  restoring = true;
  s.simTargets.value = JSON.parse(prev.targets);
  whiteOk.value = prev.whiteOk; modsDone.value = prev.modsDone; fracDone.value = prev.fracDone; startDone.value = prev.startDone ?? false; orderDone.value = prev.orderDone;
  sockets.value = prev.sockets; whiteDivine.value = prev.white;
  void nextTick(() => { lastSnap = snapNow(); restoring = false; });
}
/**
 * 4 最安値スタート: フラクチャー済みのベースを手に入れるまでの 3 ルート (回さずに計算。高貴建て)。流れが一緒になるのはフラクチャーの後
 *   self   … 自作 (白から増強・消去スパム → 王者 → 骨の壁 → フラクチャー)。1 回分 × 3 (1/3) + 固定後の消去 × 2
 *   four   … レアのフラクチャー無しベース (3 MOD + 狙い 1 MOD、2026-10-05 オーナー「3 MOD + 1 MOD (狙い) で表示」) を買う → 壁 → フラクチャー。1 回分 × 3 + 消去 × 2
 *   bought … フラクチャー済みのベースを買う (× 1)
 */
const routes = computed(() => {
  const c = calc.value;
  const fourN = num(fourDivine.value), bN = num(boughtDivine.value);
  const list = [
    { key: "self", name: "① 自作 (白から増強・消去スパム)", cost: c ? c.total : null },
    { key: "four", name: "② レアのフラクチャー無しベース (3 MOD + 狙い 1 MOD) を買う", cost: c && fourN != null ? (fourN + c.buyRest) * 3 + c.after : null },
    { key: "bought", name: "③ フラクチャー済みのベースを買う", cost: bN },
  ];
  const known = list.filter((x) => x.cost != null && Number.isFinite(x.cost));
  const best = known.length ? known.reduce((a, b) => (b.cost! < a.cost! ? b : a)).key : null;
  return { list, best };
});
onBeforeUnmount(() => { s.simShowMods.value = false; });
/** 合計金額はシミュレーションだけの表示通貨で (既定は適正。display-currency.ts の simCurrency) */
const money = (x: number): string => (Number.isFinite(x) ? simCurrency.money(x) : "—");
const pct = (x: number): string => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`;
const stale = computed(() => ranFor.value !== sig.value);
/**
 * 始め方の比べ (2026-10-05 オーナー「作った方が安いか、ベースから作った方が安いのか、完成品の方が安いのか」)。
 * 作り方を探す自動は無いので、出るのは「この作り方なら」の比べ。値段は全部 高貴建て
 *   白から作る          … 回した平均 (フラクチャーも確率込み)
 *   4 MOD のベースを買う … (ベース代 + 壁 + フラクチャー) × 3 + 消去 × 2 + 固定済みから残りを作る平均
 *   固定済みを買う       … 入れた値段 + 固定済みから残りを作る平均
 *   完成品を買う         … 入れた値段
 */
const compare = computed(() => {
  const out = recipeOut.value;
  const dv = 1; // 手で入れた値段は高貴建て
  const list: Array<{ key: string; name: string; cost: number | null; note: string }> = [];
  // フラクチャーがある時: 白から作る = 4 の自作 (1 回分 × 3 + 消去 × 2) + 固定済みから先の平均
  const selfCost = fractureRow.value ? (calc.value && restCost.value != null ? calc.value.total + restCost.value : null) : out ? out.r.perDone : null;
  list.push({ key: "make", name: fractureRow.value ? "白から作る (フラクチャーまでは 4 の計算)" : "白から作る", cost: selfCost, note: "回すと出ます" });
  if (fractureRow.value) {
    const rest = restCost.value;
    const c = calc.value;
    const four = c && c.buyOnce != null && rest != null ? c.buyOnce * 3 + c.after + rest : null;
    list.push({ key: "four", name: "レアのフラクチャー無しベース (3 MOD + 狙い 1 MOD) を買う", cost: four, note: num(fourDivine.value) == null ? "無し" : "回すと出ます" });
    const bN = num(boughtDivine.value);
    const bought = bN != null && rest != null ? bN * dv + rest : null;
    list.push({ key: "bought", name: "固定済みのベースを買う", cost: bought, note: num(boughtDivine.value) == null ? "無し" : "回すと出ます" });
  }
  list.push({ key: "done", name: "完成品を買う", cost: num(doneDivine.value) != null ? num(doneDivine.value)! * dv : null, note: "無し" });
  // 値段が空のベース・完成品は「無し」(取引所に出ていない) として比べから外す (2026-10-06 オーナー「無いパターンもあるから、未入力で無しとしてカウント」)
  const known = list.filter((x) => x.cost != null && Number.isFinite(x.cost));
  const best = known.length ? known.reduce((a, b) => (b.cost! < a.cost! ? b : a)).key : null;
  return { list, best };
});
/** 付いていた割合の MOD の名前 (2 狙う MOD の行と同じ文と色。候補は短く) */
function hitName(id: string): { text: string; tone: string } {
  const r = rows.value.find((x) => x.modId === id);
  if (r) return { text: `${r.text} ${r.rank}+`, tone: r.tone };
  const a = rows.value.flatMap((x) => x.alts).find((x) => x.modId === id);
  return { text: a ? `${a.text} ${a.rank}+` : id, tone: "" };
}
/**
 * 合計の内訳: ベース (フラクチャーがあれば 4 最安値スタートの一番安い始め方、無ければ白のベース × 使った数) とクラフト (残り)。
 * baseAdd は半分・8 割・9 割の人の金額に足すベース (フラクチャーの時だけ。白は回した費用に入っている)
 */
const split = computed(() => {
  const r = recipeOut.value?.r;
  if (!r) return { base: 0, craft: 0, baseAdd: 0, baseNote: "" };
  if (fractureRow.value) {
    const b = startMin.value ?? 0;
    const name = routes.value.list.find((x) => x.key === routes.value.best)?.name.replace(/\s*\(.*$/, "") ?? "";
    return { base: b, craft: r.perDone, baseAdd: b, baseNote: `フラクチャー済みのベースを手に入れるまで (4 最安値スタート: ${name})` };
  }
  const b = (num(whiteDivine.value) ?? 0) * r.bases;
  return { base: b, craft: r.perDone - b, baseAdd: 0, baseNote: `白のベース × ${r.bases.toFixed(1)} 個` };
});
/** 結果の金額の単位: 適正の時は合計に合わせて神でそろえる (内訳の行ごとに神・カオス・高貴が混ざって比べにくかった) */
function moneyT(x: number): string {
  if (!Number.isFinite(x)) return "—";
  if (simCurrency.choice.value !== "fair") return money(x);
  const v = x / rateOf("divine");
  return `${v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v.toFixed(2)} 神`;
}
const barW = (x: number, total: number): string => `${total > 0 ? Math.max(0, Math.min(100, (x / total) * 100)) : 0}%`;
const fmtCount = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1));
/** 運の幅の印 (半分・8 割・9 割の人。合計で) */
const luck = computed(() => {
  const sm = summary.value;
  if (!sm) return [];
  const add = split.value.baseAdd;
  const xs = [
    { label: "2 人に 1 人は", v: sm.p50 + add, bar: "bg-emerald-400", text: "text-emerald-300", tail: "以内", top: false },
    { label: "10 人に 8 人は", v: sm.p80 + add, bar: "bg-amber-400", text: "text-amber-200", tail: "以内", top: false },
    { label: "10 人に 9 人は", v: sm.p90 + add, bar: "bg-rose-400", text: "text-rose-300", tail: "以内", top: false },
    // 平均は線の上に (運の悪い人の高い金額に引っ張られて、真ん中の人より高くなる。2026-10-07 オーナー「半分とか 8 割とか分かりづらい、平均？」)
    { label: "平均", v: split.value.base + split.value.craft, bar: "bg-white", text: "text-white/80", tail: "", top: true },
  ];
  const max = Math.max(...xs.map((x) => x.v)) * 1.15 || 1;
  return xs.map((x) => ({ ...x, left: `${Math.min(92, Math.max(6, (x.v / max) * 100))}%` }));
});
/**
 * 何にお金がかかったか: ベース (フラクチャー済みにするまで、4 の一番安い始め方の内訳) とクラフト (回した結果の使った物)。
 * 金額の多い順、小さい物は「ほか N つ」
 */
const costGroups = computed(() => {
  const r = recipeOut.value?.r;
  if (!r) return [];
  const top = (items: Array<{ name: string; n: number; cost: number }>, total: number) => {
    const xs = items.filter((x) => x.cost > 0).sort((a, b) => b.cost - a.cost);
    const head = xs.slice(0, 6);
    const rest = xs.slice(6);
    const list = rest.length ? [...head, { name: `ほか ${rest.length} つ`, n: 0, cost: rest.reduce((a, x) => a + x.cost, 0) }] : head;
    return list.map((x) => ({ ...x, share: total > 0 ? x.cost / total : 0 }));
  };
  const out: Array<{ name: string; note: string; total: number; bar: string; items: Array<{ name: string; n: number; cost: number; share: number }> }> = [];
  const c = calc.value;
  if (fractureRow.value) {
    const best = routes.value.best;
    const name = routes.value.list.find((x) => x.key === best)?.name.replace(/\s*\(.*$/, "") ?? "";
    let items: Array<{ name: string; n: number; cost: number }> = [];
    if (best === "self" && c) items = [...c.lines.map((l) => ({ name: l.name, n: l.n * 3, cost: l.n * l.each * 3 })), { name: `${nameOf("annul")} (固定の後)`, n: 2, cost: c.after }];
    else if (best === "four" && c) items = [{ name: "レアのベース (3 MOD + 狙い 1)", n: 3, cost: (num(fourDivine.value) ?? 0) * 3 }, ...c.buyLines.map((l) => ({ name: l.name, n: l.n * 3, cost: l.n * l.each * 3 })), { name: `${nameOf("annul")} (固定の後)`, n: 2, cost: c.after }];
    else if (best === "bought") items = [{ name: "固定済みのベース", n: 1, cost: num(boughtDivine.value) ?? 0 }];
    out.push({ name: "ベース", note: `フラクチャー済みまで (${name})`, total: split.value.base, bar: "bg-stone-400/80", items: top(items, split.value.base) });
  } else {
    out.push({ name: "ベース", note: "白のベース", total: split.value.base, bar: "bg-stone-400/80", items: top([{ name: "白のベース", n: r.bases, cost: split.value.base }], split.value.base) });
  }
  const craft = r.usage.filter((u) => u.key !== "reveal").map((u) => ({ name: usageName(u.key), n: u.count, cost: u.cost }));
  out.push({ name: "クラフト", note: fractureRow.value ? "フラクチャー済みから完成まで" : "", total: split.value.craft, bar: "bg-amber-400/80", items: top(craft, craft.reduce((a, x) => a + x.cost, 0)) });
  return out;
});
/** 上の 5 つの数 (どちらの回し方でも同じ形) */
const summary = computed(() => {
  if (recipeOut.value) { const r = recipeOut.value.r; return { perDone: r.perDone, pDone: r.pDone, runs: r.runs, p50: r.p50, p80: r.p80, p90: r.p90 }; }
  return null;
});
const usageName = (k: string): string => (k === "reveal" ? "発現 (選ぶだけ)" : nameOf(k));
</script>

<template>
  <!-- 工程ごとに同じ高さの枠を縦に並べる (入れ子の枠はやめた。2026-10-05 オーナー「枠の中に何個枠あんのよ、きもいやろ」
       「1 がベース選定、2 がベース値段、3 が狙う MOD と分けたら」)。1 ベースは上の CraftStage.vue の枠 -->
  <div class="space-y-3 text-[12px]">
    <!-- 1 つ戻す・説明はタブの行の右端に (工程の枠の間に行を挟まない) -->
    <Teleport to="#sim-tools" :disabled="s.mode.value !== 'sim' || !!s.replay.value">
      <CurrencyPicker sim />
      <button type="button" class="rounded-lg border px-2 py-0.5 text-[11px]" :class="resetArmed ? 'border-rose-400 bg-rose-500/25 text-rose-100' : 'border-white/20 hover:bg-white/10'" title="最初 (ベースを選ぶ所) に戻す。選んだ MOD・工程・結果を消す (入れた値段は残る)" @click="resetAll">{{ resetArmed ? "もう一度押すとリセット" : "リセット" }}</button>
      <button type="button" class="rounded-lg border border-white/20 px-2 py-0.5 text-[11px] hover:bg-white/10 disabled:opacity-30" :disabled="!undoStack.length" :title="undoStack.length ? '直前の操作を 1 つ取り消す (Ctrl+Z)' : '戻せる操作がまだ無い'" @click="undo">↶ 1 つ戻す</button>
      <button type="button" class="rounded-full border px-2 py-0.5 text-[11px]" :class="help ? 'border-sky-400/60 bg-sky-500/15 text-sky-100' : 'border-white/15 opacity-60 hover:opacity-100'" title="説明を出す / 閉じる" @click="toggle('help')">説明 {{ help ? "▲" : "?" }}</button>
    </Teleport>
    <p v-if="help" class="mb-2 text-[11px] opacity-60">狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)。上から順に作る (カオス・消去・冒涜の打ち直しは自動)。前に付けた物が消えたら、また上から</p>

    <!--
      2〜5 は決めた後 (6 パターンを作る間) は 1 行に畳む。押すと開く (2026-10-07 オーナー採用の 2 枠の作業場。最小の窓 1660×860 で 6 が収まるように)
    -->
    <div v-if="socketsOk && step4pre" class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px]">
      <b class="text-[12px] text-amber-100">2〜5</b>
      <span class="truncate opacity-80">狙い {{ s.simTargets.value.length }} 個<template v-if="routes.best"> · 始め {{ routes.list.find((x) => x.key === routes.best)!.name.replace(/\s*\(.*$/, "") }} {{ money(routes.list.find((x) => x.key === routes.best)!.cost ?? 0) }}</template> · 順番 {{ orderKeys.length }} つ</span>
      <button type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="fold = !fold">{{ fold ? "開く ▼" : "畳む ▲" }}</button>
    </div>
    <!-- 2 狙う MOD → 3 白ベース設定 → 4 最安値スタート → 5 付ける順番と付け方 -->
    <template v-if="socketsOk && !(step4pre && fold)">
      <!-- ① 狙う MOD (下の「このベースに付く MOD」の「T○ 以上」で足す。「＋」であるいは) -->
      <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="modsDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="modsDone && goTo('mods')">2 狙う MOD</button> <span v-if="help" class="font-normal opacity-60">(下の一覧の「T○ 以上」で足す。「＋」でその MOD の代わりに付いても当たりにする物)</span>
          <button v-if="modsDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="goTo('mods')">ここからやり直す</button>
        </p>
        <!-- 完成図 (ベースの横から移した。段・＋・×・どれか N つ・付きやすさ) -->
        <StageTargetSummary :editable="!modsDone" />
        <div v-if="rows.length && !modsDone" class="mt-1 flex items-center gap-2">
          <button type="button" class="rounded-lg border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="s.simTargets.value = []">全部外す</button>
          <button type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100" @click="modsDone = true">決めた →</button>
        </div>
        <!-- このベースに付く MOD (同じ枠の中。2026-10-05 オーナー「枠は一緒の枠で表示するべき」)。長いので枠の中で送り、上の完成図は見えたまま -->
        <div v-if="!modsDone" class="-mx-3 mt-3 max-h-[62vh] overflow-auto border-t border-white/10 px-3 [overflow-anchor:none]">
          <StageModList embedded />
        </div>
      </div>

      <!-- 3 白ベース設定: 白ベースの値段 + 増強・消去スパムで狙う MOD (= フラクチャー予定、2 の中から) -->
      <div v-if="step3" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="whiteDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="whiteDone && goTo('white')">3 白ベース設定</button>
          <button v-if="whiteDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="goTo('white')">ここからやり直す</button>
        </p>
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span class="opacity-70">白ベース</span>
          <PriceInput v-model="whiteDivine" base="exalted" unit-key="sim.white" placeholder="0" />
          <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" :title="`アイテムレベル ${searchIlvl} 以上 (狙う MOD の段が付く一番高いレベル) の白のベースを取引所で探す (開くだけ)`" @click="searchWhite">取引所で探す ↗</button>
          <span class="inline-block w-24 shrink-0" :class="ageOf('white')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("white")?.text ?? "" }}</span>
        </div>
        <!-- フラクチャー予定は 2 狙う MOD で決める (2026-10-05 オーナー「狙う MOD の所でフラクチャー予定とか全部決めたら後が楽」)。ここは確認だけ -->
        <p class="mt-2 text-[11px] font-bold opacity-80">増強・消去スパムで狙う MOD (フラクチャー予定)</p>
        <p v-if="!fractureRows.length" class="text-[11px] opacity-50">無し (フラクチャーしない。2 の付け方の予定で「フラクチャー予定」を選ぶと出る)</p>
        <p v-if="mixedSides" class="text-[11px] text-amber-200">候補がプレとサフィに分かれています (推奨は同じ側。マジックの間はどちらの側に付いても当たり)</p>
        <p v-for="(r, i) in fracMembers" :key="r.modId" class="flex items-center gap-2 py-0.5">
          <span class="w-8 text-[10px] opacity-60">{{ r.side }}</span>
          <span :class="r.tone">{{ r.text }}</span> <span class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span>
          <span v-if="calc?.each[i]" class="ml-auto text-[11px] tabular-nums opacity-80">付きやすさ {{ pct(calc.each[i]!.p) }}<template v-if="calc.each[i]!.p === 0"> ({{ calc.grade }}では MOD レベルが低い)</template></span>
        </p>
        <div v-if="!whiteDone" class="mt-1 flex items-center gap-2">
          <span v-if="calc && fracMembers.length >= 2" class="text-[11px] opacity-80">付きやすさ 合計 {{ pct(calc.pHit) }}</span>
          <span v-if="num(whiteDivine) == null" class="ml-auto text-[11px] text-amber-200/80">白ベースの値段を入れる</span>
          <button type="button" class="rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-0.5 font-bold text-emerald-100 disabled:opacity-40" :class="num(whiteDivine) == null ? '' : 'ml-auto'" :disabled="num(whiteDivine) == null" :title="num(whiteDivine) == null ? '白ベースの値段を入れると押せる' : undefined" @click="whiteDecide">決めた →</button>
        </div>
      </div>

      <!-- 4 最安値スタート: フラクチャー済みのベースを手に入れるまでの 3 ルート (回さずに計算)。入れるのは買うベースの値段だけ -->
      <div v-if="stepStart" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="startDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="startDone && goTo('start')">4 最安値スタート</button>
          <span class="opacity-60">フラクチャー済みのベースを手に入れるまで (この先の流れはどれも同じ)</span>
          <button v-if="startDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="goTo('start')">ここからやり直す</button>
        </p>
        <table class="w-full table-fixed text-[12px]">
          <colgroup><col /><col class="w-[22rem]" /><col class="w-36" /></colgroup>
          <tbody>
            <tr v-for="x in routes.list" :key="x.key" class="border-t border-white/5" :class="routes.best === x.key ? 'bg-emerald-500/10' : ''">
              <td class="py-1">{{ x.name }}<span v-if="routes.best === x.key" class="ml-1.5 rounded bg-emerald-500/25 px-1.5 text-[10px] text-emerald-200">一番安い</span></td>
              <td class="py-1">
                <span v-if="x.key === 'self'" class="text-[11px] opacity-70">1 回分 × 3 (当たり 1/3) + 消去 × 2<template v-if="calc && calc.grade !== '完全'"> · {{ calc.grade }}の増強で計算</template></span>
                <span v-else class="flex items-center gap-1.5 text-[11px]">
                  <PriceInput v-if="x.key === 'four'" v-model="fourDivine" base="exalted" unit-key="sim.four" placeholder="無し" />
                  <PriceInput v-else v-model="boughtDivine" base="exalted" unit-key="sim.bought" placeholder="無し" />
                  <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" :title="(x.key === 'four' ? '狙いの MOD が付いたレア (固定済みは除く) を取引所で探す (開くだけ)' : 'この MOD が固定済みのベースを取引所で探す (開くだけ)') + `。アイテムレベル ${searchIlvl} 以上`" @click="x.key === 'four' ? searchFour() : searchBought()">取引所で探す ↗</button>
                </span>
              </td>
              <td class="truncate py-1 text-right tabular-nums"><b v-if="x.cost != null">{{ money(x.cost) }}</b><span v-else class="text-[11px] opacity-50" :title="x.key === 'self' ? undefined : '値段が空 = 取引所に無い物として数えない (2026-10-06)'">{{ x.key === "self" ? "—" : "無し" }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-if="calc?.cantRoll" class="mt-1 text-[11px] text-rose-300">増強ではこの段は出ません (アイテムレベルが足りない)</p>
        <div class="mt-1.5 flex items-center gap-2">
          <button type="button" class="rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="toggle('calc')">内訳 {{ open.calc ? "▲" : "▼" }}</button>
          <button v-if="!startDone" type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100" @click="startDone = true">決めた →</button>
        </div>
        <!-- 内訳 (① 自作の 1 回分と、② の分かれ目) -->
        <div v-if="open.calc && calc" class="mt-1.5 rounded bg-black/25 px-2 py-1.5 text-[11px]">
          <p class="mb-1">① 自作: 1 個 = 1 回分 <b>{{ money(calc.once) }}</b> × 3 + 固定できた後の消去 × 2 {{ money(calc.after) }} = <b class="text-amber-100">{{ money(calc.total) }}</b>
            <span class="opacity-60">(増強 1 回で候補のどれかが付く {{ calc.pHit > 0 ? pct(calc.pHit) : "0%" }} → リロール平均 {{ Number.isFinite(calc.rerolls) ? calc.rerolls.toFixed(1) : "—" }} 回)</span></p>
          <table class="w-full">
            <tbody>
              <tr v-for="l in calc.lines" :key="l.name" class="border-t border-white/5">
                <td class="py-0.5">{{ l.name }}</td>
                <td class="w-20 py-0.5 text-right tabular-nums">× {{ Number.isFinite(l.n) ? l.n.toFixed(l.n < 10 && l.n % 1 ? 1 : 0) : "—" }}</td>
                <td class="w-24 py-0.5 text-right tabular-nums opacity-70">{{ money(l.each) }}</td>
                <td class="w-24 py-0.5 text-right tabular-nums">{{ money(l.n * l.each) }}</td>
              </tr>
            </tbody>
          </table>
          <p class="mt-1">② は 1 回分 = ベースの値段 + {{ money(calc.buyRest) }} (深淵のエッセンス・結晶化・骨・ネクロマンシーで印を置き換える壁 + フラクチャー) × 3 + 消去 × 2。<b class="text-sky-100">{{ money(calc.breakEven) }}</b> より安いベースなら ① より安い</p>
          <p v-if="calc.noAbyss" class="text-amber-300">このベースの深淵のエッセンスの値段が分かりません (0 で数えています)</p>
        </div>
      </div>

      <!-- ③ 付ける順番と付け方 (フラクチャー以外) -->
      <div v-if="stepOrder" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="orderDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="orderDone && goTo('order')">5 順番計画</button> <span v-if="help" class="font-normal opacity-60">(目安。6 パターンで付ける物を選ぶプルダウンがこの順に並ぶ)</span>
          <button v-if="orderDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="goTo('order')">ここからやり直す</button>
        </p>
        <p v-if="!orderKeys.length" class="text-[11px] opacity-50">フラクチャーだけ (付ける物はありません)</p>
        <table v-else class="w-full">
          <tbody>
            <tr v-for="(k, i) in orderKeys" :key="k" class="border-t border-white/5">
              <td class="w-14 py-1">
                <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
                <template v-if="!orderDone">
                  <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="moveOrder(k, -1)">▲</button>
                  <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === orderKeys.length - 1" title="下へ" @click="moveOrder(k, 1)">▼</button>
                </template>
              </td>
              <template v-if="orderRow(k)">
                <td class="w-10 py-1 text-[10px] opacity-60">{{ orderRow(k)!.side }}</td>
                <td class="py-1">
                  <span :class="orderRow(k)!.tone">{{ orderRow(k)!.text }}</span> <span class="ml-1 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ orderRow(k)!.rank }} 以上</span>
                  <span v-if="orderRow(k)!.alts.length" class="ml-1 text-[10px] text-amber-200">ほか {{ orderRow(k)!.alts.length }} つと合わせてどれか</span>
                  <span class="ml-1 text-[10px] opacity-60">{{ METHOD_JA[orderRow(k)!.method] }}</span>
                </td>
                <td class="w-48 py-1 text-right text-[11px] tabular-nums">
                  <span v-if="redoOf.get(orderRow(k)!.modId)" :class="redoOf.get(orderRow(k)!.modId)!.safe ? 'opacity-70' : 'text-amber-200'" :title="`取り直す時の見込み (計算機と同じ見積もり): ${REDO_METHOD_JA[redoOf.get(orderRow(k)!.modId)!.method]}で 1 回 ${money(redoOf.get(orderRow(k)!.modId)!.perTry)}・当たり ${pct(redoOf.get(orderRow(k)!.modId)!.p)}・外れ 1 回のやり直し ${money(redoOf.get(orderRow(k)!.modId)!.perMiss)}${redoOf.get(orderRow(k)!.modId)!.safe ? '' : '。外れを消す時にほかの物を巻き込む'}`">取り直し 約 {{ money(redoOf.get(orderRow(k)!.modId)!.expected) }}</span>
                </td>
              </template>
              <template v-else>
                <td class="w-10 py-1 text-[10px] opacity-60">ルーン</td>
                <td class="py-1"><span class="text-amber-100">{{ runeJa(k) }}</span><span v-if="runeNeeded.has(k)" class="ml-1 text-[10px] opacity-60">(狙いの MOD に要る)</span></td>
                <td class="w-6 py-1 text-right">
                  <button v-if="!orderDone && !runeNeeded.has(k)" type="button" class="opacity-50 hover:text-rose-300 hover:opacity-100" title="順番計画から外す" @click="removeRune(k)">×</button>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
        <!-- ルーン: ステージの棚と同じ札。押すと順番計画に入れる / 外す (効き目はホバー) -->
        <div v-if="!orderDone && socketCount > 0 && runeChoices.length" class="mt-2 flex gap-2 text-[11px]">
          <p class="w-24 shrink-0 pt-1 leading-tight opacity-60">ルーン<br />(押して入れ切り)</p>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="r in runeChoices" :key="r.en" type="button"
              class="relative flex w-[66px] flex-col items-center rounded-lg border px-0.5 pb-0.5 pt-1 text-[10px] transition"
              :class="[r.inOrder ? 'border-amber-400 bg-amber-500/15 ring-2 ring-amber-400/60' : 'border-white/10 bg-black/30 hover:border-white/30', r.why && !r.inOrder ? 'cursor-not-allowed opacity-35' : '']"
              :title="`${r.ja}: ${r.effect}${r.why ? `\n${r.why}` : ''}`" @click="toggleRune(r)"
            >
              <img v-if="iconOf(r.k)" :src="iconOf(r.k)" alt="" class="h-7 w-7 object-contain" draggable="false" />
              <span v-else class="h-7 w-7 rounded border border-white/20"></span>
              <span class="w-full truncate text-center leading-tight">{{ r.ja }}</span>
              <span v-if="priceOf(r.k)" class="text-[9px] tabular-nums opacity-60">{{ simCurrency.money(priceOf(r.k)) }}</span>
              <span v-if="r.inOrder" class="absolute left-0.5 top-0.5 rounded bg-amber-600/90 px-1 text-[9px] font-bold text-white">{{ runeNeeded.has(r.k) ? "要る" : "入れた" }}</span>
            </button>
          </div>
        </div>
        <div v-if="!orderDone" class="mt-1 flex">
          <button type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100" @click="orderDone = true">決めた →</button>
        </div>
      </div>
    </template>
      <!-- 6 パターン (2026-10-06): 1 手ずつ。回すのはこの手の通り -->
      <div v-if="step4pre" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="patternDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="patternDone && (patternDone = false)">6 パターン</button>
          <span class="opacity-60">{{ fractureRow ? "フラクチャー済みのベースから" : "白のベースから" }} 1 手ずつ</span>
          <button v-if="patternDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="patternDone = false">ここからやり直す</button>
        </p>
        <StagePatternEditor :busy="busy" @run-one="(k: number) => run(k)" @search-one="(k: number) => searchPattern(k)" :start="patternStart" :order="orderKeys" :order-info="orderInfo" :locked="patternDone" :redo="redoCostMap" :annul-sides="redoPlan?.annulSides ?? {}" :money="money" />
        <!--
          パターンの一覧はここ 1 つ (2026-10-07 オーナー「パターンの比べは何個もいらん、表示 1 個でいい」「回すパターンを選択できるように」)。
          チェックで全部まとめて回す時に入れるか、押すとその結果を下に。回していない物は「未実行」、組みかけは「未完成」
        -->
        <div v-if="!patternDone" class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]" :class="stale && !busy ? '[&_.res]:opacity-50' : ''">
          <span class="opacity-60">パターン</span>
          <!-- 枠のどこを押してもチェックが切り替わる (2026-10-07 オーナー「チェックボックスだけじゃなくて枠クリックで」)。金額の所だけは結果を下に出す -->
          <span v-for="(p, i) in s.simPatterns.value" :key="i" role="checkbox" :aria-checked="!p.off" tabindex="0" class="flex cursor-pointer select-none items-center gap-1 rounded-full border py-0.5 pl-2 pr-1 transition hover:border-white/40" :class="[shownName === p.name && resultOf(p.name) ? 'border-amber-400/70 bg-amber-500/15' : 'border-white/15', p.off ? 'opacity-45' : '']" :title="p.off ? '押すと全部まとめて回す時に入れる' : '押すと全部まとめて回す時に入れない'" @click="togglePatternOff(i)" @keydown.space.prevent="togglePatternOff(i)">
            <span class="grid h-3.5 w-3.5 place-items-center rounded-sm border text-[9px] leading-none" :class="p.off ? 'border-white/30' : 'border-amber-400 bg-amber-400 text-black'">{{ p.off ? "" : "✓" }}</span>
            <b>{{ p.name }}</b>
            <button v-if="resultOf(p.name)" type="button" class="res flex items-center gap-1 rounded-full px-1.5 hover:bg-white/10" :title="stale ? '設定が変わりました。回し直すと合う (押すと結果を下に)' : '押すと結果を下に出す'" @click.stop="showResultByName(p.name)">
              <b class="tabular-nums text-amber-100">{{ money(resultOf(p.name)!.out.r.perDone + (fractureRow ? startMin ?? 0 : 0)) }}</b>
              <span class="opacity-60">完成 {{ pct(resultOf(p.name)!.out.r.pDone) }}</span>
              <span v-if="cheapestName === p.name" class="rounded bg-emerald-500/25 px-1 text-[10px] text-emerald-200">一番安い</span>
            </button>
            <span v-else class="pr-1.5 opacity-50">{{ patternNote(p) }}</span>
          </span>
          <span v-if="busy" class="ml-auto text-sky-200">{{ phase }}<template v-if="progress && phase === '試しています'"> {{ progress[0].toLocaleString() }} / {{ progress[1].toLocaleString() }} 人</template>…</span>
          <button v-if="busy" type="button" class="rounded-lg border border-rose-400/50 px-2 py-0.5 text-rose-200 hover:bg-rose-500/10" @click="stop">中止</button>
          <span v-if="error" class="text-rose-300">{{ error }}</span>
          <button type="button" class="rounded border border-white/15 px-1.5 py-0.5 opacity-70 hover:opacity-100 disabled:opacity-40" :class="[busy ? '' : 'ml-auto', market.fetchedAt.value && Date.now() - market.fetchedAt.value > MARKET_MAX_AGE_MS ? 'text-amber-300' : '']" :disabled="market.loading.value" :title="`相場 ${market.fetchedLabel.value || 'まだ読んでいない'} (押すと取り直す。計算・回した結果は相場の値段で出す)`" @click="refreshPrices">{{ market.loading.value ? "相場を取り直し中…" : `相場 ${market.fetchedLabel.value || "—"} ↻` }}</button>
          <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40" :disabled="busy || !!blocked" :title="blocked ?? `チェックの入ったパターンで、${runs.toLocaleString()} 人がそれぞれ完成まで作った場合を試す (組みかけは組めている所まで)`" @click="run()">回す ▶</button>
        </div>
      </div>
    <StageFracturePicker v-if="s.simAltFor.value" :alt-for="s.simAltFor.value" @close="s.simAltFor.value = null" />

    <template v-if="step4">
    <!--
      結果 (2026-10-07 作り直し。オーナー「UI カスすぎない、パッと見て数字が分かりづらい」「7 回すは機能してないからいらない」
      「ベースとそれ以降のクラフト金額も、何にお金がかかったかに分けて」)。上から いくらか → 運でどれくらい振れるか → 何にお金がかかったか (ベース / クラフト)
    -->
    <div v-if="summary && recipeOut" class="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3" :class="stale ? 'opacity-60' : ''">
      <p v-if="stale" class="mb-1 text-[11px] text-amber-200">設定が変わりました。もう一度「回す」で出し直してください</p>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span class="text-[12px] opacity-60">{{ shownName }} の 1 個あたり</span>
        <span class="text-[28px] font-bold leading-none tabular-nums text-amber-100">{{ moneyT(split.base + split.craft) }}</span>
        <span class="text-[12px] tabular-nums opacity-70">= ベース {{ moneyT(split.base) }} + クラフト {{ moneyT(split.craft) }}</span>
        <span v-if="summary.pDone < 0.995" class="text-[12px] font-bold text-rose-300" :title="recipeOut.r.stops.map((x) => `${pct(x.p)}: ${x.reason}`).join(' / ')">完成 {{ pct(summary.pDone) }}</span>
      </div>
      <div class="mt-2 flex h-2.5 max-w-xl overflow-hidden rounded-full bg-white/10">
        <div class="bg-stone-400/70" :style="{ width: barW(split.base, split.base + split.craft) }" :title="`ベース ${moneyT(split.base)}`"></div>
        <div class="bg-amber-400/80" :style="{ width: barW(split.craft, split.base + split.craft) }" :title="`クラフト ${moneyT(split.craft)}`"></div>
      </div>
      <!-- 運の幅 -->
      <p class="mt-4 text-[11px] opacity-60">運の幅 ({{ summary.runs.toLocaleString() }} 人が作ってみて)</p>
      <!-- 線には印だけ、言葉は下に 1 行で (印の横に書くと長い文がくっついた) -->
      <div class="relative mt-2 h-5 max-w-2xl">
        <div class="absolute left-0 right-0 top-2 h-1 rounded bg-white/15"></div>
        <div v-for="q in luck" :key="q.label" class="absolute top-0.5 h-4 w-[3px] -translate-x-1/2 rounded" :class="q.bar" :style="{ left: q.left }" :title="`${q.label} ${moneyT(q.v)} ${q.tail}`"></div>
      </div>
      <div class="mt-1 flex max-w-3xl flex-wrap gap-x-5 gap-y-1 text-[12px]">
        <span v-for="q in luck" :key="q.label" class="flex items-center gap-1.5 whitespace-nowrap">
          <span class="h-2.5 w-2.5 rounded-full" :class="q.bar"></span>
          <span class="opacity-70">{{ q.label }}</span>
          <b class="tabular-nums" :class="q.text">{{ moneyT(q.v) }}</b>
          <span v-if="q.tail" class="opacity-70">{{ q.tail }}</span>
        </span>
      </div>
      <!-- 何にお金がかかったか (ベース / クラフト) -->
      <div class="mt-3 grid max-w-4xl gap-x-8 gap-y-3 @3xl:grid-cols-2">
        <div v-for="g in costGroups" :key="g.name">
          <p class="mb-1 flex items-baseline gap-2 text-[12px]"><b>{{ g.name }}</b><span class="text-[10px] opacity-50">{{ g.note }}</span><span class="ml-auto font-bold tabular-nums">{{ moneyT(g.total) }}</span></p>
          <div class="grid grid-cols-[minmax(0,1fr)_5rem_4.5rem_2.5rem] items-center gap-x-2 gap-y-1 text-[12px]">
            <template v-for="x in g.items" :key="x.name">
              <span class="truncate" :title="x.name">{{ x.name }}<span v-if="x.n" class="opacity-50"> × {{ fmtCount(x.n) }}</span></span>
              <div class="h-2 rounded-full bg-white/10"><div class="h-2 rounded-full" :class="g.bar" :style="{ width: `${Math.max(2, x.share * 100)}%` }"></div></div>
              <span class="text-right tabular-nums">{{ moneyT(x.cost) }}</span>
              <span class="text-right text-[11px] tabular-nums opacity-50">{{ Math.round(x.share * 100) }}%</span>
            </template>
          </div>
        </div>
      </div>
      <!-- 畳む物 -->
      <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" class="rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="toggle('more')">始め方の比べ {{ open.more ? "▲" : "▼" }}</button>
      </div>
      <!-- 付いていた割合は完成が 100% でない時だけ (組みかけのパターンでどこまで付くか。100% なら全部 100% で要らない。2026-10-07 オーナー「ここいらん、デフォで畳んでいい」) -->
      <div v-if="summary.pDone < 0.995 && recipeOut.r.hitRates?.length" class="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span class="opacity-60">終わった時に付いていた割合</span>
          <span v-for="h in recipeOut.r.hitRates" :key="h.modId" class="rounded-full border border-white/15 bg-black/30 px-2 py-0.5">
            <span :class="hitName(h.modId).tone">{{ hitName(h.modId).text }}</span>
            <b class="ml-1 tabular-nums" :class="h.p >= 0.9 ? 'text-emerald-300' : h.p >= 0.5 ? 'text-amber-200' : 'text-rose-300'">{{ pct(h.p) }}</b>
          </span>
        </div>
        <p v-for="x in recipeOut.r.stops" :key="x.reason" class="mt-1 text-[11px] text-rose-300/80">止まった回 {{ pct(x.p) }}: {{ x.reason }}</p>
      <template v-if="open.more">
    <!-- 始め方の比べ (回した後) -->
    <div v-if="recipeOut" class="mt-2 rounded-lg bg-black/20 px-3 py-2">
      <p class="mb-1 font-bold text-sky-100">始め方の比べ <span v-if="help" class="text-[11px] font-normal opacity-60">(この作り方なら。値段は取引所で見て手で入れる)</span></p>
      <!-- 列の幅は固定 (金額の欄の字が変わっても入力欄が動かない。2026-10-05 オーナー「入力時 UI がズレる、入力する所は軸に」) -->
      <table class="w-full table-fixed">
        <colgroup><col class="w-64" /><col /><col class="w-40" /></colgroup>
        <tbody>
          <tr v-for="x in compare.list" :key="x.key" class="border-t border-white/5" :class="compare.best === x.key ? 'bg-emerald-500/10' : ''">
            <td class="py-1">{{ x.name }}<span v-if="compare.best === x.key" class="ml-1.5 rounded bg-emerald-500/25 px-1.5 text-[10px] text-emerald-200">一番安い</span></td>
            <td class="py-1">
              <span v-if="x.key === 'four'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="fourDivine" base="exalted" unit-key="sim.four" placeholder="無し" />
                <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="狙いの MOD が付いたレアを取引所で探す (固定済みは除く。開くだけ)" @click="searchFour">取引所で探す ↗</button>
                <span class="inline-block w-24 shrink-0" :class="ageOf('four')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("four")?.text ?? "" }}</span>
              </span>
              <span v-else-if="x.key === 'bought'" class="text-[11px] opacity-60">値段は 4 フラクチャーベース設定で入れる</span>
              <span v-else-if="x.key === 'done'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="doneDivine" base="exalted" unit-key="sim.done" placeholder="無し" />
                <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="狙いの MOD が全部付いた物を取引所で探す (普通・固定済み・冒涜のどれでも。開くだけ)" @click="searchDone">取引所で探す ↗</button>
                <span class="inline-block w-24 shrink-0" :class="doneAge?.old ? 'text-amber-300' : 'opacity-60'">{{ doneAge?.text ?? "" }}</span>
              </span>
            </td>
            <td class="truncate py-1 text-right tabular-nums"><b v-if="x.cost != null">{{ money(x.cost) }}</b><span v-else class="text-[11px] opacity-50">{{ x.note }}</span></td>
          </tr>
        </tbody>
      </table>
      <p v-if="stale && recipeOut" class="mt-1 text-[11px] text-amber-200">設定が変わりました。「回す」で出し直すと作る側の数字も合います</p>
    </div>

      </template>
    </div>
    </template>
  </div>
</template>
