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
import { computed, onMounted, ref, watch } from "vue";
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
import { marketStore, MARKET_MAX_AGE_MS } from "../../state/market-store";
import { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";

const s = craftStage;
const RUNS = [500, 1000, 3000] as const;
const runs = ref<number>(1000);

const METHOD_JA: Record<RecipeMethod, string> = { exalt: "高貴", chaos: "カオス", desecrate: "冒涜", essence: "エッセンス", fracture: "フラクチャー" };
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
    };
  });
});
function remove(modId: string): void {
  s.simTargets.value = s.simTargets.value.filter((t) => t.modId !== modId);
}
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
/** ① の候補を選ぶポップアップ ([[StageFracturePicker.vue]]) */
const pickerOpen = ref(false);
/** ② 順番に付ける MOD (① の候補以外、上から順) */
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
const fractureRow = computed(() => fractureRows.value[0] ?? null);
const fractureStart = ref<"make" | "bought">("make");
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
type Kept = { v: number; at: number };
const PRICE_KEY = "exiledesk.craftStageSim.basePrices";
const keptAll = ref<Record<string, Partial<Record<"white" | "four" | "bought", Kept>>>>({});
try { keptAll.value = JSON.parse(localStorage.getItem(PRICE_KEY) ?? "{}"); } catch { /* 無くてよい */ }
const keptKey = computed(() => `${s.base.value}|${s.itemLevel.value}`);
const kept = computed(() => keptAll.value[keptKey.value] ?? {});
let loadingKept = false;
function loadKept(): void {
  loadingKept = true;
  whiteDivine.value = kept.value.white?.v ?? null;
  fourDivine.value = kept.value.four?.v ?? null;
  boughtDivine.value = kept.value.bought?.v ?? null;
  void Promise.resolve().then(() => { loadingKept = false; });
}
function saveKept(which: "white" | "four" | "bought", v: number | null): void {
  if (loadingKept) return;
  const cur = { ...(keptAll.value[keptKey.value] ?? {}) };
  if (v == null || !(v >= 0)) delete cur[which];
  else cur[which] = { v, at: Date.now() };
  keptAll.value = { ...keptAll.value, [keptKey.value]: cur };
  try { localStorage.setItem(PRICE_KEY, JSON.stringify(keptAll.value)); } catch { /* 無くてよい */ }
}
watch(keptKey, loadKept, { immediate: true });
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
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: s.itemLevel.value, stats, fracturedItem: false, noSanctified: true }));
}
const divineEx = (): number => priceOf("divine") || 1;
/** 白のベースを取引所で探す (開くだけ) */
async function searchWhite(): Promise<void> {
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "normal", ilvlMin: s.itemLevel.value, stats: [], noSanctified: true }));
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
  await openTradeQuery(buildSpecQuery({ baseType: s.base.value, rarity: "nonunique", ilvlMin: s.itemLevel.value, stats, fracturedItem: true, noSanctified: true }));
}

/**
 * フラクチャー済みのベースを自分で作ったらいくらか (買うかの分かれ目)。2026-10-05 オーナー「ベースって買った方がええよな、基準は」→
 * 「作るとこのくらい → これより安ければ買う方が得」。錬金 → カオス → フラクチャー (外れたら白から) → 消去で固定した 1 個だけ、を回す
 */
const makeCost = ref<{ key: string; perDone: number; p50: number; p90: number; pDone: number; fractures: number; magic: number; chaos: number; bases: number } | null>(null);
const makeBusy = ref(false);
let makeGen = 0;
const makeKey = computed(() => (fractureRow.value && !(makeRoute.value === "magic" && mixedSides.value)
  ? `${s.base.value}|${s.itemLevel.value}|${fractureRows.value.map((f) => `${f.modId}:${f.minTierIndex}`).join(",")}|${makeRoute.value}|${makeSpec.value.blocker}|${whiteDivine.value ?? 0}|${market.fetchedAt.value ?? 0}` : ""));
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
    whiteBasePrice: (whiteDivine.value ?? 0) * divineEx(),
    targets: fractureRows.value.map((x) => ({ modId: x.modId, minTierIndex: x.minTierIndex, method: "fracture" as const })),
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
 *   1 個 = 1 回分 × 3 (骨の壁でフラクチャーが 1/3)
 * お告げの側は、壁を置く側 = 狙いの反対側
 */
