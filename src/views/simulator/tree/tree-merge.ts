/**
 * tree-merge.ts — 戻りの矢印だけの箱 (↩ 行き先の箱の名前・↩ 始めに戻る) から行き先へ流れ込む線 (2026-10-22 オーナー「やってる事が同じ枠ってあるじゃん、
 * 統合できないの? 枠も線も減るでしょ」)。中のデータ (木の形・精査・100 人回し・消した時に下が消える動き) は変えず、見え方だけ。
 *
 * 戻りの矢印だけの箱 = 次の手が無く、戻りの矢印だけの箱。その先は「今のアイテムの形と同じ箱」= もうある箱なので、箱の下の真ん中から
 * 行き先の箱の打つ手の札へ線を流し込む。行き先が同じ線は途中で 1 本に束ねる (tree-lines の bundle)。
 * 行き先の判定は回す時と同じ tree-run の matchTargets (形 = 付いている狙いの組 + 外れがあるか)。
 * 戻りの線は既定で出さず、乗せた箱の線だけ (帯の「線を全部表示」で全部)。オーナー 10-22 に案 A を選んだ (いつも淡く出す案 B は消した)。
 * 結果の見せ方は 10-22 オーナーが「全部普通の箱」を選んだ (前は箱を描かず小さな札にしていた。「何で表示が違うんですか」で札を消した)
 */
import type { TreeDoc } from "../../../services/simulator/tree/tree-model";
import { MATCH, matchTargets, RESTART } from "../../../services/simulator/tree/tree-shape";
import { stripTargetsOf } from "../../../services/simulator/tree/tree-outcome";
import { craftStage } from "../../../state/craft-stage";
import type { BackReq, Pos, Seg } from "./tree-lines";
import { flag } from "../../../web/release-flags";

/** 戻りの行き先の箱 (決めた箱 1 つ。前の版の形の合う箱へ = 行きうる形の箱を全部、作り直しは無し) */
export function backTargetsOf(doc: TreeDoc, id: string): string[] {
  const b = doc.boxes[id];
  if (!b?.back || b.back === RESTART) return [];
  // 全部消えてよい消去の後は、止まりうる形の箱 (tree-outcome の stripStops、10-27 オーナー)
  const data = craftStage.data.value, strip = b.back === MATCH && data ? stripTargetsOf(data, doc, id) : null;
  const to = strip ?? (b.back === MATCH ? matchTargets(doc, id).flatMap((x) => (x.to ? [x.to] : [])) : [b.back]);
  return [...new Set(to)].filter((x) => !!doc.boxes[x]);
}

/**
 * 完成の箱に次の手を付けた時、同じ形 (付いている狙いの組。tree-run の heldSets が 1 通りに決まる物) の完成の箱はその箱へ戻す (完成の印は外す)。
 * 10-22 オーナー「サフィに 3 MOD 付いた時点で、そこから先は全て同じルート…どれか 1 つから伸ばす時に自動でつながるように」。
 * 見本の 3 つの完成の枝は、300 人で完成の時点のプレフィックス・空きが全員同じ (scripts/_tree-done-shape-probe)
 */
export function joinSameShape(doc: TreeDoc, id: string): void {
  const b = doc.boxes[id];
  // 完成だった当たりの箱から伸ばした時だけ (前はどの箱に手を付けても動き、消去を付けた外れの箱へ完成の箱が黙ってつながった、10-22 靴・手袋を白紙から組んで見つけた)
  if (!b?.hand || !b.done || b.out !== "hit") return;
  // 完成の印を外すだけ。同じ形の完成の箱をここへつなぐのはやめた (当たりの箱には自動の矢印を引かない、10-26 オーナー「狙いがついたら再挑戦おかしくね、狙いついたらシンプルにプラスボタンじゃない？」)
  b.done = null;
}

/** 戻りの矢印だけの箱 (始まりは除く)。合流の線の出元 */
function mergeIds(doc: TreeDoc): Set<string> {
  return new Set(Object.values(doc.boxes).filter((b) => b.back && !b.hand && !b.outs.length && b.parent).map((b) => b.id));
}

/**
 * 合流の線 1 本 (箱 → 行き先)。fwd = 当たりの箱 (進む色)、back = 外れ・消えたの箱 (戻りの色)、
 * join = 当たりの箱を同じ状態の当たりの箱へまとめた「同じ MOD 群のため統合」(いつも実線・つながりの印、道は joinPath。10-27 オーナー)
 */
export interface MergeLine { id: string; from: string; to: string; parent: string; kind: "fwd" | "back" | "join"; /** join の印を置く所 */ mark?: { x: number; y: number } }

