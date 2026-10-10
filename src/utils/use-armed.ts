/**
 * use-armed.ts — 2 回押して決める (2026-10-10 動きの揃え 7)。原点はエミュレーターの「白に戻す」(CraftStage.vue):
 * 1 回目で赤いボタン (ARMED_CLASS = g-btn-red sm) に変わり文字が「もう一度押すと…」、3 秒押さなければ元に戻る。
 * 1 つの画面に何個もある時 (レシピの呼び出す・消す) は key で分ける。
 *   const reset = useArmed();  @click="reset.arm() && doReset()"  :class="reset.is() ? ARMED_CLASS : 'g-btn sm'"
 */
import { getCurrentScope, onScopeDispose, ref } from "vue";

export const ARMED_CLASS = "g-btn-red sm";
export const ARMED_MS = 3000;

export function useArmed(ms = ARMED_MS) {
  const armed = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function clear(): void {
    clearTimeout(timer);
    armed.value = null;
  }
  /** 押した: 2 回目 (同じ key が待っている) なら true を返して戻す。1 回目は待ちにして false */
  function arm(key = "1"): boolean {
    if (armed.value === key) { clear(); return true; }
    clearTimeout(timer);
    armed.value = key;
    timer = setTimeout(() => { armed.value = null; }, ms);
    return false;
  }
  const is = (key = "1"): boolean => armed.value === key;
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer));
  return { armed, arm, is, clear };
}
