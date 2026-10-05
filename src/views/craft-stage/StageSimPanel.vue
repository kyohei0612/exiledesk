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
import { craftStage, nameOf, priceOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { runRecipe, recipePlan, type RecipeMethod, type RecipeResult, type RecipeSpec } from "../../services/craft-stage/recipe-sim";
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
import { socketCapOf } from "../../services/craft-stage/stage-runes";

const s = craftStage;
const RUNS = [500, 1000, 3000] as const;
const runs = ref<number>(1000);

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
      tone: m?.source === "desecrated" ? "text-rose-200" : m && CRAFTED_SOURCES.has(m.source) ? "text-sky-200" : "text-[#c8c8ff]",
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
/** ② の中で 1 つ上 / 下へ (① の候補は飛ばす) */
function move(modId: string, d: -1 | 1): void {
  const list = [...s.simTargets.value];
  const i = list.findIndex((t) => t.modId === modId);
  let j = i + d;
  while (j >= 0 && j < list.length && list[j]!.method === "fracture") j += d;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  s.simTargets.value = list;
}
/** ③ 付ける順番 (フラクチャー以外、上から順) */
const restRows = computed(() => rows.value.filter((r) => r.method !== "fracture"));
/**
 * 付け方を変える。フラクチャーはいくつでも選べる = 始める MOD の候補 (同じ側。どれか 1 つが付いたら進み、どれが固定されても良い)。
 * 2026-10-05 オーナー「始める MOD 選んでもらって、どれか付いたら始めれる。選んだ個数によってそれぞれ付きやすさがあるから計算して」
 * 「フラクチャー品だから選ぶ MOD は複数でも同じ側。違う側同士は作り方も完成図も変わる」。フラクチャーの物は一番上へ (最初に作る物)
 */
function setMethod(modId: string, method: RecipeMethod): void {
  let list = s.simTargets.value.map((t) => (t.modId === modId ? { ...t, method } : t));
  if (method === "fracture") list = [...list.filter((t) => t.method === "fracture"), ...list.filter((t) => t.method !== "fracture")];
  s.simTargets.value = list;
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
async function searchFour(): Promise<void> {
  const d = s.data.value, f = fractureRow.value;
  if (!d || !f) return;
  const got = tradeFiltersFor(d, [{ modId: f.modId, minTierIndex: f.minTierIndex }]);
  const stats = got.filters.map((x) => ({ id: x.id, ...(x.min != null ? { min: x.min } : {}) }));
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: s.itemLevel.value, stats, fracturedItem: false, noSanctified: true, ...socketQuery() }));
}
/** 白のベースを取引所で探す (開くだけ) */
async function searchWhite(): Promise<void> {
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "normal", ilvlMin: s.itemLevel.value, stats: [], noSanctified: true, ...socketQuery() }));
}
/** フラクチャーの候補が違う側に分かれている (作り方が変わるので今は止める) */
const mixedSides = computed(() => new Set(fractureRows.value.map((r) => r.side)).size > 1);
const makeSpec = computed(() => ({ kind: "make" as const, route: makeRoute.value, blocker: makeRoute.value === "magic" && blocker.value }));
/** 付いた状態のベースを取引所で探す (開くだけ。値段は手で入れる) */
async function searchBought(): Promise<void> {
  const d = s.data.value, f = fractureRow.value;
  if (!d || !f) return;
  const got = tradeFiltersFor(d, [{ modId: f.modId, minTierIndex: f.minTierIndex }]);
  const stats = got.filters.map((x) => ({ id: x.id.replace(/^explicit\./, "fractured."), ...(x.min != null ? { min: x.min } : {}) }));
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: s.itemLevel.value, stats, fracturedItem: true, noSanctified: true, ...socketQuery() }));
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
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: s.itemLevel.value, stats, anyOf, noSanctified: true, ...socketQuery() }));
}

/**
 * フラクチャー済みのベースを自分で作ったらいくらか (買うかの分かれ目)。2026-10-05 オーナー「ベースって買った方がええよな、基準は」→
 * 「作るとこのくらい → これより安ければ買う方が得」。錬金 → カオス → フラクチャー (外れたら白から) → 消去で固定した 1 個だけ、を回す
 */
