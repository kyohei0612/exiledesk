<!--
  SimTutorialGuide.vue — シミュのチュートリアルの案内 (2026-10-26 夜オーナー「メモ帳みたいな感じでくっつけて、一緒に進行していく」)。
  押す所を光る枠で囲み (周りは暗くしない・押しは止めない)、そのそばにメモ帳のような小さな札 (文 + n / m・最初から・やめる)。手順が進むと札も一緒に動く。
  文と光らせる所は src/data/sim-tutorial.json (tut-data)。手元の dev だけ札の中で書ける (SimTutorialEditor)。進みは use-sim-tutorial が木の中身と窓から毎回求める。
  PC だけ (768 未満は出さない)。記録は simOp (tutorial-start / step / done、デザイン部長 9 本目の頼み)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { simOp } from "../../../web/track";
import { markRan, startTutorial, stopTutorial, tutOn, tutTick, useSimTutorial } from "./use-sim-tutorial";
import { TUT_EDITABLE, tutDirty } from "./tut-data";
import SimTutorialEditor from "./SimTutorialEditor.vue";

const tut = useSimTutorial();
const ring = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const narrow = ref(false);
/** 書く所を開いている (dev だけ) */
const editing = ref(false);
/** 光らせる要素 (done:<箱> = その箱の「完成にする」のボタン。目印が無いので文字で探す) */
function targetEl(sel: string | null): HTMLElement | null {
  if (!sel) return null;
  if (sel.startsWith("done:")) {
    const box = document.querySelector(`[data-box-id="${CSS.escape(sel.slice(5))}"]`);
    return [...(box?.querySelectorAll<HTMLElement>("button") ?? [])].find((b) => /^(完成にする|完成|Mark done|Done)$/.test(b.textContent?.trim() ?? "")) ?? null;
  }
  try { return [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.offsetParent || e.getClientRects().length) ?? null; } catch { return null; }
}
const cardEl = ref<HTMLElement | null>(null);
const pos = ref<{ left: number; top: number } | null>(null);
let raf = 0, timer = 0;
/** 札の置き場: 光る所の右 → 左 → 下 → 上の順に、画面に収まって重ならない所。光る所が無ければ左下 */
function place(r: { x: number; y: number; w: number; h: number } | null): void {
  const W = window.innerWidth, H = window.innerHeight, cw = cardEl.value?.offsetWidth ?? 340, ch = cardEl.value?.offsetHeight ?? 160, g = 14, m = 8;
  if (!r) { pos.value = null; return; }
  const clampY = (y: number): number => Math.min(Math.max(m, y), H - ch - m), clampX = (x: number): number => Math.min(Math.max(m, x), W - cw - m);
  const tries = [
    { left: r.x + r.w + g, top: clampY(r.y + r.h / 2 - ch / 2), ok: r.x + r.w + g + cw <= W - m },
    { left: r.x - g - cw, top: clampY(r.y + r.h / 2 - ch / 2), ok: r.x - g - cw >= m },
    { left: clampX(r.x + r.w / 2 - cw / 2), top: r.y + r.h + g, ok: r.y + r.h + g + ch <= H - m },
    { left: clampX(r.x + r.w / 2 - cw / 2), top: r.y - g - ch, ok: r.y - g - ch >= m },
  ];
  const t = tries.find((x) => x.ok) ?? { left: m, top: H - ch - m };
  pos.value = { left: Math.round(t.left), top: Math.round(t.top) };
}
function frame(): void {
  const el = tutOn.value && !narrow.value ? targetEl(tut.target.value) : null;
  const r = el?.getBoundingClientRect();
  ring.value = r && r.width > 0 ? { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 } : null;
  // 光る所が動かなければ札も動かない (打っている間も)。書く所を開いて背が伸びた時は画面に収まる所へ
  place(ring.value);
  raf = requestAnimationFrame(frame);
}
onMounted(() => {
  raf = requestAnimationFrame(frame);
  // 窓・棚の中の変わり目 (持った・お告げを掛けた) は木の中身に出ないので、刻みで求め直す
  timer = window.setInterval(() => {
    narrow.value = window.innerWidth < 768;
    if (!tutOn.value) return;
    tutTick.value++;
    if (tut.step.value?.kind === "run" && document.querySelector("[data-tree-run-report]")) markRan();
  }, 250);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearInterval(timer); });
// 何手目まで進んだかの記録 (1 手進むたびに 1 回)
watch(() => (tutOn.value ? tut.index.value : -1), (i) => { if (i >= 0) simOp("tutorial-step", i + 1); });
/** 木がチュートリアルの木でなくなった (別のレシピを開いた・ベースを替えた) */
const off = computed(() => !tut.onRoute.value);
const step = computed(() => tut.step.value);
const text = computed(() => tut.text.value);
const boxId = computed(() => { const st = step.value; return st && (st.kind === "hand" || st.kind === "done") ? tut.roles.value[st.box] : undefined; });
function quit(): void { if (tutDirty.value && !window.confirm("保存していない文がある。やめても画面の中には残る (保存はまだ)")) return; stopTutorial(); }
</script>

