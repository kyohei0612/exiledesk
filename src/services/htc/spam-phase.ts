/**
 * spam-phase.ts — スパムの後、同じ側の残りを高貴で足す段階 ([[spam-plan.ts]] から分けた。1 ファイル 500 行まで)
 *
 * 状態 (付いた狙い h / 外れ j / ブリーチの MOD が居るか bq) ごとに一番安い手を解き (価値反復)、回して分布を取る。
 */
import { CATALYSTS } from "./quality";
import { mulberry32, type MissPlan, type PathStep } from "./spam-total";
import type { Side, SpamPlanInput, TargetMethod } from "./spam-plan";

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
  /** 外れ無しで進んだ時の 1 手ずつ (画面の「1 手ずつ」) */
  path: PathStep[];
  /** スパムの後に 1 回、ブリーチのエッセンスで品質の上限を 40% にする費用 (品質 40% の時だけ、他は 0) */
  breachOnce: number;
  /** 回した 1 回ずつの費用 (並べ替え済み)。仕上げと足して合計の分布を作る */
  samples: number[];
  /**
   * スパムの狙い + ここに並ぶ狙いが**もう付いた状態**から、同じ側が揃うまでの平均 (外れ無し)。
   * 途中品を買って始める時の残り ([[partial-buy.ts]])。品質 40% はブリーチのエッセンス 1 回を含む
   */
  fromHeld: Array<{ held: string[]; expected: number }>;
}

export const EXALT: ReadonlyArray<[string, number]> = [["exalt", 0], ["exalt_greater", 35], ["exalt_perfect", 50]];
export const LABEL: Record<string, string> = {
  chaos: "カオスオーブ", chaos_greater: "カオスオーブ (上級)", chaos_perfect: "カオスオーブ (完全)",
  exalt: "高貴なオーブ", exalt_greater: "高貴なオーブ (上級)", exalt_perfect: "高貴なオーブ (完全)",
};

// ================= 同じ側の残りを足す段階 =================

/** 外れを消さずに残して次の高貴を打つ (枠が空いている時の選択肢) */
export const KEEP = "外れは残して次を打つ";

export interface PhaseCtx extends SpamPlanInput {
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
  kind: "exalt" | "annul" | "reset";
  label: string;
  cost: number;
  k?: string;
  floor?: number;
  tag?: string | null;
  /** 素の消去がブリーチのゴミまで消しうるか */
  breachHit?: boolean;
}

