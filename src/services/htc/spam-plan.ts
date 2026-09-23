/**
 * spam-plan.ts — カオススパムで何を狙い、同じ側の残りをどう足すか (2026-09-23)
 *
 * ## オーナーと決めた組み立て
 * 1. **カオススパム**: 固定済み (樹 MOD) + 外せる MOD 1 つの状態でカオスを打つ。外せるのが 1 つだけ
 *    なので毎回そこが入れ替わり、狙いが消える心配が無い。狙いが付いたら止める。
 * 2. **同じ側の残り**を片側の高貴 (カタリストあり / なし) で足す。外れたら消去。消去は外せる MOD から
 *    一様に 1 つ消すので、**外れ / 足した狙い / スパムで付けた狙い**のどれかが消える。スパムの狙いが
 *    消えたら剥がしてスパムからやり直し (オーナー:「キャスピ消えたら泣ける」)。
 * 3. 反対側・エッセンス・冒涜は**その後** (ここでは数えない)。冒涜は一番最後。
 *
 * ## スパムで狙う MOD の選び方 (オーナー 2026-09-23)
 * 「カオススパムは優先タグがないものもしくはカタリストがめっちゃ高いやつ (ここはカタリスト使うか
 * 使わないか選べるように) を優先順位で選ぼう」。
 *   1. 効くカタリストが無い MOD
 *   2. 効くカタリストが全部「使わない」の MOD (既定では 1 個 {@link PRICEY_CATALYST_DIVINE} 神以上を使わない)
 *   3. それ以外
 * 同じ順位の中では**サフィを先に**、その中で**カオスで一番付きにくい物** (後から高貴で足すと一番高くつく
 * 物を先に固める)。
 *
 * ## 有識者の話
 * 費用の大半は**触媒の高貴のお告げで足しに行って外した時の消去**。だからカタリストで足す側の枠はスパムの間空けておく。
 *
 * ## 品質 40% (ブリーチのエッセンス)
 * 流れ (オーナー): キャスピをスパム → ブリーチのエッセンスで最大品質 40% → カタリストで品質を足して
 * 全耐性・知性を触媒の高貴のお告げで全力で引く → 外れたら消去でやり直し。お告げは 1 回ごとに品質を
 * 使い切るので毎回カタリスト 27 個で戻す (品質 40% の触媒は 20% の約 2 倍効くので途中で品質を足す)。
 * プレにブリーチの MOD (レベル 0) が居座るので、サフィの外れを素の消去で消すとそれが消えることがある。
 * その時はブリーチのエッセンス (安い) を付け直す。右側の消去のお告げより安い (オーナー)。
 * サフィ完成後に削減のお告げで確定で消し、パーフェクトエッセンスを当て、冒涜でプレを仕上げる
 * (ここでは数えない)。
 *
 * ## 高額コース
 * 品質 20% でスパムの狙いがプレになると、後で削減のお告げの付け直しが続く (オーナー:「削減リロールの
 * 地獄」)。まだ詰めていないので**断り書きだけ**出す。
 */
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import { catalysingMultiplier, catalystCountFor, catalystPriceKey } from "./catalysing";
import { CATALYSTS, catalystsFor } from "./quality";

/** 既定で「使わない」にするカタリストの値段 (1 個・神)。軽快 0.35 / 歯擦音 0.97 / 強奪者 0.37 (2026-09-23) */
export const PRICEY_CATALYST_DIVINE = 0.2;

type Side = "prefix" | "suffix";
type Group = "no-catalyst" | "catalyst-off" | "catalyst" | "later";

export interface CatalystChoice {
  tag: string;
  ja: string;
  /** カタリスト 1 個 (高貴換算) */
  unit: number;
  /** 触媒の高貴のお告げ 1 回ぶんのカタリスト代 + お告げ代 (高貴換算) */
  perTry: number;
  enabled: boolean;
}

export interface TargetMethod {
  modId: string;
  side: Side;
  catalysts: CatalystChoice[];
  /** 固定済み + 外せる 1 つの状態で、素のカオス 1 回で付く確率 */
  chaosOdds: number;
  group: Group;
  /** 画面の「手」: スパム / 高貴で足す / 後で */
  role: "spam" | "exalt" | "later";
}

export interface PhaseStep {
  /** その時点で付いている、同じ側の狙い (modId。画面で文面に直す) */
  have: string[];
  /** 外れの数 */
  junk: number;
  action: string;
  /** 1 回の値段 (高貴換算) */
  perTry: number;
}

