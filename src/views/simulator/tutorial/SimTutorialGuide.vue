<!--
  SimTutorialGuide.vue — シミュのチュートリアルの案内 (2026-10-26 夜オーナー「メモ帳みたいな感じでくっつけて、一緒に進行していく」)。
  押す所を光る枠で囲み (周りは暗くしない・押しは止めない)、そのそばにメモ帳のような小さな札 (文 + n / m・最初から・やめる)。手順が進むと札も一緒に動く。
  文と光らせる所は src/data/sim-tutorial.json (tut-data)。手元の dev だけ札の中で書ける (SimTutorialEditor)。進みは use-sim-tutorial が木の中身と窓から毎回求める。
  スマホの形 (1280 未満、U-53) は札を画面の下に固定 (下の帯の上。光る所に重なる時だけ上へ、tutorial.md T-26)、光る枠は同じ。記録は simOp (tutorial-start / step / done、デザイン部長 9 本目の頼み)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { tr } from "../../../i18n/lang";
import { simOp } from "../../../web/track";
import { markRan, noteClick, openGoalPage, startTutorial, stopTutorial, tutHasProgress, tutOn, tutPhone, tutTick, undoOne, useSimTutorial } from "./use-sim-tutorial";
import { TUT_EDITABLE, tutDirty } from "./tut-data";
import SimTutorialEditor from "./SimTutorialEditor.vue";
import { isPhoneWidth } from "../../../utils/use-phone";
import { inView } from "./tut-dom";

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
let raf = 0, timer = 0, sentKey = "", sentAt = 0;
/** 要素の真ん中で、札と枠を除いた一番上の物がその要素の外 (帯などに覆われている) */
function covered(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const front = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((e) => !e.closest("[data-tut-card], [data-tut-ring]"));
  return !!front && !el.contains(front) && !front.contains(el);
}
/** 札の置き場: 光る所の右 → 左 → 下 → 上の順に、画面に収まって重ならない所。光る所が無ければ左下 */
function place(r: { x: number; y: number; w: number; h: number } | null): void {
  const z = zoomOf(), W = window.innerWidth / z, H = window.innerHeight / z, cw = cardEl.value?.offsetWidth ?? 340, ch = cardEl.value?.offsetHeight ?? 160, g = 14, m = 8;
  if (narrow.value) { placePhone(r, W, H, ch, m); return; }
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
/** スマホで札の床にする、画面の下の決めるボタン */
const BOTTOM_BTNS = "[data-tree-hand-aim-go], [data-tree-hand-aim-back], [data-tree-hand-keep-go], [data-tree-hand-keep-back], [data-tree-hand-aim-step], [data-tree-hand-keep-step], [data-tree-hand-use], [data-tree-hand-cancel], [data-tree-goal-done], [data-tree-start-ask-go]";
/**
 * スマホ: 画面の下に全幅で固定 (T-26)。下の帯 [data-phone-bar] が前に見えていればその上。光る所が下の方にある時だけ、光る所のすぐ上へ寄せる
 * (前は重なると画面の上へ跳び、窓の題を隠した。手の窓の中では隠れた下の帯を床にして真ん中に出た、モンキー 7 の 3)
 */
function placePhone(r: { y: number; h: number } | null, W: number, H: number, ch: number, m: number): void {
  const z = zoomOf(), barEl = document.querySelector<HTMLElement>("[data-phone-bar]"), bar = barEl?.getBoundingClientRect();
  // 帯が前に見えている (真ん中の点で札を除いた一番上の要素が帯の中) 時だけ床にする。手の窓 (画面いっぱい) の後ろの帯は数えない
  const front = bar && bar.height > 0 ? document.elementsFromPoint(bar.left + bar.width / 2, bar.top + 4).find((e) => !e.closest("[data-tut-card], [data-tut-ring]")) : null;
  const barOn = !!front && !!barEl?.contains(front);
  // 画面の下の方にある決めるボタン (手の窓の「決める」「使う」・完成形の「決めた」など) の上も床にする (札がそれを覆った)
  const lows = [...document.querySelectorAll<HTMLElement>(BOTTOM_BTNS)].map((e) => e.getBoundingClientRect()).filter((b) => b.height > 0 && b.top / z > H * 0.55 && b.top / z < H).map((b) => b.top / z);
  const floor = Math.min(barOn ? bar!.top / z : H, ...lows);
  let top = floor - ch - m;
  if (r && r.y < top + ch && r.y + r.h > top) top = r.y - ch - m;
  pos.value = { left: m, top: Math.round(Math.max(m, top)) };
  void W;
}
/** 画面の幅で html に掛かる zoom (1440 幅で 0.87 など)。getBoundingClientRect は zoom の後の値なので、fixed の left / top に入れる時は割る */
const zoomOf = (): number => Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
function frame(): void {
  const el = tutOn.value ? targetEl(tut.target.value) : null;
  // 光る所が画面の外 (棚・窓の中を送らないと見えない) なら、場面が変わった時に 1 回だけ見える所へ送る (木の枠は送りでなく寄せなので動かない)
  // 下に出る帯 (持っている・決める) に覆われた時も送る (違う物を持つと棚の下が帯に隠れた)。覆われたままなら 1 秒おきまで
  const key = tut.now.value?.key ?? "";
  if (el && (key !== sentKey || Date.now() - sentAt > 1000)) {
    const hide = !inView(el) || covered(el);
    if (key !== sentKey || hide) { sentKey = key; sentAt = Date.now(); if (hide) el.scrollIntoView({ block: "center", inline: "nearest" }); }
  }
  const r = el?.getBoundingClientRect(), z = zoomOf();
  ring.value = r && r.width > 0 ? { x: r.left / z - 4, y: r.top / z - 4, w: r.width / z + 8, h: r.height / z + 8 } : null;
  // 光る所が動かなければ札も動かない (打っている間も)。書く所を開いて背が伸びた時は画面に収まる所へ
  place(ring.value);
  raf = requestAnimationFrame(frame);
}
onMounted(() => {
  raf = requestAnimationFrame(frame);
  // 窓・棚の中の変わり目 (持った・お告げを掛けた) は木の中身に出ないので、刻みで求め直す
  timer = window.setInterval(() => {
    narrow.value = isPhoneWidth();
    tutPhone.value = narrow.value;
    if (!tutOn.value) return;
    tutTick.value++;
    if (tut.step.value?.kind === "run" && document.querySelector("[data-tree-run-report]")) markRan();
  }, 250);
  // 帯の「次へ」・テストを押したか (木に出ないので押しを拾う。capture = 押しは止めない)
  document.addEventListener("click", noteClick, true);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearInterval(timer); document.removeEventListener("click", noteClick, true); });
// 何手目まで進んだかの記録 (1 手進むたびに 1 回)
watch(() => (tutOn.value ? tut.pos.value : -1), (i) => { if (i >= 0) simOp("tutorial-step", i); });
/** 木がチュートリアルの木でなくなった (別のレシピを開いた・ベースを替えた) */
const off = computed(() => !tut.onRoute.value);
const step = computed(() => tut.step.value);
const text = computed(() => tut.text.value);
const boxId = computed(() => { const st = step.value; return st && (st.kind === "hand" || st.kind === "done") ? tut.roles.value[st.box] : undefined; });
/** 最初から: 進み (始め方を決めた・手を足した) がある時は確かめる (前は確かめなしで木の進みが消えた、モンキー 7 の 2) */
function restart(): void { if (tutHasProgress() && !window.confirm(tr("今の木の進みを消して、最初からやり直しますか? (1 つ戻すで戻せます)", "Clear the current progress and start over? (Undo brings it back)"))) return; startTutorial(); }
function quit(): void { if (tutDirty.value && !window.confirm("保存していない文がある。やめても画面の中には残る (保存はまだ)")) return; stopTutorial(); }
</script>

<template>
  <!-- body へ出す (木のページの中は transform のある親があり、fixed の枠が親の分ずれた) -->
  <Teleport to="body"><template v-if="tutOn">
    <div v-if="ring && !off" data-tut-ring aria-hidden="true" class="tut-ring pointer-events-none fixed z-[1200] rounded-lg" :style="{ left: `${ring.x}px`, top: `${ring.y}px`, width: `${ring.w}px`, height: `${ring.h}px` }" />
    <!-- メモ帳の札 (光る所のそばへ動く。無ければ左下) -->
    <!-- data-dismiss-keep = 札を押しても開いている窓の「枠の外」に数えない (札の「やめる」で手の窓が閉じ、押しが飲まれた、モンキー 7 の 5) -->
    <section ref="cardEl" data-tut-card data-dismiss-keep class="tut-note fixed z-[1201] flex flex-col gap-1.5 rounded-lg border border-amber-200/50 px-3 py-2 text-[13px] text-[#2b2217] shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
      :class="[narrow ? 'w-[calc(100vw-16px)]' : 'w-[340px]', pos ? '' : 'bottom-4 left-4']" :style="pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : {}" @pointerdown.stop @mousedown.stop @click.stop>
      <header class="flex items-center gap-1.5">
        <b class="text-[12px] text-[#7a4b12]">{{ tr("チュートリアル", "Tutorial") }}</b>
        <span class="text-[12px] tabular-nums opacity-70">{{ tut.pos.value }} / {{ tut.total.value }}</span>
        <button v-if="TUT_EDITABLE" type="button" data-tut-edit class="tut-btn ml-auto" :aria-pressed="editing" :title="tr('文を書く (手元の dev だけ)', 'Write the text (local dev only)')" @click="editing = !editing">✎</button>
        <button type="button" data-tut-restart class="tut-btn" :class="TUT_EDITABLE ? '' : 'ml-auto'" @click="restart">{{ tr("最初から", "Restart") }}</button>
        <button type="button" data-tut-stop class="tut-btn" @click="quit">{{ tr("やめる", "Quit") }}</button>
      </header>
      <template v-if="off">
        <p data-tut-off class="break-words font-bold text-rose-800">{{ tr("チュートリアルの木から離れました (ベースか完成形が変わった)", "You left the tutorial tree (the base or final item changed)") }}</p>
        <p class="text-[12px] opacity-75">{{ tr("「最初から」で不在のアミュレットの木を開き直す", "Restart opens the tutorial tree again") }}</p>
      </template>
      <template v-else>
        <p data-tut-say class="whitespace-pre-line break-words text-[14px] font-bold" :class="tut.now.value?.wrong ? 'text-rose-800' : ''">{{ tr(...text.say) }}</p>
        <p v-if="text.why[0] || text.why[1]" data-tut-why class="break-words text-[12px] leading-snug opacity-75" :class="narrow ? 'line-clamp-3' : ''">{{ tr(...text.why) }}</p>
        <button v-if="tut.now.value?.act === 'undo'" type="button" data-tut-undo class="tut-ring g-btn-red min-h-9 px-3" @click="undoOne">{{ tr("1 つ戻す", "Undo") }}</button>
        <button v-if="tut.now.value?.act === 'goal'" type="button" data-tut-goal class="tut-ring g-btn-red min-h-9 px-3" @click="openGoalPage">{{ tr("完成形の設定へ", "Final item") }}</button>
        <button v-if="step?.kind === 'note' || (narrow && step?.kind === 'done')" type="button" data-tut-next class="tut-ring g-btn-red min-h-9 px-3" @click="tut.nextNote">{{ tr("次へ", "Next") }}</button>
        <button v-if="step?.kind === 'end' || (step?.kind === 'run' && /\.(p-)?end$/.test(tut.now.value?.key ?? ''))" type="button" data-tut-end class="tut-ring g-btn-red min-h-9 px-3" @click="stopTutorial(true)">{{ tr("終わる", "Finish") }}</button>
        <SimTutorialEditor v-if="TUT_EDITABLE && editing && tut.now.value && step" :key="tut.now.value.key" :text-key="tut.now.value.key" :step-id="step.id" :box-id="boxId" :draft="[tut.now.value.draft[0], tut.now.value.draft[1]]" />
      </template>
    </section>
  </template></Teleport>
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
