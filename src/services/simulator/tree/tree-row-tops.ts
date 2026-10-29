/**
 * tree-row-tops.ts — 箱の縦の置き場を、縦の線が全部同じ長さになるように決める (スイッチ lineShort、S-68)。
 * 10-28 夜オーナー「下に伸びる線とかれんしーから伸びる線同じでいいよ…なげーよ」「えだわかれするところもいっしょのながさに」
 * 「整列前からそもそもそういう普通に設定してくれ。カレンしー、枝、カレンシーから伸びる線全て同じ長さで今のカレンシーから次の枠までの長さに統一せよ」。
 * 前は行 = 深さ × 360 の決まった高さ (整列の時だけ詰めた) で、開いた木・背の低い箱の下の線が長かった。
 * 子の箱の上端 = 親の箱の本当の下端 + LINE_Y (箱 → 手の札) + 札 + LINE_Y (札 → 枝分かれ、枝分かれが無ければ札 → 箱) + (枝分かれがあれば) LINE_Y (枝分かれ → 箱)。
 * 札と枝分かれの高さは use-tree-edges が同じ式で引く。画面は木を開いた時・手を足した時・箱の高さが変わった時にいつも掛け直す (use-row-settle、1 つ戻すには入れない)
 */
import { BOX_W, type TreeBox, type TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";
import { foldOuts, stripFolds, stripHidden } from "./tree-strip-fold";

/** 縦の線 1 本の長さ (箱 → 札・札 → 枝分かれ・枝分かれ → 箱、枝分かれの無い時は札 → 箱) */
export const LINE_Y = 48;
/** 手の札の高さ (tree-lines の CHIP_HALF × 2) */
export const CHIP_Y = 40;
/** 整列の行の見込みの間 (整列の後に settleRows が親ごとに掛け直す) */
export const LINK_Y = LINE_Y * 3 + CHIP_Y;
/** 画面に描く前の箱の高さの見込み (カードに MOD が 2 行の結果の箱くらい) */
export const EST_H = 230;

/** まとめて描かない箱 (案 A、tree-merge-open の mergedAway と同じ判定) */
const depthOf = (d: TreeDoc, id: string): number => { let n = 0; for (let b = d.boxes[id]; b?.parent; b = d.boxes[b.parent]) n++; return n; };
const away = (d: TreeDoc, c: TreeBox | undefined): boolean => !!c && flag("mergeOpen") && !!c.merged && !!c.autoBack && !c.hand && !!c.back && !!d.boxes[c.back] && depthOf(d, c.id) === depthOf(d, c.back);
/** 描く子 (まとめた箱はまとめ先へ線が行くので数えない。畳んだ消去の直線は札から最後の箱へ、S-28b) */
export const drawnKids = (d: TreeDoc, b: TreeBox): string[] => foldOuts(d, b).filter((o) => d.boxes[o] && !away(d, d.boxes[o]));
/** 横の枝分かれを描くか (線の行き先が 2 つ以上、まとめ先への線を含む) */
export const branches = (d: TreeDoc, b: TreeBox): boolean => new Set(b.outs.map((o) => (away(d, d.boxes[o]) ? d.boxes[o]!.back! : o))).size > 1;
/** 親の下端から子の上端まで */
export const gapBelow = (d: TreeDoc, b: TreeBox): number => LINE_Y + CHIP_Y + LINE_Y + (branches(d, b) ? LINE_Y : 0);

/** 箱ごとの行 (深さ)。「n 段目」の数え */
export function depthRows(d: TreeDoc): Map<string, number> {
  const rows = new Map<string, number>();
  const down = (id: string, r: number): void => { if (rows.has(id) || !d.boxes[id] || away(d, d.boxes[id])) return; rows.set(id, r); for (const k of d.boxes[id]!.outs) down(k, r + 1); };
  down("start", 0);
  return rows;
}
/** 描く段 (畳んだ消去の直線の隠した箱は段を取らず、最後の箱は札の次の段、S-28b)。畳んだ物が無ければ depthRows と同じ */
function drawRows(d: TreeDoc): Map<string, number> {
  const folds = stripFolds(d);
  if (!folds.size) return depthRows(d);
  const hidden = stripHidden(d, folds), rows = new Map<string, number>();
  const down = (id: string, r: number): void => { if (rows.has(id) || !d.boxes[id] || away(d, d.boxes[id])) return; rows.set(id, r); for (const k of foldOuts(d, d.boxes[id]!, folds, hidden)) down(k, r + 1); };
  down("start", 0);
  return rows;
}
/** 整列の行ごとの上端の見込み (始まりの箱の上端を 0)。本当の置き場は settleRows が親ごとに掛け直す */
export function rowTops(rows: ReadonlyMap<string, number>, heightOf: (id: string) => number): number[] {
  const tall: number[] = [];
  for (const [id, r] of rows) tall[r] = Math.max(tall[r] ?? 0, heightOf(id));
  const tops = [0];
  for (let r = 1; r < tall.length; r++) tops[r] = tops[r - 1]! + (tall[r - 1] ?? EST_H) + LINK_Y;
  return tops;
}
/** 前の作りの名残 (整列が呼ぶ。今は何もしない) */
export function noteLaid(_start: number, _tops: number[]): void { /* settleRows が親ごとに掛け直す */ }
/** 段ごとの決め: 上の枠の高さ・一番下の枠・枝分かれがあるか (同じ段の札も揃える) */
export interface RowLayout { rows: Map<string, number>; top: number[]; bottom: number[]; branch: boolean[] }
/**
 * 段を揃える (10-28 夜オーナー「段を合わせて欲しいな今横のラインが気持ちよくない…一番下枠が出ているものに合わせてそこを起点として次の段の位置を決める。
 * 決め方は枠の上枠で決めて線を調整・オーブの位置までそろえたい」): 同じ段 (深さ) の箱は上の枠を揃え、次の段の上の枠 = その段の一番下の枠 + 48 + 札 + 48
 * (+ その段に枝分かれがあれば 48)。札もその段の一番下の枠 + 48 に揃う (背の低い箱から札までは長くなってよい)
 */
export function rowLayout(d: TreeDoc, heightOf: (id: string) => number): RowLayout {
  const rows = drawRows(d), top: number[] = [], bottom: number[] = [], branch: boolean[] = [];
  const by: string[][] = [];
  for (const [id, r] of rows) (by[r] ??= []).push(id);
  top[0] = d.boxes.start?.y ?? 0;
  for (let r = 0; r < by.length; r++) {
    const ids = by[r] ?? [];
    bottom[r] = Math.max(top[r]!, ...ids.map((id) => top[r]! + (d.boxes[id]!.out === "pass" ? 0 : heightOf(id))));
    branch[r] = ids.some((id) => d.boxes[id]!.out !== "pass" && branches(d, d.boxes[id]!));
    top[r + 1] = Math.round(bottom[r]! + LINE_Y + CHIP_Y + LINE_Y + (branch[r] ? LINE_Y : 0));
  }
  return { rows, top, bottom, branch };
}
/** 統合の線の横の区間を通す高さ (段の一番下の枠と札の間の真ん中。どの段も同じ形なので、線を横切る縦の線の上下が揃う) */
export const laneYs = (L: RowLayout): number[] => L.bottom.map((b, r) => (L.top[r + 1] != null ? b + LINE_Y / 2 : NaN)).filter((y) => Number.isFinite(y));
/**
 * 箱の縦の置き場を掛け直す: 同じ段の上の枠を揃える (rowLayout、始まりの箱の y は動かさない、x は触らない)。動かしたら true
 */
export function settleRows(d: TreeDoc, heightOf: (id: string) => number): boolean {
  if (!d.boxes.start) return false;
  const L = rowLayout(d, heightOf);
  let moved = false;
  for (const [id, r] of L.rows) {
    if (id === "start") continue;
    const b = d.boxes[id]!, y = L.top[r]!;
    if (Math.abs(b.y - y) > 0.5) { b.y = y; moved = true; }
  }
  return moved;
}

/** 箱どうしの横の間 (重なりとみなす) */
const ROOM_X = 24;
/**
 * 合流した箱を合流した親たちの真ん中へ (10-28 夜オーナー「この場合真ん中が良いなスタートと同じ立てれるがいいその方が綺麗」、S-66)。
 * 親たち = 合流した箱の親とまとめた箱の親。その横の範囲の真ん中に置き、下の箱も一緒に動かす。
 * 真ん中に同じ段のほかの箱があってぶつかる時は動かさない (今の位置のまま)。動かしたら true
 */
export function centerMerged(d: TreeDoc): boolean {
  let moved = false;
  for (const t of Object.values(d.boxes)) {
    const into = Object.values(d.boxes).filter((b) => b.back === t.id && away(d, b));
    if (!into.length || !t.parent) continue;
    const ps = [t.parent, ...into.map((b) => b.parent!)].map((id) => d.boxes[id]).filter((p): p is TreeBox => !!p);
    const cs = ps.map((p) => p.x + BOX_W / 2), x = Math.round((Math.min(...cs) + Math.max(...cs)) / 2 - BOX_W / 2), dx = x - t.x;
    if (Math.abs(dx) < 1) continue;
    const sub = new Set<string>();
    const down = (id: string): void => { if (sub.has(id)) return; sub.add(id); for (const k of drawnKids(d, d.boxes[id]!)) down(k); };
    down(t.id);
    const hit = Object.values(d.boxes).some((o) => !sub.has(o.id) && !away(d, o) && sub.has(o.id) === false && [...sub].some((id) => { const b = d.boxes[id]!; return Math.abs(o.y - b.y) < 2 && o.x < b.x + dx + BOX_W + ROOM_X && b.x + dx < o.x + BOX_W + ROOM_X; }));
    if (hit) continue;
    for (const id of sub) d.boxes[id]!.x += dx;
    moved = true;
  }
  return moved;
}
