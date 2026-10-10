import { nextTick } from "vue";
import { toCss } from "./zoom";

/**
 * スクロールまわりの共通の部品 (2026-10-10 オーナー「全体コード整理、スクロール周り余分な奴とか重複」で 1 か所に):
 *   - scrollBoxOf: 送っている枠を探す
 *   - keepPlace / keepTopOf: 中身が伸び縮みしても、押した物を画面の同じ高さに残す (一気に戻す = 見た目は動かない)
 *   - scrollToTop / glideBy: 見える所へ送る時は、いつも同じ速さでぬるっと (ブラウザ任せの smooth と混ぜない)
 */

/** el を送っている枠 (overflow が auto / scroll で、中身があふれている一番近い親)。無ければ null = ページ全体 (スマホ) */
export function scrollBoxOf(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** el の画面の高さを before に戻す (枠ごとに一気に。見た目は動かない) */
export function keepTopOf(el: Element, before: number): void {
  if (!el.isConnected) return;
  // 位置の差は画面の座標 (拡大率込み)、スクロール量は CSS の px なので換算する (2026-10-10 点検: 拡大率の分だけ行き過ぎていた)
  const d = toCss(el.getBoundingClientRect().top - before);
  if (Math.abs(d) > 1) (scrollBoxOf(el) ?? window).scrollBy({ top: d, behavior: "instant" as ScrollBehavior });
}

/**
 * 押した物を画面の同じ高さに残したまま中身を変える (2026-10-09 オーナー「スマホ版は上に戻らないといけない仕組みは用意しないで、
 * MOD とか選んで設定が戻って上にとかだるい」)。上の方が伸び縮みしても、押した行が画面の外へ流れない。
 * iOS Safari は CSS の scroll anchoring (overflow-anchor) が無いので手で直す。PC は画面の中の枠、スマホはページを送る
 */
export function keepPlace(el: Element | null | undefined, change: () => void): void {
  const before = el?.getBoundingClientRect().top;
  change();
  if (before == null || !el) return;
  void nextTick(() => keepTopOf(el, before));
}

/**
 * 物を見える所へ送る。スマホは上に貼るアイテムの帯 (StageItemMini) の下に出す
 * (2026-10-09 エミュレーターの「狙う」: scrollIntoView だと見出しと狙いの札が帯の裏に隠れた)。
 * 「見える所へ送る」はみなこれで。pcBlock = PC の時の位置 (発現の欄は真ん中)。behavior "auto" は一気に、それ以外は glideBy でぬるっと
 */
export function scrollToTop(el: Element | null | undefined, behavior: ScrollBehavior = "smooth", pcBlock: ScrollLogicalPosition = "start"): void {
  if (!el) return;
  const box = scrollBoxOf(el);
  const r = el.getBoundingClientRect();
  const view = box ? box.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const bar = window.innerWidth < 768 ? (document.querySelector("[data-item-mini]") as HTMLElement | null)?.offsetHeight ?? 0 : 0;
  // 固定の見出し (scroll-mt-*) の分は下げる (MOD 一覧の目次で飛ぶと、節の見出しが固定の目次の裏に隠れていた。2026-10-10 点検)
  const mt = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = view.top + bar + 8 + mt;
  let d: number;
  if (window.innerWidth < 768 || pcBlock === "start") d = r.top - top;
  else if (pcBlock === "center") d = r.top + r.height / 2 - (view.top + view.bottom) / 2;
  else if (pcBlock === "end") d = r.bottom - view.bottom + 8;
  else d = r.top < top ? r.top - top : r.bottom > view.bottom ? r.bottom - view.bottom + 8 : 0; // nearest
  if (behavior === "auto" || behavior === "instant") { if (Math.abs(d) > 1) (box ?? window).scrollBy({ top: toCss(d), behavior: "instant" as ScrollBehavior }); return; }
  void glideBy(box, d);
}

/**
 * 送りが要る時だけ、短く減速で滑らせる (2026-10-10 オーナー「ぱっと移動させるんじゃなくて高速でスライド」「やるのは全部じゃなくスクロールが必要な時だけ」)。
 * ブラウザの smooth は遅くて途中で他の送りと重なるとカクつくので、自前で 1 本の rAF。動きを減らす設定の時は一気に
 */
let gliding = 0;
/** 送り終わったら解ける (途中で別の送りに替わった時も解ける)。d は画面の座標の差 (拡大率込み)、中で CSS の px に換算する */
export function glideBy(box: HTMLElement | null, dScreen: number, ms = 260): Promise<void> {
  const d = toCss(dScreen);
  if (Math.abs(d) < 1) return Promise.resolve();
  const getY = (): number => (box ? box.scrollTop : window.scrollY);
  const setY = (y: number): void => { if (box) box.scrollTop = y; else window.scrollTo(0, y); };
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) { setY(getY() + d); return Promise.resolve(); }
  return new Promise((done) => {
  const run = ++gliding;
  // 数え始めは最初のコマ (重い描画の直後は最初のコマが遅れ、決めた時から数えると 1 コマ目で大きく飛んでカクついた。2026-10-10 オーナー「時折カクつく、ぬるっと」)。
  // 動き出しと止まり際をゆっくり (ease-in-out)
  let t0 = 0, y0 = 0;
  const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  const step = (t: number): void => {
    if (run !== gliding) { done(); return; }
    if (!t0) { t0 = t; y0 = getY(); }
    const k = Math.min(1, (t - t0) / ms);
    setY(y0 + d * ease(k));
    if (k < 1) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
  });
}
