/**
 * use-phone.ts — スマホの幅 (768 CSS px 未満) と指の端末 (hover の無い画面) の判定 (2026-10-22、4 か所の写しを 1 つに)
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** 幅が 768 未満か (窓の大きさが変わったら追う)。部品の中で呼ぶ */
export function usePhone(): Ref<boolean> {
  const phone = ref(typeof window !== "undefined" && window.innerWidth < 768);
  const onResize = (): void => { phone.value = window.innerWidth < 768; };
  onMounted(() => window.addEventListener("resize", onResize));
  onBeforeUnmount(() => window.removeEventListener("resize", onResize));
  return phone;
}

/** 指の端末 (hover の無い画面 = スマホ)。乗せて出すカードを出さない時に */
export const isTouchOnly = (): boolean => typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
