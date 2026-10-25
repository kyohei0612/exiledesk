/**
 * tree-run.ts — クラフトの道 (ツリー) を n 人に 1 人ずつ打たせて、箱ごとの数字を出す (解析君、2026-10-23。入口の形 docs/org/math/notes/2026-10-23-tree-run.md、
 * 設計 docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 4)。ワーカーと画面はシミュ部長、ここは純粋な計算だけ。
 *
 * 打つのは全部エンジンの入口 (applyCurrency / fillCatalyst)。結果の分け方は tree-sample.ts の outcomeOf・aimsOf (見本と同じ分け方)。
 * 繰り返し (当たるまで) は tree-sample の playHand と同じ流れを、個数を数えるためにここでたどる (playHand を変える時はここも合わせる)。
 */
import { mulberry32, type PatchData, type StageItem } from "../../craft-stage/engine";
import { aimHeldOn, isAimMod } from "./tree-aim";
import { effectOf } from "./tree-hands";
import { aimOpts, aimsOf, fractureChoices, handAims, outcomeOf, playHand, SPAM_CAP, startItemOf as startOf, targetsOf } from "./tree-sample";
import { heldSets, MATCH, matchBox, outBoxOf, RESTART, settle, shapesOf, splitTo, type Shape, type SplitBox } from "./tree-shape";
import { withTreeTune } from "./tree-tune";
import { modText, tr } from "../../../i18n/lang";
import { type Aim, type OutKind, type TreeDoc } from "./tree-model";

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
  /**
   * 「当たるまで」(上限無し) の箱 (既定 = repeat.max の無い箱)。見張りの上限 (SPAM_CAP・精査の写しは 1,000) まで当たらなかった人は、形の合う箱へ回し直さずここで止まる
   * (抜けにくい形: 削減のお告げで満杯の側の入れ替えが続く等。前は形の合う同じ箱へ戻って打ち直し、1 人が数万回回って画面が止まった、10-25 モンキー 4 本目の 12 本)
   */
  untilHit?: ReadonlySet<string>;
  /** every 人ごとに途中の結果 */
  onProgress?: (r: TreeRunResult) => void;
  every?: number;
  /** 1 人終わるごとに、その人の通った箱 (順に、着いた時の費用) と終わり方。画面の「1 人目が木を進む」が読む (10-22) */
  onPerson?: (p: { end: End; at: string; cost: number; visits: readonly { box: string; cost: number; pass?: true }[]; why?: { reason: string; item: StageItem } }, i: number) => void;
  /** 手を打つ直前の箱とアイテム (照らしの台本が、箱に着いた実物ごとにエンジンの確率を出して比べる。シミュ 25 本目 10-25) */
  onHand?: (box: string, item: StageItem) => void;
}
interface BoxStat {
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
  /** この箱の手で使ったお金の 1 人あたり (神。次の箱に着いた時の費用 − 着いた時の費用、結果のレポートの「一番お金を使った箱」10-22) */
  spend: number;
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
  /** 手が打てずに止まった箱の、最初の 1 人の理由・着いた形・通った戻りの箱 (古い順、重ねない)。精査がどの外れ・どの戻りが元かを出す (10-22) */
  stuckWhy: Record<string, { reason: string; item: StageItem; backs: string[]; noBox?: boolean; /** 当たるまでを この回数打っても当たらずに止まった (untilHit) */ spam?: number }>;
  /** 手の結果に合う結果の箱が無かった人数 (箱ごと。結果が 1 通りとして箱を 1 つにした手で別の結果が出た等。形の合う箱があればそこへ進み、無ければ止まり) */
  unexpected: Record<string, number>;
  /** 着いた箱 (手の結果の箱・戻り先) の形が実物と違い、形の合う箱へ移した人数 (箱ごと、settle。照らしの台本は形合わせを辿らないので、これのある木は比べ方が違う、10-24) */
  moved: Record<string, number>;
  /** 全員の合計 ÷ 完成数 (完成 0 なら NaN) */
  perItem: number;
  meanFinished: number;
  median: number;
  p90: number;
  /** 完成した人の費用の下位 10% (安い方、結果のレポート 10-22) */
  p10: number;
  /** 1 人あたりの個数 (値段のキーごと) */
  uses: Record<string, number>;
  /** 1 人あたりの作り直しの回数 */
  restarts: number;
  boxes: Record<string, BoxStat>;
  /** 箱から箱へ移った回数の合計 ("<元>><先>"、進む線も戻りの弧も。回した時の層の線の太さ、10-22 オーナー) */
  edges: Record<string, number>;
}

