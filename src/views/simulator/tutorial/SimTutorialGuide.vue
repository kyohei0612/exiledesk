<!--
  SimTutorialGuide.vue — シミュのチュートリアルの案内 (2026-10-26 夜オーナー「メモ帳みたいな感じでくっつけて、一緒に進行していく」)。
  押す所を光る枠で囲み、そのそばにメモ帳のような小さな札 (文 + n / m・最初から・やめる)。手順が進むと札も一緒に動く。札は光る枠に被らない所へ (T-35)。
  光る所・道の箱・結果のほかは灰色の幕で覆い、押せなくする (T-30・Q7 A、11-03 オーナー「ほかグレーアウトして欲しいな完全に」。重なりの段は U-17 の 4)。
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
import { handOpen, inView } from "./tut-dom";
import { clipRect, litRect, maskPath, softPath, type Rect } from "./tut-mask";

const tut = useSimTutorial();
const ring = ref<Rect | null>(null);
/** 灰色の幕の形 (SVG の d、dark = 黒 0.6・soft = 薄い黒 0.3) と大きさ */
const mask = ref<{ d: string; soft: string; w: number; h: number } | null>(null);
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
/** チュートリアルが描く層 (覆いの数えから外す) */
const TUT_LAYERS = "[data-tut-card], [data-tut-ring], [data-tut-mask]";
/** 要素の真ん中で、札と枠と幕を除いた一番上の物がその要素の外 (帯などに覆われている) */
function covered(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const front = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find((e) => !e.closest(TUT_LAYERS));
  return !!front && !el.contains(front) && !front.contains(el);
}
/**
 * 札の置き場 (T-35): 光る所の右 → 左 → 下 → 上 (それぞれ真ん中・端に揃える)、次に四隅の中から、画面に収まって光る枠に重ならない所。
 * そのうち明るくした所 (道の箱・結果) との重なりが一番小さい所 (同じなら前の順)。どこも光る枠に重なるなら重なりの一番小さい隅。光る所が無ければ左下
 * (前は光る枠だけを避け、明るくした箱の中身に被った、11-03 オーナー「被ったりしてる所あるし」)
 */
