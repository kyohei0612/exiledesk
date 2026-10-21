/**
 * tree-run.ts — クラフトの道 (ツリー) を n 人に 1 人ずつ打たせて、箱ごとの数字を出す (解析君、2026-10-23。入口の形 docs/org/math/notes/2026-10-23-tree-run.md、
 * 設計 docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 4)。ワーカーと画面はシミュ部長、ここは純粋な計算だけ。
 *
 * 打つのは全部エンジンの入口 (applyCurrency / fillCatalyst)。結果の分け方は tree-sample.ts の outcomeOf・aimsOf (見本と同じ分け方)。
 * 繰り返し (当たるまで) は tree-sample の playHand と同じ流れを、個数を数えるためにここでたどる (playHand を変える時はここも合わせる)。
 */
import { applyCurrency, freshItem, mulberry32, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { CATALYSING } from "./tree-hands";
import { aimHeld, aimsOf, fillCatalyst, outcomeOf } from "./tree-sample";
import { aimKey, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";

export interface TreeRunOpts {
  /** 人数 (裏は 100、確かめは 300) */
  n: number;
  /** 同じ seed なら同じ結果 */
  seed: number;
  /** 値段のキー → 神。無い物は 0 */
  price: (key: string) => number;
  /** 始めの形の値段 (神)。始まりの 1 回だけ払う */
  startCost?: number;
  /** 1 人の打ち止め (神、既定 2000) */
  capDiv?: number;
  /** 1 人の手の上限 (既定 20000) */
  capSteps?: number;
  /** 狙いの札 (既定 = ツリーの当たりの箱の札、aimsOf)。分かれ目の箱だけで組んだツリーは当たりの箱が無いので渡す */
  aims?: Aim[];
  /** 始めのアイテム (既定 = sampleOf の始まり: レア + フラクチャーの指名) */
  start?: (rng: () => number) => StageItem;
  /** every 人ごとに途中の結果 */
  onProgress?: (r: TreeRunResult) => void;
  every?: number;
}
export interface BoxStat {
  /** 1 回でもここに来た人数 */
  reach: number;
  /** 来た回数の合計 */
  visits: number;
  /** 着いた時のそれまでの費用の平均 (神、来た回ごと) */
  costIn: number;
  /** ここから完成 (か打ち止め・止まり) までの費用の平均 (神、来た回ごと) */
  remain: number;
  /** remain > startCost + perItem (作り直しの方が安い) */
  warn: boolean;
}
export interface TreeRunResult {
  n: number;
  finished: number;
  main: number;
  compromise: number;
  /** 打ち止め (神か手の上限) */
  capped: number;
  /** 組んでいない芽・打てない手で止まった人 */
  stuck: number;
  stuckAt: Record<string, number>;
  /** 全員の合計 ÷ 完成数 (完成 0 なら NaN) */
  perItem: number;
  meanFinished: number;
  median: number;
  p90: number;
  /** 1 人あたりの個数 (値段のキーごと) */
  uses: Record<string, number>;
  /** 1 人あたりの作り直しの回数 */
  restarts: number;
  boxes: Record<string, BoxStat>;
}

/** 繰り返しの上限が無い時の見張り (tree-sample の SPAM_CAP と同じ) */
const SPAM_CAP = 5000;

type End = "main" | "compromise" | "capped" | "stuck";
interface Person { end: End; cost: number; at: string; visits: { box: string; cost: number }[]; uses: Record<string, number>; restarts: number }

function startItemOf(data: PatchData, doc: TreeDoc, rng: () => number): StageItem {
  const it = freshItem(data, doc.base, doc.itemLevel, "rare");
  if (!doc.fracture) return it;
  return applyCurrency(data, it, `force:${doc.fracture.modId}|T${doc.fracture.tier}|f`, rng).item;
}

/** 手を 1 回打つ (playHand と同じ流れ)。use で使った物を数える */
function play(data: PatchData, item: StageItem, h: Hand, rng: () => number, aims: readonly Aim[], use: (key: string, n?: number) => void): StageApply {
  if (h.repeat) {
    const cap = h.repeat.max ?? SPAM_CAP;
    let r: StageApply = { applied: false, item, added: [], removed: [] };
    let it = item;
    for (let i = 0; i < cap; i++) {
      r = play(data, it, { ...h, repeat: null }, rng, aims, use);
      if (!r.applied) return i ? { ...r, applied: true, item: it } : r;
      it = r.item;
      if (outcomeOf(data, item, it, aims).out === "hit") break;
    }
    return { ...r, item: it };
  }
  let it = item;
  if (h.catalyst && h.omens.includes(CATALYSING)) {
    const r = fillCatalyst(data, it, h.catalyst, rng);
    if (!r.applied && r.count === 0 && !(it.qualityTag === h.catalyst.slice("catalyst_".length))) return r;
    if (r.count) use(h.catalyst, r.count);
    it = r.item;
  }
  const r = applyCurrency(data, it, h.currency, rng, h.omens);
  if (r.applied) {
    use(h.currency);
    for (const o of r.omensUsed ?? []) use(o);
  }
  return r;
}

/**
 * 形の合う箱へ (設計の「消去の後は 形の合う箱へ」、back: "match")。形 = 付いている狙いの組 + 外れがあるか。
 * 箱の形 = 始まりから親をたどった当たりの札の組 (+ 外れの箱なら外れあり)。狙いが 1 つも無ければ始まりへ (始まりの手が外れも扱う)
 */
export const MATCH = "match";
/** 作り直し (設計の「作り直し」、back: "restart"): 始めのアイテムに戻して、始めの費用をもう一度払う。数えた回数は TreeRunResult.restarts */
export const RESTART = "restart";

/**
 * 分かれ目の箱 (設計 2 弾目「打たずに状態で分ける」): 手を打たずに、今のアイテムの状態の条件を上から順に見て、最初に合った行の箱へ進む。
 * TreeDoc の型にはまだ無いので、箱に split / next を足した形 (SplitBox) をここだけで読む。どの行にも合わなければ止まる。
 * next = 手の結果がどれでも、この箱へ進む (分かれ目に戻す時に結果の箱を並べなくてよい)
 */
type Range = [number, number];
export interface SplitWhen {
  /** 付いている狙いの数 */
  heldCount?: Range;
  /** 全部付いている狙い (aimKey) */
  has?: string[];
  /** どれも付いていない狙い (aimKey) */
  lacks?: string[];
  /** 外れ (固定でも狙いでもない MOD) の数 */
  junk?: { prefix?: Range; suffix?: Range; any?: Range };
  /** 固定でない MOD の数 */
  free?: { prefix?: Range; suffix?: Range; any?: Range };
}
export interface SplitRule { when: SplitWhen; to: string }
export type SplitBox = TreeBox & { split?: SplitRule[]; next?: string };
const inRange = (n: number, r?: Range): boolean => !r || (n >= r[0] && n <= r[1]);
function splitTo(data: PatchData, rules: readonly SplitRule[], item: StageItem, aims: readonly Aim[]): string | null {
  const held = new Set(aims.filter((a) => aimHeld(data, item, a)).map(aimKey));
  const isAim = (m: StageMod): boolean => aims.some((a) => aimHeld(data, { ...item, prefixes: [m], suffixes: [] }, a));
  const count = (side: "prefix" | "suffix" | "any", junkOnly: boolean): number =>
    [...(side !== "suffix" ? item.prefixes : []), ...(side !== "prefix" ? item.suffixes : [])].filter((m) => !m.fractured && (!junkOnly || !isAim(m))).length;
  const ok = (w: SplitWhen): boolean =>
    inRange(held.size, w.heldCount)
    && (w.has ?? []).every((k) => held.has(k))
    && (w.lacks ?? []).every((k) => !held.has(k))
    && (["prefix", "suffix", "any"] as const).every((sd) => inRange(count(sd, true), w.junk?.[sd]) && inRange(count(sd, false), w.free?.[sd]));
  return rules.find((r) => ok(r.when))?.to ?? null;
}
type Shape = { key: string; box: string };
function shapesOf(doc: TreeDoc): Shape[] {
  const out: Shape[] = [];
  for (const b of Object.values(doc.boxes)) {
    if (!b.hand || (b.out !== "hit" && b.out !== "junk")) continue;
    const held: string[] = [];
    for (let x: string | null = b.out === "junk" ? b.parent : b.id; x; x = doc.boxes[x]?.parent ?? null) {
      const c = doc.boxes[x];
      if (c?.out === "hit" && c.aim) held.push(aimKey(c.aim));
    }
    out.push({ key: `${[...new Set(held)].sort().join(",")}#${b.out === "junk" ? 1 : 0}`, box: b.id });
  }
  return out;
}
function matchBox(data: PatchData, shapes: readonly Shape[], item: StageItem, aims: readonly Aim[]): string | null {
  const held = aims.filter((a) => aimHeld(data, item, a)).map(aimKey);
  if (!held.length) return "start";
  const isAim = (m: StageMod): boolean => aims.some((a) => aimHeld(data, { ...item, prefixes: [m], suffixes: [] }, a));
  const junk = [...item.prefixes, ...item.suffixes].some((m) => !m.fractured && !isAim(m));
  const key = `${[...new Set(held)].sort().join(",")}#${junk ? 1 : 0}`;
  return shapes.find((s) => s.key === key)?.box ?? null;
}

function runOne(data: PatchData, doc: TreeDoc, aims: readonly Aim[], shapes: readonly Shape[], rng: () => number, o: Required<Pick<TreeRunOpts, "price" | "startCost" | "capDiv" | "capSteps">> & Pick<TreeRunOpts, "start">): Person {
  let item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
  let cost = o.startCost;
  const uses: Record<string, number> = {};
  const visits: Person["visits"] = [];
  const use = (key: string, n = 1): void => { uses[key] = (uses[key] ?? 0) + n; cost += o.price(key) * n; };
  let at = "start";
  let steps = 0;
  let restarts = 0;
  // back だけで回り続ける形 (back の輪) の見張り
  let hops = 0;
  for (;;) {
    const b = doc.boxes[at];
    if (!b) return { end: "stuck", cost, at, visits, uses, restarts };
    visits.push({ box: at, cost });
    if (b.done) return { end: b.done, cost, at, visits, uses, restarts };
    const sb = b as SplitBox;
    if (sb.split) {
      if (++hops > 1000) return { end: "stuck", cost, at, visits, uses, restarts };
      const to = splitTo(data, sb.split, item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts };
      at = to;
      continue;
    }
    if (b.back) {
      if (++hops > 1000) return { end: "stuck", cost, at, visits, uses, restarts };
      if (b.back === RESTART) {
        item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
        cost += o.startCost;
        restarts++;
        at = "start";
        continue;
      }
      const to = b.back === MATCH ? matchBox(data, shapes, item, aims) : b.back;
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts };
      at = to;
      continue;
    }
    if (!b.hand) return { end: "stuck", cost, at, visits, uses, restarts };
    if (++steps > o.capSteps || cost > o.capDiv) return { end: "capped", cost, at, visits, uses, restarts };
    hops = 0;
    const before = item;
    const r = play(data, item, b.hand, rng, aims, use);
    if (!r.applied) return { end: "stuck", cost, at, visits, uses, restarts };
    if (sb.next) { item = r.item; at = sb.next; continue; }
    const oc = outcomeOf(data, before, r.item, aims);
    const next = b.outs.find((id) => {
      const c = doc.boxes[id];
      if (!c || c.out !== oc.out) return false;
      return oc.out !== "hit" || (!!c.aim && oc.hits.some((a) => a.modId === c.aim!.modId && a.tier === c.aim!.tier));
    });
    if (!next) return { end: "stuck", cost, at, visits, uses, restarts };
    item = r.item;
    at = next;
  }
}

function summarize(doc: TreeDoc, people: readonly Person[], startCost: number): TreeRunResult {
  const n = people.length;
  const fin = people.filter((p) => p.end === "main" || p.end === "compromise");
  const total = people.reduce((a, p) => a + p.cost, 0);
  const perItem = fin.length ? total / fin.length : NaN;
  const costs = fin.map((p) => p.cost).sort((a, b) => a - b);
  const q = (p: number): number => (costs.length ? costs[Math.min(costs.length - 1, Math.floor(p * costs.length))]! : NaN);
  const uses: Record<string, number> = {};
  for (const p of people) for (const [k, v] of Object.entries(p.uses)) uses[k] = (uses[k] ?? 0) + v / (n || 1);
  const stuckAt: Record<string, number> = {};
  for (const p of people) if (p.end === "stuck") stuckAt[p.at] = (stuckAt[p.at] ?? 0) + 1;
  const acc: Record<string, { reach: number; visits: number; costIn: number; remain: number }> = {};
  for (const id of Object.keys(doc.boxes)) acc[id] = { reach: 0, visits: 0, costIn: 0, remain: 0 };
  for (const p of people) {
    const seen = new Set<string>();
    for (const v of p.visits) {
      const a = acc[v.box];
      if (!a) continue;
      if (!seen.has(v.box)) { seen.add(v.box); a.reach++; }
      a.visits++;
      a.costIn += v.cost;
      a.remain += p.cost - v.cost;
    }
  }
  const boxes: Record<string, BoxStat> = {};
  for (const [id, a] of Object.entries(acc)) {
    const costIn = a.visits ? a.costIn / a.visits : 0, remain = a.visits ? a.remain / a.visits : 0;
    boxes[id] = { reach: a.reach, visits: a.visits, costIn, remain, warn: a.visits > 0 && Number.isFinite(perItem) && remain > startCost + perItem };
  }
  return {
    n, finished: fin.length,
    main: people.filter((p) => p.end === "main").length,
    compromise: people.filter((p) => p.end === "compromise").length,
    capped: people.filter((p) => p.end === "capped").length,
    stuck: people.filter((p) => p.end === "stuck").length,
    stuckAt, perItem,
    meanFinished: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : NaN,
    median: q(0.5), p90: q(0.9), uses, boxes,
    restarts: people.reduce((a, p) => a + p.restarts, 0) / (n || 1),
  };
}

/** ツリーどおりに n 人を 1 人ずつ打つ */
export function runTree(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  const o = { price: opts.price, startCost: opts.startCost ?? 0, capDiv: opts.capDiv ?? 2000, capSteps: opts.capSteps ?? 20000, start: opts.start };
  const aims = opts.aims ?? aimsOf(doc);
  const shapes = shapesOf(doc);
  const rng = mulberry32(opts.seed);
  const every = Math.max(1, opts.every ?? 10);
  const people: Person[] = [];
  for (let i = 0; i < opts.n; i++) {
    people.push(runOne(data, doc, aims, shapes, rng, o));
    if (opts.onProgress && (i + 1) % every === 0 && i + 1 < opts.n) opts.onProgress(summarize(doc, people, o.startCost));
  }
  return summarize(doc, people, o.startCost);
}
