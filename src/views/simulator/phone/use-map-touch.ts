/**
 * use-map-touch.ts — スマホの見るだけの全体図の指の動き (S-94c。オーナー 11-01「この画面に拡大したら…」)。
 * 1 本の指で送る・2 本でつまむ・動かさず離すと押した事にする。PC の細い窓で触れるようホイールでも拡大する。
 * 倍率 k と送り tx・ty だけを持ち、木の座標 (x, y) は画面の (x * k + tx, y * k + ty) に出る
 */
import { ref, type Ref } from "vue";

/** ここまで動かしたら押したのではなく送った (指の遊び) */
const SLOP = 8;
/** 一番大きい倍率 (箱の幅 316px がそのまま) */
const MAX_K = 1;
/** 寄る動きの長さ */
const GLIDE_MS = 220;
/** 全体に合わせた倍率の上限 (箱が少ない木で箱が枠いっぱいに膨らまないよう、幅 64px まで。PhoneMap と同じ) */
const FIT_MAX = 64 / 316;

export type MapBounds = { x: number; y: number; w: number; h: number };

export function useMapTouch(el: Ref<HTMLElement | null>, onTap: (px: number, py: number) => void, onMoved: () => void) {
  const k = ref(0.1), tx = ref(0), ty = ref(0);
  /** 全体に合わせた倍率 (これより小さくしない) */
  let minK = 0.05, box: MapBounds = { x: 0, y: 0, w: 1, h: 1 };
  const pts = new Map<number, { x: number; y: number }>();
  let moved = false, startX = 0, startY = 0, pinchD = 0, glide = 0;
  const size = (): { w: number; h: number } => ({ w: el.value?.clientWidth ?? 1, h: el.value?.clientHeight ?? 1 });
  const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => { const r = el.value!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  /** 木が枠の外へ全部出てしまわないよう、枠の半分までに止める */
  function clamp(): void {
    const { w, h } = size();
    tx.value = Math.min(w / 2 - box.x * k.value, Math.max(w / 2 - (box.x + box.w) * k.value, tx.value));
    ty.value = Math.min(h / 2 - box.y * k.value, Math.max(h / 2 - (box.y + box.h) * k.value, ty.value));
  }
  /** 画面の (px, py) を動かさず倍率を nk へ */
  function zoomAt(nk: number, px: number, py: number): void {
    const z = Math.min(MAX_K, Math.max(minK, nk));
    tx.value = px - ((px - tx.value) / k.value) * z;
    ty.value = py - ((py - ty.value) / k.value) * z;
    k.value = z;
    clamp();
  }
  /** 全体を枠に合わせる (b は箱のある範囲) */
  function fit(b: MapBounds): void {
    box = b;
    const { w, h } = size(), PAD = 12;
    const z = Math.min((w - PAD * 2) / Math.max(1, b.w), (h - PAD * 2) / Math.max(1, b.h), FIT_MAX);
    minK = z; k.value = z;
    tx.value = (w - b.w * z) / 2 - b.x * z;
    ty.value = (h - b.h * z) / 2 - b.y * z;
  }
  /** 木の (x, y) を枠の真ん中へ、倍率 nk まで滑らかに寄る */
  function glideTo(x: number, y: number, nk: number): void {
    cancelAnimationFrame(glide);
    const { w, h } = size(), k0 = k.value, x0 = (w / 2 - tx.value) / k0, y0 = (h / 2 - ty.value) / k0, z = Math.min(MAX_K, Math.max(minK, nk)), t0 = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - t0) / GLIDE_MS), e = 1 - (1 - p) * (1 - p);
      k.value = k0 + (z - k0) * e;
      tx.value = w / 2 - (x0 + (x - x0) * e) * k.value;
      ty.value = h / 2 - (y0 + (y - y0) * e) * k.value;
      if (p < 1) glide = requestAnimationFrame(step); else clamp();
    };
    glide = requestAnimationFrame(step);
  }
  const gap = (): number => { const [a, b] = [...pts.values()]; return Math.hypot(a!.x - b!.x, a!.y - b!.y); };
  function down(e: PointerEvent): void {
    cancelAnimationFrame(glide);
    el.value?.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    if (pts.size === 1) { moved = false; startX = e.clientX; startY = e.clientY; }
    if (pts.size === 2) { moved = true; pinchD = gap(); }
  }
  function move(e: PointerEvent): void {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const n = local(e), dx = n.x - p.x, dy = n.y - p.y;
    if (pts.size === 1) {
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < SLOP) return;
      if (!moved) onMoved();
      moved = true;
      tx.value += dx; ty.value += dy;
      clamp();
      pts.set(e.pointerId, n);
      return;
    }
    pts.set(e.pointerId, n);
    if (pts.size !== 2) return;
    const [a, b] = [...pts.values()], d = gap();
    onMoved();
    // つまんだ真ん中を動かさず、2 本の指で一緒に送った分も足す
    zoomAt(k.value * (d / (pinchD || d)), (a!.x + b!.x) / 2, (a!.y + b!.y) / 2);
    tx.value += dx / 2; ty.value += dy / 2;
    clamp();
    pinchD = d;
  }
  function up(e: PointerEvent): void {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (p && !pts.size && !moved) onTap(p.x, p.y);
  }
  function cancel(e: PointerEvent): void { pts.delete(e.pointerId); moved = true; }
  function wheel(e: WheelEvent): void { const p = local(e); onMoved(); zoomAt(k.value * (e.deltaY < 0 ? 1.2 : 1 / 1.2), p.x, p.y); }
  return { k, tx, ty, fit, glideTo, handlers: { pointerdown: down, pointermove: move, pointerup: up, pointercancel: cancel, wheel } };
}