const makeCost = ref<{ key: string; perDone: number; p50: number; p90: number; pDone: number; fractures: number; magic: number; chaos: number; bases: number } | null>(null);
const makeBusy = ref(false);
let makeGen = 0;
const makeKey = computed(() => (fractureRow.value && !(makeRoute.value === "magic" && mixedSides.value)
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
 * フラクチャーの当たりの確率 (計算): 4 つのうち、固定されても良い物の数。壁 (未発現の冒涜) は選ばれないので候補が 3 つ。
 * 錬金 → カオスは 4 つのうち狙いが付いた数 (1 つで数える)
 */
const fractureOdds = computed((): { hit: number; of: number } => {
  const wall = makeRoute.value === "magic" && blocker.value;
  // 候補は同じ側で、付いているのはそのうち 1 つ
  const hit = 1;
  return { hit, of: wall ? 3 : 4 };
});
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
  const sideKey = m.type === "suffix" ? "suffixes" : "prefixes";
  /**
   * 変成・増強の等級は完全 (オーナー「最低完全変成、次の完全増強」)。完全の段の下限で狙いの段が出ない時 (兜のライフ T2 以上など) は
   * 上級 → 無印に落とす (2026-10-05、前は 0% と「—」で止まって見えた)
   */
  const pAt = (floor: number) => {
    const w = (id: string, minIdx: number): number => {
      const x = d.mods.get(id);
      return x ? x.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl >= floor && t.ilvl <= s.itemLevel.value ? t.weight : 0), 0) : 0;
    };
    const total = it.cls.pools.normal[sideKey].reduce((a, id) => a + w(id, 0), 0);
    const each = fracMembers.value.map((r) => ({ name: `${r.text} (${r.rank} 以上)`, p: total > 0 ? w(r.modId, r.minTierIndex) / total : 0 }));
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
  return { pHit, each, rerolls, lines, once, after, total: once * 3 + after, noAbyss: !(priceOf(abyss) > 0), cantRoll: pHit === 0, grade: gr.ja, buyRest, breakEven, buyOnce };
});
const busy = ref(false);
const phase = ref("");
const progress = ref<[number, number] | null>(null);
const error = ref("");
const recipeOut = ref<{ r: RecipeResult; spec: RecipeSpec } | null>(null);
/** フラクチャー済みから残りを作る費用 (ベース代 0 で回した平均)。買う側の比べに足す */
const restCost = ref<number | null>(null);
const ranFor = ref("");
const sig = computed(() => `${market.fetchedAt.value ?? 0}|${s.base.value}|s${socketCount.value}|${s.itemLevel.value}|${makeRoute.value}|${blocker.value}|${whiteDivine.value}|${s.simTargets.value.map((t) => methodOf(t)).join(",")}|${targetsSig()}`);
let gen = 0;

const blocked = computed((): string | null => {
  if (!rows.value.length) return "狙いがありません";
  if (fractureRow.value && makeRoute.value === "magic" && mixedSides.value) return "フラクチャーの候補は同じ側だけ (違う側同士は作り方も完成図も変わる)";
  return null;
});

