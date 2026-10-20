/**
 * auto-solve.ts — ④ の「順番だけ自動」の計算の入口 (解析君、2026-10-20。設計 = 共有メモ auto-order-design.md の手 1)。
 *
 * 順番 1 つ (④ の simOrder のキー) について、⑤ を各場面で一番安い手で打った時の「始め 1 個から完成まで」の平均費用と完成の割合を
 * 動的計画法で出す。⑤・⑥ と同じ決まり: まだの関門より後ろの狙いは外れに見える、関門ごとの打ち止め (GATE_CAPS)。
 *   1. 見えている形 (⑤ の見え方) だけで最善手を決める (方策の繰り返し、評価は疎な連立方程式 auto-linear.ts)
 *   2. 本当の形 (関門より後ろの狙いも持ったまま) でその手を打って評価し直す (先に付いたおまけが入る)。堂々巡りの形は打ち止めまで打って止まる扱い
 *   3. mc を頼まれたら計算の中で 1 人ずつたどる (関門の累計の打ち止めつき。値だけの評価はこれを知らないので完成の割合を高く見る)
 * 形・手・重みは auto-model.ts・auto-actions.ts。
 *
 * この型はシミュ部長の auto-order.ts・ワーカーが使う。変える時は共有メモ auto-order-api.md に書いて知らせる。
 */
import type { QuizSimIn } from "../quiz-build";
import type { AutoModel } from "./auto-model";
import { actionsOf, Shape, type Act, type State } from "./auto-actions";
import { solveLinear, type LinRow } from "./auto-linear";

/** 計算の入力。sim は ⑤ に渡す物と同じ (order は見ない、順番は solveOrder に渡す)。値段は runQuiz と同じ (キー → 高貴建て) */
export interface AutoInput {
  sim: QuizSimIn;
  price: (key: string) => number;
}

/** buildAutoModel の結果。対応外 (範囲外の組み合わせ) は reason を画面にそのまま出す (日本語・英語 1 行) */
export type AutoBuilt = { ok: true; model: AutoModel } | { ok: false; reason: { ja: string; en: string } };

/** 順番 1 つの計算結果。費用はどれも高貴建て */
export interface OrderResult {
  /** 始め 1 個を買った後、完成か打ち止めまでの 1 人あたりの平均費用 (作り直しの始めの代金込み、最初の 1 個の代金 R は除く) */
  cost: number;
  /** 完成の割合 (0〜1)。止まる = 堂々巡りで二度と届かない形、mc ありなら関門の累計の打ち止めも */
  finish: number;
  /** 始め 1 個の代金 (= 作り直しの費用) */
  R: number;
  /** 並べ方の点数: 完成 1 個あたり = (R + cost) ÷ finish − R (finish = 0 なら Infinity)。安い順に並べる */
  perFinish: number;
  /** mc 人数 (0 = 値だけ) */
  mc: number;
  /** 計算にかかった時間 (ミリ秒) */
  ms: number;
}

export interface SolveOpts {
  /** 計算の中で 1 人ずつたどる人数 (関門の累計の打ち止めつき)。0 か省略 = 値だけ (速い) */
  mc?: number;
  /** mc の乱数の種 (mulberry32) */
  seed?: number;
}

export type { AutoModel } from "./auto-model";
/** 画面の側 (s.data がある所) で 1 回。エンジンを読むので、ワーカーでは使わない (ワーカーは solveOrder だけ) */
export { buildAutoModel } from "./auto-model";

// ── 行き先の表 (順番に関係ない本当の形の手と行き先。model ごとに 1 回作って順番の間で使い回す) ──
interface Edge { name: string; cost: number; oi: Int32Array; op: Float64Array }
interface Graph { sh: Shape; idx: Map<string, number>; st: State[]; acts: Array<Edge[] | null>; starts: Array<[number, number]> }
const graphs = new WeakMap<AutoModel, Graph>();
function graphOf(m: AutoModel): Graph {
  const g0 = graphs.get(m);
  if (g0) return g0;
  const sh = new Shape(m);
  const g: Graph = { sh, idx: new Map(), st: [], acts: [], starts: [] };
  g.starts = sh.starts().map(([p, s]) => [p, nodeOf(g, sh.canon(s))]);
  graphs.set(m, g);
  return g;
}
function nodeOf(g: Graph, s: State): number {
  const k = g.sh.key(s);
  let i = g.idx.get(k);
  if (i == null) { i = g.st.length; g.idx.set(k, i); g.st.push(s); g.acts.push(null); }
  return i;
}
function edgesOf(g: Graph, i: number): Edge[] {
  const e0 = g.acts[i];
  if (e0) return e0;
  const as: Act[] = g.sh.goal(g.st[i]!) ? [] : actionsOf(g.sh, g.st[i]!);
  const e = as.map((a) => ({ name: a.name, cost: a.cost, oi: Int32Array.from(a.out.map(([, t]) => nodeOf(g, t))), op: Float64Array.from(a.out.map(([p]) => p)) }));
  g.acts[i] = e;
  return e;
}