const calc = computed(() => {
  const d = s.data.value, it = s.item.value, f = fractureRow.value;
  if (!d || !it || !f) return null;
  const m = d.mods.get(f.modId);
  if (!m) return null;
  const sideKey = m.type === "suffix" ? "suffixes" : "prefixes";
  const floor = CURRENCY_FLOOR.augment.perfect;
  const w = (id: string, minIdx: number): number => {
    const x = d.mods.get(id);
    return x ? x.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl >= floor && t.ilvl <= s.itemLevel.value ? t.weight : 0), 0) : 0;
  };
  const total = it.cls.pools.normal[sideKey].reduce((a, id) => a + w(id, 0), 0);
  // 候補ごとの付きやすさと合計 (どれか 1 つで良い)
  const each = fractureRows.value.map((r) => ({ name: `${r.text} (${r.rank} 以上)`, p: total > 0 ? w(r.modId, r.minTierIndex) / total : 0 }));
  const pHit = Math.min(1, each.reduce((a, x) => a + x.p, 0));
  const wall: "prefix" | "suffix" = m.type === "suffix" ? "prefix" : "suffix";
  const abyss = `essence:perfect:${it.cls.id}/PerfectEssence_EssenceAbyss`;
  const rerolls = pHit > 0 ? 1 / pHit : Infinity;
  const white = (whiteDivine.value ?? 0) * divineEx();
  // buy = 4 MOD のベースを買っても要る物 (壁とフラクチャー)
  // 1 から (自前): 壁は王者の後に骨 1 本だけ (側を選ばないのでお告げも深淵のエッセンスも要らない)。増強のリロールで狙いの 1 つだけ
  // になった時 (最初の増強で付かなかった時、確率 1 − p) は、王者で 2 つにしかならないので高貴で 3 つにしてから骨
  // (2026-10-05 オーナー「1 からの場合骨壁は単純で王者後は骨 1 個でいい、選ぶ必要ない」「増強リロールで 1 個だけ付いたら王者すると 1 個足りないから高貴打って 3 つに」)
  const lines: Array<{ name: string; n: number; each: number }> = [
    { name: "白のベース", n: 1, each: white },
    { name: nameOf("transmute_perfect"), n: 1, each: priceOf("transmute_perfect") },
    { name: `${nameOf("augment_perfect")} (リロール)`, n: rerolls, each: priceOf("augment_perfect") },
    { name: `${nameOf("annul")} (リロールに 2 つ)`, n: rerolls * 2, each: priceOf("annul") },
    // マジック → レアにする王者 (等級は問わないので無印。2026-10-05 オーナー「適当な王者がいるのか、レア化に。チャレンジ品作る時だから 3 個か」)
    { name: nameOf("regal"), n: 1, each: priceOf("regal") },
    { name: `${nameOf("exalt")} (リロールで 1 つだけの時)`, n: Math.max(0, 1 - pHit), each: priceOf("exalt") },
    { name: `${nameOf("desecrate")} (壁)`, n: 1, each: priceOf("desecrate") },
    { name: nameOf("fracture"), n: 1, each: priceOf("fracture") },
  ];
  const once = lines.reduce((a, l) => a + l.n * l.each, 0);
  // 4 MOD のベースを買う時は満杯なので、壁は 深淵のエッセンス (結晶化で消す側を選ぶ) → 骨 (ネクロマンシー) で印を置き換える
  const buyLines: Array<{ name: string; n: number; each: number }> = [
    { name: nameOf("annul"), n: 2, each: priceOf("annul") },
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
  const fourB = fourDivine.value != null && fourDivine.value >= 0 ? fourDivine.value * divineEx() : null;
  const buyOnce = fourB != null ? fourB + buyRest : null;
  return { pHit, each, rerolls, lines, once, total: once * 3, noAbyss: !(priceOf(abyss) > 0), cantRoll: pHit === 0, buyRest, breakEven, buyOnce };
});
/** 入れた値段との比べ (高貴建て) */
const buyVsMake = computed(() => {
  const m = makeCost.value;
  if (!m || boughtDivine.value == null || !(boughtDivine.value >= 0) || !Number.isFinite(m.perDone)) return null;
  const buy = boughtDivine.value * (priceOf("divine") || 1);
  return { buy, diff: m.perDone - buy };
});

