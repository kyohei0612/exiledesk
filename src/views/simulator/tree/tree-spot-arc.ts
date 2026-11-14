/**
 * tree-spot-arc.ts — 手の札に乗せた時の「ここへ行く」弧の矢印 (S-142j ③、スイッチ linkChipHover、開発版だけ・実験)。
 * 木の線の通り道を通らず、手の札から行き先の箱へ真っすぐ弧を描く (上へふくらむ)。色は ↩ = 青・同じ枠 = 緑。
 * 11-14 オーナー「ホバー時にグレーアウトでツリー内関係なく飛行機とかの説明よく使われる矢印？弧を描いた矢印でアニメーションつけてここにいくよーみたいな感じで」
 */
import { BOX_W } from "../../../services/simulator/tree/tree-model";

export interface SpotArc { id: string; back: boolean; d: string }

/**
 * 手の札の真ん中 (sx, sy) から箱 (左上 q・高さ h) への弧。箱が札の真下 (横に重なる) なら上の辺 (札より上なら下の辺) の真ん中へ、
 * そうでなければ札に近い方の横の辺の真ん中へ。ふくらみは 2 点の間の 0.25 倍 (40〜220) で、上の向き
 */
export function spotArc(sx: number, sy: number, q: { x: number; y: number }, h: number): string {
  const cx = q.x + BOX_W / 2;
  const [ex, ey] = Math.abs(cx - sx) < BOX_W / 2 ? [cx, q.y > sy ? q.y : q.y + h] : [cx < sx ? q.x + BOX_W : q.x, q.y + h / 2];
  const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1;
  // 2 点を結ぶ向きに直角な 2 つのうち、上 (y が小さい) へ向く方へふくらませる。真上・真下の時は右へ
  let nx = -dy / len, ny = dx / len;
  if (ny > 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny; }
  const bulge = Math.max(40, Math.min(220, len * 0.25));
  const mx = (sx + ex) / 2 + nx * bulge, my = (sy + ey) / 2 + ny * bulge;
  return `M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`;
}

/** 乗せた手の札の行き先の箱を照らし、ほかを暗くする CSS (描き面 key の中だけ)。src = 札の親の箱 */
export function spotCss(key: string, src: string, arcs: readonly SpotArc[]): string {
  if (!arcs.length) return "";
  const root = `[data-tree-canvas][data-spot="${key}"]`;
  const keep = [src, ...arcs.map((a) => a.id)].map((id) => `:not([data-id="${id}"])`).join("");
  const lit = arcs.map((a) => `${root} .vue-flow__node[data-id="${a.id}"] { filter: drop-shadow(0 0 10px ${a.back ? "rgba(95,208,224,0.95)" : "rgba(111,208,140,0.95)"}) brightness(1.15); }`);
  return [
    `${root} .vue-flow__node${keep} { opacity: 0.25; }`,
    `${root} [data-tree-lines] { opacity: 0.25; }`,
    `${root} [data-hand-of]:not([data-hand-of="${src}"]) { opacity: 0.25; }`,
    ...lit,
  ].join("\n");
}
