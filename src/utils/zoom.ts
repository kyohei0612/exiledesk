/**
 * zoom.ts — アプリ全体の拡大 (App.vue の fitZoom) の補正 (2026-09-26)
 *
 * html に zoom を掛けているので、マウスの座標 (clientX / clientY) と窓の大きさ (innerWidth / innerHeight) は実ピクセル、
 * position: fixed の left / top は拡大前の CSS ピクセルになる。そのまま使うとツールチップが拡大率ぶん右下にずれる
 * (2560 幅でマウス 849 → ツールチップ 1337)。実ピクセル → CSS ピクセルはこれで割る
 */
export function pageZoom(): number {
  if (typeof document === "undefined") return 1;
  return parseFloat(document.documentElement.style.zoom || "1") || 1;
}
/** 実ピクセル → 拡大前の CSS ピクセル */
export function toCss(px: number): number {
  return px / pageZoom();
}
