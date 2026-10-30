/**
 * tree-model-layout.ts — 箱の配置の小物 (tree-model.ts から分けた、1 ファイル 500 行まで、10-28)。中身は前のまま。呼ぶ所は tree-model の出し直しから
 */
import { BOX_H, BOX_W, GAP_X, GAP_Y, subtree, type TreeBox, type TreeDoc } from "./tree-model";

/** 矢印の先の箱を親の下に並べ直す (子の下の箱も一緒に動かす) */
export function spread(d: TreeDoc, parentId: string): void {
  const p = d.boxes[parentId];
  if (!p) return;
  const n = p.outs.length;
  p.outs.forEach((id, i) => {
    const b = d.boxes[id]!;
    const x = p.x + (i - (n - 1) / 2) * GAP_X, y = p.y + GAP_Y;
    shift(d, id, x - b.x, y - b.y);
  });
}

/** 重なりとみなす箱の間 (横の＋が 14px はみ出すので、それより広く) */
export const ROOM = 24;
/**
 * 足した結果の箱 (親の下の並び) が既にある箱と重なる時は、足した側の並びだけを横にずらして空いた所へ置く (オーナー 10-22
 * 「箱を追加した時に枠が他の箱とかぶったりするから、都度調整してあげて」)。既にある箱 (手で動かした物も) は動かさない
 */
export function makeRoom(d: TreeDoc, parentId: string): void {
  const p = d.boxes[parentId];
  if (!p?.outs.length) return;
  const mine = new Set(p.outs.flatMap((o) => subtree(d, o)));
  const others = Object.values(d.boxes).filter((b) => !mine.has(b.id));
  const hit = (dx: number): boolean => [...mine].some((id) => {
    const b = d.boxes[id]!;
    return others.some((o) => Math.abs(b.x + dx - o.x) < BOX_W + ROOM && Math.abs(b.y - o.y) < BOX_H + ROOM);
  });
  if (hit(0)) for (let k = 1, done = false; k <= 200 && !done; k++) for (const dx of [k * 20, -k * 20]) if (!hit(dx)) { for (const id of p.outs) shift(d, id, dx, 0); done = true; break; }
  slideSiblings(d, parentId);
}

/**
 * 子の並びの真上 (親の段) に別の箱があれば、その箱とその下を横へ滑らせる (右の箱は右へ、左の箱は左へ。その先の同じ段の箱も一緒に)。
 * 親の真下に別の親の箱を置かない (S-68b、10-28 深夜オーナー「右のハズレMDOｓ１は下の縦ラインにかさなっちゃだめだよね」)
 */
function slideSiblings(d: TreeDoc, parentId: string, hidden: (b: TreeBox) => boolean = () => false): boolean {
  const p = d.boxes[parentId]!;
  const kids = p.outs.map((o) => d.boxes[o]!).filter((k) => k && !hidden(k));
  if (!kids.length) return false;
  const x0 = Math.min(...kids.map((k) => k.x)) - ROOM, x1 = Math.max(...kids.map((k) => k.x)) + BOX_W + ROOM;
  const up = new Set<string>();
  for (let x: string | null = parentId; x; x = d.boxes[x]?.parent ?? null) up.add(x);
  const row = Object.values(d.boxes).filter((b) => b.id !== parentId && !up.has(b.id) && !hidden(b) && Math.abs(b.y - p.y) < BOX_H);
  const right = row.filter((b) => b.x > p.x).sort((a, z) => a.x - z.x), left = row.filter((b) => b.x < p.x).sort((a, z) => z.x - a.x);
  const r = right[0], l = left[0];
  const dr = r && r.x < x1 ? x1 - r.x : 0, dl = l && l.x + BOX_W > x0 ? l.x + BOX_W - x0 : 0;
  // 同じ段のその先の箱も同じだけ (間を変えない)。下の段は箱ごと一緒に動く (shift)
  if (dr) for (const b of right) shift(d, b.id, dr, 0);
  if (dl) for (const b of left) shift(d, b.id, -dl, 0);
  if (dr || dl) pushRight(d);
  return !!(dr || dl);
}
/**
 * 重なっている箱を右へ押す (押すのは重なった右側の箱とその下だけ、ほかは動かさない)。横に当たりを足した時 (オーナー 10-22「箱を追加した時に枠が他の箱とかぶる」)
 */
export function pushRight(d: TreeDoc): void {
  for (let n = 0; n < 400; n++) {
    const bs = Object.values(d.boxes);
    let moved = false;
    for (const a of bs) {
      const b = bs.find((x) => x !== a && (x.x > a.x || (x.x === a.x && x.id > a.id)) && x.x - a.x < BOX_W + ROOM && Math.abs(x.y - a.y) < BOX_H + ROOM);
      if (b) { shift(d, b.id, a.x + BOX_W + ROOM - b.x, 0); moved = true; break; }
    }
    if (!moved) return;
  }
}

/** 箱とその下を一緒にずらす */
export function shift(d: TreeDoc, id: string, dx: number, dy: number): void {
  if (!dx && !dy) return;
  for (const x of subtree(d, id)) { const b = d.boxes[x]!; b.x += dx; b.y += dy; }
}

export function moveBox(d: TreeDoc, id: string, x: number, y: number): void {
  const b = d.boxes[id];
  if (b) { b.x = Math.round(x); b.y = Math.round(y); }
}

/** 箱の並びの外枠 (画面の広さ・一望の縮め方) */
export function boundsOf(d: TreeDoc): { x: number; y: number; w: number; h: number } {
  const bs = Object.values(d.boxes);
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + BOX_W)), y1 = Math.max(...bs.map((b) => b.y + BOX_H));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
