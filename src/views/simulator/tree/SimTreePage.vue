<!--
  SimTreePage.vue — クラフトの道 (ツリー) のページ (?page=sim-tree、2026-10-22 オーナー OK「UI の表面だけ」、開発版だけ・PC だけ)。
  入口 (web-page.ts の treePage・web/page.ts・WebApp.vue) はジン部長、中身はシミュ部長。設計は docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 11。
  一番上がフラクチャーの箱 (始まり)。下の＋で打つ手 → 矢印の先に結果の箱 (当たり・外れ…)。横の＋で当たりを足す、↩ で既にある箱へ戻す。
  箱はドラッグで動かす、1 つ戻す / Ctrl+Z。全体図 = 全画面に広げる / 全体を縮めて一望 (閉じたら元の位置へ)。100 人回す計算はまだ繋がない
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import TreeBox from "./TreeBox.vue";
import TreeHandPick from "./TreeHandPick.vue";
import TreeModPick from "./TreeModPick.vue";
import { useTree } from "./use-tree";
import { addHit, BOX_H, BOX_W, boundsOf, canRemove, clearHand, moveBox, removeHit, setAim, setBack, setDone, setHand, type Aim, type Hand, type HandKind, type TreeBox as Box } from "../../../services/simulator/tree/tree-model";
import { handLabel } from "../../../services/simulator/tree/tree-hands";
import { treePage } from "../../../state/web-page";
import { tr } from "../../../i18n/lang";

const t = useTree();
const doc = t.doc;
const PAD = 80;

/** 右の欄 (箱を選んだ時だけ) */
const panel = ref<{ kind: "hand" | "aim" | "fracture"; id: string } | null>(null);
/** 戻りの矢印の先を選んでいる箱 */
const picking = ref<string | null>(null);
const full = ref(false);
const overview = ref(false);

// ドラッグ中は画面の上だけで動かし、離した時に 1 回だけ組み替える (1 つ戻すが 1 手で済む)
const drag = ref<{ id: string; sx: number; sy: number; bx: number; by: number; x: number; y: number } | null>(null);
const posOf = (b: Box): { x: number; y: number } => (drag.value?.id === b.id ? { x: drag.value.x, y: drag.value.y } : { x: b.x, y: b.y });

const boxes = computed(() => Object.values(doc.value.boxes));
const bounds = computed(() => boundsOf(doc.value));
const ox = computed(() => PAD - bounds.value.x);
const oy = computed(() => PAD - bounds.value.y);
const area = computed(() => ({ w: bounds.value.w + PAD * 2 + 120, h: bounds.value.h + PAD * 2 + 60 }));

const viewport = ref<HTMLElement | null>(null);
const vpSize = ref({ w: 1000, h: 600 });
function measure(): void { const el = viewport.value; if (el) vpSize.value = { w: el.clientWidth, h: el.clientHeight }; }
/** 一望の縮め方 (全部が入る大きさ、大きくはしない) */
const scale = computed(() => (overview.value ? Math.min(1, (vpSize.value.w - 16) / area.value.w, (vpSize.value.h - 16) / area.value.h) : 1));

/** 矢印 (箱の下 → 手の札 → 結果の箱の上) */
const COLOR: Record<string, string> = { hit: "#e0b060", junk: "#e0707a", junkGone: "#9aa7b8", lost: "#a58be0" };
const edges = computed(() => boxes.value.filter((b) => b.hand && b.outs.length).map((b) => {
  const p = posOf(b);
  const px = p.x + BOX_W / 2 + ox.value, py = p.y + BOX_H + oy.value, jy = py + 46;
  return {
    id: b.id, hand: b.hand!, jx: px, jy, stem: `M ${px} ${py} L ${px} ${jy}`,
    to: b.outs.map((o) => {
      const c = doc.value.boxes[o]!, q = posOf(c);
      const cx = q.x + BOX_W / 2 + ox.value, cy = q.y + oy.value - 4;
      return { id: o, color: COLOR[c.out] ?? "#ccc", d: `M ${px} ${jy} C ${px} ${jy + 40} ${cx} ${cy - 50} ${cx} ${cy}` };
    }),
  };
}));
/** 戻りの矢印 (箱の横 → 戻り先の箱の横)。木の真ん中より右の箱は右を、左の箱は左を回す (ほかの箱を横切りにくい) */
const backs = computed(() => {
  const mid = bounds.value.x + bounds.value.w / 2;
  return boxes.value.filter((b) => b.back && doc.value.boxes[b.back]).map((b) => {
    const p = posOf(b), q = posOf(doc.value.boxes[b.back!]!);
    const right = p.x + BOX_W / 2 >= mid;
    const y1 = p.y + BOX_H / 2 + oy.value + 12, y2 = q.y + BOX_H / 2 + oy.value - 12;
    const x1 = (right ? p.x + BOX_W : p.x) + ox.value, x2 = (right ? q.x + BOX_W + 6 : q.x - 6) + ox.value;
    const reach = 70 + Math.abs(y1 - y2) * 0.08;
    const bend = right ? Math.max(x1, x2) + reach : Math.min(x1, x2) - reach;
    return { id: b.id, d: `M ${x1} ${y1} C ${bend} ${y1} ${bend} ${y2} ${x2} ${y2}` };
  });
});

