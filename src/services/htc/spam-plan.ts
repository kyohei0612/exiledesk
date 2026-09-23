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
 * 使い切るので毎回カタリスト 27 個で戻す (品質 40% のお告げは 20% の約 2 倍効くので途中で品質を足す)。
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
import { prefixFinish, type FinishPlan } from "./prefix-finish";

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
  /** カレンシーランキングに無い (使えない) */
  unpriced: boolean;
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
  /** 品質 40% でブリーチの MOD が消えている (付け直しは次の触媒の高貴のお告げの直前) */
  breachGone: boolean;
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
  /** 回した 1 回ずつの費用 (並べ替え済み)。仕上げと足して合計の分布を作る */
  samples: number[];
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
  /** サフィが揃った後のプレの仕上げ ([[prefix-finish.ts]])。スパムがサフィの時だけ */
  finish: FinishPlan | null;
  /** サフィ段階 + 仕上げの合計 (高貴換算)。仕上げが組めない時は null */
  total: { expected: number; p50: number; p80: number; p90: number } | null;
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
  /** 完成品の品質の種類 (貼り付けの「品質 (マナモッド)」→ mana)。仕上げで最後の品質を上げる */
  qualityTag?: string | null;
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
      // カレンシーランキングに無い物は使えない (オーナー 2026-09-23)。お告げも同じ
      const unpriced = !Number.isFinite(unit) || !Number.isFinite(cur("OmenofCatalysingExaltation"));
      const def = unit / divine < PRICEY_CATALYST_DIVINE;
      return {
        tag: c.tag, ja: CATALYSTS.find((x) => x.tag === c.tag)?.ja ?? c.tag, unit,
        perTry: cur("OmenofCatalysingExaltation") + nCat * unit,
        enabled: !unpriced && (inp.catalystChoice?.[c.tag] ?? def),
        unpriced,
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
  if (!cand.length) return { methods, spam: null, side: null, expensive: false, phase: null, finish: null, total: null, alternatives: [], reason: "カオスで付けられる狙いがありません" };

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
  // ---- サフィが揃った後のプレの仕上げ (スパムがサフィの時だけ) ----
  let finish: FinishPlan | null = null;
  let total: SpamPlan["total"] = null;
  if (main.side === "suffix" && main.phase) {
    finish = prefixFinish({
      data, cls, prices, itemLevel,
      targets: inp.targets.filter((t) => mod(t.modId)?.type === "prefix"),
      quality, qualityTag: inp.qualityTag ?? null, breach, prefixCap: 3 - inp.used.prefix,
      ...(inp.catalystChoice ? { catalystChoice: inp.catalystChoice } : {}),
    });
    if (!finish.reason) {
      const rnd = mulberry32(7);
      const sum = main.phase.samples.map((x) => x + finish!.sample(rnd)).sort((a, b) => a - b);
      const q = (f: number): number => sum[Math.min(sum.length - 1, Math.floor(sum.length * f))]!;
      total = { expected: main.phase.expected + finish.expected, p50: q(0.5), p80: q(0.8), p90: q(0.9) };
    }
  }
  return { methods, spam: main.spam, side: main.side, expensive: main.expensive, phase: main.phase, finish, total, alternatives, reason: main.reason };
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
  // **消えてもすぐには付け直さない** (オーナー 2026-09-23:「品質 20% 消えたら即付けなおしではなく、
  // はずれ MOD だけ消えるが正解」)。無い間は消去の候補がサフィだけになり外れを引きやすい。付け直すのは
  // **次に触媒の高貴のお告げを打つ直前** (お告げは品質を使い切るので、40% に戻すには上限 40% が要る)。
  // エッセンスは安いので右側の消去のお告げより付け直しの方が安い (オーナー)。お告げも候補には残す
  const annuls: Act[] = [{ kind: "annul", label: "消去のオーブ", cost: c.cur("annul"), breachHit: c.breach }];
  if (c.breach) annuls.push({ kind: "annul", label: `消去のオーブ + ${c.side === "prefix" ? "左" : "右"}側の消去のお告げ`, cost: c.cur("annul") + c.cur(eraseOmen), breachHit: false });
  // ブリーチのエッセンスはレアに当てると既存の MOD を 1 つ食う (CoE も結晶化のお告げ付きで扱う)。
  // プレは固定済みしか無いので、**安い高貴でプレにゴミを 1 つ付けてから、左側の結晶化のお告げ付きで
  // 当てる** とゴミだけ食わせられる (オーナー 2026-09-23:「プレフィックスにゴミ高貴打てば解決」)。
  // 1 回ぶん = エッセンス + 高貴 + 左側の高貴なお告げ + 左側の結晶化のお告げ
  const essence = c.cur("essence:breach") + c.cur("exalt") + c.cur("OmenofSinistralExaltation") + c.cur("OmenofSinistralCrystallisation");
  /** スパムの後にブリーチのエッセンスで最大品質を 40% にする 1 回ぶん (品質 40% の時だけ。ゴミ高貴込み) */
  const breachOnce = c.breach ? essence : 0;
  /** その手の前にブリーチのエッセンスを付け直すか (品質 40%、ブリーチが無い、カタリストを使う高貴) */
  const needsBreach = (e: Act, bq: number): boolean => c.breach && bq === 0 && e.kind === "exalt" && !!e.tag;

  const occupied = (held: number): Set<string> => new Set([c.pick.modId, ...ids.filter((_, i) => held & (1 << i))]);
  const outcomes = (e: Act, held: number): number[] => {
    const occ = occupied(held);
    const W = c.pool(c.side).filter((id) => !occ.has(id)).reduce((s, id) => s + c.famW(id, e.floor!, e.tag), 0);
    return ids.map((id, i) => (held & (1 << i) ? 0 : c.hitW(id, e.floor!, e.tag) / W));
  };
  const bits = (x: number): number => { let s = 0; for (; x; x &= x - 1) s++; return s; };
  /** 状態: 付いた狙い h / 外れ j / ブリーチの MOD が居るか bq */
  const key = (held: number, j: number, bq: number): number => (held * 8 + j) * 2 + bq;
  const START_B = c.breach ? 1 : 0;
  const states: Array<[number, number, number]> = [];
  for (let h = 0; h <= full; h++) for (let j = 0; 1 + bits(h) + j <= c.cap; j++) for (const bq of c.breach ? [0, 1] : [0]) states.push([h, j, bq]);
  // スパムの狙いが消えた時: 残り (h と外れ j) を素の消去で 1 つまで剥がし (ブリーチなら付け直し)、
  // スパムからやり直す。外せる MOD が 1 つの状態がスパムの出発点
  const resetCost = (h: number, j: number): number =>
    Math.max(0, bits(h) + j - 1) * c.cur("annul") + breachOnce + c.sp.expected;

  let V = new Map<number, number>(states.map(([h, j, bq]) => [key(h, j, bq), 0]));
  const pol = new Map<number, Act>();
  const annulValue = (e: Act, h: number, j: number, bq: number, V: Map<number, number>, R: number): number => {
    const hitsB = e.breachHit && bq === 1 ? 1 : 0;
    const m = 1 + bits(h) + j + hitsB;
    let v = e.cost + (j / m) * V.get(key(h, j - 1, bq))! + (resetCost(h, j) + R) / m;
    ids.forEach((_, i) => { if (h & (1 << i)) v += V.get(key(h & ~(1 << i), j, bq))! / m; });
    if (hitsB) v += V.get(key(h, j, 0))! / m;   // ブリーチの MOD が消える。付け直しは後で
    return v;
  };
  for (let it = 0; it < 2000; it++) {
    const R = V.get(key(0, 0, START_B))!;
    const nv = new Map<number, number>();
    for (const [h, j, bq] of states) {
      const k0 = key(h, j, bq);
      if (h === full) { nv.set(k0, 0); continue; }
      let best = Infinity; let bp: Act | null = null;
      if (1 + bits(h) + j < c.cap) for (const e of exalts) {
        const nb = needsBreach(e, bq) ? 1 : bq;
        const ps = outcomes(e, h); const pj = 1 - ps.reduce((x, y) => x + y, 0);
        let v = e.cost + (nb !== bq ? essence : 0) + pj * V.get(key(h, j + 1, nb))!;
        ps.forEach((p, i) => { if (p > 0) v += p * V.get(key(h | (1 << i), j, nb))!; });
        if (v < best) { best = v; bp = e; }
      }
      if (j > 0) for (const e of annuls) {
        const v = annulValue(e, h, j, bq, V, R);
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
    let cost = c.cur(c.sp.k) * geo(c.sp.odds) + breachOnce; let ex = 0; let h = 0; let j = 0; let bq = START_B;
    for (let g = 0; g < 100000 && h !== full; g++) {
      const e = pol.get(key(h, j, bq));
      if (!e) break;
      cost += e.cost;
      if (e.kind === "exalt") {
        ex++;
        if (needsBreach(e, bq)) { cost += essence; bq = 1; }
        const ps = outcomes(e, h); let u = rnd(); let hit = -1;
        for (let i = 0; i < ps.length; i++) { if (u < ps[i]!) { hit = i; break; } u -= ps[i]!; }
        if (hit >= 0) h |= 1 << hit; else j++;
      } else {
        const hitsB = e.breachHit && bq === 1 ? 1 : 0;
        const m = 1 + bits(h) + j + hitsB;
        const u = Math.floor(rnd() * m);
        const heldIdx = ids.map((_, i) => i).filter((i) => h & (1 << i));
        if (u < j) j--;
        else if (u === j) { cost += resetCost(h, j) - c.sp.expected + c.cur(c.sp.k) * geo(c.sp.odds); h = 0; j = 0; bq = START_B; }
        else if (u - j - 1 < heldIdx.length) h &= ~(1 << heldIdx[u - j - 1]!);
        else bq = 0;
      }
    }
    costs.push(cost); exN.push(ex);
  }
  costs.sort((x, y) => x - y); exN.sort((x, y) => x - y);
  const q = (arr: number[], f: number): number => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))]!;

  const steps: PhaseStep[] = [];
  for (const [h, j, bq] of states) {
    const e = pol.get(key(h, j, bq));
    if (!e) continue;
    const re = needsBreach(e, bq);
    steps.push({ have: ids.filter((_, i) => h & (1 << i)), junk: j, breachGone: c.breach && bq === 0,
      action: (re ? "高貴 + 左側の高貴なお告げでプレにゴミ → ブリーチのエッセンス + 左側の結晶化のお告げ → " : "") + e.label, perTry: e.cost + (re ? essence : 0) });
  }
  return {
    expected: V.get(key(0, 0, START_B))! + c.sp.expected + breachOnce,
    p50: q(costs, 0.5), p80: q(costs, 0.8), p90: q(costs, 0.9),
    exalts50: q(exN, 0.5), exalts80: q(exN, 0.8),
    steps,
    samples: costs,
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