/**
 * 合流の線の頼み (tree-lines の routeBacks へ)。戻りの矢印だけの箱の下の真ん中から出て、行き先の箱の枠 (横の辺の真ん中) へ入る。
 * 出元が行き先より右なら右の辺 (flip)、左なら左の辺。10-25 オーナー「枠に返すような線じゃなかったっけ」(前は行き先の打つ手の札の左の端へ入れ、札の高さまで上って箱を囲んで見えた)。
 * pos = 箱の位置と大きさ (引っ張り中はその位置)
 */
export function mergeReqs(doc: TreeDoc, pos: (id: string) => Required<Pos>): { reqs: BackReq[]; lines: MergeLine[] } {
  const reqs: BackReq[] = [], lines: MergeLine[] = [];
  for (const id of mergeIds(doc)) {
    const b = doc.boxes[id]!, p = pos(id);
    for (const t of backTargetsOf(doc, id)) {
      const to = pos(t);
      const lid = `${id}>${t}`;
      // 統合 (当たり → 当たり) は戻りの線の道でなく、向き合う辺どうしを箱を避けて結ぶ (joinPath を呼ぶ側で)
      if (b.out === "hit" && doc.boxes[t]?.out === "hit") { lines.push({ id: lid, from: id, to: t, parent: b.parent!, kind: "join" }); continue; }
      const flip = p.x + p.w / 2 > to.x + to.w / 2;
      reqs.push({ id: lid, from: p, to, end: { x: flip ? to.x + to.w : to.x, y: to.y + to.h / 2 }, start: { x: p.x + p.w / 2, y: p.y + p.h }, flip });
      lines.push({ id: lid, from: id, to: t, parent: b.parent!, kind: b.out === "hit" || b.out === "any" ? "fwd" : "back" });
    }
  }
  return { reqs, lines };
}

type Box = Required<Pos>;
/** 箱の周りに空ける間 */
const M = 16;
/** 折れ目 1 つの重さ (px に直して。折れ目の少ない道を選ぶ) */
const BEND = 60;
/** 箱の上に出ている札 (「…が付いた」) の高さ。箱の一部として避ける */
const CHIP = 14;
/** 木の線 (進む線) の上を同じ向きに走る時の重さ (1 区間ごと。重なると統合の線と見分けられない) */
const ALONG = 600;
/** 線の 1 本 (縦か横) がほかの箱 (周りを M - 2 空ける) を通るか */
function hits(ax: number, ay: number, bx: number, by: number, boxes: readonly Box[]): boolean {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by), m = M - 2;
  return boxes.some((r) => x0 < r.x + r.w + m && x1 > r.x - m && y0 < r.y + r.h + m && y1 > r.y - m);
}
/**
 * 統合の線の道 (10-27 オーナー「最短でつなげる感じだけど枠を貫通しないでくれ。最短でつながる枠の所から出して」): 2 つの箱の 4 つの辺の真ん中のどれかから出て、
 * どれかへ入る、縦と横だけの道のうち、ほかの箱を通らずに一番短い物 (折れ目 1 つを BEND px と数える)。通り道は箱の辺から M 離した縦横の線の格子。
 * mark = つながりの印を置く所 (一番長い区間の真ん中)。どうしても無ければ真っすぐ (null にはしない)
 */
