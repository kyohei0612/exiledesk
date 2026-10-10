/**
 * use-flash.ts — 少しだけ出して消える知らせ (コピーしました など)。2026-10-10 動きの揃え 7。
 * 原点はエミュレーターの「手順 JSON をコピーしました」(CraftStage.vue): 2.5 秒。続けて出したら前の物は消して出し直す。
 * 長い文 (切り替えの知らせ) だけ ms を延ばす
 *   const note = useFlash();  note.flash(tr("コピーしました", "Copied"))  <span v-if="note.msg.value">{{ note.msg.value }}</span>
 */
import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";

export const FLASH_MS = 2500;

export function useFlash<T = string>(ms = FLASH_MS): { msg: Ref<T | null>; flash: (v: T) => void; clear: () => void } {
  const msg = ref(null) as Ref<T | null>;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear(): void {
    clearTimeout(timer);
    msg.value = null;
  }
  function flash(v: T): void {
    clearTimeout(timer);
    msg.value = v;
    timer = setTimeout(() => { msg.value = null; }, ms);
  }
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer));
  return { msg, flash, clear };
}
