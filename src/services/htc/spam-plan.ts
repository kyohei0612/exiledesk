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
 * **サフィを先に** (サフィに候補が無い時だけプレ)、その中で上の順位、同じ順位の中では
 * **カオスで一番付きにくい物** (後から高貴で足すと一番高くつく物を先に固める)。
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
import { LABEL, solvePhase, type PhaseResult } from "./spam-phase";
import { totalOf, type SpamTotal } from "./spam-total";
export type { SpamTotal } from "./spam-total";
export type { PhaseResult, PhaseStep } from "./spam-phase";

/** 既定で「使わない」にするカタリストの値段 (1 個・神)。軽快 0.35 / 歯擦音 0.97 / 強奪者 0.37 (2026-09-23) */
export const PRICEY_CATALYST_DIVINE = 0.2;

export type Side = "prefix" | "suffix";
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
  total: SpamTotal | null;
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
  /** ベースの枠 (固定済みを引く前)。無ければ 3 / 3。黄昏の指輪はプレ 4 / サフィ 2 (ninja の指輪 2026-09-23) */
  baseLimits?: { prefix: number; suffix: number };
  /** 利用者が切り替えたカタリスト (tag → 使うか)。無ければ既定 */
  catalystChoice?: Readonly<Record<string, boolean>>;
  /** 完成品の品質の種類 (貼り付けの「品質 (マナモッド)」→ mana)。仕上げで最後の品質を上げる */
  qualityTag?: string | null;
  /** 回す回数 (既定 20,000) */
  runs?: number;
  /** 利用者が選んだ打ち方・リカバリー (状態のキー → 手の名前)。無ければ期待値で一番安い手 */
  force?: Readonly<Record<string, string>>;
  /** 利用者が選び直したスパムの狙い (modId)。無ければ優先順のルール */
  spamOverride?: string;
}

const CHAOS: ReadonlyArray<[string, number]> = [["chaos", 0], ["chaos_greater", 35], ["chaos_perfect", 50]];
export function spamPlan(inp: SpamPlanInput): SpamPlan {
  const { data, cls, prices, itemLevel, quality, breach } = inp;
  const free = (side: "prefix" | "suffix"): number => (inp.baseLimits?.[side] ?? 3) - inp.used[side];
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
  // **サフィを先に** (側が第 1): 品質 40% は「サフィをスパムで」が原則、品質 20% でもプレのスパムは
  // 削減リロールの高額コース (オーナー 2026-09-23)。サフィに候補が無い時だけプレ。
  // 以前は「カタリストの有無」が先で、レアリティ (プレ版) のように効くカタリストが無いプレが
  // サフィより先に選ばれ、高額コースに落ちていた (poe.ninja の指輪 10 個で 2 件)。その中で一番付きにくい物
  const sideRank = (x: TargetMethod): number => (x.side === "suffix" ? 0 : 1);
  const cand = methods.filter((x) => x.group !== "later")
    .sort((a, b) => sideRank(a) - sideRank(b) || rank[a.group] - rank[b.group] || a.chaosOdds - b.chaosOdds);
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
    const cap = free(side);
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
  // **サフィに狙いが無い** (ミニオンの樹 MOD を買う指輪で、残りが最大マナ・命中などプレだけ) なら
  // スパムは要らない。プレの仕上げ ([[prefix-finish.ts]]: 左側の高貴 + 冒涜) だけで組む。
  // poe.ninja の上位の指輪 (2026-09-23) で、この形が「スパムがプレ = 高額コース」に落ちていた (292 個中 24 件)
  if (!inp.spamOverride && !cand.some((x) => x.side === "suffix")) {
    const finish = prefixFinish({
      data, cls, prices, itemLevel,
      targets: inp.targets.filter((t) => mod(t.modId)?.type === "prefix"),
      quality, qualityTag: inp.qualityTag ?? null, breach, prefixCap: free("prefix"),
      ...(inp.catalystChoice ? { catalystChoice: inp.catalystChoice } : {}),
      ...(inp.force ? { force: inp.force } : {}),
    });
    for (const m of methods) if (m.side === "prefix" && m.group !== "later") m.role = "later";
    const total = finish.reason ? null : totalOf(finish, finish.expected, new Array<number>(4000).fill(0));
    return { methods, spam: null, side: "prefix", expensive: false, phase: null, finish, total, alternatives: [], reason: null };
  }
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
  let total: SpamTotal | null = null;
  if (main.side === "suffix" && main.phase) {
    finish = prefixFinish({
      data, cls, prices, itemLevel,
      targets: inp.targets.filter((t) => mod(t.modId)?.type === "prefix"),
      quality, qualityTag: inp.qualityTag ?? null, breach, prefixCap: free("prefix"),
      ...(inp.catalystChoice ? { catalystChoice: inp.catalystChoice } : {}),
      ...(inp.force ? { force: inp.force } : {}),
    });
    if (!finish.reason) total = totalOf(finish, main.phase.expected + finish.expected, main.phase.samples);
  }
  return { methods, spam: main.spam, side: main.side, expensive: main.expensive, phase: main.phase, finish, total, alternatives, reason: main.reason };
}