export function joinPath(from: Box, to: Box, others0: readonly Box[], segs: readonly Seg[] = []): { d: string; mark: Pos } {
  const others = others0.map((r) => ({ ...r, y: r.y - CHIP, h: r.h + CHIP }));
  /** この区間が木の線の上を同じ向きに走るか */
  const along = (ax: number, ay: number, bx: number, by: number): boolean => segs.some((g) => ay === by
    ? Math.abs(g.y0 - g.y1) < 1 && Math.abs(g.y0 - ay) < 6 && Math.min(g.x0, g.x1) < Math.max(ax, bx) && Math.max(g.x0, g.x1) > Math.min(ax, bx)
    : Math.abs(g.x0 - g.x1) < 1 && Math.abs(g.x0 - ax) < 6 && Math.min(g.y0, g.y1) < Math.max(ay, by) && Math.max(g.y0, g.y1) > Math.min(ay, by));
  // 2 つの箱が横に並ぶ (高さが重なる) 時は左右の辺を重なる高さの真ん中から、縦に並ぶ (幅が重なる) 時は上下の辺を重なる幅の真ん中から出す。
  // 間に箱が無ければ 1 本の直線になる (10-27 オーナー images 22「マークの所で線が段違い」。前は辺の真ん中どうしで、高さの違う箱だと段が付いた。スイッチ goalShape)
  const sy0 = Math.max(from.y, to.y), sy1 = Math.min(from.y + from.h, to.y + to.h), sx0 = Math.max(from.x, to.x), sx1 = Math.min(from.x + from.w, to.x + to.w);
  const shareY = flag("goalShape") && sy1 - sy0 >= 8 ? (sy0 + sy1) / 2 : null, shareX = flag("goalShape") && sx1 - sx0 >= 8 ? (sx0 + sx1) / 2 : null;
  const ports = (r: Box): Array<{ p: Pos; q: Pos }> => {
    const cx = shareX ?? r.x + r.w / 2, cy = shareY ?? r.y + r.h / 2;
    // p = 辺の真ん中、q = そこから外へ M 出た所 (格子に乗る所)
    return [{ p: { x: cx, y: r.y - CHIP }, q: { x: cx, y: r.y - CHIP - M } }, { p: { x: cx, y: r.y + r.h }, q: { x: cx, y: r.y + r.h + M } }, { p: { x: r.x, y: cy }, q: { x: r.x - M, y: cy } }, { p: { x: r.x + r.w, y: cy }, q: { x: r.x + r.w + M, y: cy } }];
  };
  const A = ports(from), Z = ports(to);
  const block = [...others, { ...from, y: from.y - CHIP, h: from.h + CHIP }, { ...to, y: to.y - CHIP, h: to.h + CHIP }];
  const xs = new Set<number>(), ys = new Set<number>();
  for (const r of block) { xs.add(r.x - M); xs.add(r.x + r.w + M); ys.add(r.y - M); ys.add(r.y + r.h + M); ys.add(r.y - M - 18); ys.add(r.y + r.h + M + 18); }
  for (const e of [...A, ...Z]) { xs.add(e.q.x); ys.add(e.q.y); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
  const key = (i: number, j: number, d: number): number => (i * Y.length + j) * 3 + d; // d = 0 着いたばかり / 1 横に来た / 2 縦に来た
  const dist = new Map<number, number>(), prev = new Map<number, number>();
  const ix = new Map(X.map((x, i) => [x, i])), iy = new Map(Y.map((y, j) => [y, j]));
  const open: Array<[number, number]> = [];
  const push = (k: number, c: number, from?: number): void => { if (c < (dist.get(k) ?? Infinity)) { dist.set(k, c); if (from !== undefined) prev.set(k, from); open.push([c, k]); } };
  for (const e of A) { if (hits(e.p.x, e.p.y, e.q.x, e.q.y, others)) continue; push(key(ix.get(e.q.x)!, iy.get(e.q.y)!, 0), M); }
  const goal = new Map<number, Pos>();
  for (const e of Z) goal.set(ix.get(e.q.x)! * Y.length + iy.get(e.q.y)!, e.p);
  let end: number | null = null;
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [c, k] = open.shift()!;
    if (c > (dist.get(k) ?? Infinity)) continue;
    const d = k % 3, cell = (k - d) / 3, i = Math.floor(cell / Y.length), j = cell % Y.length;
    if (goal.has(cell) && !hits(X[i]!, Y[j]!, goal.get(cell)!.x, goal.get(cell)!.y, others)) { end = k; break; }
    for (const [di, dj, nd] of [[1, 0, 1], [-1, 0, 1], [0, 1, 2], [0, -1, 2]] as const) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= X.length || nj >= Y.length) continue;
      if (hits(X[i]!, Y[j]!, X[ni]!, Y[nj]!, block)) continue;
      push(key(ni, nj, nd), c + Math.abs(X[ni]! - X[i]!) + Math.abs(Y[nj]! - Y[j]!) + (d && d !== nd ? BEND : 0) + (along(X[i]!, Y[j]!, X[ni]!, Y[nj]!) ? ALONG : 0), k);
    }
  }
  let pts: Pos[];
  if (end === null) pts = [A[0]!.p, Z[0]!.p];
  else {
    const cells: Pos[] = [];
    for (let k: number | undefined = end; k !== undefined; k = prev.get(k)) { const cell = (k - (k % 3)) / 3; cells.unshift({ x: X[Math.floor(cell / Y.length)]!, y: Y[cell % Y.length]! }); }
    const s0 = A.find((e) => e.q.x === cells[0]!.x && e.q.y === cells[0]!.y)!.p;
    const last = cells[cells.length - 1]!;
    pts = [s0, ...cells, goal.get(ix.get(last.x)! * Y.length + iy.get(last.y)!)!];
    // まっすぐ続く点を間引く
    pts = pts.filter((p, n) => n === 0 || n === pts.length - 1 || !((pts[n - 1]!.x === p.x && p.x === pts[n + 1]!.x) || (pts[n - 1]!.y === p.y && p.y === pts[n + 1]!.y)));
  }
  let best = 0, mark: Pos = pts[0]!;
  for (let n = 1; n < pts.length; n++) { const p = pts[n - 1]!, q = pts[n]!, L = Math.abs(q.x - p.x) + Math.abs(q.y - p.y); if (L > best) { best = L; mark = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }; } }
  return { d: "M " + pts.map((p) => `${p.x} ${p.y}`).join(" L "), mark };
}
