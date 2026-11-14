/**
 * tree-spot-arc.ts — 手の札に乗せた時の「ここへ行く」弧の矢印 (S-142j ③、スイッチ linkChipHover、開発版だけ・実験)。
 * 木の線の通り道を通らず、手の札の上の辺から行き先の箱の下の辺へ弧を描く。色は ↩ = 青・同じ枠 = 緑。
 * 11-14 オーナー「ホバー時にグレーアウトでツリー内関係なく飛行機とかの説明よく使われる矢印？弧を描いた矢印でアニメーションつけてここにいくよーみたいな感じで」
 */
import { BOX_W } from "../../../services/simulator/tree/tree-model";

export interface SpotArc { id: string; back: boolean; d: string }

/**
 * 手の札の上の辺の出口 (sx, sy) から箱 (左上 q・高さ h) への弧 (11-14 オーナー「弧のルールもうちょい練った方が良いかもね」→ 決まり 1〜5、ブラック 107 経由):
 * 着く所はいつも行き先の箱の一番下の真ん中 (箱が札より下にある時だけ上の辺の真ん中)。3 次の曲線で、出口は真上 (下の箱へは真下) へ出て、
 * 着く所では辺に直角に入る (矢じりがいつも箱へ真っすぐ)。ふくらみの強さは縦の差の 0.4 倍 (40〜160) で全部同じ決まり。
 * 出口を行き先の左右の順に並べるので (呼ぶ側)、同じ札から出る弧どうしは交わらない
 */
export function spotArc(sx: number, sy: number, q: { x: number; y: number }, h: number): string {
  const down = q.y > sy, ex = q.x + BOX_W / 2, ey = down ? q.y : q.y + h;
  const d = Math.max(40, Math.min(160, Math.abs(ey - sy) / 2.5)) * (down ? 1 : -1);
  return `M ${sx} ${sy} C ${sx} ${sy + d} ${ex} ${ey - d} ${ex} ${ey}`;
}

/** 照らす物 (箱の id と色。back = ↩ の青、そうでなければ同じ枠の緑) */
export interface SpotLit { id: string; back: boolean }

const glow = (back: boolean): string => `drop-shadow(0 0 10px ${back ? "rgba(95,208,224,0.95)" : "rgba(111,208,140,0.95)"}) brightness(1.15)`;
/**
 * 乗せた手の札に関わる物を照らし、ほかを暗くする CSS (描き面 key の中だけ)。
 * boxes = 照らす箱 (乗せた札の元の箱・行き先の箱・同じ行き先を指すほかの手の札の元の箱)、chips = 照らす手の札 (乗せた札と、同じ行き先を指すほかの札。札の印は元の箱の id)。
 * 11-14 オーナー「その範囲で全部ライトアップして」(前は行き先の箱だけ光らせ、元の箱は暗くしないだけ・同じ行き先を指すほかの札は暗くしていた)
 */
export function spotCss(key: string, boxes: readonly SpotLit[], chips: readonly SpotLit[]): string {
  if (!boxes.length) return "";
  const root = `[data-tree-canvas][data-spot="${key}"]`;
  const keepB = boxes.map((b) => `:not([data-id="${b.id}"])`).join(""), keepC = chips.map((c) => `:not([data-hand-of="${c.id}"])`).join("");
  return [
    `${root} .vue-flow__node${keepB} { opacity: 0.25; }`,
    `${root} [data-tree-lines] { opacity: 0.25; }`,
    `${root} [data-hand-of]${keepC} { opacity: 0.25; }`,
    ...boxes.map((b) => `${root} .vue-flow__node[data-id="${b.id}"] { filter: ${glow(b.back)}; }`),
    ...chips.map((c) => `${root} [data-hand-of="${c.id}"] { filter: ${glow(c.back)}; }`),
  ].join("\n");
}
