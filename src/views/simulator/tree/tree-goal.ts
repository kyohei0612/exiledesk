/**
 * tree-goal.ts — ツリーの一番上の「0 完成形の設定」の箱の置き場 (2026-10-22 オーナー「ツリー特化」)。
 * 0 の箱は木の形 (TreeDoc.boxes) の外: 回す・整列・精査・見本は今まで通りスタートの箱 (boxes.start) から。画面だけ Vue Flow に 1 つ足し、スタートの箱の真上に置く。
 * 中身は木のベース・アイテムレベル・レアリティ (start.rarity) と完成の狙い (memoAims)
 */
import { BOX_W, type TreeDoc } from "../../../services/simulator/tree/tree-model";

export const GOAL_ID = "goal";
/** 箱の高さ (スタートの箱より低い) と、スタートの箱との間 (線と矢印) */
export const GOAL_H = 84;
export const GOAL_GAP = 60;
/** 0 の箱の位置 (スタートの箱の真上) */
export function goalPos(d: TreeDoc): { x: number; y: number } {
  const st = d.boxes.start!;
  return { x: st.x, y: st.y - GOAL_H - GOAL_GAP };
}
/** 外枠に 0 の箱を足す (全体表示で一番上が切れない) */
export function withGoal(b: { x: number; y: number; w: number; h: number }, d: TreeDoc): { x: number; y: number; w: number; h: number } {
  const g = goalPos(d), x0 = Math.min(b.x, g.x), y0 = Math.min(b.y, g.y);
  return { x: x0, y: y0, w: Math.max(b.x + b.w, g.x + BOX_W) - x0, h: b.y + b.h - y0 };
}