function backLabel(b: Box): string {
  const to = b.back ? doc.value.boxes[b.back] : null;
  if (!to) return "";
  if (to.out === "start") return tr("始まり", "Start");
  if (to.out === "hit") return to.aim ? t.aimLabel(to.aim) : tr("当たり", "Hit");
  return to.out === "junk" ? tr("外れ", "Miss") : to.out === "junkGone" ? tr("外れが消えた", "Miss removed") : tr("狙いが消えた", "Target lost");
}

// 組み替え
function pickHand(h: Hand, kind: HandKind): void { const id = panel.value!.id; t.edit((d) => setHand(d, id, h, kind)); panel.value = null; }
function clearHandOf(): void { const id = panel.value!.id; t.edit((d) => clearHand(d, id)); panel.value = null; }
function pickAim(a: Aim): void {
  const p = panel.value!;
  t.edit((d) => { if (p.kind === "fracture") d.fracture = { ...a }; else setAim(d, p.id, a); });
  panel.value = null;
}
function onAim(b: Box): void { panel.value = { kind: b.out === "start" ? "fracture" : "aim", id: b.id }; }
function onAddHit(b: Box): void {
  let made: string | null = null;
  t.edit((d) => { made = addHit(d, b.parent!, b.id); });
  if (made) panel.value = { kind: "aim", id: made };
}
function onDone(b: Box): void { t.edit((d) => setDone(d, b.id, b.done === null ? "main" : b.done === "main" ? "compromise" : null)); }
function onTarget(b: Box): void {
  const from = picking.value;
  picking.value = null;
  if (from && from !== b.id) t.edit((d) => setBack(d, from, b.id));
}

// ドラッグ (画面の拡大率で割る)
function startDrag(b: Box, e: PointerEvent): void {
  if (overview.value) return;
  drag.value = { id: b.id, sx: e.clientX, sy: e.clientY, bx: b.x, by: b.y, x: b.x, y: b.y };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}
function onMove(e: PointerEvent): void {
  const g = drag.value;
  if (g) { g.x = g.bx + (e.clientX - g.sx) / scale.value; g.y = g.by + (e.clientY - g.sy) / scale.value; }
}
function endDrag(): void {
  window.removeEventListener("pointermove", onMove);
  const g = drag.value;
  drag.value = null;
  if (g && (Math.abs(g.x - g.bx) > 2 || Math.abs(g.y - g.by) > 2)) t.edit((d) => moveBox(d, g.id, g.x, g.y));
}

// 全体図: 広げる (全画面) / 一望 (縮める)。閉じたら元のスクロールの位置へ
let saved: { left: number; top: number } | null = null;
async function toggleView(kind: "full" | "overview"): Promise<void> {
  const el = viewport.value;
  const opening = kind === "full" ? !full.value : !overview.value;
  if (opening && !full.value && !overview.value && el) saved = { left: el.scrollLeft, top: el.scrollTop };
  if (kind === "full") full.value = !full.value; else overview.value = !overview.value;
  await nextTick();
  measure();
  if (!full.value && !overview.value && saved && viewport.value) { viewport.value.scrollTo(saved); saved = null; }
}

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); t.undo(); return; }
  if (e.key === "Escape") {
    if (picking.value) picking.value = null;
    else if (panel.value) panel.value = null;
    else if (full.value) void toggleView("full");
    else if (overview.value) void toggleView("overview");
    else close();
  }
}
const ro = new ResizeObserver(measure);
onMounted(() => { window.addEventListener("keydown", onKey); if (viewport.value) ro.observe(viewport.value); measure(); });
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointermove", onMove); ro.disconnect(); });

function close(): void { treePage.value = false; }
const panelBox = computed(() => (panel.value ? doc.value.boxes[panel.value.id] ?? null : null));
</script>

