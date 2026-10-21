/**
 * tree-lines.ts — ツリーの線の道筋 (2026-10-21 オーナー 10-22「線が他の線と被ったり…都度調整してあげて」「線を繋げても、その線が出ない」)。
 * - 戻りの弧: いつも出すので、箱を横切らない道を通す。箱の下から段の間のすき間へ下り → すき間を横へ → 箱の無い縦の通り道を上 (下) へ →
 *   戻り先の段の上のすき間を横へ → 戻り先の上の辺の左寄りへ下りる (真ん中は木の線が入るので外す)。角は丸める。通り道が無ければ木の外側
 * - 進む線の横の棒: 同じ段で別の親の棒が横に重なると 1 本に見える (赤と灰が合流して見分けにくい) ので、重なる物は段を 1 つずつ上へずらす
 * 座標は全部ツリーの座標 (Vue Flow の倍率を掛ける前)
 */
import { BOX_H, BOX_W } from "../../../services/simulator/tree/tree-model";

export interface Pos { x: number; y: number }
/** 箱の下の辺 → 段のすき間 (手の札 +33〜+59 より上) */
const DOWN = 18;
/** 戻り先の上の辺 ← 段のすき間 (手の札より下、横の棒 -18 より上) */
const UP = 32;
/** 戻り先の上の辺のどこへ入れるか (左から。真ん中は木の線) */
const ENTER = 26;
/** 縦の通り道と箱の間 */
const CLEAR = 10;
const R = 8;

/** 縦の線 x が y0〜y1 の間で箱を通らないか (除く箱は自分と戻り先) */
function freeColumn(x: number, y0: number, y1: number, boxes: readonly Pos[]): boolean {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  return boxes.every((b) => x < b.x - CLEAR || x > b.x + BOX_W + CLEAR || b.y + BOX_H < lo || b.y > hi);
}
/** 横の線 y が x0〜x1 の間で箱を通らないか */
function freeRow(y: number, x0: number, x1: number, boxes: readonly Pos[]): boolean {
  const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
  return boxes.every((b) => y < b.y - 2 || y > b.y + BOX_H + 2 || b.x + BOX_W < lo || b.x > hi);
}

/** 角を丸めた折れ線 */
function rounded(pts: readonly Pos[]): string {
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]!, b = pts[i]!, c = pts[i + 1]!;
    const r1 = Math.min(R, Math.hypot(b.x - a.x, b.y - a.y) / 2), r2 = Math.min(R, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const u = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }, w = { x: Math.sign(c.x - b.x), y: Math.sign(c.y - b.y) };
    d += ` L ${b.x - u.x * r1} ${b.y - u.y * r1} Q ${b.x} ${b.y} ${b.x + w.x * r2} ${b.y + w.y * r2}`;
  }
  const z = pts[pts.length - 1]!;
  return `${d} L ${z.x} ${z.y}`;
}

/** 戻りの弧の道 (from の箱 → to の箱)。others = ほかの箱 (自分と戻り先は除いて渡す) */
export function backRoute(from: Pos, to: Pos, others: readonly Pos[]): string {
  const sx = from.x + ENTER, sy = from.y + BOX_H, yS = sy + DOWN;
  const tx = to.x + ENTER, ty = to.y, yT = ty - UP;
  // 縦の通り道の候補 = 箱の左右の端のすぐ外 + 自分・戻り先の入り口の真上。近い順に、縦と 2 本の横が箱を通らない物
  const xs = new Set<number>([sx, tx]);
  for (const b of [...others, from, to]) { xs.add(b.x - CLEAR - 4); xs.add(b.x + BOX_W + CLEAR + 4); }
  const all = [...others, from, to];
  const cand = [...xs].sort((a, z) => Math.abs(a - sx) + Math.abs(a - tx) - (Math.abs(z - sx) + Math.abs(z - tx)));
  const ok = (x: number): boolean => freeColumn(x, yS, yT, all) && freeRow(yS, sx, x, others) && freeRow(yT, x, tx, others);
  let col = cand.find(ok);
  if (col === undefined) {
    // 通り道が無い時は木の外側 (近い方)
    const minX = Math.min(...all.map((b) => b.x)) - 30, maxX = Math.max(...all.map((b) => b.x + BOX_W)) + 30;
    col = Math.abs(minX - sx) + Math.abs(minX - tx) <= Math.abs(maxX - sx) + Math.abs(maxX - tx) ? minX : maxX;
  }
  return rounded([{ x: sx, y: sy }, { x: sx, y: yS }, { x: col, y: yS }, { x: col, y: yT }, { x: tx, y: yT }, { x: tx, y: ty - 3 }]);
}

/**
 * 進む線の横の棒の段 (同じ高さで横に重なる棒を 1 段 10px ずつ上へ、3 段まで = 手の札に届かない)。spans = 親ごとの棒の [左, 右, 高さ]。返り値 = ずらす量 (上へ、px)
 */
export function busLevels(spans: ReadonlyArray<{ id: string; x0: number; x1: number; y: number }>): Map<string, number> {
  const out = new Map<string, number>();
  const rows = new Map<number, typeof spans[number][]>();
  for (const s of spans) { const k = Math.round(s.y); rows.set(k, [...(rows.get(k) ?? []), s]); }
  for (const list of rows.values()) {
    const lanes: Array<Array<[number, number]>> = [];
    for (const s of [...list].sort((a, z) => a.x0 - z.x0)) {
      let k = lanes.findIndex((l) => l.every(([a, b]) => s.x1 < a - 6 || s.x0 > b + 6));
      if (k < 0) { lanes.push([]); k = lanes.length - 1; }
      lanes[k]!.push([s.x0, s.x1]);
      out.set(s.id, Math.min(k, 2) * 10);
    }
  }
  return out;
}