export function solvePhase(c: PhaseCtx): PhaseResult {
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
  // 外れたら全部剥がしてスパムからやり直す (オーナー 2026-09-23:「消去でリセットしまくる、最悪カオススパムから戻る」)
  const reset: Act = { kind: "reset", label: "全部剥がしてスパムからやり直し", cost: 0 };
  const recoveries: Act[] = [...annuls, reset];
  /**
   * 利用者が選んだ手 ([[craft-steps.ts]] の選択肢)。キーは付いた狙いの modId とブリーチの有無なので、
   * 狙いの並びが変わっても同じ状態に当たる
   */
  const force = c.force ?? {};
  const sKey = (kind: "e" | "r", h: number, bq: number): string =>
    `${c.side}:${kind}:${ids.filter((_, i) => h & (1 << i)).join(",")}:${bq}`;
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
  // 手と付いた狙いだけで決まるので覚えておく (反復のたびに重みを足し直すと、狙い 4〜5 つで数十秒かかった)
  const memo = new Map<Act, Map<number, number[]>>();
  const outcomes = (e: Act, held: number): number[] => {
    let byH = memo.get(e); if (!byH) memo.set(e, byH = new Map());
    const hit = byH.get(held); if (hit) return hit;
    const occ = occupied(held);
    const W = c.pool(c.side).filter((id) => !occ.has(id)).reduce((s, id) => s + c.famW(id, e.floor!, e.tag), 0);
    const ps = ids.map((id, i) => (held & (1 << i) ? 0 : c.hitW(id, e.floor!, e.tag) / W));
    byH.set(held, ps);
    return ps;
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

  const V = new Map<number, number>(states.map(([h, j, bq]) => [key(h, j, bq), 0]));
  const pol = new Map<number, Act>();
  const exaltValue = (e: Act, h: number, j: number, bq: number): number => {
    const nb = needsBreach(e, bq) ? 1 : bq;
    const ps = outcomes(e, h); const pj = 1 - ps.reduce((x, y) => x + y, 0);
    let v = e.cost + (nb !== bq ? essence : 0) + pj * V.get(key(h, j + 1, nb))!;
    ps.forEach((p, i) => { if (p > 0) v += p * V.get(key(h | (1 << i), j, nb))!; });
    return v;
  };
  const annulValue = (e: Act, h: number, j: number, bq: number, V: Map<number, number>, R: number): number => {
    if (e.kind === "reset") return resetCost(h, j) + R;
    const hitsB = e.breachHit && bq === 1 ? 1 : 0;
    const m = 1 + bits(h) + j + hitsB;
    let v = e.cost + (j / m) * V.get(key(h, j - 1, bq))! + (resetCost(h, j) + R) / m;
    ids.forEach((_, i) => { if (h & (1 << i)) v += V.get(key(h & ~(1 << i), j, bq))! / m; });
    if (hitsB) v += V.get(key(h, j, 0))! / m;   // ブリーチの MOD が消える。付け直しは後で
    return v;
  };
  for (let it = 0; it < 2000; it++) {
    const R = V.get(key(0, 0, START_B))!;
    // その場で書き換える (Gauss-Seidel)。外れ → 消去 → 高貴の輪が長いと、1 反復ずつ写すやり方は 2000 回でも収束しなかった
    let diff = 0;
    for (const [h, j, bq] of states) {
      const k0 = key(h, j, bq);
      if (h === full) { V.set(k0, 0); continue; }
      let best = Infinity; let bp: Act | null = null;
      const fe = force[sKey("e", h, bq)], fr = j > 0 ? force[sKey("r", h, bq)] : undefined;
      const canExalt = 1 + bits(h) + j < c.cap;
      if (canExalt && (!fr || fr === KEEP)) for (const e of exalts) {
        if (fe && e.label !== fe) continue;
        const v = exaltValue(e, h, j, bq);
        if (v < best) { best = v; bp = e; }
      }
      if (j > 0 && (fr !== KEEP || !canExalt)) for (const e of recoveries) {
        if (fr && fr !== KEEP && e.label !== fr) continue;
        const v = annulValue(e, h, j, bq, V, R);
        if (v < best) { best = v; bp = e; }
      }
      const old = V.get(k0)!;
      if (Number.isFinite(best) && Number.isFinite(old)) diff = Math.max(diff, Math.abs(best - old));
      else if (Number.isFinite(best) !== Number.isFinite(old)) diff = Infinity;
      V.set(k0, best);
      if (bp) pol.set(k0, bp);
    }
    if (it > 0 && diff < 1e-6) break;   // 収束したら止める (高貴換算で 100 万分の 1)
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
      if (e.kind === "reset") { cost += resetCost(h, j) - c.sp.expected + c.cur(c.sp.k) * geo(c.sp.odds); h = 0; j = 0; bq = START_B; continue; }
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
  /** 外れが 1 つ付いた状態 (h, 外れ 1, bq) で次に打つ手と、消去なら何に当たるか */
  const missAt = (h: number, bq: number, p: number): MissPlan | null => {
    const e = pol.get(key(h, 1, bq));
    if (!e || !(p > 0)) return null;
    const base = V.get(key(h, 0, bq))!;
    const loss = V.get(key(h, 1, bq))! - base;
    // 選べるリカバリー: 消去 (お告げあり / なし)・全部剥がしてやり直し・外れを残して次を打つ (枠があれば)
    const R0 = V.get(key(0, 0, START_B))!;
    const rk = sKey("r", h, bq);
    const options: MissPlan["options"] = recoveries.map((a) => ({
      label: a.label, loss: annulValue(a, h, 1, bq, V, R0) - base, chosen: a === e, forceKey: rk, forced: force[rk] === a.label }));
    if (1 + bits(h) + 1 < c.cap) {
      const keep = Math.min(...exalts.map((x) => exaltValue(x, h, 1, bq)));
      options.push({ label: KEEP, loss: keep - base, chosen: e.kind === "exalt", forceKey: rk, forced: force[rk] === KEEP });
    }
    options.sort((a, b) => a.loss - b.loss);
    if (e.kind === "exalt") return { p, action: `外れは残して ${e.label} (枠が空いている)`, outcomes: [], loss, options, cost: 0 };
    if (e.kind === "reset") return { p, action: e.label, outcomes: [], loss, options, cost: resetCost(h, 1) };
    const hitsB = e.breachHit && bq === 1 ? 1 : 0;
    const m = 1 + bits(h) + 1 + hitsB;
    const outcomes: MissPlan["outcomes"] = [{ kind: "junk", p: 1 / m }, { kind: "spam", modId: c.pick.modId, p: 1 / m }];
    ids.forEach((id, i) => { if (h & (1 << i)) outcomes.push({ kind: "target", modId: id, p: 1 / m }); });
    if (hitsB) outcomes.push({ kind: "breach", p: 1 / m });
    return { p, action: e.label, outcomes, loss, options, cost: e.cost };
  };
  // 外れ無しの道: 付いていない狙いを、その状態で選ぶ手で引き、一番付きやすい物から付いたとする
  const path: PathStep[] = [];
  for (let h = 0, bq = START_B; h !== full;) {
    const e = pol.get(key(h, 0, bq));
    if (!e || e.kind !== "exalt") break;
    const re = needsBreach(e, bq);
    const ps = outcomes(e, h);
    const best = ps.indexOf(Math.max(...ps));
    const h2 = h | (1 << best), bq2 = re ? 1 : bq;
    const odds = ps.reduce((x, y) => x + y, 0);
    // 選べる打ち方: 高貴の段階 × カタリスト。差は「今の手より何高貴高いか」(その後も一番安く進めた時)
    const q0 = exaltValue(e, h, 0, bq), ek = sKey("e", h, bq);
    const options = exalts.map((x) => ({
      label: x.label, odds: outcomes(x, h).reduce((a, b) => a + b, 0), delta: exaltValue(x, h, 0, bq) - q0,
      chosen: x === e, forceKey: ek, forced: force[ek] === x.label })).sort((a, b) => a.delta - b.delta);
    path.push({ want: ids.filter((_, i) => !(h & (1 << i))), odds, perTry: e.cost + (re ? essence : 0),
      action: (re ? "ブリーチのエッセンスを付け直して " : "") + e.label,
      spend: V.get(key(h, 0, bq))! - V.get(key(h2, 0, bq2))!, miss: missAt(h, bq2, 1 - odds), options });
    h = h2; bq = bq2;
  }
  return {
    path, breachOnce,
    expected: V.get(key(0, 0, START_B))! + c.sp.expected + breachOnce,
    p50: q(costs, 0.5), p80: q(costs, 0.8), p90: q(costs, 0.9),
    exalts50: q(exN, 0.5), exalts80: q(exN, 0.8),
    steps,
    samples: costs,
    fromHeld: Array.from({ length: full + 1 }, (_, h) => ({
      held: ids.filter((_, i) => h & (1 << i)),
      expected: V.get(key(h, 0, START_B))! + breachOnce,
    })),
  };
}
