/**
 * use-phone.ts — スマホの幅 (768 CSS px 未満) と指の端末 (hover の無い画面) の判定 (2026-10-22、4 か所の写しを 1 つに)
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { flag } from "../web/release-flags";

/** スマホの形の幅の上限 (これ未満がスマホ)。スイッチ twoShapes で 1280 の 1 本 (U-53、CSS の境は style.css の @custom-variant) */
export const PHONE_MAX = flag("twoShapes") ? 1280 : 768;
/** 今の窓がスマホの形の幅か (追わない 1 回の読み) */
export const isPhoneWidth = (): boolean => typeof window !== "undefined" && window.innerWidth < PHONE_MAX;

/** 幅がスマホの形か (窓の大きさが変わったら追う)。部品の中で呼ぶ */
export function usePhone(): Ref<boolean> {
  const phone = ref(isPhoneWidth());
  const onResize = (): void => { phone.value = isPhoneWidth(); };
  onMounted(() => window.addEventListener("resize", onResize));
  onBeforeUnmount(() => window.removeEventListener("resize", onResize));
  return phone;
}

/** シミュの見るだけの幅の上限 (これ未満は組めない、S-94g。エミュの入口も同じ物を見る)。画面の形の境 PHONE_MAX とは別で、形は替えない (U-53) */
export const VIEW_ONLY_MAX = 768;
/** 今の窓が見るだけの幅か (窓の大きさが変わったら追う)。部品の中で呼ぶ */
export function useViewOnlyWidth(): Ref<boolean> {
  const narrow = (): boolean => typeof window !== "undefined" && window.innerWidth < VIEW_ONLY_MAX;
  const viewOnly = ref(narrow());
  const onResize = (): void => { viewOnly.value = narrow(); };
  onMounted(() => window.addEventListener("resize", onResize));
  onBeforeUnmount(() => window.removeEventListener("resize", onResize));
  return viewOnly;
}

/** 指の端末 (hover の無い画面 = スマホ)。乗せて出すカードを出さない時に */
export const isTouchOnly = (): boolean => typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
