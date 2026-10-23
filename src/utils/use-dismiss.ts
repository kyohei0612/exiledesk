/**
 * use-dismiss.ts — 選びかけ・開きかけを、枠の外を押す / Esc で「選ぶ前」に戻す共通の仕組み (2026-10-22 オーナー、全部の画面の決まり
 * 「枠の中の物を選んで、キャンセルは枠の外をクリックで、クリック前の状態に戻す」。確定はボタンの時だけ)。
 * active が true の間だけ、document の pointerdown (捕まえる段) と keydown を見る。枠 (inside の要素のどれか) の外なら cancel を呼び、
 * その押下に続く click は下の物に届けない (swallow-click.ts、外を押して閉じたら下のボタンまで押されていた 10-19 の件)。
 * 枠は複数渡せる (持ち物の札と棚など、離れた 2 か所を 1 つの枠として扱う時)。data-dismiss-keep の付いた所の中も外に数えない (別の窓に出した選ぶ欄など)
 *   useDismiss(() => open.value, [panelRef], () => { open.value = false; });
 * Esc は開いている物のうち一番後に開いた 1 つだけを閉じる (積み)。窓 (ModalShell) の中で開いている物は、窓より先に閉じる (cancelTopIn、2026-10-23 オーナー
 * 「展開した時の動きをエミュとシミュで一緒に」: シミュは全部が窓の中で、Esc で段の表だけ閉じられず窓ごと閉じていた)
 */
import { onBeforeUnmount, watch, type Ref } from "vue";
import { swallowNextClick } from "./swallow-click";

type El = Ref<HTMLElement | null | undefined> | (() => HTMLElement | null | undefined);

/** 今開いている物の積み (後に開いた物ほど後ろ)。Esc はここの一番後ろ */
interface Open { els: () => HTMLElement[]; cancel: () => void }
const opened: Open[] = [];
function onEsc(e: KeyboardEvent): void {
  if (e.key !== "Escape" || e.defaultPrevented || !opened.length) return;
  e.preventDefault();
  opened[opened.length - 1].cancel();
}
/** el (窓の枠) の中で開いている物のうち一番後の 1 つを閉じる。閉じたら true (窓は自分を閉じない) */
export function cancelTopIn(el: HTMLElement | null | undefined): boolean {
  if (!el) return false;
  for (let i = opened.length - 1; i >= 0; i--) {
    if (opened[i].els().some((x) => el.contains(x))) { opened[i].cancel(); return true; }
  }
  return false;
}

/** opts.swallow: false で押した物にも届ける (別の行を押したらそのまま開く時など)。opts.keep: 中に数える場所の CSS (窓・body に出した小窓など) */
export function useDismiss(active: () => boolean, inside: El[], cancel: () => void, opts: { swallow?: boolean; keep?: string } = {}): void {
  const keep = opts.keep ? `[data-dismiss-keep], ${opts.keep}` : "[data-dismiss-keep]";
  const els = (): HTMLElement[] => inside.map((e) => (typeof e === "function" ? e() : e.value)).filter((e): e is HTMLElement => !!e);
  const onDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !active()) return;
    const t = e.target as Node | null;
    if (!t || !t.isConnected) return;
    if (els().some((el) => el.contains(t)) || (t instanceof Element && t.closest(keep))) return;
    // 上に重なった別の窓 (ModalShell) の中を押した時は、その窓の外にある下の物は取り消さない (狙いの窓の「やめる」で下の段の表が閉じていた。2026-10-24)
    const modal = t instanceof Element ? t.closest('[aria-modal="true"]') : null;
    if (modal && !els().some((el) => modal.contains(el))) return;
    cancel();
    if (opts.swallow !== false) swallowNextClick();
  };
  const me: Open = { els, cancel: () => { if (active()) cancel(); } };
  const on = (): void => {
    document.addEventListener("pointerdown", onDown, true);
    if (!opened.length) document.addEventListener("keydown", onEsc);
    opened.push(me);
  };
  const off = (): void => {
    document.removeEventListener("pointerdown", onDown, true);
    const i = opened.indexOf(me);
    if (i < 0) return;
    opened.splice(i, 1);
    if (!opened.length) document.removeEventListener("keydown", onEsc);
  };
  // 開いた時だけ聞く (開いたその押下で閉じないよう、次の tick から)
  watch(active, (v) => { off(); if (v) setTimeout(() => { if (active()) on(); }, 0); }, { immediate: true });
  onBeforeUnmount(off);
}