export type End = "done" | "capped" | "stuck";
interface Person { end: End; cost: number; at: string; visits: { box: string; cost: number; pass?: true }[]; uses: Record<string, number>; restarts: number; odd: Set<string>; why?: { reason: string; item: StageItem; noBox?: boolean; spam?: number } }

const startItemOf = (data: PatchData, doc: TreeDoc, rng: () => number): StageItem => startOf(data, doc, rng).item;

/** フラクチャーの外れの回数 (10-24 オーナー「2 回外れて 1 回当たり」) と、外れうる固定の候補の数 */
export const FRACTURE_MISS = 2;
const FRACTURE_PICK = 2;

function runOne(data: PatchData, doc: TreeDoc, aims: readonly Aim[], shapes: readonly Shape[], rng: () => number, o: Required<Pick<TreeRunOpts, "price" | "startCost" | "capDiv" | "capSteps" | "untilHit">> & Pick<TreeRunOpts, "start" | "onHand">): Person {
  let item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
  let cost = o.startCost;
  const uses: Record<string, number> = {};
  const visits: Person["visits"] = [];
  const use = (key: string, n = 1): void => { uses[key] = (uses[key] ?? 0) + n; cost += o.price(key) * n; };
  let at = "start";
  let steps = 0;
  let restarts = 0;
  const odd = new Set<string>();
  // back だけで回り続ける形 (back の輪) の見張り
  let hops = 0;
  for (;;) {
    const b = doc.boxes[at];
    if (!b) return { end: "stuck", cost, at, visits, uses, restarts, odd };
    visits.push({ box: at, cost });
    // 完成の印は "main" だけ (前の版の妥協 "compromise" は未完成 = 印の無い箱として先へ読む)。
    // 着いた時に狙いの数を見る: 道の当たりの数より少なければ完成にせず、形の合う箱へ (無ければ止まり)
    // (10-22 白紙から 13 通り組んだ #4: 入れ替えのカオスで途中の狙いが消え、完成 100% と出たのに 96 人は狙い 1 つだった)
    if (b.done === "main") {
      // 完成のアイテムも残す (台本で完成図を出す。止まりの集計 stuckWhy には入れない)
      if (doneOk(data, doc, at, item, aims)) return { end: "done", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成", "Done"), item } };
      odd.add(at);
      const to = ++hops > 1000 ? null : matchBox(data, shapes, item, aims);
      if (!to || to === at) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成の箱に着いたが、狙いが揃っていない (形の合う箱も無い)", "Reached a done box without all its targets (and no box matches the shape)"), item } };
      at = to;
      continue;
    }
    const sb = b as SplitBox;
    if (sb.split) {
      if (++hops > 1000) return { end: "stuck", cost, at, visits, uses, restarts, odd };
      const to = splitTo(data, sb.split, item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts, odd };
      at = to;
      continue;
    }
    if (b.back) {
      if (++hops > 1000) return { end: "stuck", cost, at, visits, uses, restarts, odd };
      if (b.back === RESTART) {
        item = o.start ? o.start(rng) : startItemOf(data, doc, rng);
        cost += o.startCost;
        restarts++;
        at = "start";
        continue;
      }
      const to = b.back === MATCH ? matchBox(data, shapes, item, aims) : settle(data, doc, shapes, b.back, item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("戻り先の「形の合う箱」が無い", "No box matches the shape to return to"), item, noBox: true } };
      // 戻り先に着いてから形の合う箱へ移った時も、結果の箱と同じく戻り先の来訪を pass で残す (moved に数える)
      if (b.back !== MATCH && to !== b.back) visits.push({ box: b.back, cost, pass: true });
      at = to;
      continue;
    }
    if (!b.hand) {
      // 完成 = 完成の狙い (0 完成形の設定) が全部付いた時点。手の無い箱で揃っていれば完成 (狙いを全部付けたスタート、10-22 14 本目)
      const goals = doc.memoAims ?? [];
      if (goals.length && goals.every((a) => aimHeldOn(data, item, a, { sameText: true }))) return { end: "done", cost, at, visits, uses, restarts, odd, why: { reason: tr("完成", "Done"), item } };
      return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr("次の手・戻り先が無い", "No next craft or return"), item, noBox: true } };
    }
    // 打ち止めの時のアイテムも残す (台本で輪から抜けない理由を見る。止まりの集計 stuckWhy には入れない)
    if (++steps > o.capSteps || cost > o.capDiv) return { end: "capped", cost, at, visits, uses, restarts, odd, why: { reason: tr("打ち止め", "Capped"), item } };
    hops = 0;
    const before = item;
    // フラクチャーは必ず狙いを固定し (playHand の fractureTarget)、固定できる MOD が 2 つ以上なら「2 回外れて 1 回当たり」として、ここまでに使った物と
    // 始めの値段を 2 回分足す (外れた時は素材を作り直す。10-24 オーナー、ツリーに買い直しの道は作らない)。作り直しの回数にも 2
    const miss = effectOf(b.hand.currency) === "fracture" && fractureChoices(data, item) >= FRACTURE_PICK ? Object.entries(uses) : null;
    const tried = uses[b.hand.currency] ?? 0, own = handAims(doc, at, aims);
    o.onHand?.(at, item);
    const r = playHand(data, item, b.hand, rng, own, use);
    if (!r.applied) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: r.reason ?? "", item } };
    const cap = b.hand.repeat?.max ?? SPAM_CAP;
    if (o.untilHit.has(at) && (uses[b.hand.currency] ?? 0) - tried >= cap && outcomeOf(data, before, r.item, own, b.hand.currency).out !== "hit") {
      return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr(`当たるまでを ${cap} 回打っても当たらない (この形からは狙いが付きにくい・付かない)`, `No hit in ${cap} repeats (the target is unlikely or impossible from this item)`), item: r.item, spam: cap } };
    }
    if (miss) {
      for (const [k, n] of miss) use(k, FRACTURE_MISS * n);
      use(b.hand.currency, FRACTURE_MISS);
      cost += FRACTURE_MISS * o.startCost;
      restarts += FRACTURE_MISS;
    }
    if (sb.next) { item = r.item; at = sb.next; continue; }
    const oc = outcomeOf(data, before, r.item, aims, b.hand.currency);
    const next = outBoxOf(doc, b, oc, r.item);
    if (!next) {
      // 合う結果の箱が無い (10-22 ブラック「1 箱にした手で別の結果が出た時に黙って止まらない」): 形の合う箱があればそこへ、無ければ止まり。どちらも想定外として数える
      odd.add(at);
      const to = matchBox(data, shapes, r.item, aims);
      if (!to) return { end: "stuck", cost, at, visits, uses, restarts, odd, why: { reason: tr(`この手の結果「${outcomeText(data, r.item, oc)}」の箱が無く、形の合う箱も無い`, `No box for this craft's result "${outcomeText(data, r.item, oc)}", and no box matches the shape`), item: r.item, noBox: true } };
      item = r.item;
      at = to;
      continue;
    }
    item = r.item;
    // 結果の箱には一度着いてから形の合う箱へ移る (着いた数と線に入れる。前は飛ばして、当たりの箱が「来た人 0」・照らしで当たり 0% になった、10-24 モンキー m-602・指輪 b11)
    const to = settle(data, doc, shapes, next, item, aims);
    if (to !== next) visits.push({ box: next, cost, pass: true });
    at = to;
  }
}

