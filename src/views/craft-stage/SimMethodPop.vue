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

const open = ref<{ left: number; top: number; above: boolean; opts: SimMethod[]; off: Partial<Record<SimMethod, string>>; done: (m: SimMethod) => void } | null>(null);
const W = 150;
function close(): void {
  open.value = null;
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("scroll", close, true);
  document.removeEventListener("keydown", onKey);
}
function outside(e: PointerEvent): void { if (!(e.target as HTMLElement | null)?.closest?.("[data-sim-method-pop]")) close(); }
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") { e.stopPropagation(); close(); } }
/** off: 選べない付け方とその理由 (灰色にして理由を出す) */
function ask(btn: Element, opts: SimMethod[], done: (m: SimMethod) => void, off: Partial<Record<SimMethod, string>> = {}): void {
  const r = btn.getBoundingClientRect();
  const vw = toCss(window.innerWidth), vh = toCss(window.innerHeight);
  const above = toCss(r.bottom) + 40 + opts.length * 30 > vh;
  open.value = { left: Math.max(8, Math.min(toCss(r.right) - W, vw - W - 8)), top: above ? toCss(r.top) - 4 : toCss(r.bottom) + 4, above, opts, off, done };
  void nextTick(() => {
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", close, true);
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
