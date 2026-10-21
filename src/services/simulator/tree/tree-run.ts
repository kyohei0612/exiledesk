/**
 * tree-run.ts — クラフトの道 (ツリー) を n 人に 1 人ずつ打たせて、箱ごとの数字を出す (解析君、2026-10-23。入口の形 docs/org/math/notes/2026-10-23-tree-run.md、
 * 設計 docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 4)。ワーカーと画面はシミュ部長、ここは純粋な計算だけ。
 *
 * 打つのは全部エンジンの入口 (applyCurrency / fillCatalyst)。結果の分け方は tree-sample.ts の outcomeOf・aimsOf (見本と同じ分け方)。
 * 繰り返し (当たるまで) は tree-sample の playHand と同じ流れを、個数を数えるためにここでたどる (playHand を変える時はここも合わせる)。
 */
import { mulberry32, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { kindOfCurrency } from "./tree-hands";
import { aimHeld, aimsOf, outcomeOf, playHand, startItemOf as startOf } from "./tree-sample";
import { withTreeTune } from "./tree-tune";
import { aimKey, MATCH_BACK, type Aim, type TreeBox, type TreeDoc } from "./tree-model";

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
  /** 完成した人 (終わり方は完成か未完成だけ。未完成 = 打ち止め・止まり、妥協は無し、オーナー 10-22) */
  finished: number;
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

type End = "done" | "capped" | "stuck";
interface Person { end: End; cost: number; at: string; visits: { box: string; cost: number }[]; uses: Record<string, number>; restarts: number }

const startItemOf = (data: PatchData, doc: TreeDoc, rng: () => number): StageItem => startOf(data, doc, rng).item;

/**
 * 形の合う箱へ (設計の「消去の後は 形の合う箱へ」、back: "match")。形 = 付いている狙いの組 + 外れがあるか。
 * 箱の形 = 始まりから親をたどった当たりの札の組 (+ 外れの箱なら外れあり)。狙いが 1 つも無ければ始まりへ (始まりの手が外れも扱う)
 */
export const MATCH = MATCH_BACK;
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
/**
 * 形の合う箱の判定 (回す時・ルート精査・画面の線で同じ物を使う。シミュ部長 10-21 オーナー「↩ 形の合う箱へは自動で探して線を引いた状態に」)。
 * 形の鍵 = 付いている狙いの組 + 外れがあるか (空きの数は、側の決まった狙いと外れの有無で決まる)
 */
export const shapeKey = (held: readonly string[], junk: boolean): string => `${[...new Set(held)].sort().join(",")}#${junk ? 1 : 0}`;
export type Shape = { key: string; box: string };
/** 箱の道の札 (始まりから親をたどった当たりの札、aimKey) */
function pathHeld(doc: TreeDoc, id: string | null): string[] {
  const held: string[] = [];
  for (let x = id; x; x = doc.boxes[x]?.parent ?? null) {
    const c = doc.boxes[x];
    if (c?.out === "hit" && c.aim) held.push(aimKey(c.aim));
  }
  return [...new Set(held)];
}
/** 行き先になれる箱 (手のある当たり / 外れの箱) とその形 */
export function shapesOf(doc: TreeDoc): Shape[] {
  const out: Shape[] = [];
  for (const b of Object.values(doc.boxes)) {
    if (!b.hand || (b.out !== "hit" && b.out !== "junk")) continue;
    out.push({ key: shapeKey(pathHeld(doc, b.out === "junk" ? b.parent : b.id), b.out === "junk"), box: b.id });
  }
  return out;
}
/** 形の鍵 → 行き先 (狙いが 0 なら始まり = 始まりの手が外れも扱う。無ければ null) */
export function boxOfShape(shapes: readonly Shape[], key: string): string | null {
  return key.startsWith("#") ? "start" : shapes.find((s) => s.key === key)?.box ?? null;
}
function matchBox(data: PatchData, shapes: readonly Shape[], item: StageItem, aims: readonly Aim[]): string | null {
  const held = aims.filter((a) => aimHeld(data, item, a)).map(aimKey);
  const isAim = (m: StageMod): boolean => aims.some((a) => aimHeld(data, { ...item, prefixes: [m], suffixes: [] }, a));
  const junk = [...item.prefixes, ...item.suffixes].some((m) => !m.fractured && !isAim(m));
  return boxOfShape(shapes, shapeKey(held, junk));
}
/** アイテムから行き先 (ルート精査が回す時と同じ道を辿る用) */
export function matchItem(data: PatchData, doc: TreeDoc, item: StageItem, aims: readonly Aim[] = aimsOf(doc)): string | null {
  return matchBox(data, shapesOf(doc), item, aims);
}
/**
 * 「形の合う箱へ」の箱が、アイテムを見ずに行きうる形と行き先 (画面の線・ルート精査の「形の合う箱が無い」)。
 * 当たり = 道の札・外れ無し / 外れ・打った後 = 道の札・外れあり / 外れが消えた = 道の札・外れ無し /
 * 狙いが消えた = 親の道の札から 1 つ欠けた形 (どれが消えるかで候補が分かれる)、外れは親が外れの箱か、消す手でない時 (カオスの入れ替え) に残る
 */
export function matchTargets(doc: TreeDoc, id: string): { key: string; to: string | null }[] {
  const b = doc.boxes[id];
  if (!b) return [];
  const shapes = shapesOf(doc);
  const one = (held: string[], junk: boolean): { key: string; to: string | null } => { const key = shapeKey(held, junk); return { key, to: boxOfShape(shapes, key) }; };
  if (b.out !== "lost") return [one(pathHeld(doc, b.id), b.out === "junk" || b.out === "any")];
  const p = b.parent ? doc.boxes[b.parent] : undefined;
  const held = pathHeld(doc, p?.id ?? null);
  const junk = p?.out === "junk" || (!!p?.hand && kindOfCurrency(p.hand.currency) !== "remove");
  const out = held.map((k) => one(held.filter((x) => x !== k), junk));
  return out.length ? out.filter((x, i) => out.findIndex((y) => y.key === x.key) === i) : [one([], junk)];
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
    // 完成の印は "main" だけ (前の版の妥協 "compromise" は未完成 = 印の無い箱として先へ読む)
    if (b.done === "main") return { end: "done", cost, at, visits, uses, restarts };
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
    const r = playHand(data, item, b.hand, rng, aims, use);
    if (!r.applied) return { end: "stuck", cost, at, visits, uses, restarts };
    if (sb.next) { item = r.item; at = sb.next; continue; }
    const oc = outcomeOf(data, before, r.item, aims);
    const next = b.outs.find((id) => {
      const c = doc.boxes[id];
      if (!c || (c.out !== oc.out && c.out !== "any")) return false; // any = 狙い無しの手の「打った後」(何が付いても)
      return oc.out !== "hit" || (!!c.aim && oc.hits.some((a) => a.modId === c.aim!.modId && a.tier === c.aim!.tier));
    });
    if (!next) return { end: "stuck", cost, at, visits, uses, restarts };
    item = r.item;
    at = next;
  }
}

function summarize(doc: TreeDoc, people: readonly Person[], startCost: number): TreeRunResult {
  const n = people.length;
  const fin = people.filter((p) => p.end === "done");
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
    capped: people.filter((p) => p.end === "capped").length,
    stuck: people.filter((p) => p.end === "stuck").length,
    stuckAt, perItem,
    meanFinished: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : NaN,
    median: q(0.5), p90: q(0.9), uses, boxes,
    restarts: people.reduce((a, p) => a + p.restarts, 0) / (n || 1),
  };
}

/** ツリーどおりに n 人を 1 人ずつ打つ (木の設定 tune で打つ) */
export function runTree(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  return withTreeTune(doc, () => runIn(data, doc, opts));
}
function runIn(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
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