export interface PhaseResult {
  /** スパム込みの平均 (高貴換算) */
  expected: number;
  p50: number;
  p80: number;
  p90: number;
  /** 高貴を打つ回数 (半分 / 8 割) */
  exalts50: number;
  exalts80: number;
  steps: PhaseStep[];
}

/** スパムの狙いの候補 1 つ。安い順に並べて画面に出す */
export interface SpamAlternative {
  modId: string;
  side: Side;
  group: Group;
  /** 優先順のルールで選ばれる物 */
  byRule: boolean;
  /** いま採っている物 */
  chosen: boolean;
  expected: number | null;
  p80: number | null;
  expensive: boolean;
  reason: string | null;
}

export interface SpamPlan {
  methods: TargetMethod[];
  /** スパムの狙いの候補を全部、平均の安い順 */
  alternatives: SpamAlternative[];
  spam: { modId: string; currency: string; odds: number; expected: number } | null;
  side: Side | null;
  /** 品質 20% でプレをスパム = 削減リロールの高額コース */
  expensive: boolean;
  phase: PhaseResult | null;
  /** 組めなかった理由 */
  reason: string | null;
}

export interface SpamPlanInput {
  data: PatchData;
  cls: ItemBase;
  targets: readonly TierTarget[];
  prices: Prices;
  itemLevel: number;
  /** カタリストで上げる品質 (%)。品質 40% の貼り付けならブリーチのエッセンスを使っている */
  quality: number;
  /** プレにブリーチのゴミ MOD が居るか (品質 40%) */
  breach: boolean;
  /** 固定済み・樹 MOD で埋まっている枠 */
  used: { prefix: number; suffix: number };
  /** 利用者が切り替えたカタリスト (tag → 使うか)。無ければ既定 */
  catalystChoice?: Readonly<Record<string, boolean>>;
  /** 回す回数 (既定 20,000) */
  runs?: number;
  /** 利用者が選び直したスパムの狙い (modId)。無ければ優先順のルール */
  spamOverride?: string;
}

const CHAOS: ReadonlyArray<[string, number]> = [["chaos", 0], ["chaos_greater", 35], ["chaos_perfect", 50]];
const EXALT: ReadonlyArray<[string, number]> = [["exalt", 0], ["exalt_greater", 35], ["exalt_perfect", 50]];
const LABEL: Record<string, string> = {
  chaos: "カオスオーブ", chaos_greater: "カオスオーブ (上級)", chaos_perfect: "カオスオーブ (完全)",
  exalt: "高貴なオーブ", exalt_greater: "高貴なオーブ (上級)", exalt_perfect: "高貴なオーブ (完全)",
};