/** 手の結果の名前 (止まりの文。当たりは付いた MOD の文) */
const OUT_TEXT: Partial<Record<OutKind, [string, string]>> = { junk: ["外れ", "Miss"], junkGone: ["外れが消えた", "Miss removed"], lost: ["狙いが消えた", "Target lost"] };
function outcomeText(data: PatchData, item: StageItem, oc: { out: OutKind; hits: Aim[] }): string {
  if (oc.out !== "hit") { const n = OUT_TEXT[oc.out]; return n ? tr(n[0], n[1]) : oc.out; }
  const mods = [...item.prefixes, ...item.suffixes];
  const names = oc.hits.map((a) => { const t = targetsOf(data, [a]), m = mods.find((x) => isAimMod(x, t, aimOpts(data))); return m ? modText(m) : a.modId; });
  return tr(`当たり ${names.join("・")}`, `Hit ${names.join(", ")}`);
}
/** 完成の箱で狙いが揃っているか (付いている木の狙いの数が、その箱の道の当たりの数の一番少ない組以上。分かれ目の先は行の条件で決まるので数で見る) */
function doneOk(data: PatchData, doc: TreeDoc, id: string, item: StageItem, aims: readonly Aim[]): boolean {
  const need = Math.min(...heldSets(doc, id).map((h) => h.length));
  return aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).length >= need;
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
  const stuckWhy: TreeRunResult["stuckWhy"] = {};
  for (const p of people) if (p.end === "stuck") { stuckAt[p.at] = (stuckAt[p.at] ?? 0) + 1; if (p.why && !stuckWhy[p.at]) stuckWhy[p.at] = { ...p.why, backs: [...new Set(p.visits.map((v) => v.box).filter((id) => doc.boxes[id]?.back))] }; }
  const unexpected: Record<string, number> = {};
  for (const p of people) for (const id of p.odd) unexpected[id] = (unexpected[id] ?? 0) + 1;
  const moved: Record<string, number> = {};
  for (const p of people) for (const id of new Set(p.visits.filter((v) => v.pass).map((v) => v.box))) moved[id] = (moved[id] ?? 0) + 1;
  const acc: Record<string, { reach: number; visits: number; costIn: number; remain: number; spend: number }> = {};
  for (const id of Object.keys(doc.boxes)) acc[id] = { reach: 0, visits: 0, costIn: 0, remain: 0, spend: 0 };
  for (const p of people) {
    const seen = new Set<string>();
    p.visits.forEach((v, i) => {
      const a = acc[v.box];
      if (!a) return;
      a.spend += (p.visits[i + 1]?.cost ?? p.cost) - v.cost;
      if (!seen.has(v.box)) { seen.add(v.box); a.reach++; }
      // 着いてすぐ形の合う箱へ移った来訪 (pass) は、来た人と線には入れ、来た回数・平均の費用には入れない (この箱の手は打っていない)
      if (v.pass) return;
      a.visits++;
      a.costIn += v.cost;
      a.remain += p.cost - v.cost;
    });
  }
  const edges: Record<string, number> = {};
  for (const p of people) for (let i = 1; i < p.visits.length; i++) { const k = `${p.visits[i - 1]!.box}>${p.visits[i]!.box}`; edges[k] = (edges[k] ?? 0) + 1; }
  const boxes: Record<string, BoxStat> = {};
  for (const [id, a] of Object.entries(acc)) {
    const costIn = a.visits ? a.costIn / a.visits : 0, remain = a.visits ? a.remain / a.visits : 0;
    boxes[id] = { reach: a.reach, visits: a.visits, costIn, remain, warn: a.visits > 0 && Number.isFinite(perItem) && remain > startCost + perItem, spend: a.spend / (n || 1) };
  }
  return {
    n, finished: fin.length,
    capped: people.filter((p) => p.end === "capped").length,
    stuck: people.filter((p) => p.end === "stuck").length,
    stuckAt, stuckWhy, unexpected, moved, perItem,
    meanFinished: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : NaN,
    median: q(0.5), p90: q(0.9), p10: q(0.1), uses, boxes, edges,
    restarts: people.reduce((a, p) => a + p.restarts, 0) / (n || 1),
  };
}

