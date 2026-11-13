/**
 * tree-canvas-ctx.ts — 木の描き面 (TreeCanvas.vue) へ置き場 (SimTreePage) が渡す値と手の名前 (S-09c の区切り 1、11-14)。
 * 区切り 1 は切り出しだけなので、中身の型は置き場の物のまま (ここでは名前だけ決める)。区切り 2 で描き面ごとの作りを TreeCanvas へ移す時に型を付け直す
 */
export const CANVAS_KEYS = [
  "hand", "pageZ", "grid", "t", "lanes", "v", "sf", "doc", "panel", "plus", "backLabel", "viewOnly", "jt", "glowOf", "zoom", "tr100", "issueOf", "inv", "bd",
  "startDrag", "onAim", "onPlus", "removeHandOf", "clearBack", "onDone", "onFail", "openIssues", "goBack", "hoverBox", "shownEdges", "edgeHot", "rv", "posOf",
  "chipRoom", "passes", "startLink", "merged", "linesAll", "shown", "goIssue", "plusLine", "onPaneClick", "onNodeClick",
] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 区切り 1 は置き場の値をそのまま通すだけ (上の説明)
export type CanvasCtx = { [K in (typeof CANVAS_KEYS)[number]]: any };