function place(r: Rect | null, lit: Rect[] = []): void {
  const z = zoomOf(), W = window.innerWidth / z, H = window.innerHeight / z, cw = cardEl.value?.offsetWidth ?? 340, ch = cardEl.value?.offsetHeight ?? 160, g = 14, m = 8;
  if (narrow.value) { placePhone(r, W, H, ch, m); return; }
  if (!r) { pos.value = null; return; }
  const clampY = (y: number): number => Math.min(Math.max(m, y), H - ch - m), clampX = (x: number): number => Math.min(Math.max(m, x), W - cw - m);
  const ys = [r.y + r.h / 2 - ch / 2, r.y, r.y + r.h - ch].map(clampY), xs = [r.x + r.w / 2 - cw / 2, r.x, r.x + r.w - cw].map(clampX);
  const sides = [
    ...ys.map((top) => ({ left: r.x + r.w + g, top, ok: r.x + r.w + g + cw <= W - m })),
    ...ys.map((top) => ({ left: r.x - g - cw, top, ok: r.x - g - cw >= m })),
    ...xs.map((left) => ({ left, top: r.y + r.h + g, ok: r.y + r.h + g + ch <= H - m })),
    ...xs.map((left) => ({ left, top: r.y - g - ch, ok: r.y - g - ch >= m })),
  ];
  const lap = (t: { left: number; top: number }, q: Rect): number => Math.max(0, Math.min(t.left + cw, q.x + q.w) - Math.max(t.left, q.x)) * Math.max(0, Math.min(t.top + ch, q.y + q.h) - Math.max(t.top, q.y));
  const corners = [{ left: m, top: H - ch - m }, { left: W - cw - m, top: H - ch - m }, { left: W - cw - m, top: m }, { left: m, top: m }];
  const free = [...sides.filter((x) => x.ok), ...corners].filter((x) => !lap(x, r));
  const cover = (t: { left: number; top: number }): number => lit.reduce((s, q) => s + lap(t, q), 0);
  const t = free.length ? free.reduce((a, b) => (cover(b) < cover(a) ? b : a)) : corners.reduce((a, b) => (lap(b, r) < lap(a, r) ? b : a));
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
  const front = bar && bar.height > 0 ? document.elementsFromPoint(bar.left + bar.width / 2, bar.top + 4).find((e) => !e.closest(TUT_LAYERS)) : null;
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
/** 幕から抜く結果 (最終チェックの ✓・100 人のまとめ) */
const LIT_RESULTS = "[data-tree-test-ok], [data-tree-run-report]";
/** 完成形 (木のページの左上の札・完成形のページのカード)。全部の段で薄い幕にする (T-30 の光り方) */
const GOAL = "[data-tree-goal], [data-tree-goal-card]";
/**
 * 幕の穴 (T-30 の光り方): clear = 幕なし (光る所・結果)、soft = 薄い幕 (完成形・道の箱。道の箱は窓が開いている時は窓の下なので出さず、木の枠の中で切る)。
 * 前に見えていない物 (窓などの下) は抜かない (抜くと上の窓が明るく見える)
 */
function holes(el: HTMLElement | null, z: number): { clear: Rect[]; soft: Rect[] } {
  const clear: Rect[] = [], out: Rect[] = [];
  const t = el ? litRect(el, z, 4) : null;
  if (t) clear.push(t);
  for (const e of document.querySelectorAll<HTMLElement>(GOAL)) { const r = e.getClientRects().length && !covered(e) ? litRect(e, z, 4) : null; if (r) out.push(r); }
  const fr = document.querySelector("[data-tree-frame]");
  const f = fr ? litRect(fr, z) : null;
  if (f && !handOpen()) {
    const ids = new Set(tut.steps.value.slice(0, tut.index.value + 1).flatMap((st) => (st.kind === "hand" || st.kind === "done" || st.kind === "fail") && tut.roles.value[st.box] ? [tut.roles.value[st.box]!] : []));
    for (const id of ids) {
      const b = document.querySelector<HTMLElement>(`[data-box-id="${CSS.escape(id)}"]`);
      const r = b && !covered(b) ? litRect(b, z, 4) : null;
      const c = r ? clipRect(r, f) : null;
      if (c) out.push(c);
    }
  }
  for (const e of document.querySelectorAll<HTMLElement>(LIT_RESULTS)) { const r = e.getClientRects().length && !covered(e) ? litRect(e, z, 4) : null; if (r) clear.push(r); }
  return { clear, soft: out };
}
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
  const W = window.innerWidth / z, H = window.innerHeight / z;
  // 光らせる所が決まっているのに見つからない (目印が描かれていない・別の木を見ている) 時は幕を掛けない。押す所まで灰色になって進めなくなった
  // (11-03 オーナー「案内する所さえグレアウトしてるしなんなん」。1440 の dev が HMR の後に木の状態を 2 つ持ち、完成形のカードに目印が無かった)
  const lost = !!tut.target.value && !el;
  const hs = tutOn.value && !off.value && !lost ? holes(el, z) : null;
  mask.value = hs ? { d: maskPath(W, H, [...hs.clear, ...hs.soft]), soft: softPath(W, H, hs.soft, hs.clear), w: W, h: H } : null;
  // 光る所が動かなければ札も動かない (打っている間も)。書く所を開いて背が伸びた時は画面に収まる所へ。明るくした所 (光る所の外) もなるべく避ける
  place(ring.value, hs ? [...hs.clear.slice(el ? 1 : 0), ...hs.soft] : []);
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
  // 帯の「次へ」・穴チェックを押したか (木に出ないので押しを拾う。capture = 押しは止めない)
  document.addEventListener("click", noteClick, true);
});
onBeforeUnmount(() => { cancelAnimationFrame(raf); clearInterval(timer); document.removeEventListener("click", noteClick, true); });
// 何手目まで進んだかの記録 (1 手進むたびに 1 回)
watch(() => (tutOn.value ? tut.pos.value : -1), (i) => { if (i >= 0) simOp("tutorial-step", i); });
/** 木がチュートリアルの木でなくなった (別のレシピを開いた・ベースを替えた) */
const off = computed(() => !tut.onRoute.value);
const step = computed(() => tut.step.value);
const text = computed(() => tut.text.value);
const boxId = computed(() => { const st = step.value; return st && (st.kind === "hand" || st.kind === "done" || st.kind === "fail") ? tut.roles.value[st.box] : undefined; });
/** 最初から: 進み (始め方を決めた・手を足した) がある時は確かめる (前は確かめなしで木の進みが消えた、モンキー 7 の 2) */
function restart(): void { if (tutHasProgress() && !window.confirm(tr("今の木の進みを消して、最初からやり直しますか? (1 つ戻すで戻せます)", "Clear the current progress and start over? (Undo brings it back)"))) return; startTutorial(); }
function quit(): void { if (tutDirty.value && !window.confirm("保存していない文がある。やめても画面の中には残る (保存はまだ)")) return; stopTutorial(); }
</script>