/** 順番のキー → 関門 (札の番号)。並びに無い札は後ろに 1 つずつ (quiz-recipe の gatesOf と同じ) */
function gatesOf(m: AutoModel, order: readonly string[]): number[] {
  const out: number[] = [];
  for (const k of order) for (const id of m.keyIds[k] ?? []) if (!out.includes(id)) out.push(id);
  m.slots.forEach((_, k) => { if (!out.includes(k)) out.push(k); });
  return out;
}

type Row = { c: number; oi: Int32Array; op: Float64Array };
/** 計算の中身 (確かめの台本用): 見えている形ごとの最善手と、本当の形の評価 */
export interface OrderDetail {
  result: OrderResult;
  /** 関門 (札の番号) */
  gates: number[];
  /** 見えている形ごと: 形・最善手の名前 (restart = 作り直し)・値・mc で通った回数 */
  view: Array<{ s: State; act: string; V: number; visits: number }>;
  /** 本当の形で、方策の手がその形で打てなかった数 (0 が正しい) */
  bad: number;
  /** 止まる (完成にも作り直しにも届かない) 本当の形の数 */
  stuck: number;
  /** 見えている形・本当の形の数と、方策の繰り返しの回数 + 本当の形の評価 (2)、表 (model.eng) に無かった形を引いた数 (今までの累計、0 が正しい) */
  size: { view: number; true: number; sweeps: number; miss: number };
}

/**
 * 順番 1 つの費用 (ワーカーの中で何回も。model だけで閉じる、エンジンのデータは読まない)。order = ④ の simOrder のキー ("mod:<id>"・"rest:frac"・"rest:<id>"・"rune:<名前>")。
 * 並べない行 (ルーン・増強スパム・フラクチャー済み) は入っていても無視する。model に無いキーも無視
 */
export function solveOrder(model: AutoModel, order: readonly string[], opts: SolveOpts = {}): OrderResult {
  return orderDetail(model, order, opts).result;
}