const busy = ref(false);
const phase = ref("");
const progress = ref<[number, number] | null>(null);
const error = ref("");
const recipeOut = ref<{ r: RecipeResult; spec: RecipeSpec } | null>(null);
const ranFor = ref("");
const sig = computed(() => `${market.fetchedAt.value ?? 0}|${s.base.value}|${s.itemLevel.value}|${fractureStart.value}|${boughtDivine.value}|${makeRoute.value}|${blocker.value}|${whiteDivine.value}|${s.simTargets.value.map((t) => `${t.modId}:${t.minTierIndex}:${methodOf(t)}`).join(",")}`);
let gen = 0;

const blocked = computed((): string | null => {
  if (!rows.value.length) return "狙いがありません";
  if (fractureRow.value && fractureStart.value === "bought" && !(boughtDivine.value != null && boughtDivine.value >= 0)) return "付いた状態のベースの値段 (神) を入れてください";
  if (fractureRow.value && fractureStart.value === "make" && makeRoute.value === "magic" && mixedSides.value) return "フラクチャーの候補は同じ側だけ (違う側同士は作り方も完成図も変わる)";
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
    const divine = priceOf("divine") || 1;
    // 値段は 1 回引いたら覚える (相場の一覧を毎手引くと、500 回で 46 秒かかっていた)
    const memo = new Map<string, number>();
    const price = (k: string): number => { let v = memo.get(k); if (v == null) { v = priceOf(k); memo.set(k, v); } return v; };
    const spec: RecipeSpec = {
      data: d, base: s.base.value, itemLevel: s.itemLevel.value, runs: runs.value, price,
      targets: s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, method: methodOf(t) })),
      whiteBasePrice: (whiteDivine.value ?? 0) * divine,
      ...(fractureRow.value ? { fractureStart: fractureStart.value === "bought" ? { kind: "bought" as const, price: (boughtDivine.value ?? 0) * divine } : makeSpec.value } : {}),
    };
    const r = await runRecipe(spec, (done, total) => { if (my === gen) progress.value = [done, total]; }, () => my !== gen);
    if (my !== gen || !r) return;
    recipeOut.value = { r, spec };
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
watch(() => s.base.value, () => { recipeOut.value = null; });