<template>
  <!-- body へ出す (木のページの中は transform のある親があり、fixed の枠が親の分ずれた) -->
  <Teleport to="body"><template v-if="tutOn">
    <!-- 灰色の幕 (z 1100、U-17 の 4)。塗った所だけが押し・ホバー・ホイールを受け止め、穴の所は下へ届く。押しても窓の「枠の外」に数えない (data-dismiss-keep)、Esc の窓には数えない (data-overlay を付けない、U-17 の 8) -->
    <!-- 光り方 (T-30): 濃い幕 (押しを受け止める) + 完成形・道の箱の薄い幕 (押せる)。縁はぼかす (押しの形はぼかす前のまま) -->
    <svg v-if="mask" data-tut-mask data-dismiss-keep aria-hidden="true" class="pointer-events-none fixed left-0 top-0 z-[1100]" :width="mask.w" :height="mask.h" :viewBox="`0 0 ${mask.w} ${mask.h}`">
      <defs><filter id="tut-feather" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6" /></filter></defs>
      <path :d="mask.d" filter="url(#tut-feather)" class="tut-mask pointer-events-auto" @pointerdown.stop.prevent @mousedown.stop.prevent @click.stop.prevent @dblclick.stop.prevent @contextmenu.prevent @wheel.prevent @touchstart.stop.prevent />
      <path :d="mask.soft" filter="url(#tut-feather)" class="tut-mask-soft" />
    </svg>
    <div v-if="ring && !off" data-tut-ring aria-hidden="true" class="tut-ring pointer-events-none fixed z-[1200] rounded-lg" :style="{ left: `${ring.x}px`, top: `${ring.y}px`, width: `${ring.w}px`, height: `${ring.h}px` }" />
    <!-- メモ帳の札 (光る所のそばへ動く。無ければ左下) -->
    <!-- data-dismiss-keep = 札を押しても開いている窓の「枠の外」に数えない (札の「やめる」で手の窓が閉じ、押しが飲まれた、モンキー 7 の 5) -->
    <section ref="cardEl" data-tut-card data-dismiss-keep class="tut-note fixed z-[1300] flex flex-col gap-1.5 rounded-lg border border-amber-200/50 px-3 py-2 text-[13px] text-[#2b2217] shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
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
/* 灰色の幕 (黒 0.6、彩度は残す。U-17 の 7) */
.tut-mask { fill: rgba(0, 0, 0, 0.6); }
/* 完成形・道の箱の薄い幕 (一段弱い明るさ、T-30 の光り方) */
.tut-mask-soft { fill: rgba(0, 0, 0, 0.3); }
/* 押す所の光る枠 (ゆっくり明るさだけ揺らす) */
.tut-ring { box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.95), 0 0 18px 4px rgba(251, 191, 36, 0.55); animation: tut-pulse 1.4s ease-in-out infinite; }
@keyframes tut-pulse { 50% { box-shadow: 0 0 0 3px rgba(253, 230, 138, 1), 0 0 26px 8px rgba(251, 191, 36, 0.75); } }
/* メモ帳の札: 紙の色 + 罫線、動く時はすっと移る */
.tut-note { background: #f3e7c6 repeating-linear-gradient(to bottom, transparent 0 21px, rgba(122, 75, 18, 0.12) 21px 22px); transition: left 0.25s ease, top 0.25s ease; }
.tut-btn { height: 24px; padding: 0 8px; border: 1px solid rgba(122, 75, 18, 0.45); border-radius: 4px; font-size: 12px; color: #4a3214; background: rgba(255, 255, 255, 0.4); }
.tut-btn:hover { background: rgba(255, 255, 255, 0.75); }
.tut-btn[aria-pressed="true"] { background: #7a4b12; color: #fff; }
@media (prefers-reduced-motion: reduce) { .tut-ring { animation: none; } .tut-note { transition: none; } }
</style>
