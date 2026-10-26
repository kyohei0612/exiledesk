/**
 * 1 行に入らない文は、まず字を縮めて 1 行に収める。縮めるのは下限 (10px) まで、下限でも入らなければ折る (2026-10-26 夜オーナー
 * 「折り返すくらいなら小さくしておけ。指定の px 以下になったら流石に 2 行でおけ。見えないとかになるくらいなら 1 行にこだわらなくていい」)。
 * 折る時は語の切れ目 (空白) で: 「-1個」の数と単位の間では割らない (keep-all)。空白の無い長い語だけは仕方なくどこでも割る。
 * 使い方: 文の入った枠に v-fit-text (枠の幅は親が決める物、min-w-0 flex-1 など)。枠の幅が変わった時・中身が変わった時に測り直す。
 * v-fit-text="false" の間は何もしない (シミュの箱の中の MOD の行は縮めずに札を次の行へ折る、10-26 夜オーナー「折る感じで行こうか」)
 */
import type { Directive, DirectiveBinding } from "vue";

const MIN_PX = 10;
type FitEl = HTMLElement & { __fitRo?: ResizeObserver };

const over = (el: HTMLElement): boolean => el.scrollWidth > el.clientWidth + 0.5;

function fit(el: HTMLElement, on = true): void {
  el.style.fontSize = "";
  el.style.whiteSpace = on ? "nowrap" : "";
  el.style.wordBreak = on ? "keep-all" : "";
  el.style.overflowWrap = on ? "anywhere" : "";
  if (!on) return;
  if (!el.clientWidth || !over(el)) return;
  // 中に字の大きさの決まった札 (10px のタグなど) があるので、比で縮めて入るまで数回
  let size = parseFloat(getComputedStyle(el).fontSize);
  for (let i = 0; i < 4 && over(el) && size > MIN_PX; i++) {
    size = Math.max(MIN_PX, Math.floor(size * (el.clientWidth / el.scrollWidth) * 10) / 10);
    el.style.fontSize = `${size}px`;
  }
  // 下限でも入らない → 下限の大きさで折る
  if (over(el)) el.style.whiteSpace = "";
}

const onOf = (b: DirectiveBinding<boolean | undefined>): boolean => b.value !== false;
export const vFitText: Directive<FitEl, boolean | undefined> = {
  mounted(el, b) {
    el.dataset.fitOff = onOf(b) ? "" : "1";
    fit(el, onOf(b));
    if (typeof ResizeObserver !== "undefined") {
      let w = el.clientWidth;
      el.__fitRo = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; fit(el, el.dataset.fitOff !== "1"); } });
      el.__fitRo.observe(el);
    }
  },
  updated(el, b) { el.dataset.fitOff = onOf(b) ? "" : "1"; fit(el, onOf(b)); },
  unmounted(el) { el.__fitRo?.disconnect(); },
};
