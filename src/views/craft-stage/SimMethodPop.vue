<!--
  SimMethodPop.vue — シミュレーターの 2 で「T○ 以上」を押した時の付け方のポップアップ (2026-10-18 オーナー「選択時に付け方をその場で選ばせる感じ、ポップアップで」)。
  押したボタンのすぐ下に出す (下で切れるならすぐ上)。外を押す・Esc・送ると閉じる。ask(ボタン, 付け方, 選んだ時) で開く
-->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import { METHOD_EN, METHOD_JA } from "../../services/craft-stage/sim-methods";
import type { SimMethod } from "../../services/craft-stage/quiz-build";
import { toCss } from "../../utils/zoom";
import { tr } from "../../i18n/lang";
import { swallowNextClick } from "../../utils/swallow-click";

const open = ref<{ left: number; top: number; above: boolean; opts: SimMethod[]; off: Partial<Record<SimMethod, string>>; done: (m: SimMethod) => void } | null>(null);
const W = 150;
/** 開いたボタンと時刻 (開いた直後の自動の送りでは閉じずに付いていく) */
let anchor: { btn: Element; at: number } | null = null;
function close(): void {
  open.value = null;
  anchor = null;
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("scroll", onScroll, true);
  document.removeEventListener("keydown", onKey);
}
function outside(e: PointerEvent): void { if (!(e.target as HTMLElement | null)?.closest?.("[data-sim-method-pop]")) { close(); swallowNextClick(); } } // 外を押したら閉じるだけ (下の物は押さない)
/**
 * スクロールしたら閉じる。ただし開いて 1 秒以内 (段の表を開いた時の「全体が見える所まで送る」がまだ動いている) はボタンに付いていく
 * (2026-10-21 モンキーチェック: 一覧の下の方の雷耐性で、表を開いてすぐ「T1 以上」を押すと吹き出しが出た瞬間に閉じ、押しても何も起きなかった)
 */
function onScroll(): void {
  if (!anchor || Date.now() - anchor.at > 1000) { close(); return; }
  if (open.value) open.value = { ...open.value, ...placeOf(anchor.btn, open.value.opts.length) };
}
function placeOf(btn: Element, n: number): { left: number; top: number; above: boolean } {
  const r = btn.getBoundingClientRect();
  const vw = toCss(window.innerWidth), vh = toCss(window.innerHeight);
  const above = toCss(r.bottom) + 40 + n * 30 > vh;
  return { left: Math.max(8, Math.min(toCss(r.right) - W, vw - W - 8)), top: above ? toCss(r.top) - 4 : toCss(r.bottom) + 4, above };
}
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") { e.stopPropagation(); close(); } }
/** off: 選べない付け方とその理由 (灰色にして理由を出す) */
function ask(btn: Element, opts: SimMethod[], done: (m: SimMethod) => void, off: Partial<Record<SimMethod, string>> = {}): void {
  open.value = { ...placeOf(btn, opts.length), opts, off, done };
  anchor = { btn, at: Date.now() };
  void nextTick(() => {
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("keydown", onKey);
  });
}
function pick(m: SimMethod): void { const d = open.value?.done; close(); d?.(m); }
onBeforeUnmount(close);
defineExpose({ ask });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" data-sim-method-pop class="fixed z-[320] rounded-lg border border-[var(--exile-color-border-brass)] bg-[#14110d] p-1.5 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.75)]" :style="{ left: `${open.left}px`, top: `${open.top}px`, width: `${W}px`, transform: open.above ? 'translateY(-100%)' : undefined }">
      <p class="mb-1 px-1 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ tr("付け方を選ぶ", "Choose how to add it") }}</p>
      <button v-for="m in open.opts" :key="m" type="button" :data-method="m" class="block w-full rounded px-2 py-1 text-left hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent max-md:min-h-10" :disabled="!!open.off[m]" :title="open.off[m]" @click="pick(m)">{{ tr(METHOD_JA[m], METHOD_EN[m]) }}<span v-if="open.off[m]" class="block text-[10px] leading-tight text-rose-300/90">{{ open.off[m] }}</span></button>
    </div>
  </Teleport>
</template>