async function run(): Promise<void> {
  const it = s.item.value, d = s.data.value;
  if (!it || !d || blocked.value) return;
  const my = ++gen;
  busy.value = true;
  error.value = "";
  progress.value = null;
  try {
    phase.value = "回しています";
    const divine = 1; // 手で入れた値段は高貴建て
    // 値段は 1 回引いたら覚える (相場の一覧を毎手引くと、500 回で 46 秒かかっていた)
    const memo = new Map<string, number>();
    const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
    const spec: RecipeSpec = {
      data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: runs.value, price,
      targets: s.simTargets.value.flatMap((t) => (methodOf(t) === "fracture"
        ? [{ modId: t.modId, minTierIndex: t.minTierIndex, method: "fracture" as const }, ...(t.alts ?? []).map((a) => ({ ...a, method: "fracture" as const }))]
        : [{ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t), ...(t.alts?.length ? { alts: t.alts } : {}) }])),
      whiteBasePrice: (num(whiteDivine.value) ?? 0) * divine, sockets: socketCount.value,
      ...(fractureRow.value ? { fractureStart: makeSpec.value } : {}),
    };
    // 白から作る + (フラクチャーがあれば) 固定済みから残りを作る (ベース代 0) の 2 本。始め方の比べに使う
    const total = runs.value * (fractureRow.value ? 2 : 1);
    const r = await runRecipe(spec, (done) => { if (my === gen) progress.value = [done, total]; }, () => my !== gen);
    if (my !== gen || !r) return;
    let rest: number | null = null;
    if (fractureRow.value) {
      const r2 = await runRecipe({ ...spec, fractureStart: { kind: "bought", price: 0 } }, (done) => { if (my === gen) progress.value = [runs.value + done, total]; }, () => my !== gen);
      if (my !== gen || !r2) return;
      rest = r2.perDone;
    }
    recipeOut.value = { r, spec };
    restCost.value = rest;
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
watch(() => s.base.value, () => { recipeOut.value = null; restCost.value = null; });

/**
 * 説明・内訳は閉じておき、要る時に開く (2026-10-05 オーナー「UI とにかく文字が多いから説明とかは閉じてデフォで、必要な時に開く感じで最低限に。活字疲れる」)。
 * 開け閉めは覚える
 */
const FOLD_KEY = "exiledesk.craftStageSim.open";
const open = ref<Record<string, boolean>>({});
try { open.value = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "{}"); } catch { /* 無くてよい */ }
function toggle(k: "help" | "calc" | "usage"): void {
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
const step2 = computed(() => whiteOk.value && num(whiteDivine.value) != null);
const step3 = computed(() => step2.value && modsDone.value && rows.value.length > 0);
const stepOrder = computed(() => step3.value && fracDone.value);
const step4 = computed(() => stepOrder.value && orderDone.value);
watch(() => rows.value.length, (n) => { if (n === 0) { modsDone.value = false; fracDone.value = false; orderDone.value = false; } });
watch(keptKey, () => { if (restoring) return; modsDone.value = false; fracDone.value = false; orderDone.value = false; whiteOk.value = false; s.simAltFor.value = null; });
// 下の MOD 一覧は ① で選んでいる間だけ。「決めた」で閉じる (2026-10-05 オーナー「役目終えたらこのベースに付く MOD はしまっていい、最初以外使わん」)。
// 足し直す時は ① の「直す」で開き直す
watch(() => step2.value && !modsDone.value, (v) => { s.simShowMods.value = v; }, { immediate: true });
/**
 * 工程を押すとそこからやり直す (後ろの工程は決め直し)。「1 つ戻す」は今の 1 つ前の工程へ
 * (2026-10-05 オーナー「各工程クリックでそこからやり直させて欲しい。ミスクリックもあるから 1 つ戻すボタンも」)
 */
type Stage = "white" | "mods" | "frac" | "order";
function goTo(st: Stage): void {
  if (st === "white") whiteOk.value = false;
  if (st === "white" || st === "mods") modsDone.value = false;
  if (st !== "order") fracDone.value = false;
  orderDone.value = false;
}
/**
 * 「1 つ戻す」= 直前の操作を 1 つ取り消す (工程ではなく、1 つ前の状態に。2026-10-05 オーナー「1 つ戻すは手じゃなくて行動、1 つ前の作業の状態」)。
 * 狙い (MOD・段・あるいは・どれか N つ・フラクチャー・付け方・順番)・工程の決めた / 戻した・ソケット・白ベースの値段を、変わるたびに前の形を積む
 */
type Snap = { targets: string; whiteOk: boolean; modsDone: boolean; fracDone: boolean; orderDone: boolean; sockets: number | null; white: number | null };
const snapNow = (): Snap => ({ targets: JSON.stringify(s.simTargets.value), whiteOk: whiteOk.value, modsDone: modsDone.value, fracDone: fracDone.value, orderDone: orderDone.value, sockets: sockets.value, white: whiteDivine.value });
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
  whiteOk.value = prev.whiteOk; modsDone.value = prev.modsDone; fracDone.value = prev.fracDone; orderDone.value = prev.orderDone;
  sockets.value = prev.sockets; whiteDivine.value = prev.white;
  void nextTick(() => { lastSnap = snapNow(); restoring = false; });
}
/**
 * ② フラクチャーにできる MOD (普通の MOD だけ。冒涜・エッセンスの MOD は固定の候補にしない、あるいは付きの手順も外す)。
 * 候補は同じ側だけ (1 つ目の側に揃える)
 */
const fracSide = computed(() => fractureRows.value[0]?.side ?? null);
const canFracture = (r: { method: RecipeMethod; methods: RecipeMethod[]; alts: unknown[]; side: string }): boolean =>
  r.methods.includes("exalt") && (!fracSide.value || fracSide.value === r.side || r.method === "fracture");
function toggleFracture(modId: string): void {
  const r = rows.value.find((x) => x.modId === modId);
  if (!r) return;
  if (r.method === "fracture") s.simTargets.value = s.simTargets.value.map((t) => (t.modId === modId ? { ...t, method: methodsFor(modId)[0] } : t));
  else if (canFracture(r)) setMethod(modId, "fracture");
}
/**
 * 白ベースからの流れ (エンジン recipe-sim.ts の作り方と同じ)。1 番が普通の MOD で高貴ガチャ / カオススパムなら、マジックの間に
 * 変成 → 増強・消去スパムで 1 番だけ付けてから王者。フラクチャーがある時は候補を増強・消去スパムで付けて骨の壁 → フラクチャー
 */