<template>
  <template v-if="tutOn && !narrow">
    <div v-if="ring && !off" data-tut-ring aria-hidden="true" class="tut-ring pointer-events-none fixed z-[1200] rounded-lg" :style="{ left: `${ring.x}px`, top: `${ring.y}px`, width: `${ring.w}px`, height: `${ring.h}px` }" />
    <!-- メモ帳の札 (光る所のそばへ動く。無ければ左下) -->
    <section ref="cardEl" data-tut-card class="tut-note fixed z-[1201] flex w-[340px] flex-col gap-1.5 rounded-lg border border-amber-200/50 px-3 py-2 text-[13px] text-[#2b2217] shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
      :class="pos ? '' : 'bottom-4 left-4'" :style="pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : {}" @mousedown.stop @click.stop>
      <header class="flex items-center gap-1.5">
        <b class="text-[12px] text-[#7a4b12]">{{ tr("チュートリアル", "Tutorial") }}</b>
        <span class="text-[12px] tabular-nums opacity-70">{{ tut.index.value + 1 }} / {{ tut.total.value }}</span>
        <button v-if="TUT_EDITABLE" type="button" data-tut-edit class="tut-btn ml-auto" :aria-pressed="editing" :title="tr('文を書く (手元の dev だけ)', 'Write the text (local dev only)')" @click="editing = !editing">✎</button>
        <button type="button" data-tut-restart class="tut-btn" :class="TUT_EDITABLE ? '' : 'ml-auto'" @click="startTutorial">{{ tr("最初から", "Restart") }}</button>
        <button type="button" data-tut-stop class="tut-btn" @click="quit">{{ tr("やめる", "Quit") }}</button>
      </header>
      <template v-if="off">
        <p data-tut-off class="break-words font-bold text-rose-800">{{ tr("チュートリアルの木から離れました (ベースか完成形が変わった)", "You left the tutorial tree (the base or final item changed)") }}</p>
        <p class="text-[12px] opacity-75">{{ tr("「最初から」で不在のアミュレットの木を開き直す", "Restart opens the tutorial tree again") }}</p>
      </template>
      <template v-else>
        <p data-tut-say class="whitespace-pre-line break-words text-[14px] font-bold" :class="tut.now.value?.wrong ? 'text-rose-800' : ''">{{ tr(...text.say) }}</p>
        <p v-if="text.why[0] || text.why[1]" data-tut-why class="break-words text-[12px] leading-snug opacity-75">{{ tr(...text.why) }}</p>
        <button v-if="step?.kind === 'auto'" type="button" data-tut-auto class="tut-ring g-btn-red min-h-9 px-3" @click="tut.autoFill">{{ tr("残りを自動で付ける", "Fill in the rest") }}</button>
        <button v-if="step?.kind === 'note'" type="button" data-tut-next class="tut-ring g-btn-red min-h-9 px-3" @click="tut.nextNote">{{ tr("次へ", "Next") }}</button>
        <button v-if="step?.kind === 'end'" type="button" data-tut-end class="tut-ring g-btn-red min-h-9 px-3" @click="stopTutorial(true)">{{ tr("終わる", "Finish") }}</button>
        <SimTutorialEditor v-if="TUT_EDITABLE && editing && tut.now.value && step" :key="tut.now.value.key" :text-key="tut.now.value.key" :step-id="step.id" :box-id="boxId" :draft="[tut.now.value.draft[0], tut.now.value.draft[1]]" />
      </template>
    </section>
  </template>
</template>

<style scoped>
/* 押す所の光る枠 (周りは暗くしない。ゆっくり明るさだけ揺らす) */
.tut-ring { box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.95), 0 0 18px 4px rgba(251, 191, 36, 0.55); animation: tut-pulse 1.4s ease-in-out infinite; }
@keyframes tut-pulse { 50% { box-shadow: 0 0 0 3px rgba(253, 230, 138, 1), 0 0 26px 8px rgba(251, 191, 36, 0.75); } }
/* メモ帳の札: 紙の色 + 罫線、動く時はすっと移る */
.tut-note { background: #f3e7c6 repeating-linear-gradient(to bottom, transparent 0 21px, rgba(122, 75, 18, 0.12) 21px 22px); transition: left 0.25s ease, top 0.25s ease; }
.tut-btn { height: 24px; padding: 0 8px; border: 1px solid rgba(122, 75, 18, 0.45); border-radius: 4px; font-size: 12px; color: #4a3214; background: rgba(255, 255, 255, 0.4); }
.tut-btn:hover { background: rgba(255, 255, 255, 0.75); }
.tut-btn[aria-pressed="true"] { background: #7a4b12; color: #fff; }
@media (prefers-reduced-motion: reduce) { .tut-ring { animation: none; } .tut-note { transition: none; } }
</style>
