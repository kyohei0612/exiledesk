/**
 * tree-row-tops.ts — 整列の行の高さを箱の本当の高さで詰める (スイッチ lineShort、10-28 夜オーナー「下に伸びる線とかれんしーから伸びる線同じでいいよ
 * 合わせるのはカレンシーから伸びる線の長さがちょうどいいななげーよ」)。前は行 = 深さ × 360 の決まった高さで、背の低い箱 (スタートなど) の下から
 * 手の札までの線が長く、札から下の箱までは短かった。
 * 行 r の上端 = 行 r − 1 の上端 + その行の一番背の高い箱 + LINK_Y (箱の下 → 札の上 40 + 札 40 + 札の下 → 枝分かれ 40 + 枝分かれ → 箱の上 40。
 * 10-28 夜オーナー「えだわかれするところもいっしょのながさにしてあげようかせますぎてもごちゃって見えるだけ」。札と枝分かれの高さは use-tree-edges)。
 * 行は親からの深さ (結果の箱はいつも親のすぐ下の行 = tidyUnder)。まだ描いていない箱の高さは見込み (画面が測ったら settleRows で行だけ直す)
 */
import type { TreeDoc } from "./tree-model";
import { flag } from "../../../web/release-flags";

/** 縦の線 1 本の長さ (箱 → 札・札 → 枝分かれ・枝分かれ → 箱) */
export const LINE_Y = 40;
export const LINK_Y = LINE_Y * 3 + 40;
/** 画面に描く前の箱の高さの見込み (カードに MOD が 2 行の結果の箱くらい) */
export const EST_H = 230;

/** 箱ごとの行 (深さ) */
export function depthRows(d: TreeDoc): Map<string, number> {
  const rows = new Map<string, number>();
  // まとめて描かない箱 (案 A、tree-merge-open の mergedAway と同じ判定) は行に数えない
  const away = (id: string): boolean => { const c = d.boxes[id]; return !!c && flag("mergeOpen") && !!c.merged && !!c.autoBack && !c.hand && !!c.back && !!d.boxes[c.back]; };
  const down = (id: string, r: number): void => { if (rows.has(id) || !d.boxes[id] || away(id)) return; rows.set(id, r); for (const k of d.boxes[id]!.outs) down(k, r + 1); };
  down("start", 0);
  return rows;
}
/** 行ごとの上端 (始まりの箱の上端を 0) */
export function rowTops(rows: ReadonlyMap<string, number>, heightOf: (id: string) => number): number[] {
  const tall: number[] = [];
  for (const [id, r] of rows) tall[r] = Math.max(tall[r] ?? 0, heightOf(id));
  const tops = [0];
  for (let r = 1; r < tall.length; r++) tops[r] = tops[r - 1]! + (tall[r - 1] ?? EST_H) + LINK_Y;
  return tops;
}
/** 最後に整列で置いた行の上端 (画面が測った高さで直す時に、整列のまま動かしていない箱だけを動かす) */
let laid: { start: number; tops: number[] } | null = null;
export function noteLaid(start: number, tops: number[]): void { laid = { start, tops }; }
/**
 * 描いた後の本当の高さで行の上端を直す。整列で置いたままの箱 (その行の上端にいる箱) だけ動かす。動かしたら true。
 * 人が引っ張った箱・整列していない木は触らない
 */
export function settleRows(d: TreeDoc, heightOf: (id: string) => number): boolean {
  if (!laid || !d.boxes.start) return false;
  const rows = depthRows(d), tops = rowTops(rows, heightOf), base = d.boxes.start.y;
  if (Math.abs(base - laid.start) > 1) return false;
  let moved = false;
  for (const [id, r] of rows) {
    const b = d.boxes[id]!, was = laid.tops[r], now = tops[r];
    if (was == null || now == null || Math.abs(b.y - (base + was)) > 2 || Math.abs(now - was) <= 2) continue;
    b.y = base + now;
    moved = true;
  }
  laid = { start: base, tops };
  return moved;
}