const whiteFlow = computed(() => {
  if (fractureRow.value) return "変成 → 増強・消去スパムでフラクチャーの候補を付ける → 王者 → 骨の壁 → フラクチャー (1/3、外れたら白から) → 消去 × 2 → 1 番から順に";
  const first = restRows.value[0];
  if (first && (first.method === "exalt" || first.method === "chaos") && first.methods.includes("exalt")) return "変成 → 増強・消去スパムで 1 番を付ける (外れは消去か白の買い直しの安い方) → 王者 → 2 番から順に";
  return "変成 → 王者 → 1 番から順に";
});
/** 「しない」: フラクチャーの印を全部外して進む */
function noFracture(): void {
  s.simTargets.value = s.simTargets.value.map((t) => (t.method === "fracture" ? { ...t, method: methodsFor(t.modId)[0] } : t));
  fracDone.value = true;
}
onBeforeUnmount(() => { s.simShowMods.value = false; });
const money = (x: number): string => (Number.isFinite(x) ? displayCurrency.money(x) : "—");
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
  list.push({ key: "make", name: fractureRow.value ? "白から作る (フラクチャーも自前)" : "白から作る", cost: out ? out.r.perDone : null, note: "回すと出ます" });
  if (fractureRow.value) {
    const rest = restCost.value;
    const c = calc.value;
    const four = c && c.buyOnce != null && rest != null ? c.buyOnce * 3 + c.after + rest : null;
    list.push({ key: "four", name: "4 MOD・当たり 1 のベースを買う", cost: four, note: num(fourDivine.value) == null ? "値段を入れると出ます" : "回すと出ます" });
    const bN = num(boughtDivine.value);
    const bought = bN != null && rest != null ? bN * dv + rest : null;
    list.push({ key: "bought", name: "固定済みのベースを買う", cost: bought, note: num(boughtDivine.value) == null ? "値段を入れると出ます" : "回すと出ます" });
  }
  list.push({ key: "done", name: "完成品を買う", cost: num(doneDivine.value) != null ? num(doneDivine.value)! * dv : null, note: "値段を入れると出ます" });
  const known = list.filter((x) => x.cost != null && Number.isFinite(x.cost));
  const best = known.length >= 2 ? known.reduce((a, b) => (b.cost! < a.cost! ? b : a)).key : null;
  return { list, best };
});
/** 上の 5 つの数 (どちらの回し方でも同じ形) */
const summary = computed(() => {
  if (recipeOut.value) { const r = recipeOut.value.r; return { perDone: r.perDone, pDone: r.pDone, runs: r.runs, p50: r.p50, p80: r.p80, p90: r.p90 }; }
  return null;
});
const usageName = (k: string): string => (k === "reveal" ? "発現 (選ぶだけ)" : nameOf(k));
/** 真ん中くらいの 1 回を「手で打つ」で再生 */
function replay(): void {
  const o = recipeOut.value;
  if (!o?.r.sample) return;
  const plan = recipePlan(o.spec, o.r.sample);
  s.mode.value = "hand";
  s.loadReplay(plan, plan.steps.length);
}
</script>