/** ツリーどおりに n 人を 1 人ずつ打つ (木の設定 tune で打つ) */
export function runTree(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  return withTreeTune(doc, () => runIn(data, doc, opts));
}
/**
 * 1 人回すごとに人数を返す形 (ルート精査が間に画面を返して「精査中 12/30」を出す、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」)。
 * 木の設定 (tune) は呼ぶ側が next() ごとに withTreeTune で包む (tree-check の checkTreeAsync)
 */
export function* runTreeSteps(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): Generator<number, TreeRunResult> {
  const untilHit = opts.untilHit ?? new Set(Object.values(doc.boxes).filter((b) => b.hand?.repeat && b.hand.repeat.max == null).map((b) => b.id));
  const o = { price: opts.price, startCost: opts.startCost ?? 0, capDiv: opts.capDiv ?? 2000, capSteps: opts.capSteps ?? 20000, start: opts.start, untilHit, onHand: opts.onHand };
  const aims = opts.aims ?? aimsOf(doc);
  const shapes = shapesOf(doc);
  const rng = mulberry32(opts.seed);
  const people: Person[] = [];
  const every = Math.max(1, opts.every ?? 10);
  for (let i = 0; i < opts.n; i++) {
    const p = runOne(data, doc, aims, shapes, rng, o);
    people.push(p);
    opts.onPerson?.(p, i);
    if (opts.onProgress && (i + 1) % every === 0 && i + 1 < opts.n) opts.onProgress(summarize(doc, people, o.startCost));
    yield i + 1;
  }
  return summarize(doc, people, o.startCost);
}
function runIn(data: PatchData, doc: TreeDoc, opts: TreeRunOpts): TreeRunResult {
  const g = runTreeSteps(data, doc, opts);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}
