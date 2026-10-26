<!--
  SimTutorialGuide.vue — シミュのチュートリアルの案内 (2026-10-26 夜オーナー「押す所を光らせて一手ずつ案内、人が押すと次の案内へ」)。
  押す所を光る枠で囲み (周りは暗くしない・押しは止めない)、画面の隅に小さな札 (今の一手の一言 + なぜ + n / m・最初から・やめる)。
  札は押す所と重ならない隅へ動く (下半分を押す時は上へ)。進みは use-sim-tutorial が木の中身と窓から毎回求める。PC だけ (768 未満は出さない)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { tr } from "../../../i18n/lang";
import { markRan, startTutorial, stopTutorial, tutOn, tutTick, useSimTutorial } from "./use-sim-tutorial";

const tut = useSimTutorial();
const ring = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const narrow = ref(false);
/** 光らせる要素 (done:<箱> = その箱の「完成にする」のボタン。目印が無いので文字で探す) */
function targetEl(sel: string | null): HTMLElement | null {
  if (!sel) return null;
  if (sel.startsWith("done:")) {
    const box = document.querySelector(`[data-box-id="${CSS.escape(sel.slice(5))}"]`);
    return [...(box?.querySelectorAll<HTMLElement>("button") ?? [])].find((b) => /^(完成にする|完成|Mark done|Done)$/.test(b.textContent?.trim() ?? "")) ?? null;
  }
  return [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent || e.getClientRects().length) ?? null;
}
let raf = 0, timer = 0;
function frame(): void {
  const el = tutOn.value && !narrow.value ? targetEl(tut.now.value.target) : null;
  const r = el?.getBoundingClientRect();
  ring.value = r && r.width > 0 ? { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 } : null;
  raf = requestAnimationFrame(frame);
}
onMounted(() => {
  raf = requestAnimationFrame(frame);
  // 窓・棚の中の変わり目 (持った・お告げを掛けた) は木の中身に出ないので、刻みで求め直す
  timer = window.setInterval(() => {
    narrow.value = window.innerWidth < 768;
    if (!tutOn.value) return;
    tutTick.value++;
    if (tut.step.value.kind === "run" && document.querySelector("[data-tree-run-report]")) markRan();
  }, 250);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearInterval(timer); });
/** 木がチュートリアルの木でなくなった (別のレシピを開いた・ベースを替えた) */
const off = computed(() => !tut.onRoute.value);
/** 札の置き場: ふだんは左下。押す所が左下の札の所に重なる時だけ左上へ (上の帯を隠さないよう、要る時だけ) */
const cardEl = ref<HTMLElement | null>(null);
const top = computed(() => {
  const r = ring.value;
  if (!r) return false;
  const h = cardEl.value?.offsetHeight ?? 160, y0 = window.innerHeight - 16 - h - 8;
  return r.x < 16 + 360 + 8 && r.y + r.h > y0;
});
const step = computed(() => tut.step.value);
const why = computed(() => step.value.why(tut.names));
</script>

<template>
  <template v-if="tutOn && !narrow">
    <div v-if="ring && !off" data-tut-ring aria-hidden="true" class="tut-ring pointer-events-none fixed z-[1200] rounded-lg" :style="{ left: `${ring.x}px`, top: `${ring.y}px`, width: `${ring.w}px`, height: `${ring.h}px` }" />
    <section ref="cardEl" data-tut-card class="fixed left-4 z-[1201] flex w-[360px] flex-col gap-2 rounded-xl border border-amber-400/60 bg-[#16110b]/[0.97] px-3 py-2.5 text-[13px] text-[#e6dcc6] shadow-[0_10px_30px_rgba(0,0,0,0.7)]" :class="top ? 'top-20' : 'bottom-4'" @mousedown.stop @click.stop>
      <header class="flex items-center gap-2">
        <b class="text-amber-200">{{ tr("チュートリアル", "Tutorial") }}</b>
        <span class="text-[12px] tabular-nums opacity-70">{{ tut.index.value + 1 }} / {{ tut.total }}</span>
        <button type="button" data-tut-restart class="g-btn sm ml-auto" @click="startTutorial">{{ tr("最初から", "Restart") }}</button>
        <button type="button" data-tut-stop class="g-btn sm" @click="stopTutorial">{{ tr("やめる", "Quit") }}</button>
      </header>
      <template v-if="off">
        <p data-tut-off class="break-words font-bold text-rose-200">{{ tr("チュートリアルの木から離れました (ベースか完成形が変わった)", "You left the tutorial tree (the base or final item changed)") }}</p>
        <p class="text-[12px] opacity-75">{{ tr("「最初から」で不在のアミュレットの木を開き直す", "Restart opens the tutorial tree again") }}</p>
      </template>
      <template v-else>
        <p data-tut-say class="break-words text-[15px] font-bold" :class="tut.now.value.wrong ? 'text-rose-200' : 'text-amber-100'">{{ tr(...tut.now.value.say) }}</p>
        <p data-tut-why class="break-words text-[12px] leading-snug opacity-75">{{ tr(...why) }}</p>
        <button v-if="step.kind === 'auto'" type="button" data-tut-auto class="tut-ring g-btn-red min-h-9 px-3" @click="tut.autoFill">{{ tr("残りを自動で付ける", "Fill in the rest") }}</button>
        <button v-if="step.kind === 'end'" type="button" data-tut-end class="tut-ring g-btn-red min-h-9 px-3" @click="stopTutorial">{{ tr("終わる", "Finish") }}</button>
      </template>
    </section>
  </template>
</template>

<style scoped>
/* 押す所の光る枠 (周りは暗くしない。ゆっくり明るさだけ揺らす) */
.tut-ring { box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.95), 0 0 18px 4px rgba(251, 191, 36, 0.55); animation: tut-pulse 1.4s ease-in-out infinite; }
@keyframes tut-pulse { 50% { box-shadow: 0 0 0 3px rgba(253, 230, 138, 1), 0 0 26px 8px rgba(251, 191, 36, 0.75); } }
@media (prefers-reduced-motion: reduce) { .tut-ring { animation: none; } }
</style>
