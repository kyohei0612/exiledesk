/**
 * use-armed.ts — 2 回押して決める (2026-10-10 動きの揃え 7)。原点はエミュレーターの「白に戻す」(CraftStage.vue):
 * 1 回目で赤いボタン (ARMED_CLASS = g-btn-red sm) に変わり文字が「もう一度押すと…」、3 秒押さなければ元に戻る。
 * スイッチ armAll (U-23、オーナー 10-28「ここは統一させたいな」): 時間では戻さず、押したボタンの外を押すか Esc で戻す (全部の画面)。
 * ボタンは 1 回目を押した物 (直前の pointerdown の先、鍵盤で押した時は focus の物) を覚えるので、使う側は今のまま。外の押下は下の物にも届ける
 * 1 つの画面に何個もある時 (レシピの呼び出す・消す) は key で分ける。
 *   const reset = useArmed();  @click="reset.arm() && doReset()"  :class="reset.is() ? ARMED_CLASS : 'g-btn sm'"
 */
import { getCurrentInstance, getCurrentScope, onScopeDispose, ref } from "vue";
import { flag } from "../web/release-flags";
import { useDismiss } from "./use-dismiss";

export const ARMED_CLASS = "g-btn-red sm";
const ARMED_MS = 3000;
const ALL = flag("armAll");

/** 直前の押下の先 (1 回目のボタンを知るため) */
let lastDown: { el: Element; at: number } | null = null;
if (ALL && typeof document !== "undefined") {
  document.addEventListener("pointerdown", (e) => { if (e.target instanceof Element) lastDown = { el: e.target, at: e.timeStamp }; }, true);
}
function pressedButton(): HTMLElement | null {
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const t = lastDown && now - lastDown.at < 1000 ? lastDown.el : document.activeElement;
  const b = t?.closest("button, [role=button]");
  return b instanceof HTMLElement ? b : null;
}

export function useArmed(ms = ARMED_MS) {
  const armed = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let btn: HTMLElement | null = null;
  function clear(): void {
    clearTimeout(timer);
    armed.value = null;
    btn = null;
  }
  /** 押した: 2 回目 (同じ key が待っている) なら true を返して戻す。1 回目は待ちにして false */
  function arm(key = "1"): boolean {
    if (armed.value === key) { clear(); return true; }
    clearTimeout(timer);
    armed.value = key;
    btn = ALL ? pressedButton() : null;
    if (!btn) timer = setTimeout(() => { armed.value = null; }, ms);
    return false;
  }
  const is = (key = "1"): boolean => armed.value === key;
  // 外の押下・Esc で戻す。ボタンが分からない時 (押下の先が取れない) は前と同じく時間で戻す (2 回目の押下まで外に数えないため)
  if (ALL && getCurrentInstance()) useDismiss(() => armed.value !== null && !!btn, [() => btn], clear, { swallow: false });
  if (getCurrentScope()) onScopeDispose(() => clearTimeout(timer));
  return { armed, arm, is, clear };
}
