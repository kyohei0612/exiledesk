/**
 * use-gesture.ts — ツリーのページのマウスの扱いを 1 つの決まった作りに (2026-10-22 オーナー「クリックした時の挙動がおかしいし、長押しも、枠の移動も」)。
 * 押す → (遊び SLOP を超えて動いた / 長押し HOLD_MS) → 引っ張っている → 離す。超えずに離したら「押した」(tap)。
 * - 座標は拡大前の CSS ピクセル (html の zoom で割る、utils/zoom.ts)。dx・dy は押した所からの差
 * - 押した要素で pointer capture を取る (広告の iframe・窓の外で離しても「離した」が届く。前は届かず引っ張ったままになる事があった)
 * - pointercancel・capture を失った時は「やめた」(引っ張りを元に戻す)。pointerdown の既定の動き (文字選び・画像のドラッグ) は止める
 * - 左ボタンだけ。押せる物の中の別のボタン (data-gesture-skip) から始まった時は何もしない
 */
import { toCss } from "../../../utils/zoom";

/** 押したのか引っ張ったのかの遊び (CSS ピクセル。ツリーの倍率では割らない = 画面の上でいつも同じ) */
const SLOP = 5;
/** 長押しで引っ張り始めるまで */
export const HOLD_MS = 350;

interface GesturePoint { x: number; y: number; dx: number; dy: number; clientX: number; clientY: number }
interface GestureOpts {
  slop?: number;
  /** 長押しで引っ張り始める (無ければ長押しは無し) */
  holdMs?: number;
  /** 引っ張り始めた (遊びを超えた / 長押し) */
  onStart?: (p: GesturePoint) => void;
  /** 引っ張っている間 (始めた後だけ) */
  onMove?: (p: GesturePoint) => void;
  /** 引っ張って離した */
  onEnd?: (p: GesturePoint) => void;
  /** 引っ張らずに離した = 押した */
  onTap?: (p: GesturePoint) => void;
  /** やめた (pointercancel など。引っ張りを元に戻す) */
  onCancel?: () => void;
}

/** pointerdown から呼ぶ。返り値 = 途中でやめる関数 */
export function gesture(e: PointerEvent, o: GestureOpts): () => void {
  if (e.button !== 0) return () => {};
  e.preventDefault();
  const el = e.currentTarget instanceof Element ? e.currentTarget : (e.target as Element);
  const id = e.pointerId;
  try { el.setPointerCapture(id); } catch { /* 取れなくても window で受ける */ }
  const sx = e.clientX, sy = e.clientY, slop = o.slop ?? SLOP;
  let started = false, done = false, last = e;
  const at = (m: PointerEvent): GesturePoint => ({ x: toCss(m.clientX), y: toCss(m.clientY), dx: toCss(m.clientX - sx), dy: toCss(m.clientY - sy), clientX: m.clientX, clientY: m.clientY });
  const start = (m: PointerEvent): void => { if (started || done) return; started = true; o.onStart?.(at(m)); };
  const timer = o.holdMs ? window.setTimeout(() => start(last), o.holdMs) : 0;
  const move = (m: PointerEvent): void => {
    if (m.pointerId !== id) return;
    last = m;
    if (!started && Math.hypot(toCss(m.clientX - sx), toCss(m.clientY - sy)) > slop) start(m);
    if (started) o.onMove?.(at(m));
  };
  const finish = (): void => {
    done = true;
    clearTimeout(timer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    el.removeEventListener("lostpointercapture", lost);
    try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch { /* 無くてよい */ }
  };
  const up = (m: PointerEvent): void => {
    if (m.pointerId !== id || done) return;
    finish();
    if (started) o.onEnd?.(at(m)); else o.onTap?.(at(m));
  };
  const cancel = (m?: PointerEvent): void => {
    if ((m && m.pointerId !== id) || done) return;
    finish();
    if (started) o.onCancel?.();
  };
  // capture を失った時: 先に pointerup が来ていれば done。来ていなければやめた扱い
  const lost = (): void => { setTimeout(() => cancel(), 0); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  el.addEventListener("lostpointercapture", lost);
  return () => cancel();
}