export function spamPlan(inp: SpamPlanInput): SpamPlan {
  const { data, cls, prices, itemLevel, quality, breach } = inp;
  const cur = (k: string): number => prices.currency[k] ?? prices.omens[k] ?? Infinity;
  const divine = prices.currency.divine ?? 1;
  const mod = (id: string): Mod | undefined => data.mods.get(id);
  const minTier = new Map(inp.targets.map((t) => [t.modId, t.minTierIndex ?? 0]));
  const mult = catalysingMultiplier(quality);
  const nCat = catalystCountFor(quality);

  const sw = (m: Mod, minIdx: number, floor: number): number =>
    m.tiers.reduce((a, t, i) => a + (i >= minIdx && t.ilvl <= itemLevel && t.ilvl >= floor ? t.weight : 0), 0);
  const boosted = (m: Mod, tag: string | null): number => (tag && catalystsFor(m).some((c) => c.tag === tag) ? mult : 1);
  const famW = (id: string, floor: number, tag: string | null = null): number => {
    const m = mod(id); return m ? sw(m, 0, floor) * boosted(m, tag) : 0;
  };
  const hitW = (id: string, floor: number, tag: string | null = null): number => {
    const m = mod(id); return m ? sw(m, minTier.get(id) ?? 0, floor) * boosted(m, tag) : 0;
  };
  const pool = (side: Side): readonly string[] => (side === "prefix" ? cls.pools.normal.prefixes : cls.pools.normal.suffixes);
  const allW = (floor: number): number => [...pool("prefix"), ...pool("suffix")].reduce((a, id) => a + famW(id, floor), 0);

  // ---- 狙いごとの手 ----
  const methods: TargetMethod[] = [];
  for (const t of inp.targets) {
    const m = mod(t.modId);
    if (!m) continue;
    const side: Side = m.type === "prefix" ? "prefix" : "suffix";
    const catalysts: CatalystChoice[] = catalystsFor(m).map((c) => {
      const unit = cur(catalystPriceKey(c.tag));
      const def = unit / divine < PRICEY_CATALYST_DIVINE;
      return {
        tag: c.tag, ja: CATALYSTS.find((x) => x.tag === c.tag)?.ja ?? c.tag, unit,
        perTry: cur("OmenofCatalysingExaltation") + nCat * unit,
        enabled: inp.catalystChoice?.[c.tag] ?? def,
      };
    });
    const rollable = m.source === "normal";
    const group: Group = !rollable ? "later"
      : catalysts.length === 0 ? "no-catalyst"
        : catalysts.every((c) => !c.enabled) ? "catalyst-off" : "catalyst";
    methods.push({ modId: t.modId, side, catalysts, chaosOdds: rollable ? hitW(t.modId, 0) / allW(0) : 0, group, role: "later" });
  }

  const rank: Record<Group, number> = { "no-catalyst": 0, "catalyst-off": 1, catalyst: 2, later: 9 };
  // 同じ順位ならサフィを先に: 品質 40% は「サフィをスパムで」が原則、品質 20% でもプレのスパムは
  // 削減リロールの高額コース (オーナー 2026-09-23)。その中で一番付きにくい物
  const sideRank = (x: TargetMethod): number => (x.side === "suffix" ? 0 : 1);
  const cand = methods.filter((x) => x.group !== "later")
    .sort((a, b) => rank[a.group] - rank[b.group] || sideRank(a) - sideRank(b) || a.chaosOdds - b.chaosOdds);
  if (!cand.length) return { methods, spam: null, side: null, expensive: false, phase: null, alternatives: [], reason: "カオスで付けられる狙いがありません" };

  /** その狙いをスパムにした時の組み立て (同じ側の残りを高貴で足すところまで) */
  const planFor = (pick: TargetMethod, runs: number) => {
    const spamOpts = CHAOS.map(([k, f]) => {
      const odds = hitW(pick.modId, f) / allW(f);
      return { k, odds, expected: cur(k) / odds };
    }).filter((o) => o.odds > 0 && Number.isFinite(o.expected)).sort((x, y) => x.expected - y.expected);
    const sp = spamOpts[0];
    const side = pick.side;
    const expensive = side === "prefix" && !breach;
    if (!sp) return { pick, side, expensive, spam: null, others: [], phase: null, reason: "カオスで付きません (段が高すぎる / 相場が無い)" };
    const cap = 3 - (side === "prefix" ? inp.used.prefix : inp.used.suffix);
    const others = methods.filter((x) => x !== pick && x.side === side && x.group !== "later");
    const spam = { modId: pick.modId, currency: LABEL[sp.k] ?? sp.k, odds: sp.odds, expected: sp.expected };
    if (1 + others.length > cap) {
      return { pick, side, expensive, spam, others, phase: null, reason: `${side === "prefix" ? "プレ" : "サフィ"}の枠が足りません (空き ${cap} / 狙い ${1 + others.length})` };
    }
    const phase = solvePhase({ ...inp, runs, pick, others, side, cap, cur, famW, hitW, pool, sp });
    return { pick, side, expensive, spam, others, phase, reason: null as string | null };
  };

  // ルールで選ぶ (利用者が選び直していればそれ)。**ルールが一番安いとは限らない** ── 完全の高貴は
  // 段の下限 50 で高い段が当たりやすく、スパムで固めなくても安く付く MOD がある (死体の円環では
  // 軽快を使うとキャスピより全耐性をスパムした方が安かった)。だから候補を全部並べて見せる
  const chosen = cand.find((x) => x.modId === inp.spamOverride) ?? cand[0]!;
  const main = planFor(chosen, inp.runs ?? 20000);
  main.pick.role = "spam";
  for (const o of main.others) o.role = "exalt";
  // **比べるのは同じ側どうし。**反対側をスパムにした案は、その側の費用しか数えていない (こちら側の
  // 狙いがまるごと抜ける) ので並べても比べられない。反対側の段階を数えるまでは理由だけ出す
  const alternatives: SpamAlternative[] = cand.map((x) => {
    if (x.side !== chosen.side) {
      return { modId: x.modId, side: x.side, group: x.group, byRule: x === cand[0], chosen: false,
        expected: null, p80: null, expensive: x.side === "prefix" && !breach, reason: "反対側なので比べていない" };
    }
    const r = x === chosen ? main : planFor(x, Math.min(inp.runs ?? 20000, 4000));
    return {
      modId: x.modId, side: x.side, group: x.group, byRule: x === cand[0], chosen: x === chosen,
      expected: r.phase?.expected ?? null, p80: r.phase?.p80 ?? null, expensive: r.expensive, reason: r.reason,
    };
  }).sort((x, y) => (x.expected ?? Infinity) - (y.expected ?? Infinity));
  return { methods, spam: main.spam, side: main.side, expensive: main.expensive, phase: main.phase, alternatives, reason: main.reason };
}

