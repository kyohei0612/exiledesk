/**
 * anchor-place.ts — アイコンを軸に物を出す時の位置 (カード・お告げの欄で共通。2026-10-10 オーナー「座標を統一、上下左右で距離が違うと気持ち悪い、
 * カードは右上の距離が一番ちょうどいい」)。
 * 距離はどの向きでも同じ: 横 GAP_X、縦 GAP_Y。入らない向きは同じ距離のまま裏返す (右 → 左、上 → 下 / 下 → 上)。座標は CSS px
 */
export const GAP_X = 4;
export const GAP_Y = 6;
export type Box = { left: number; right: number; top: number; bottom: number };

/** 横: アイコンの右 (入らなければ左)。edge = 画面の端からの余白 */
export function sideOf(box: Box, w: number, vw: number, edge: number): number {
  const right = box.right + GAP_X;
  return right + w + edge <= vw ? right : Math.max(edge, box.left - w - GAP_X);
}
/** 縦: prefer の向き (上 / 下) に出し、入らなければ逆へ。どちらも入らなければ画面の中に収める */
export function verticalOf(box: Box, h: number, vh: number, edge: number, prefer: "above" | "below"): number {
  const above = box.top - h - GAP_Y, below = box.bottom + GAP_Y;
  const fitsAbove = above >= edge, fitsBelow = below + h + edge <= vh;
  if (prefer === "above") return fitsAbove ? above : fitsBelow ? below : Math.max(edge, vh - h - edge);
  return fitsBelow ? below : fitsAbove ? above : Math.max(edge, vh - h - edge);
}
