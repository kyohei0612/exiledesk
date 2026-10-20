/**
 * auto-order.ts — ④ の「順番だけ自動」の候補を作る・絞る・ワーカーで計算する (シミュ部長、2026-10-20)。
 * 設計は共有メモ auto-order-design.md (オーナー 10-20 に決め事 3 つをおすすめどおりで OK):
 *   - 出す数字は各場面で一番安い手を打った時の目安 (⑤ を自分で答えるとこれより高くなる)
 *   - 候補は上位 3 つ + 今の順番を並べ、押した物にする (勝手に並べ替えない)
 *   - 計算は「おすすめを出す」を押した時だけ
 * 自動で決めるのは mod: と rest: の行の並びだけ。増強スパムの狙いは一番上、要るルーンはその MOD のすぐ前
 * (アストリッドの創造性は 2 つ目のエッセンスのすぐ前)、自分で足したルーンはすぐ後ろの行に付いて動く。
 * 1 つの順番の値は解析君の solveOrder (auto-solve.ts)
 */
import type { AutoModel, OrderResult } from "./auto-solve";
import type { AutoJob, AutoMsg } from "./auto-order.worker";

export interface OrderInput {
  /** 今の ④ の順番 (orderKeys) */
  keys: string[];
  /** 一番上で固定 (増強スパムの狙い) */
  aug: string[];
  /** 要るルーン → それが要る行。行のうち nth 番目 (1 から) に来る物のすぐ前に置く */
  runeAt: Record<string, { before: string[]; nth: number }>;
  /** 安い見積もり (④ の「外した時の取り直し」、キーごと) */
  redo: Record<string, number>;
  /** 側 (プレ "p" / サフィ "s")。無ければ側の点は無し */
  side: Record<string, string>;
}

const movableKey = (k: string): boolean => k.startsWith("mod:") || k.startsWith("rest:");
/** 自動で並べる行 (増強スパムの狙いを除く mod: / rest:) */
export const movableOf = (inp: OrderInput): string[] => inp.keys.filter((k) => movableKey(k) && !inp.aug.includes(k));

/** 並べた行から ④ の順番を組み立てる (増強は上・要るルーンは前・自分で足したルーンはすぐ後ろの行に付く) */
export function assemble(inp: OrderInput, movable: string[]): string[] {
  // 自分で足したルーン: 今の順番ですぐ後ろの並べる行に付く (無ければ一番下)
  const free = inp.keys.filter((k) => k.startsWith("rune:") && !inp.runeAt[k]);
  const attach = new Map<string, string[]>();
  const tail: string[] = [];
  for (const r of free) {
    const after = inp.keys.slice(inp.keys.indexOf(r) + 1).find((k) => movableKey(k) && !inp.aug.includes(k));
    if (after) attach.set(after, [...(attach.get(after) ?? []), r]);
    else tail.push(r);
  }
  const body = [...inp.aug, ...movable];
  const out: string[] = [];
  for (const k of body) out.push(...(attach.get(k) ?? []), k);
  out.push(...tail);
  // 要るルーン: 要る行のうち nth 番目のすぐ前 (要る行が並べる行に無ければ一番上)
  for (const [r, at] of Object.entries(inp.runeAt)) {
    if (!inp.keys.includes(r)) continue;
    const hits = out.filter((k) => at.before.includes(k));
    const anchor = hits[Math.min(at.nth, hits.length) - 1];
    out.splice(anchor ? out.indexOf(anchor) : 0, 0, r);
  }
  return out;
}

function* perms<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) { yield [...xs]; return; }
  for (let i = 0; i < xs.length; i++) {
    const rest = [...xs.slice(0, i), ...xs.slice(i + 1)];
    for (const p of perms(rest)) yield [xs[i]!, ...p];
  }
}