// ================= 同じ側の残りを足す段階 =================

interface PhaseCtx extends SpamPlanInput {
  pick: TargetMethod;
  others: TargetMethod[];
  side: Side;
  cap: number;
  cur: (k: string) => number;
  famW: (id: string, floor: number, tag?: string | null) => number;
  hitW: (id: string, floor: number, tag?: string | null) => number;
  pool: (side: Side) => readonly string[];
  sp: { k: string; odds: number; expected: number };
}

interface Act {
  kind: "exalt" | "annul";
  label: string;
  cost: number;
  k?: string;
  floor?: number;
  tag?: string | null;
  /** 素の消去がブリーチのゴミまで消しうるか */
  breachHit?: boolean;
}

function solvePhase(c: PhaseCtx): PhaseResult {
  const n = c.others.length;
  const ids = c.others.map((o) => o.modId);
  const full = (1 << n) - 1;
  const sideOmen = c.side === "prefix" ? "OmenofSinistralExaltation" : "OmenofDextralExaltation";
  const eraseOmen = c.side === "prefix" ? "OmenofSinistralErasure" : "OmenofDextralErasure";
  const tags = [...new Set(c.others.flatMap((o) => o.catalysts.filter((x) => x.enabled).map((x) => x.tag)))];
  const exalts: Act[] = [];
  for (const [k, floor] of EXALT) {
    for (const tag of [null, ...tags]) {
      const catCost = tag ? (c.others.flatMap((o) => o.catalysts).find((x) => x.tag === tag)?.perTry ?? Infinity) : 0;
      const ja = tag ? CATALYSTS.find((x) => x.tag === tag)?.ja ?? tag : "";
      exalts.push({ kind: "exalt", k, floor, tag, cost: c.cur(k) + c.cur(sideOmen) + catCost,
        label: `${LABEL[k]} + ${c.side === "prefix" ? "左" : "右"}側の高貴なお告げ${tag ? ` + 触媒の高貴のお告げ + ${ja}` : ""}` });
    }
  }
  // 品質 40% はプレにブリーチの MOD が居るので、素の消去はそれを消しうる (サフィ 3 つ + ブリーチ で 1/4)。
  // 消えたらブリーチのエッセンスを付け直す (オーナー 2026-09-23:「ブリーチエッセンスやすいから消えても
  // 付けなおせばいい…お告げのが高いか普通に。消去使うか」)。右側の消去のお告げ (1/3) も候補に残し、
  // 状態ごとに安い方を値反復が選ぶ
  const annuls: Act[] = [{ kind: "annul", label: "消去のオーブ", cost: c.cur("annul"), breachHit: c.breach }];
  if (c.breach) annuls.push({ kind: "annul", label: `消去のオーブ + ${c.side === "prefix" ? "左" : "右"}側の消去のお告げ`, cost: c.cur("annul") + c.cur(eraseOmen), breachHit: false });
  /** スパムの後にブリーチのエッセンスで最大品質を 40% にする 1 回ぶん (品質 40% の時だけ) */
  const breachOnce = c.breach ? c.cur("essence:breach") : 0;

  const occupied = (held: number): Set<string> => new Set([c.pick.modId, ...ids.filter((_, i) => held & (1 << i))]);
  const outcomes = (e: Act, held: number): number[] => {
    const occ = occupied(held);
    const W = c.pool(c.side).filter((id) => !occ.has(id)).reduce((s, id) => s + c.famW(id, e.floor!, e.tag), 0);
    return ids.map((id, i) => (held & (1 << i) ? 0 : c.hitW(id, e.floor!, e.tag) / W));
  };
  const bits = (x: number): number => { let s = 0; for (; x; x &= x - 1) s++; return s; };
  const key = (held: number, j: number): number => held * 8 + j;
  const states: Array<[number, number]> = [];
  for (let h = 0; h <= full; h++) for (let j = 0; 1 + bits(h) + j <= c.cap; j++) states.push([h, j]);
  // スパムの狙いが消えた時: 残り (h と外れ j) を素の消去で 1 つまで剥がし (ブリーチなら付け直し)、
  // スパムからやり直す。外せる MOD が 1 つの状態がスパムの出発点
  const resetCost = (h: number, j: number): number =>
    Math.max(0, bits(h) + j - 1) * c.cur("annul") + (c.breach ? c.cur("essence:breach") : 0) + c.sp.expected;

  let V = new Map<number, number>(states.map(([h, j]) => [key(h, j), 0]));
  const pol = new Map<number, Act>();
  for (let it = 0; it < 2000; it++) {
    const R = V.get(key(0, 0))!;
    const nv = new Map<number, number>();
    for (const [h, j] of states) {
      const k0 = key(h, j);
      if (h === full) { nv.set(k0, 0); continue; }
      let best = Infinity; let bp: Act | null = null;
      if (1 + bits(h) + j < c.cap) for (const e of exalts) {
        const ps = outcomes(e, h); const pj = 1 - ps.reduce((a, b) => a + b, 0);
        let v = e.cost + pj * V.get(key(h, j + 1))!;
        ps.forEach((p, i) => { if (p > 0) v += p * V.get(key(h | (1 << i), j))!; });
        if (v < best) { best = v; bp = e; }
      }
      if (j > 0) for (const e of annuls) {
        const m = 1 + bits(h) + j + (e.breachHit ? 1 : 0);
        let v = e.cost + (j / m) * V.get(key(h, j - 1))! + (resetCost(h, j) + R) / m;
        ids.forEach((_, i) => { if (h & (1 << i)) v += V.get(key(h & ~(1 << i), j))! / m; });
        if (e.breachHit) v += (c.cur("essence:breach") + V.get(k0)!) / m;
        if (v < best) { best = v; bp = e; }
      }
      nv.set(k0, best);
      if (bp) pol.set(k0, bp);
    }
    V = nv;
  }

  // ---- 回して分布を取る ----
  const runs = c.runs ?? 20000;
  const rnd = mulberry32(20260923);
  const geo = (p: number): number => Math.max(1, Math.ceil(Math.log(1 - rnd()) / Math.log(1 - p)));
  const costs: number[] = []; const exN: number[] = [];
  for (let r = 0; r < runs; r++) {
    let cost = c.cur(c.sp.k) * geo(c.sp.odds) + breachOnce; let ex = 0; let h = 0; let j = 0;
    for (let g = 0; g < 100000 && h !== full; g++) {
      const e = pol.get(key(h, j));
      if (!e) break;
      cost += e.cost;
      if (e.kind === "exalt") {
        ex++;
        const ps = outcomes(e, h); let u = rnd(); let hit = -1;
        for (let i = 0; i < ps.length; i++) { if (u < ps[i]!) { hit = i; break; } u -= ps[i]!; }
        if (hit >= 0) h |= 1 << hit; else j++;
      } else {
        const m = 1 + bits(h) + j + (e.breachHit ? 1 : 0);
        const u = Math.floor(rnd() * m);
        const heldIdx = ids.map((_, i) => i).filter((i) => h & (1 << i));
        if (u < j) j--;
        else if (u === j) { cost += resetCost(h, j) - c.sp.expected + c.cur(c.sp.k) * geo(c.sp.odds); h = 0; j = 0; }
        else if (u - j - 1 < heldIdx.length) h &= ~(1 << heldIdx[u - j - 1]!);
        else cost += c.cur("essence:breach");
      }
    }
    costs.push(cost); exN.push(ex);
  }
  costs.sort((a, b) => a - b); exN.sort((a, b) => a - b);
  const q = (arr: number[], f: number): number => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]!;

  const steps: PhaseStep[] = [];
  for (const [h, j] of states) {
    const e = pol.get(key(h, j));
    if (!e) continue;
    steps.push({ have: ids.filter((_, i) => h & (1 << i)), junk: j, action: e.label, perTry: e.cost });
  }
  return {
    expected: V.get(key(0, 0))! + c.sp.expected + breachOnce,
    p50: q(costs, 0.5), p80: q(costs, 0.8), p90: q(costs, 0.9),
    exalts50: q(exN, 0.5), exalts80: q(exN, 0.8),
    steps,
  };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
