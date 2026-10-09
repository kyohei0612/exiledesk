import { nextTick } from "vue";

/**
 * 押した物を画面の同じ高さに残したまま中身を変える (2026-10-09 オーナー「スマホ版は上に戻らないといけない仕組みは用意しないで、
 * MOD とか選んで設定が戻って上にとかだるい」)。上の方 (狙う MOD の完成図など) が伸び縮みしても、押した行が画面の外へ流れない。
 * iOS Safari は CSS の scroll anchoring (overflow-anchor) が無いので手で直す。ページ全体が送られている時 (スマホ) だけ効く
 */
export function keepPlace(el: Element | null | undefined, change: () => void): void {
  const before = el?.getBoundingClientRect().top;
  change();
  if (before == null || !el) return;
  void nextTick(() => {
    if (!el.isConnected) return;
    const d = el.getBoundingClientRect().top - before;
    if (Math.abs(d) > 1) window.scrollBy({ top: d, behavior: "instant" as ScrollBehavior });
  });
}