<template>
  <section data-tree-page class="min-w-0 flex-1 p-4">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("クラフトの道 (ツリー)", "Craft route tree") }}</h1>
      <button type="button" class="g-btn sm" @click="close">{{ tr("← 戻る", "← Back") }}</button>
    </div>

    <div class="g-panel flex flex-col gap-2 px-3 py-2" :class="full ? '!fixed inset-0 z-[60] !m-0 rounded-none' : ''">
      <!-- 帯: 全体の数字 (まだ) ・1 つ戻す・全体図 -->
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <span class="opacity-70">{{ tr("100 人回した時: 1 個あたり — 神 · 完成 —%", "100 runs: — div per item · —% done") }}</span>
        <span class="rounded-sm bg-white/10 px-1.5 text-[11px] opacity-70">{{ tr("計算はまだ繋いでいない", "Not calculated yet") }}</span>
        <span class="ml-auto flex items-center gap-1">
          <button type="button" data-tree-undo class="g-btn sm inline-flex items-center gap-1" :disabled="!t.canUndo.value" :title="tr('1 つ戻す (Ctrl+Z)', 'Undo (Ctrl+Z)')" @click="t.undo"><Icon name="undo" class="size-4" />{{ tr("1 つ戻す", "Undo") }}</button>
          <button type="button" data-tree-full class="g-btn sm" :aria-pressed="full" @click="toggleView('full')">{{ full ? tr("全画面を閉じる", "Exit full screen") : tr("全画面に広げる", "Full screen") }}</button>
          <button type="button" data-tree-overview class="g-btn sm" :aria-pressed="overview" @click="toggleView('overview')">{{ overview ? tr("一望を閉じる", "Exit overview") : tr("全体を一望", "Overview") }}</button>
          <button type="button" class="g-btn sm" :title="tr('始まりの箱だけに戻す (1 つ戻すで戻せる)', 'Back to just the start box (undo restores it)')" @click="t.reset">{{ tr("白紙に戻す", "Clear") }}</button>
        </span>
      </div>
      <p v-if="picking" class="rounded-md bg-cyan-500/15 px-2 py-1 text-[12px] text-cyan-100">{{ tr("戻り先の箱を押す (Esc でやめる)", "Click the box to return to (Esc cancels)") }}</p>

      <div class="flex min-h-0 gap-2" :class="full ? 'flex-1' : 'h-[calc(100vh-190px)] min-h-[480px]'">
        <!-- ツリー -->
        <div ref="viewport" data-tree-canvas class="relative min-w-0 flex-1 overflow-auto rounded-md bg-black/30">
          <div class="relative" :style="{ width: `${area.w * scale}px`, height: `${area.h * scale}px` }">
            <div class="absolute left-0 top-0 origin-top-left" :style="{ width: `${area.w}px`, height: `${area.h}px`, transform: `scale(${scale})` }">
              <svg class="pointer-events-none absolute inset-0" :width="area.w" :height="area.h">
                <defs>
                  <marker v-for="(c, k) in { ...COLOR, back: '#5fd0e0' }" :id="`tree-arrow-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="c" /></marker>
                </defs>
                <g v-for="e in edges" :key="e.id">
                  <path :d="e.stem" stroke="#e0b060" stroke-width="2.5" fill="none" />
                  <path v-for="o in e.to" :key="o.id" :d="o.d" :stroke="o.color" stroke-width="2.5" fill="none" :marker-end="`url(#tree-arrow-${doc.boxes[o.id]!.out})`" />
                </g>
                <path v-for="b in backs" :key="`back-${b.id}`" :d="b.d" stroke="#5fd0e0" stroke-width="2.5" fill="none" marker-end="url(#tree-arrow-back)" />
              </svg>
              <!-- 矢印の上の札 = 打つ手 (押すと替える・消す) -->
              <button v-for="e in edges" :key="`hand-${e.id}`" type="button" data-tree-hand class="absolute max-w-[300px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border-2 border-amber-500/70 bg-[#221a10] px-3 py-0.5 text-[12px] font-bold text-amber-100 hover:bg-amber-500/25"
                :style="{ left: `${e.jx}px`, top: `${e.jy}px` }" :title="handLabel(e.hand)" @click="panel = { kind: 'hand', id: e.id }">{{ handLabel(e.hand) }}</button>
              <TreeBox v-for="b in boxes" :key="b.id" :box="b" :x="posOf(b).x + ox" :y="posOf(b).y + oy" :removable="canRemove(doc, b.id)" :picking="!!picking && picking !== b.id" :selected="panel?.id === b.id || picking === b.id" :back-label="backLabel(b)"
                @drag="startDrag(b, $event)" @aim="onAim(b)" @next="panel = { kind: 'hand', id: b.id }" @add-hit="onAddHit(b)" @remove="t.edit((d) => removeHit(d, b.id))"
                @back="picking = b.id" @clear-back="t.edit((d) => setBack(d, b.id, null))" @done="onDone(b)" @target="onTarget(b)" />
            </div>
          </div>
        </div>

        <!-- 右の欄 -->
        <aside v-if="panel && panelBox" data-tree-panel class="flex w-[320px] shrink-0 flex-col overflow-y-auto rounded-md bg-white/[0.04] p-3">
          <TreeHandPick v-if="panel.kind === 'hand'" :key="`h-${panel.id}`" :current="panelBox.hand" @pick="pickHand" @clear="clearHandOf" @close="panel = null" />
          <TreeModPick v-else :key="`m-${panel.id}-${panel.kind}`" :mode="panel.kind === 'fracture' ? 'fracture' : 'hit'" :current="panel.kind === 'fracture' ? doc.fracture : panelBox.aim" @pick="pickAim" @close="panel = null" />
        </aside>
      </div>
    </div>
  </section>
</template>
