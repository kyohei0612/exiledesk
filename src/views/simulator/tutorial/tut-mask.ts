/**
 * tut-mask.ts — チュートリアルの灰色の幕の形 (tutorial.md T-30、shared-ui.md U-17 の 4・5)。
 * 画面いっぱいの幕から穴 (光る所・道の箱・結果) を抜いた形を SVG の path で返す。穴どうしが重なっても塗り直さないよう、
 * 穴の縁で画面を升目に切り、どの穴にも入らない升目だけを塗る (偶奇の塗りだと重なった所が灰色に戻った)
 */
export type Rect = { x: number; y: number; w: number; h: number };

/** 要素の四角 (zoom で割った fixed の座標) を `--lit-bleed` の幅だけ広げる (飾りの枠が穴の縁で切れないように、U-17 の 5) */
export function litRect(el: Element, z: number, pad = 0): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const b = (Number.parseFloat(getComputedStyle(el).getPropertyValue("--lit-bleed")) || 0) + pad;
  return { x: r.left / z - b, y: r.top / z - b, w: r.width / z + b * 2, h: r.height / z + b * 2 };
}
/** 四角を別の四角の中に切る (木の枠の外へ箱の穴がはみ出して帯を明るくしないように)。何も残らなければ null */
export function clipRect(a: Rect, f: Rect): Rect | null {
  const x = Math.max(a.x, f.x), y = Math.max(a.y, f.y), r = Math.min(a.x + a.w, f.x + f.w), b = Math.min(a.y + a.h, f.y + f.h);
  return r > x && b > y ? { x, y, w: r - x, h: b - y } : null;
}
const EDGE = 40;
const inAny = (rs: Rect[], x: number, y: number): boolean => rs.some((h) => x > h.x && x < h.x + h.w && y > h.y && y < h.y + h.h);
/** 四角の縁で W × H を升目に切り、fill が真の升目を塗った形 (SVG の d)。行ごとに横へつながる升目はまとめる */
function cellsPath(W: number, H: number, rs: Rect[], fill: (x: number, y: number) => boolean): string {
  // 画面の外まで EDGE 広げて塗る (縁をぼかすと画面の端が薄くなった)
  const x0 = -EDGE, x1 = W + EDGE, y0e = -EDGE, y1e = H + EDGE;
  const xs = [...new Set([x0, x1, ...rs.flatMap((h) => [h.x, h.x + h.w])].map((v) => Math.round(Math.min(x1, Math.max(x0, v)))))].sort((a, b) => a - b);
  const ys = [...new Set([y0e, y1e, ...rs.flatMap((h) => [h.y, h.y + h.h])].map((v) => Math.round(Math.min(y1e, Math.max(y0e, v)))))].sort((a, b) => a - b);
  let d = "";
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j]!, y1 = ys[j + 1]!, cy = (y0 + y1) / 2;
    let run: number | null = null;
    for (let i = 0; i < xs.length; i++) {
      const on = i < xs.length - 1 && fill((xs[i]! + xs[i + 1]!) / 2, cy);
      if (on && run === null) run = xs[i]!;
      if (!on && run !== null) { d += `M${run} ${y0}H${xs[i]}V${y1}H${run}Z`; run = null; }
    }
  }
  return d;
}
/** 幅 W・高さ H の幕から holes を抜いた形 (SVG の d) */
export const maskPath = (W: number, H: number, holes: Rect[]): string => cellsPath(W, H, holes, (x, y) => !inAny(holes, x, y));
/** 薄い幕の形: soft のどれかに入り、clear のどれにも入らない所 (完成形・道の箱のうち、今押す所と結果を除いた所。T-30 の光り方) */
export const softPath = (W: number, H: number, soft: Rect[], clear: Rect[]): string => cellsPath(W, H, [...soft, ...clear], (x, y) => inAny(soft, x, y) && !inAny(clear, x, y));