export function orderDetail(model: AutoModel, order: readonly string[], opts: SolveOpts = {}): OrderDetail {
  const t0 = Date.now();
  const g = graphOf(model), sh = g.sh;
  const gates = gatesOf(model, order);
  const Rr = model.R + model.runeCost;
  // 本当の形 → 見えている形 (⑤ の見え方)
  const viewMap = new Map<number, number>();
  const viewOf = (j: number): number => { let v = viewMap.get(j); if (v == null) { v = nodeOf(g, sh.view(g.st[j]!, gates)); viewMap.set(j, v); viewMap.set(v, v); } return v; };

  // 1. 見えている形だけで最善手 (見えている形から打った行き先を、また見えている形に)
  const vList: number[] = [], vPos = new Map<number, number>();
  const addV = (v: number) => { if (!vPos.has(v)) { vPos.set(v, vList.length); vList.push(v); } };
  for (const [, j] of g.starts) addV(viewOf(j));
  const vRows: Array<Array<Row & { name: string }>> = [];
  for (let q = 0; q < vList.length; q++) {
    vRows.push(edgesOf(g, vList[q]!).map((e) => {
      const m = new Map<number, number>();
      e.oi.forEach((j, t) => { const v = viewOf(j); addV(v); m.set(v, (m.get(v) ?? 0) + e.op[t]!); });
      return { c: e.cost, name: e.name, oi: Int32Array.from([...m.keys()].map((v) => vPos.get(v)!)), op: Float64Array.from(m.values()) };
    }));
  }
  const nv = vList.length;
  const vGoal = (q: number) => sh.goal(g.st[vList[q]!]!);
  const vStart = g.starts.map(([p, j]) => [p, vPos.get(viewOf(j))!] as const);
  const startQ = new Set(vStart.map(([, q]) => q));
  // 方策の繰り返し: 始めは全部「諦める」(費用 GIVE で終わり) = どの形からも終わる方策。良くなる手に替えて、変わらなくなるまで
  const GIVE = 1e12;
  const pol = new Int32Array(nv).fill(-2); // -2 諦める、-1 作り直し、0.. = 手
  const V = new Float64Array(nv);
  let sweeps = 0;
  // 前の方策と値 (解けない方策が来たらここに戻して止める)
  const polPrev = new Int32Array(nv), VPrev = new Float64Array(nv);
  for (let it = 0; it < 200; it++) {
    const rows: LinRow[] = [];
    for (let q = 0; q < nv; q++) {
      const a = pol[q]!;
      if (vGoal(q)) rows.push({ oi: [], op: [], b: 0 });
      else if (a === -2) rows.push({ oi: [], op: [], b: GIVE });
      else if (a === -1) rows.push({ oi: vStart.map(([, x]) => x), op: vStart.map(([p]) => p), b: Rr });
      else { const r = vRows[q]![a]!; rows.push({ oi: r.oi, op: r.op, b: r.c }); }
    }
    // ほとんど抜けられない輪の方策は解けない事がある (値が 1e20 超え・特異)。そのごみの値で次の方策を選ぶと
    // 本当に抜けられない輪になって NaN が広がる (手袋の 120 通りで 2 つ) → 1 つ前の方策 (解けている) に戻して止める
    if (!solveLinear(rows, V) && it > 0) { pol.set(polPrev); V.set(VPrev); break; }
    polPrev.set(pol); VPrev.set(V);
    sweeps++;
    const rs = Rr + vStart.reduce((a, [p, q]) => a + p * V[q]!, 0);
    let ch = 0;
    for (let q = 0; q < nv; q++) {
      if (vGoal(q)) continue;
      let best = V[q]! - 1e-9 * (1 + Math.abs(V[q]!)), bi = pol[q]!;
      if (!startQ.has(q) && rs < best) { best = rs; bi = -1; }
      const rr = vRows[q]!;
      for (let a = 0; a < rr.length; a++) {
        const r = rr[a]!;
        let v = r.c;
        for (let t = 0; t < r.oi.length; t++) v += r.op[t]! * V[r.oi[t]!]!;
        if (v < best) { best = v; bi = a; }
      }
      if (bi !== pol[q]) { pol[q] = bi; ch++; }
    }
    if (!ch) break;
  }
  const polName = (v: number): string | null => { const a = pol[vPos.get(v)!]!; return a < 0 ? null : vRows[vPos.get(v)!]![a]!.name; };

  // 2. 本当の形で、見えている形の手を打って評価し直す
  const tList: number[] = [], tPos = new Map<number, number>();
  const addT = (j: number) => { if (!tPos.has(j)) { tPos.set(j, tList.length); tList.push(j); } };
  for (const [, j] of g.starts) addT(j);
  const tEdge: Array<Edge | "restart" | "bad" | "goal"> = [];
  let bad = 0;
  for (let q = 0; q < tList.length; q++) {
    const j = tList[q]!;
    if (sh.goal(g.st[j]!)) { tEdge.push("goal"); continue; }
    const n = polName(viewOf(j));
    if (n == null) { tEdge.push("restart"); continue; }
    const e = edgesOf(g, j).find((x) => x.name === n);
    if (!e) { bad++; tEdge.push("bad"); continue; }
    e.oi.forEach((x) => addT(x));
    tEdge.push(e);
  }
  const nt = tList.length;
  const tRows: Array<Row | "restart" | "bad" | "goal"> = tEdge.map((e) => (typeof e === "string" ? e : { c: e.cost, oi: Int32Array.from(e.oi, (x) => tPos.get(x)!), op: e.op }));
  // 完成にも作り直しにも届かない形 (見え方が同じで堂々巡り) は、⑤ の関門の打ち止めまで打って止まる扱い
  const back: number[][] = tList.map(() => []);
  tRows.forEach((r, q) => { if (typeof r !== "string") r.oi.forEach((x, t) => { if (r.op[t]! > 0) back[x]!.push(q); }); });
  const ok = new Uint8Array(nt), stack: number[] = [];
  tRows.forEach((r, q) => { if (r === "goal" || r === "restart") { ok[q] = 1; stack.push(q); } });
  while (stack.length) { const q = stack.pop()!; for (const p of back[q]!) if (!ok[p]) { ok[p] = 1; stack.push(p); } }
  const gateAt = (q: number): number | null => { const s = g.st[tList[q]!]!; return gates.find((x) => !sh.hit(x, s[1 + x]!)) ?? null; };
  let stuck = 0;
  const tStart = g.starts.map(([p, j]) => [p, tPos.get(j)!] as const);
  const costRows: LinRow[] = [], doneRows: LinRow[] = [];
  for (let q = 0; q < nt; q++) {
    const r = tRows[q]!;
    if (r === "goal") { costRows.push({ oi: [], op: [], b: 0 }); doneRows.push({ oi: [], op: [], b: 1 }); continue; }
    if (r === "bad") { costRows.push({ oi: [], op: [], b: 1e7 }); doneRows.push({ oi: [], op: [], b: 0 }); continue; }
    if (r === "restart") { const oi = tStart.map(([, x]) => x), op = tStart.map(([p]) => p); costRows.push({ oi, op, b: Rr }); doneRows.push({ oi, op, b: 0 }); continue; }
    if (!ok[q]) { stuck++; const k = gateAt(q); costRows.push({ oi: [], op: [], b: k == null ? 0 : model.slots[k]!.cap * r.c }); doneRows.push({ oi: [], op: [], b: 0 }); continue; }
    costRows.push({ oi: r.oi, op: r.op, b: r.c }); doneRows.push({ oi: r.oi, op: r.op, b: 0 });
  }
  const TV = Float64Array.from(tList, (j) => V[vPos.get(viewOf(j)) ?? 0] ?? 0), PD = new Float64Array(nt).fill(0.5);
  const okT = solveLinear(costRows, TV), okD = solveLinear(doneRows, PD);
  const sweepsT = 2;
  // 解けない (抜けられない輪) 時は、費用は Infinity・完成は 0 扱い。完成の割合の小さな負 (−6e-12 など) は 0 に
  let cost = okT ? model.runeCost + tStart.reduce((a, [p, q]) => a + p * TV[q]!, 0) : Infinity;
  let finish = okD ? Math.min(1, Math.max(0, tStart.reduce((a, [p, q]) => a + p * PD[q]!, 0))) : 0;

  // 3. 1 人ずつ (⑤ と同じ関門の累計の打ち止め、乱数は mulberry32)
  const visits = new Map<number, number>();
  const nmc = Math.max(0, Math.floor(opts.mc ?? 0));
  if (nmc > 0) {
    let r = (opts.seed ?? 7) >>> 0;
    const rand = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pickStart = (): number => { let x = rand(); for (const [p, q] of tStart) { x -= p; if (x <= 0) return q; } return tStart[tStart.length - 1]![1]; };
    let tot = 0, nDone = 0;
    for (let n = 0; n < nmc; n++) {
      let q = pickStart(), c = model.runeCost;
      const used = new Map<number, number>();
      for (let step = 0; step < 500000; step++) {
        const row = tRows[q]!;
        if (row === "goal") { nDone++; break; }
        if (row === "bad") break;
        const k = gateAt(q);
        if (k != null && (used.get(k) ?? 0) >= model.slots[k]!.cap) break;
        if (row === "restart") { c += Rr; q = pickStart(); continue; }
        const v = viewOf(tList[q]!); visits.set(v, (visits.get(v) ?? 0) + 1);
        c += row.c;
        if (k != null) used.set(k, (used.get(k) ?? 0) + 1);
        let x = rand(), nx = row.oi[row.oi.length - 1]!;
        for (let t = 0; t < row.oi.length; t++) { x -= row.op[t]!; if (x <= 0) { nx = row.oi[t]!; break; } }
        q = nx;
      }
      tot += c;
    }
    cost = tot / nmc; finish = nDone / nmc;
  }
  const pf = finish > 0 ? (model.R + cost) / finish - model.R : Infinity;
  const perFinish = Number.isFinite(pf) ? pf : Infinity;
  const result: OrderResult = { cost, finish, R: model.R, perFinish, mc: nmc, ms: Date.now() - t0 };
  const view = vList.map((v, q) => ({ s: g.st[v]!, act: polName(v) ?? "restart", V: V[q]!, visits: visits.get(v) ?? 0 }));
  return { result, gates, view, bad, stuck, size: { view: nv, true: nt, sweeps: sweeps + sweepsT, miss: sh.miss } };
}
