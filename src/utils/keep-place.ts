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

/**
 * 物を画面の上に送る。スマホで上に貼るアイテムの帯 (StageItemMini、高さは MOD の数で変わる) の下に出す
 * (2026-10-09 エミュレーターの「狙う」: scrollIntoView だと見出しと狙いの札が帯の裏に隠れた)。
 * 「見える所へ送る」はみなこれで (2026-10-10 動きの揃え 4: 生の scrollIntoView を置き換え)。pcBlock = PC の時の位置 (発現の欄は真ん中)
 */
export function scrollToTop(el: Element | null | undefined, behavior: ScrollBehavior = "smooth", pcBlock: ScrollLogicalPosition = "start"): void {
  if (!el) return;
  // PC は画面の中の枠が送られる (ページ全体は動かない) ので、ふつうに上へ
  if (window.innerWidth >= 768) { el.scrollIntoView({ block: pcBlock, behavior }); return; }
  const bar = (document.querySelector("[data-item-mini]") as HTMLElement | null)?.offsetHeight ?? 0;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 8, behavior });
}