const money = (x: number): string => (Number.isFinite(x) ? displayCurrency.money(x) : "—");
const pct = (x: number): string => `${(x * 100).toFixed(x < 0.1 && x > 0 ? 1 : 0)}%`;
const stale = computed(() => ranFor.value !== sig.value);
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
  <section class="rounded-xl border border-amber-400/30 bg-amber-500/[0.04] p-3 text-[12px]">
    <div class="mb-2 flex flex-wrap items-center gap-2">
      <b class="text-sm text-amber-100">シミュレーション</b>
      <span class="rounded bg-amber-500/20 px-1.5 text-[10px] text-amber-200">実験</span>
      <span class="opacity-60">{{ s.item.value?.baseJa }} (アイテムレベル {{ s.itemLevel.value }})。狙いは下の「このベースに付く MOD」の段の表の「狙う」で選ぶ (その段以上)</span>
    </div>

    <p class="mb-2 text-[11px] opacity-60">上から順に作る (カオス・消去・冒涜の打ち直しは自動)。前に付けた物が消えたら、また上から</p>

    <!-- 狙い: ① フラクチャーの候補 (ポップアップの MOD 一覧から選ぶ) → ② 順番に付ける MOD (下の一覧の「狙う」) -->
    <div class="mb-3">
      <!-- ① フラクチャーの候補 -->
      <div class="mb-2 rounded-lg border border-emerald-400/40 bg-emerald-500/[0.05] px-2 py-1.5">
        <p class="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-bold text-emerald-100">
          ① フラクチャーの候補 <span class="font-normal opacity-60">(同じ側。どれか 1 つが付いたら進み、どれが固定されても良い)</span>
          <button type="button" class="ml-auto rounded border border-emerald-400/60 bg-emerald-500/15 px-2 py-0.5 font-normal text-emerald-100 hover:bg-emerald-500/25" @click="pickerOpen = true">MOD を選ぶ</button>
        </p>
        <p v-if="!fractureRows.length" class="text-[11px] opacity-50">なし (白から ② を順に作る)</p>
        <table v-else class="w-full">
          <tbody>
            <tr v-for="(r, i) in fractureRows" :key="r.modId" class="border-t border-white/5">
              <td class="w-10 py-1 text-[10px] opacity-60">{{ r.side }}</td>
              <td class="py-1"><span :class="r.tone">{{ r.text }}</span> <span class="ml-1 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span></td>
              <td class="w-28 py-1 text-right text-[11px] tabular-nums opacity-80"><template v-if="calc?.each[i]">付きやすさ {{ pct(calc.each[i]!.p) }}</template></td>
              <td class="w-6 py-1 text-right"><button type="button" class="opacity-60 hover:opacity-100" title="外す" @click="remove(r.modId)">×</button></td>
            </tr>
          </tbody>
        </table>
        <p v-if="calc && fractureRows.length >= 2" class="mt-0.5 text-right text-[11px]">合計 {{ pct(calc.pHit) }}</p>
      </div>

      <!-- ② 順番に付ける MOD -->
      <div class="rounded-lg border border-amber-400/40 bg-amber-500/[0.04] px-2 py-1.5">
        <p class="mb-1 text-[11px] font-bold text-amber-100">② 順番に付ける MOD <span class="font-normal opacity-60">(下の「このベースに付く MOD」の段の表の「狙う」で足す。上から順。前に付けた物が消えたら、また上から)</span></p>
        <p v-if="!restRows.length" class="text-[11px] opacity-50">まだありません</p>
        <table v-else class="w-full">
          <tbody>
            <tr v-for="(r, i) in restRows" :key="r.modId" class="border-t border-white/5">
              <td class="w-14 py-1">
                <span class="mr-1 font-bold text-amber-200">{{ i + 1 }}</span>
                <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === 0" title="上へ" @click="move(r.modId, -1)">▲</button>
                <button type="button" class="px-0.5 opacity-60 hover:opacity-100 disabled:opacity-20" :disabled="i === restRows.length - 1" title="下へ" @click="move(r.modId, 1)">▼</button>
              </td>
              <td class="w-10 py-1 text-[10px] opacity-60">{{ r.side }}</td>
              <td class="py-1"><span :class="r.tone">{{ r.text }}</span> <span class="ml-1 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }} 以上</span></td>
              <td class="py-1">
                <span class="flex flex-wrap gap-1">
                  <button v-for="m in r.methods" :key="m" type="button" class="rounded px-1.5 py-px text-[11px]" :class="r.method === m ? (m === 'desecrate' ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/60' : 'bg-white/15 text-white ring-1 ring-white/40') : 'border border-white/10 opacity-60 hover:opacity-100'" @click="setMethod(r.modId, m)">{{ METHOD_JA[m] }}</button>
                </span>
              </td>
              <td class="w-6 py-1 text-right"><button type="button" class="opacity-60 hover:opacity-100" title="外す" @click="remove(r.modId)">×</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <button v-if="rows.length" type="button" class="mt-1 rounded-lg border border-white/15 px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100" @click="s.simTargets.value = []">全部外す</button>
    </div>
    <StageFracturePicker v-if="pickerOpen" @close="pickerOpen = false" />

    <!-- 白のベースの値段 (手で) -->
    <div class="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
      <span class="opacity-70">白のベースの値段</span>
      <input v-model.number="whiteDivine" type="number" min="0" step="0.1" placeholder="0" class="w-20 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-right" /> <span>神</span>
      <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="アイテムレベル以上の白のベースを取引所で探す (開くだけ)" @click="searchWhite">取引所で探す ↗</button>
      <span v-if="ageOf('white')" :class="ageOf('white')!.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("white")!.text }}</span>
      <span class="opacity-60">規格外のソケット付きならその値段。白から始める時・作り直す時に数え、マジックで外れた時は「消去」と「白を買い直して変成」の安い方を使う</span>
    </div>
    <!-- カレンシーの相場 -->
    <div class="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
      <span class="opacity-70">カレンシーの相場</span>
      <span :class="market.fetchedAt.value && Date.now() - market.fetchedAt.value > MARKET_MAX_AGE_MS ? 'text-amber-300' : ''">{{ market.loading.value ? "取り直しています…" : market.fetchedLabel.value || "まだ読んでいない" }}</span>
      <button type="button" class="rounded border border-white/20 px-2 py-0.5 hover:bg-white/10 disabled:opacity-40" :disabled="market.loading.value" title="カレンシーランキングと同じ相場を取り直す (計算・回した結果も出し直す)" @click="refreshPrices">相場を取り直す</button>
      <span class="opacity-60">計算と回した結果は、この相場の値段で出しています</span>
    </div>

    <!-- フラクチャーの始め方 -->
    <div v-if="fractureRow" class="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-500/[0.06] px-3 py-2">
      <p class="mb-1 font-bold text-emerald-100">フラクチャー: <template v-for="(f, i) in fractureRows" :key="f.modId">{{ i ? " か " : "" }}{{ f.text }} ({{ f.rank }} 以上)</template><span v-if="fractureRows.length >= 2" class="ml-1 text-[11px] font-normal opacity-70">(始める MOD の候補。どれか 1 つが付いたら進み、どれが固定されても良い)</span></p>
      <label class="mr-4 inline-flex items-center gap-1.5"><input v-model="fractureStart" type="radio" value="make" /> 作る (確率込み)</label>
      <label class="inline-flex items-center gap-1.5"><input v-model="fractureStart" type="radio" value="bought" /> 付いた状態で始める (ベースを買う)</label>
      <!-- 計算の費用 (1 回分 × 3) -->
      <div v-if="calc" class="mt-1 rounded bg-black/25 px-2 py-1.5 text-[11px]">
        <p class="mb-1 text-[12px]">
          計算: 1 個 = 1 回分 <b>{{ money(calc.once) }}</b> × 3 = <b class="text-amber-100">{{ money(calc.total) }}</b>
          <span class="opacity-60">(完全の増強 1 回で候補のどれかが付く {{ calc.pHit > 0 ? pct(calc.pHit) : "0%" }} → リロール平均 {{ Number.isFinite(calc.rerolls) ? calc.rerolls.toFixed(1) : "—" }} 回)</span>
        </p>
        <p v-if="calc.each.length >= 2" class="mb-1 opacity-80">
          付きやすさ: <template v-for="(x, i) in calc.each" :key="x.name">{{ i ? " + " : "" }}{{ x.name }} {{ pct(x.p) }}</template> = {{ pct(calc.pHit) }}
        </p>
        <p v-if="calc.cantRoll" class="text-rose-300">完全の増強 (段の下限 {{ CURRENCY_FLOOR.augment.perfect }}) ではこの段は出ません</p>
        <p v-if="calc.noAbyss" class="text-amber-300">このベースの深淵のエッセンスの値段が分かりません (0 で数えています)</p>
        <!-- 買うか自前か (4 MOD・当たり 1 のベース) -->
        <div class="mb-1.5 rounded border border-sky-400/25 bg-sky-500/[0.06] px-2 py-1.5">
          <p class="flex flex-wrap items-center gap-2">
            <span>4 MOD・当たり 1 のベース</span>
            <input v-model.number="fourDivine" type="number" min="0" step="0.1" placeholder="値段" class="w-20 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-right" /> <span>神</span>
            <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="狙いの MOD が付いたレアを取引所で探す (固定済みは除く。開くだけ)" @click="searchFour">取引所で探す ↗</button>
            <span v-if="ageOf('four')" :class="ageOf('four')!.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("four")!.text }}</span>
          </p>
          <p class="mt-0.5">
            分かれ目: <b class="text-sky-100">{{ money(calc.breakEven) }}</b> より安ければ買う方が得
            <span class="opacity-60">(自前の 1 回分 {{ money(calc.once) }} − 買う時のベース代以外 {{ money(calc.buyRest) }} = 消去 2 + 深淵のエッセンス・結晶化・骨・ネクロマンシー (満杯なので印を置き換える壁) + フラクチャー)</span>
          </p>
          <p v-if="calc.buyOnce != null" class="mt-0.5">
            買う: 1 回分 {{ money(calc.buyOnce) }} × 3 = <b>{{ money(calc.buyOnce * 3) }}</b> / 自前: {{ money(calc.total) }}
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
          <span class="text-[11px] opacity-60">(半分の人 {{ money(makeCost.p50) }} 以内・9 割 {{ money(makeCost.p90) }} 以内<template v-if="makeCost.pDone < 0.95">・作れた割合 {{ pct(makeCost.pDone) }}</template>)</span>
          → <b class="text-emerald-200">これより安ければ買う方が得</b>
          <span class="mt-1 grid grid-cols-2 gap-1.5 @3xl:grid-cols-4">
            <span class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">フラクチャーの当たり</span>
              <b>{{ fractureOdds.hit }}/{{ fractureOdds.of }}</b> <span class="text-[11px] opacity-70">= 平均 {{ (fractureOdds.of / fractureOdds.hit).toFixed(1) }} 回に 1 回</span>
              <span class="block text-[10px] opacity-60">回した結果: 平均 {{ makeCost.fractures.toFixed(1) }} 回</span>
            </span>
            <span v-if="makeRoute === 'magic'" class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">変成・増強 ({{ fractureRows.length >= 2 ? "候補のどれかが" : "狙いが" }}付くまで、全部のベースで)</span>
              <b>平均 {{ makeCost.magic.toFixed(0) }} 回</b>
            </span>
            <span v-else class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">錬金・カオス (全部のベースで)</span>
              <b>平均 {{ makeCost.chaos.toFixed(0) }} 回</b>
            </span>
            <span class="rounded bg-black/30 px-2 py-1">
              <span class="block text-[10px] opacity-60">使った白のベース</span>
              <b>平均 {{ makeCost.bases.toFixed(1) }} 個</b>
              <span class="block text-[10px] opacity-60">外れの固定・マジックの買い直し込み</span>
            </span>
          </span>
          <template v-if="buyVsMake">
            <span v-if="buyVsMake.diff > 0" class="ml-2 rounded bg-emerald-500/20 px-1.5 text-emerald-200">入れた値段なら買う方が {{ money(buyVsMake.diff) }} 得</span>
            <span v-else class="ml-2 rounded bg-amber-500/20 px-1.5 text-amber-200">入れた値段なら作る方が {{ money(-buyVsMake.diff) }} 得</span>
          </template>
        </template>
      </p>
      <div v-if="fractureStart === 'make'" class="mt-1 text-[11px]">
        <p class="mt-0.5 opacity-70">
          変成 → {{ fractureRows.length >= 2 ? "候補のどれかが" : "狙いが" }}付くまで増強 (外れは消去か白の買い直しの安い方) → 王者 (狙いだけの 1 つなら高貴で 3 つに) → 骨 1 本の壁 (未発現の冒涜、側は問わない) で 4 つ → フラクチャー (1/3)。外れを固定したら白を買い直して始めから → 外れが無くなるまで消去。ここまでの費用も込み
        </p>
      </div>
      <p v-else class="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        <span class="opacity-70">ベースの値段</span>
        <input v-model.number="boughtDivine" type="number" min="0" step="0.1" class="w-20 rounded border border-white/15 bg-black/30 px-1.5 py-0.5 text-right" /> <span>神</span>
        <button type="button" class="rounded border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10" title="この MOD が固定済みのベースを取引所で探す (開くだけ)" @click="searchBought">取引所で探す ↗</button>
        <span v-if="ageOf('bought')" :class="ageOf('bought')!.old ? 'text-amber-300' : 'opacity-60'">{{ ageOf("bought")!.text }}</span>
        <span v-else class="opacity-60">見つけた値段を入れてください</span>
      </p>
    </div>

    <!-- 回す -->
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <span class="opacity-60">回す回数</span>
      <button v-for="n in RUNS" :key="n" type="button" class="rounded-lg px-2 py-0.5" :class="runs === n ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="runs = n">{{ n.toLocaleString() }}</button>
      <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-3 py-1 font-bold text-amber-100 disabled:opacity-40" :disabled="busy || !!blocked" :title="blocked ?? ''" @click="run">回す</button>
      <button v-if="busy" type="button" class="rounded-lg border border-rose-400/50 px-2 py-1 text-rose-200 hover:bg-rose-500/10" @click="stop">中止</button>
      <span v-if="busy" class="text-sky-200">{{ phase }}<template v-if="progress && phase === '回しています'"> {{ progress[0] }} / {{ progress[1] }}</template>…</span>
      <span v-else-if="blocked && rows.length" class="text-amber-200/80">{{ blocked }}</span>
      <span v-if="error" class="text-rose-300">{{ error }}</span>
    </div>

    <!-- 結果 -->
    <div v-if="summary" :class="stale ? 'opacity-50' : ''">
      <p v-if="stale" class="mb-1 text-[11px] text-amber-200">設定が変わりました。もう一度「回す」で出し直してください</p>
      <div class="mb-2 grid grid-cols-2 gap-2 @3xl:grid-cols-5">
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">1 個できるまでの平均</p>
          <p class="text-lg font-bold text-amber-100">{{ money(summary.perDone) }}</p>
          <p class="text-[10px] opacity-50">失敗した回の費用も込み</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2">
          <p class="text-[10px] opacity-60">完成の割合</p>
          <p class="text-lg font-bold" :class="summary.pDone >= 0.9 ? 'text-emerald-300' : 'text-amber-300'">{{ pct(summary.pDone) }}</p>
          <p class="text-[10px] opacity-50">{{ summary.runs.toLocaleString() }} 回のうち</p>
        </div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">半分の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p50) }}</p></div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">8 割の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p80) }}</p></div>
        <div class="rounded-lg bg-black/30 px-3 py-2"><p class="text-[10px] opacity-60">9 割の人はこれ以内</p><p class="text-base font-bold">{{ money(summary.p90) }}</p></div>
      </div>

      <!-- 使った物 -->
      <template v-if="recipeOut">
        <div class="mb-1 flex items-center gap-2">
          <p class="text-[11px] opacity-70">使った物 (1 個できるまでの平均)</p>
          <button type="button" class="ml-auto rounded-lg border border-sky-400/50 px-2 py-0.5 text-sky-200 hover:bg-sky-500/10 disabled:opacity-40" :disabled="!recipeOut.r.sample" title="費用が真ん中くらいだった 1 回を「手で打つ」で 1 手ずつ見る" @click="replay">真ん中くらいの 1 回をステージで再生 ▶</button>
        </div>
        <table class="w-full text-[12px]">
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
  </section>
</template>
