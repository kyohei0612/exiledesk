/**
 * use-turn-touch.ts — 「横向きで表示」(U-53d、頁を 90 度回す utils/turn-page.ts) の間の、木の枠の指の受け口 (S-94l、11-18 オーナー
 * 「ツリー内をスマホで動かすとめっちゃ挙動変」「UIはそのままでスマホ仕様で動作はさせたい」)。
 * Vue Flow (d3-zoom) は指の位置を画面の座標で読むので、回した頁では引く向きが 90 度ずれ、つまむ中心もずれた。
 * 回している間だけ木の枠で指を先に受け (d3 へは渡さない)、指の位置を頁の座標へ戻して (unturnPoint) 1 本指は動かす・2 本指は動かす + つまむで大きさを替える。
 * 叩く (手の札・箱を押す) は止めない (touchstart・touchend は既定のまま = click が出る)。回していない時は何もしない (今の d3 のまま)
 */
import { turned, unturnPoint, unturnRect } from "../../../utils/turn-page";

type Pt = { x: number; y: number };
export interface TurnTouchView { vp: () => { x: number; y: number; zoom: number }; put: (x: number, y: number, zoom: number) => unknown; pageZ: () => number; min: () => number; max: () => number }

const mid = (ps: readonly Pt[]): Pt => ({ x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length });
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** el = 木の枠 (data-tree-canvas)。外す関数を返す */
export function attachTurnTouch(el: HTMLElement, v: TurnTouchView): () => void {
  let pts = new Map<number, Pt>();
  const read = (e: TouchEvent): Map<number, Pt> => { const m = new Map<number, Pt>(); for (const t of Array.from(e.touches)) m.set(t.identifier, unturnPoint(t.clientX, t.clientY)); return m; };
  const start = (e: TouchEvent): void => { if (!turned.value) return; e.stopPropagation(); pts = read(e); };
  const move = (e: TouchEvent): void => {
    if (!turned.value) return;
    e.stopPropagation();
    const next = read(e), ids = [...next.keys()].filter((id) => pts.has(id));
    if (!ids.length) { pts = next; return; }
    e.preventDefault();
    const a = ids.map((id) => pts.get(id)!), b = ids.map((id) => next.get(id)!), vp = v.vp(), k = v.pageZ();
    let zoom = vp.zoom;
    if (a.length >= 2 && dist(a[0]!, a[1]!) > 0) zoom = Math.min(v.max(), Math.max(v.min(), vp.zoom * (dist(b[0]!, b[1]!) / dist(a[0]!, a[1]!))));
    // 指の真ん中の下の木の点が、動いた後の指の真ん中の下に来るように (枠の中は頁の px × pageZ)
    const r = unturnRect(el.getBoundingClientRect()), ca = mid(a), cb = mid(b);
    const fx = ((ca.x - r.left) * k - vp.x) / vp.zoom, fy = ((ca.y - r.top) * k - vp.y) / vp.zoom;
    void v.put((cb.x - r.left) * k - fx * zoom, (cb.y - r.top) * k - fy * zoom, zoom);
    pts = next;
  };
  const end = (e: TouchEvent): void => { if (!turned.value) return; e.stopPropagation(); pts = read(e); };
  el.addEventListener("touchstart", start, { capture: true, passive: true });
  el.addEventListener("touchmove", move, { capture: true, passive: false });
  el.addEventListener("touchend", end, { capture: true, passive: true });
  el.addEventListener("touchcancel", end, { capture: true, passive: true });
  return () => {
    el.removeEventListener("touchstart", start, { capture: true });
    el.removeEventListener("touchmove", move, { capture: true });
    el.removeEventListener("touchend", end, { capture: true });
    el.removeEventListener("touchcancel", end, { capture: true });
  };
}