<template>
  <!-- 工程ごとに同じ高さの枠を縦に並べる (入れ子の枠はやめた。2026-10-05 オーナー「枠の中に何個枠あんのよ、きもいやろ」
       「1 がベース選定、2 がベース値段、3 が狙う MOD と分けたら」)。1 ベースは上の CraftStage.vue の枠 -->
  <div class="space-y-3 text-[12px]">
    <!-- 1 つ戻す・説明はタブの行の右端に (工程の枠の間に行を挟まない) -->
    <Teleport to="#sim-tools" :disabled="s.mode.value !== 'sim' || !!s.replay.value">
      <button type="button" class="rounded-lg border border-white/20 px-2 py-0.5 text-[11px] hover:bg-white/10 disabled:opacity-30" :disabled="!undoStack.length" title="直前の操作を 1 つ取り消す" @click="undo">↶ 1 つ戻す</button>
      <button type="button" class="rounded-full border px-2 py-0.5 text-[11px]" :class="help ? 'border-sky-400/60 bg-sky-500/15 text-sky-100' : 'border-white/15 opacity-60 hover:opacity-100'" title="説明を出す / 閉じる" @click="toggle('help')">説明 {{ help ? "▲" : "?" }}</button>
    </Teleport>
    <p v-if="help" class="mb-2 text-[11px] opacity-60">狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)。上から順に作る (カオス・消去・冒涜の打ち直しは自動)。前に付けた物が消えたら、また上から</p>

    <!-- 2 ベースの値段 (手で) -->
    <div v-if="socketsOk" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p class="mb-1.5 flex items-center gap-2">
        <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="whiteOk ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="whiteOk && goTo('white')">2 白ベース設定</button>
        <button v-if="whiteOk" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="goTo('white')">ここからやり直す</button>
      </p>
      <div class="flex flex-wrap items-center gap-2 text-[11px]">
      <span class="opacity-70">白ベース</span>
      <PriceInput v-model="whiteDivine" base="exalted" unit-key="sim.white" placeholder="0" />
      <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="アイテムレベル以上の白のベースを取引所で探す (開くだけ)" @click="searchWhite">取引所で探す ↗</button>
      <span class="inline-block w-24 shrink-0" :class="ageOf('white')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("white")?.text ?? "" }}</span>
      <button v-if="!whiteOk" type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100 disabled:opacity-40" :disabled="num(whiteDivine) == null" @click="whiteOk = true">進む →</button>
      <span v-if="help" class="opacity-60">規格外のソケット付きならその値段。白から始める時・作り直す時に数え、マジックで外れた時は「消去」と「白を買い直して変成」の安い方を使う</span>
      </div>
    </div>

    <!-- 3 狙う MOD → 4 フラクチャー → 5 付ける順番と付け方 -->
    <template v-if="step2">
      <!-- ① 狙う MOD (下の「このベースに付く MOD」の「T○ 以上」で足す。「＋」であるいは) -->
      <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="modsDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="modsDone && goTo('mods')">3 狙う MOD</button> <span v-if="help" class="font-normal opacity-60">(下の一覧の「T○ 以上」で足す。「＋」でその MOD の代わりに付いても当たりにする物)</span>
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

      <!-- ② フラクチャー (① の中から固定する MOD。同じ側でどれか 1 つが固定されれば良い) -->
      <div v-if="step3" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="fracDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="fracDone && goTo('frac')">4 フラクチャー</button> <span v-if="help" class="font-normal opacity-60">(3 の中から固定する MOD。いくつ選んでも同じ側で、どれか 1 つが固定されれば良い)</span>
          <button v-if="fracDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="goTo('frac')">ここからやり直す</button>
        </p>
        <template v-if="!fracDone">
          <label v-for="r in rows.filter((x) => x.methods.includes('exalt'))" :key="r.modId" class="flex items-center gap-2 py-0.5" :class="canFracture(r) ? 'cursor-pointer' : 'opacity-40'">
            <input type="checkbox" class="h-4 w-4 accent-emerald-400" :checked="r.method === 'fracture'" :disabled="!canFracture(r)" @change="toggleFracture(r.modId)" />
            <span class="w-8 text-[10px] opacity-60">{{ r.side }}</span>
            <span :class="r.tone">{{ r.text }}</span> <span class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span>
            <span v-if="r.alts.length" class="text-[10px] text-amber-200">ほか {{ r.alts.length }} つも全部候補 (どれか 1 つが固定されれば良い)</span>
            <span v-if="!canFracture(r)" class="text-[10px] opacity-60">(候補と違う側)</span>
          </label>
          <p v-if="!rows.some((x) => x.methods.includes('exalt'))" class="text-[11px] opacity-50">固定にできる普通の MOD がありません</p>
          <div class="mt-1 flex items-center gap-2">
            <span v-if="calc && fractureRows.length" class="text-[11px] opacity-80">付きやすさ 合計 {{ pct(calc.pHit) }}</span>
            <button type="button" class="ml-auto rounded-lg border border-white/20 px-2 py-0.5 text-[11px] hover:bg-white/10" @click="noFracture">しない</button>
            <button type="button" class="rounded-lg border border-emerald-400/60 bg-emerald-500/20 px-3 py-0.5 font-bold text-emerald-100 disabled:opacity-40" :disabled="!fractureRows.length" @click="fracDone = true">決めた →</button>
          </div>
        </template>
        <template v-else>
          <p v-if="!fractureRows.length" class="text-[11px] opacity-50">しない</p>
          <p v-for="(r, i) in fracMembers" :key="r.modId" class="flex items-center gap-2 py-0.5">
            <span class="w-8 text-[10px] opacity-60">{{ r.side }}</span>
            <span :class="r.tone">{{ r.text }}</span> <span class="rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span>
            <span v-if="calc?.each[i]" class="ml-auto text-[11px] tabular-nums opacity-80">付きやすさ {{ pct(calc.each[i]!.p) }}</span>
          </p>
        </template>
      </div>

      <!-- ③ 付ける順番と付け方 (フラクチャー以外) -->
      <div v-if="stepOrder" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <p class="mb-1.5 flex items-center gap-2 text-[11px]">
          <button type="button" class="text-[13px] font-bold text-amber-100 hover:underline" :class="orderDone ? 'cursor-pointer' : 'cursor-default'" title="ここからやり直す" @click="orderDone && goTo('order')">5 付ける順番と付け方</button> <span v-if="help" class="font-normal opacity-60">(上から順。前に付けた物が消えたら、また上から)</span>
          <button v-if="orderDone" type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 opacity-70 hover:opacity-100" @click="goTo('order')">ここからやり直す</button>
        </p>
        <!-- 白ベースからの流れ (2026-10-05 オーナー「フラクチャー無しの段階の説明が足りてなさすぎる」) -->
        <p class="mb-1 text-[11px] text-amber-100/80">白ベースから: {{ whiteFlow }}</p>
        <p v-if="!restRows.length" class="text-[11px] opacity-50">フラクチャーだけ (付ける物はありません)</p>
        <table v-else class="w-full">
          <tbody>
            <tr v-for="(r, i) in restRows" :key="r.modId" class="border-t border-white/5">
              <td class="w-14 py-1">
                <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
                <template v-if="!orderDone">
                  <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="move(r.modId, -1)">▲</button>
                  <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === restRows.length - 1" title="下へ" @click="move(r.modId, 1)">▼</button>
                </template>
              </td>
              <td class="w-10 py-1 text-[10px] opacity-60">{{ r.side }}</td>
              <td class="py-1">
                <span :class="r.tone">{{ r.text }}</span> <span class="ml-1 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span>
                <span v-if="r.alts.length" class="ml-1 text-[10px] text-amber-200">ほか {{ r.alts.length }} つと合わせてどれか 1 つ</span>
              </td>
              <td class="py-1">
                <span class="flex flex-wrap justify-end gap-1">
                  <button v-for="m in r.methods" :key="m" type="button" class="rounded px-1.5 py-px text-[11px] disabled:cursor-default" :class="r.method === m ? (m === 'desecrate' ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/60' : 'bg-white/15 text-white ring-1 ring-white/40') : 'border border-white/10 opacity-60 hover:opacity-100'" :disabled="orderDone" @click="setMethod(r.modId, m)">{{ METHOD_JA[m] }}</button>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!orderDone" class="mt-1 flex">
          <button type="button" class="ml-auto rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-0.5 font-bold text-amber-100" @click="orderDone = true">決めた →</button>
        </div>
      </div>
    </template>
    <StageFracturePicker v-if="s.simAltFor.value" :alt-for="s.simAltFor.value" @close="s.simAltFor.value = null" />

    <template v-if="step4">
    <!-- 6 回す (相場・フラクチャーまでの費用・回す) -->
    <div class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 space-y-2">
    <p class="text-[13px] font-bold text-amber-100">6 回す</p>
    <div class="flex flex-wrap items-center gap-2 text-[11px]">
      <span class="opacity-70">相場</span>
      <span :class="market.fetchedAt.value && Date.now() - market.fetchedAt.value > MARKET_MAX_AGE_MS ? 'text-amber-300' : ''">{{ market.loading.value ? "取り直しています…" : market.fetchedLabel.value || "まだ読んでいない" }}</span>
      <button type="button" class="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:opacity-40" :disabled="market.loading.value" title="カレンシーランキングと同じ相場を取り直す (計算・回した結果も出し直す)" @click="refreshPrices">相場を取り直す</button>
      <span v-if="help" class="opacity-60">計算と回した結果は、この相場の値段で出しています</span>
    </div>

    <!-- フラクチャーの始め方 -->
    <div v-if="fractureRow" class="border-t border-white/10 pt-2">
      <p class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <b class="text-emerald-100">フラクチャーまで</b>
        <span v-if="calc">計算 <b class="text-amber-100">{{ money(calc.total) }}</b></span>
        <span>回した平均 <b class="text-amber-100">{{ makeBusy ? "…" : makeCost ? money(makeCost.perDone) : "—" }}</b></span>
        <span class="opacity-70">当たり {{ fractureOdds.hit }}/{{ fractureOdds.of }}</span>
        <span v-if="calc?.cantRoll" class="text-rose-300">増強ではこの段は出ません (アイテムレベルが足りない)</span>
        <span v-else-if="calc && calc.grade !== '完全'" class="text-[11px] text-amber-200">完全の増強では出ない段なので{{ calc.grade }}で計算</span>
        <button type="button" class="ml-auto rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="toggle('calc')">内訳 {{ open.calc ? "▲" : "▼" }}</button>
      </p>
      <template v-if="open.calc">
      <!-- 計算の費用 (1 回分 × 3) -->
      <div v-if="calc" class="mt-1.5 rounded bg-black/25 px-2 py-1.5 text-[11px]">
        <p class="mb-1 text-[12px]">
          計算: 1 個 = 1 回分 <b>{{ money(calc.once) }}</b> × 3 + 固定できた後の消去 × 2 {{ money(calc.after) }} = <b class="text-amber-100">{{ money(calc.total) }}</b>
          <span v-if="help" class="opacity-60">(完全の増強 1 回で候補のどれかが付く {{ calc.pHit > 0 ? pct(calc.pHit) : "0%" }} → リロール平均 {{ Number.isFinite(calc.rerolls) ? calc.rerolls.toFixed(1) : "—" }} 回)</span>
        </p>
        <p v-if="calc.each.length >= 2" class="mb-1 opacity-80">
          付きやすさ: <template v-for="(x, i) in calc.each" :key="x.name">{{ i ? " + " : "" }}{{ x.name }} {{ pct(x.p) }}</template> = {{ pct(calc.pHit) }}
        </p>
        <p v-if="calc.noAbyss" class="text-amber-300">このベースの深淵のエッセンスの値段が分かりません (0 で数えています)</p>
        <!-- 買うか自前か (4 MOD・当たり 1 のベース) -->
        <div class="mb-1.5 rounded border border-sky-400/25 bg-sky-500/[0.06] px-2 py-1.5">
          <p>
            4 MOD・当たり 1 のベースは <b class="text-sky-100">{{ money(calc.breakEven) }}</b> より安ければ買う方が得
            <span v-if="help" class="opacity-60">(自前の 1 回分 {{ money(calc.once) }} − 買う時のベース代以外 {{ money(calc.buyRest) }} = 深淵のエッセンス・結晶化・骨・ネクロマンシー (満杯なので印を置き換える壁) + フラクチャー。固定できた後の消去 × 2 はどちらも同じ)</span>
          </p>
          <p v-if="calc.buyOnce != null" class="mt-0.5">
            買う: 1 回分 {{ money(calc.buyOnce) }} × 3 + 消去 × 2 = <b>{{ money(calc.buyOnce * 3 + calc.after) }}</b> / 自前: {{ money(calc.total) }}
            <span v-if="calc.buyOnce < calc.once" class="ml-1 rounded bg-emerald-500/20 px-1.5 text-emerald-200">買う方が {{ money((calc.once - calc.buyOnce) * 3) }} 得</span>
            <span v-else class="ml-1 rounded bg-amber-500/20 px-1.5 text-amber-200">自前の方が {{ money((calc.buyOnce - calc.once) * 3) }} 得</span>
          </p>
        </div>
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
      </div>
      <p class="mt-1 text-[12px]">
        <span class="opacity-60">回した結果: </span>
        <template v-if="makeBusy">作る費用を出しています…</template>
        <template v-else-if="makeCost">
          自分で作ると平均 <b class="text-amber-100">{{ money(makeCost.perDone) }}</b>
          <span v-if="help" class="text-[11px] opacity-60">(半分の人 {{ money(makeCost.p50) }} 以内・9 割 {{ money(makeCost.p90) }} 以内<template v-if="makeCost.pDone < 0.95">・作れた割合 {{ pct(makeCost.pDone) }}</template>)</span>
          <span class="mt-1 grid grid-cols-2 gap-1.5 @3xl:grid-cols-4">
            <span class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">フラクチャーの当たり</span>
              <b>{{ fractureOdds.hit }}/{{ fractureOdds.of }}</b> <span class="text-[11px] opacity-70">= 平均 {{ (fractureOdds.of / fractureOdds.hit).toFixed(1) }} 回に 1 回</span>
              <span class="block text-[10px] opacity-60">回した結果: 平均 {{ makeCost.fractures.toFixed(1) }} 回</span>
            </span>
            <span v-if="makeRoute === 'magic'" class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">変成・増強 ({{ fracMembers.length >= 2 ? "候補のどれかが" : "狙いが" }}付くまで、全部のベースで)</span>
              <b>平均 {{ makeCost.magic.toFixed(0) }} 回</b>
            </span>
            <span v-else class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">錬金・カオス (全部のベースで)</span>
              <b>平均 {{ makeCost.chaos.toFixed(0) }} 回</b>
            </span>
            <span class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">使った白のベース</span>
              <b>平均 {{ makeCost.bases.toFixed(1) }} 個</b>
              <span v-if="help" class="block text-[10px] opacity-60">外れの固定・マジックの買い直し込み</span>
            </span>
          </span>
        </template>
      </p>
      <div v-if="help" class="mt-1 text-[11px]">
        <p class="mt-0.5 opacity-70">
          変成 → {{ fracMembers.length >= 2 ? "候補のどれかが" : "狙いが" }}付くまで増強 (外れは消去か白の買い直しの安い方) → 王者 (狙いだけの 1 つなら高貴で 3 つに) → 骨 1 本の壁 (未発現の冒涜、側は問わない) で 4 つ → フラクチャー (1/3)。外れを固定したら白を買い直して始めから。固定できたら消去を 2 つ (残りの外れはカオスが入れ替え、高貴・冒涜は要る時にその側を消す)。ここまでの費用も込み
        </p>
      </div>
      </template>
    </div>

    <!-- 回す -->
    <div class="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
      <span class="opacity-60">回す回数</span>
      <button v-for="n in RUNS" :key="n" type="button" class="rounded-lg px-2 py-0.5" :class="runs === n ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="runs = n">{{ n.toLocaleString() }}</button>
      <!-- フラクチャーがあると比べ用に 2 本回す (2026-10-05 オーナー「1000 回押しても 2000 回になる、別に 2000 回でおｋだから UI 直して」) -->
      <span v-if="fractureRow" class="text-[11px] opacity-70">白から {{ runs.toLocaleString() }} 回 + 固定済みから {{ runs.toLocaleString() }} 回 = 計 {{ (runs * 2).toLocaleString() }} 回</span>
      <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 disabled:opacity-40" :disabled="busy || !!blocked" :title="blocked ?? ''" @click="run">回す</button>
      <button v-if="busy" type="button" class="rounded-lg border border-rose-400/50 px-2 py-1 text-rose-200 hover:bg-rose-500/10" @click="stop">中止</button>
      <span v-if="busy" class="text-sky-200">{{ phase }}<template v-if="progress && phase === '回しています'"> {{ progress[0].toLocaleString() }} / {{ progress[1].toLocaleString() }}</template>…</span>
      <span v-else-if="blocked && rows.length" class="text-amber-200/80">{{ blocked }}</span>
      <span v-if="error" class="text-rose-300">{{ error }}</span>
    </div>

    </div>
    <!-- 始め方の比べ (回した後) -->
    <div v-if="recipeOut" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p class="mb-1 font-bold text-sky-100">始め方の比べ <span v-if="help" class="text-[11px] font-normal opacity-60">(この作り方なら。値段は取引所で見て手で入れる)</span></p>
      <!-- 列の幅は固定 (金額の欄の字が変わっても入力欄が動かない。2026-10-05 オーナー「入力時 UI がズレる、入力する所は軸に」) -->
      <table class="w-full table-fixed">
        <colgroup><col class="w-64" /><col /><col class="w-40" /></colgroup>
        <tbody>
          <tr v-for="x in compare.list" :key="x.key" class="border-t border-white/5" :class="compare.best === x.key ? 'bg-emerald-500/10' : ''">
            <td class="py-1">{{ x.name }}<span v-if="compare.best === x.key" class="ml-1.5 rounded bg-emerald-500/25 px-1.5 text-[10px] text-emerald-200">一番安い</span></td>
            <td class="py-1">
              <span v-if="x.key === 'four'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="fourDivine" base="exalted" unit-key="sim.four" />
                <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="狙いの MOD が付いたレアを取引所で探す (固定済みは除く。開くだけ)" @click="searchFour">取引所で探す ↗</button>
                <span class="inline-block w-24 shrink-0" :class="ageOf('four')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("four")?.text ?? "" }}</span>
              </span>
              <span v-else-if="x.key === 'bought'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="boughtDivine" base="exalted" unit-key="sim.bought" />
                <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="この MOD が固定済みのベースを取引所で探す (開くだけ)" @click="searchBought">取引所で探す ↗</button>
                <span class="inline-block w-24 shrink-0" :class="ageOf('bought')?.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("bought")?.text ?? "" }}</span>
              </span>
              <span v-else-if="x.key === 'done'" class="flex flex-wrap items-center gap-1.5 text-[11px]">
                <PriceInput v-model="doneDivine" base="exalted" unit-key="sim.done" />
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

    <!-- 結果 -->
    <div v-if="summary" class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2" :class="stale ? 'opacity-50' : ''">
      <p v-if="stale" class="mb-1 text-[11px] text-amber-200">設定が変わりました。もう一度「回す」で出し直してください</p>
      <div class="mb-2 grid grid-cols-2 gap-2 @3xl:grid-cols-5">
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">1 個できるまでの平均</p>
          <p class="text-lg font-bold text-amber-100">{{ money(summary.perDone) }}</p>
          <p v-if="help" class="text-[10px] opacity-50">失敗した回の費用も込み</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">完成の割合</p>
          <p class="text-lg font-bold" :class="summary.pDone >= 0.9 ? 'text-emerald-300' : 'text-amber-300'">{{ pct(summary.pDone) }}</p>
          <p class="text-[10px] opacity-50">{{ fractureRow ? "白から作る " : "" }}{{ summary.runs.toLocaleString() }} 回のうち</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">半分の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p50) }}</p></div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">8 割の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p80) }}</p></div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">9 割の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p90) }}</p></div>
      </div>

      <!-- 使った物 -->
      <template v-if="recipeOut">
        <div class="mb-1 flex items-center gap-2">
          <button type="button" class="rounded border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="toggle('usage')">使った物 {{ open.usage ? "▲" : "▼" }}</button>
          <button type="button" class="ml-auto rounded-lg border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10 disabled:opacity-40" :disabled="!recipeOut.r.sample" title="費用が真ん中くらいだった 1 回を「手で打つ」で 1 手ずつ見る" @click="replay">真ん中くらいの 1 回をステージで再生 ▶</button>
        </div>
        <table v-if="open.usage" class="w-full text-[12px]">
          <thead>
            <tr class="text-[10px] opacity-60">
              <th class="py-1 text-left font-normal">打つ物 / お告げ</th>
              <th class="w-24 py-1 text-right font-normal">数</th>
              <th class="w-28 py-1 text-right font-normal">費用</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in recipeOut.r.usage" :key="u.key" class="border-t border-white/5">
              <td class="py-1">{{ usageName(u.key) }}</td>
              <td class="py-1 text-right tabular-nums">{{ u.count.toFixed(u.count < 10 ? 1 : 0) }}</td>
              <td class="py-1 text-right tabular-nums">{{ u.key === "reveal" ? "" : money(u.cost) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-for="x in recipeOut.r.stops" :key="x.reason" class="mt-1 text-[11px] text-rose-300/80">止まった回 {{ pct(x.p) }}: {{ x.reason }}</p>
      </template>

    </div>
    </template>
  </div>
</template>