/** 安い見積もり: 取り直しの高い物を後ろ・同じ側をまとめる (小さいほど良い。絞るだけに使う) */
export function roughScore(inp: OrderInput, movable: string[]): number {
  const n = movable.length;
  const vals = movable.map((k) => inp.redo[k] ?? 0);
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, n);
  let s = 0;
  vals.forEach((v, i) => { s += v * (n - 1 - i); });
  for (let i = 1; i < n; i++) if (inp.side[movable[i]!] && inp.side[movable[i - 1]!] && inp.side[movable[i]!] !== inp.side[movable[i - 1]!]) s += mean * 0.1;
  return s;
}

/** 全部で数える上限 (n ≤ 5 は全部、それより多いと絞る) と、絞った時に残す数 */
export const ALL_UPTO = 5;
export const KEEP = 24;

/** 計算に回す順番の候補 (組み立て済み)。今の順番は別に足す */
export function orderCandidates(inp: OrderInput): string[][] {
  const mv = movableOf(inp);
  let picks: string[][];
  if (mv.length <= ALL_UPTO) picks = [...perms(mv)];
  else if (mv.length <= 8) {
    // 8! = 40,320 までは見積もりだけ全部数えて上から KEEP
    const all = [...perms(mv)].map((p) => ({ p, v: roughScore(inp, p) }));
    all.sort((a, b) => a.v - b.v);
    picks = all.slice(0, KEEP).map((x) => x.p);
  } else {
    // それより多い時: 見積もりの安い順に並べた物と、その隣どうしを入れ替えた物
    const base = [...mv].sort((a, b) => (inp.redo[a] ?? 0) - (inp.redo[b] ?? 0));
    picks = [base];
    for (let i = 0; i + 1 < base.length && picks.length < KEEP; i++) { const q = [...base]; [q[i], q[i + 1]] = [q[i + 1]!, q[i]!]; picks.push(q); }
  }
  return picks.map((p) => assemble(inp, p));
}

/**
 * 安い順の比べ方。完成 0 の順番などで perFinish が NaN・Infinity になる事があり、a - b だと並べ替えが壊れる
 * (10-20 夜、手袋で NaN 1 つが値だけの上位 5 を高い順番に入れ替えていた)。NaN・Infinity は一番後ろ。ワーカーにも同じ物
 */
export const byCost = (a: number, b: number): number => { const x = Number.isFinite(a) ? a : Infinity, y = Number.isFinite(b) ? b : Infinity; return x < y ? -1 : x > y ? 1 : 0; };

/** 1 行 (並べる値は perFinish = 完成 1 個あたり (R + 後半) ÷ 完成の割合 − R。optimal-craft-dp の並べ方、打ち止めの多い順番が上に来ないように) */
export type AutoRow = OrderResult & { order: string[]; current: boolean };

/** 上位いくつを 1 人ずつ回して並べ直すか、その人数 */
export const MC_TOP = 5;
export const MC_RUNS = 500;

/**
 * ワーカーで計算する。値だけで全部 → 上位 MC_TOP と今の順番を mc で回し、出た順に onRow。止めるとワーカーごと捨てる。
 * onStep: 値だけの数 (done / total)
 */
export function runAutoOrder(model: AutoModel, cands: string[][], current: string[], on: { step: (done: number, total: number) => void; row: (r: AutoRow) => void; done: () => void; error: (m: string) => void }): { stop: () => void } {
  let w: Worker | null = null;
  const stop = (): void => { w?.terminate(); w = null; };
  try {
    w = new Worker(new URL("./auto-order.worker.ts", import.meta.url), { type: "module" });
  } catch (e) {
    on.error(e instanceof Error ? e.message : String(e));
    return { stop };
  }
  w.addEventListener("message", (e: MessageEvent<AutoMsg>) => {
    const m = e.data;
    if (m.kind === "step") on.step(m.done, m.total);
    else if (m.kind === "row") on.row(m.row);
    else if (m.kind === "done") { on.done(); stop(); }
    else { on.error(m.message); stop(); }
  });
  w.addEventListener("error", (e) => { on.error(e.message || "worker error"); stop(); });
  w.postMessage({ model, cands, current, top: MC_TOP, mc: MC_RUNS } satisfies AutoJob);
  return { stop };
}
