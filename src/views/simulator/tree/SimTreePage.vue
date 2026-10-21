<!--
  SimTreePage.vue — クラフトの道 (ツリー) のページ (?page=sim-tree、2026-10-22 オーナー OK「UI の表面だけ」、開発版だけ・PC だけ)。
  入口 (web-page.ts の treePage・web/page.ts・WebApp.vue) はジン部長、中身はシミュ部長。設計は docs/org/simulator/notes/2026-10-22-manual-sim-design.md の 11。
  一番上がフラクチャーの箱 (始まり)。下の＋で打つ手 (クラフト台の棚から) → 矢印の先に結果の箱。横の＋で当たりを足す、↩ で既にある箱へ戻す。
  ＋は長押しで引っ張ると置く所を選べ、箱の上で離すとその箱へつなぐ。箱はドラッグで動かす、1 つ戻す / Ctrl+Z。
  見え方 (拡大縮小・全画面) は use-tree-view.ts、上の帯 (欲しい MOD・メモ) は TreeAimsBar.vue。100 人回す計算はまだ繋がない
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import TreeMemoFloat from "./TreeMemoFloat.vue";
import TreeBox from "./TreeBox.vue";
import TreeHandShelf from "./TreeHandShelf.vue";
import TreeModPick from "./TreeModPick.vue";
import TreeNote from "./TreeNote.vue";
import TreeTrial from "./TreeTrial.vue";
import { useTree } from "./use-tree";
import { useTreeView } from "./use-tree-view";
import { craftStage as s } from "../../../state/craft-stage";
import { addHit, aimKey, BOX_H, BOX_W, canRemove, clearHand, moveBox, placeOuts, removeHit, setAim, setBack, setDone, setHand, tidy, handUses, type Aim, type Hand, type HandKind, type TreeBox as Box } from "../../../services/simulator/tree/tree-model";
import { handLabel } from "../../../services/simulator/tree/tree-hands";
import { aimHeld, aimsOf, sampleOf } from "../../../services/simulator/tree/tree-sample";
import { checkTree, type CheckIssue } from "../../../services/simulator/tree/tree-check";
import { treePage } from "../../../state/web-page";
import { tr } from "../../../i18n/lang";

const t = useTree();
const doc = t.doc;
/** これより動かしたらドラッグ、動かさずに離したら押した (手のぶれで箱が動かないよう 5px) */
const DRAG_SLOP = 5;
/** ＋をこれだけ押し続けたら「引っ張る」 */
const HOLD_MS = 300;

/** 右の欄 (箱を選んだ時だけ) */
const panel = ref<{ kind: "hand" | "aim" | "fracture" | "trial" | "note"; id: string } | null>(null);
/** 戻りの矢印の先を選んでいる箱 */
const picking = ref<string | null>(null);
/** メモの窓を開いているか (このブラウザに覚える。無くても使える) */
const MEMO_KEY = "exiledesk.tree.memo-open";
const memoOpen = ref((() => { try { return localStorage.getItem(MEMO_KEY) === "1"; } catch { return false; } })());
watch(memoOpen, (v) => { try { localStorage.setItem(MEMO_KEY, v ? "1" : "0"); } catch { /* 覚えられなくても使える */ } });
/** メモの窓の札で選んだ札 (その札を使っている箱が光る) */
const glowAim = ref<string | null>(null);
const v = useTreeView(doc, () => !!panel.value);
const { viewport, zoom, full, bounds, ox, oy, area, viewOnly } = v;

// ドラッグ中は画面の上だけで動かし、離した時に 1 回だけ組み替える (1 つ戻すが 1 手で済む)
const drag = ref<{ id: string; sx: number; sy: number; bx: number; by: number; x: number; y: number } | null>(null);
const posOf = (b: Box): { x: number; y: number } => (drag.value?.id === b.id ? { x: drag.value.x, y: drag.value.y } : { x: b.x, y: b.y });
const boxes = computed(() => Object.values(doc.value.boxes));

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
/**
 * 戻りの矢印 (2026-10-22 整列と一緒に): 箱の下の隙間 → ツリーの外側の通り道 → 戻り先の上の隙間 → 戻り先の上の辺に入る (オーナー「基本は相手の箱の上の辺」)。
 * 箱の中を通らない (整列した後は段と段の間に箱が無い)。木の真ん中より右の箱は右の外側、左は左の外側。通り道は 1 本ずつ外へずらす
 */
const backs = computed(() => {
  const mid = bounds.value.x + bounds.value.w / 2, minX = bounds.value.x, maxX = bounds.value.x + bounds.value.w;
  let li = 0, ri = 0;
  return boxes.value.filter((b) => b.back && doc.value.boxes[b.back]).map((b) => {
    const p = posOf(b), q = posOf(doc.value.boxes[b.back!]!);
    const right = p.x + BOX_W / 2 >= mid;
    const lane = (right ? maxX + 28 + 12 * ri++ : minX - 28 - 12 * li++) + ox.value;
    const sx = p.x + BOX_W / 2 + ox.value, sy = p.y + BOX_H + oy.value, gy1 = sy + 16;
    const tx = q.x + BOX_W / 2 + (right ? 44 : -44) + ox.value, ty = q.y + oy.value, gy2 = ty - 18;
    return { id: b.id, d: `M ${sx} ${sy} L ${sx} ${gy1} L ${lane} ${gy1} L ${lane} ${gy2} L ${tx} ${gy2} L ${tx} ${ty - 3}` };
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
/** ＋を引っ張って空き所で離した時の置き場所 (手を選んだら結果の箱をそこへ) */
let pendingDrop: { id: string; x: number; y: number } | null = null;
function pickHand(h: Hand, kind: HandKind, aims: Aim[]): void {
  const id = panel.value!.id, drop = pendingDrop?.id === id ? pendingDrop : null;
  t.edit((d) => { setHand(d, id, h, kind, aims); if (drop) placeOuts(d, id, drop.x, drop.y); });
  pendingDrop = null;
  panel.value = null;
}
/**
 * ツリーの空いた所を押した = 右の欄を閉じる (よくあるモーダルと同じ。オーナー 10-22)。
 * 空き所のドラッグは画面を動かすだけ (動かさずに離した時だけ閉じる)
 */
function onCanvasDown(e: PointerEvent): void {
  v.pan(e, !!picking.value || !!plus.value);
  if (!panel.value || picking.value || (e.target as HTMLElement).closest("[data-tree-box],button")) return;
  const sx = e.clientX, sy = e.clientY;
  window.addEventListener("pointerup", (u) => { if (Math.hypot(u.clientX - sx, u.clientY - sy) <= DRAG_SLOP) closeHand(); }, { once: true });
}
function closeHand(): void { pendingDrop = null; panel.value = null; }
function clearHandOf(): void { const id = panel.value!.id; t.edit((d) => clearHand(d, id)); panel.value = null; }
function pickAim(a: Aim): void {
  const p = panel.value!;
  t.edit((d) => { if (p.kind === "fracture") d.fracture = { ...a }; else setAim(d, p.id, a); });
  panel.value = null;
}
function onAim(b: Box): void { panel.value = { kind: b.out === "start" ? "fracture" : "aim", id: b.id }; }
function onAddHit(b: Box, at?: { x: number; y: number }, link?: string): void {
  let made: string | null = null;
  t.edit((d) => {
    made = addHit(d, b.parent!, b.id);
    if (made && at) moveBox(d, made, at.x - BOX_W / 2, at.y);
    if (made && link) setBack(d, made, link);
  });
  if (made) panel.value = { kind: "aim", id: made };
}
function onDone(b: Box): void { t.edit((d) => setDone(d, b.id, b.done === null ? "main" : b.done === "main" ? "compromise" : null)); }
function onTarget(b: Box): void {
  const from = picking.value;
  picking.value = null;
  if (from && from !== b.id) t.edit((d) => setBack(d, from, b.id));
}
// ルート精査 (押した時だけ。組み替えたら消す)
const issues = ref<CheckIssue[] | null>(null);
const checking = ref(false);
watch(doc, () => { issues.value = null; });
async function onCheck(): Promise<void> {
  const d = s.data.value;
  if (!d || checking.value) return;
  checking.value = true;
  await new Promise((r) => setTimeout(r, 30)); // 「精査中」を先に出す
  try { issues.value = checkTree(d, doc.value); } finally { checking.value = false; }
}
const issueOf = (b: Box): string | null => issues.value?.filter((x) => x.boxId === b.id).map((x) => x.text).join(" / ") || null;
function goIssue(id: string): void { v.reveal(id, true); }

/** 整列して、全体に合わせる (1 つ戻すで元の並びへ) */
async function onTidy(): Promise<void> {
  t.edit((d) => tidy(d));
  await v.fit();
}
/** カオススパムを 1 押しで (当たりの既定 = このツリーの狙いのうち、この箱でまだ付いていない物を全部) */
function onSpam(b: Box): void {
  const d0 = s.data.value;
  const all = aimsOf(doc.value);
  const it = d0 ? sampleOf(d0, doc.value, b.id, 1).item : null;
  const aims = d0 && it ? all.filter((a) => !aimHeld(d0, it, a)) : all;
  t.edit((d) => setHand(d, b.id, { currency: "chaos", omens: [], catalyst: null, quality: 0, repeat: { until: "hit", max: null } }, "spam", aims));
}

// 箱のドラッグ (画面の倍率で割る)
function startDrag(b: Box, e: PointerEvent): void {
  if (viewOnly.value) return;
  drag.value = { id: b.id, sx: e.clientX, sy: e.clientY, bx: b.x, by: b.y, x: b.x, y: b.y };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}
function onMove(e: PointerEvent): void {
  const g = drag.value;
  if (g) { g.x = g.bx + (e.clientX - g.sx) / zoom.value; g.y = g.by + (e.clientY - g.sy) / zoom.value; }
}
function endDrag(): void {
  window.removeEventListener("pointermove", onMove);
  const g = drag.value;
  drag.value = null;
  if (g && (Math.abs(g.x - g.bx) > DRAG_SLOP || Math.abs(g.y - g.by) > DRAG_SLOP)) t.edit((d) => moveBox(d, g.id, g.x, g.y));
  else if (g) panel.value = { kind: "trial", id: g.id }; // 動かさずに離した = 箱を押した → 試し打ち
}

// ＋: 押すだけ = 足す (今まで通り)。長押し (か大きく動かす) で引っ張る → 空き所で離す = そこに置く / 箱の上で離す = その箱へつなぐ
const plus = ref<{ id: string; kind: "side" | "next"; sx: number; sy: number; cx: number; cy: number; active: boolean; target: string | null } | null>(null);
let plusTimer = 0;
function onPlus(b: Box, kind: "side" | "next", e: PointerEvent): void {
  if (viewOnly.value) return;
  plus.value = { id: b.id, kind, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, active: false, target: null };
  plusTimer = window.setTimeout(() => { if (plus.value) plus.value.active = true; }, HOLD_MS);
  window.addEventListener("pointermove", plusMove);
  window.addEventListener("pointerup", plusUp, { once: true });
}
function plusMove(e: PointerEvent): void {
  const p = plus.value;
  if (!p) return;
  p.cx = e.clientX; p.cy = e.clientY;
  if (!p.active && Math.hypot(p.cx - p.sx, p.cy - p.sy) > 8) p.active = true;
  if (p.active) {
    const id = (document.elementFromPoint(p.cx, p.cy) as HTMLElement | null)?.closest<HTMLElement>("[data-tree-box]")?.dataset.boxId ?? null;
    p.target = id && id !== p.id ? id : null;
  }
}
function plusUp(): void {
  window.removeEventListener("pointermove", plusMove);
  clearTimeout(plusTimer);
  const p = plus.value;
  plus.value = null;
  const b = p ? doc.value.boxes[p.id] : null;
  if (!p || !b) return;
  if (!p.active) { if (p.kind === "side") onAddHit(b); else panel.value = { kind: "hand", id: b.id }; return; }
  const at = v.toWorld(p.cx, p.cy);
  if (p.kind === "side") onAddHit(b, p.target ? undefined : at, p.target ?? undefined);
  else if (p.target) t.edit((d) => setBack(d, b.id, p.target!));
  else { pendingDrop = { id: b.id, x: at.x, y: at.y }; panel.value = { kind: "hand", id: b.id }; }
}
/** 引っ張っている＋の線 (＋の所 → 指の所、ツリーの座標) */
const plusLine = computed(() => {
  const p = plus.value, b = p ? doc.value.boxes[p.id] : null;
  if (!p?.active || !b) return null;
  const q = posOf(b), end = v.toWorld(p.cx, p.cy);
  const x1 = (p.kind === "side" ? q.x + BOX_W + 2 : q.x + BOX_W / 2) + ox.value, y1 = (p.kind === "side" ? q.y + BOX_H / 2 : q.y + BOX_H + 20) + oy.value;
  return `M ${x1} ${y1} L ${end.x + ox.value} ${end.y + oy.value}`;
});

watch(() => panel.value?.id, (id) => { if (id) v.reveal(id); });

function onKey(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); t.undo(); return; }
  if (e.key === "Escape") {
    if (plus.value) { plus.value = null; window.removeEventListener("pointermove", plusMove); }
    else if (picking.value) picking.value = null;
    else if (panel.value) panel.value = null;
    else if (full.value) void v.toggleFull();
    else close();
  }
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointermove", plusMove); clearTimeout(plusTimer); });

function close(): void { treePage.value = false; }
const panelBox = computed(() => (panel.value ? doc.value.boxes[panel.value.id] ?? null : null));
/** 一覧に出す箱の名前 (種類 + 当たりの札) */
function boxName(id: string): string {
  const b = doc.value.boxes[id];
  if (!b) return id;
  if (b.out === "start") return tr("始まり", "Start");
  const k = { hit: tr("当たり", "Hit"), junk: tr("外れ", "Miss"), junkGone: tr("外れが消えた", "Miss removed"), lost: tr("狙いが消えた", "Target lost") }[b.out];
  return b.out === "hit" && b.aim ? `${k} ${t.aimLabel(b.aim)}` : k;
}
/** 縮めて組んでいる時 (75〜99%) の倍率の逆数: 押せる物だけ大きさを戻す */
const inv = computed(() => (viewOnly.value ? 1 : Math.max(1, 1 / zoom.value)));
/** 光る箱: MOD の札 = その札の当たりの箱、カレンシーの札 ("cur:" + キー) = その手を使っている箱 */
const glowOf = (b: Box): boolean => {
  const g = glowAim.value;
  if (!g) return false;
  if (g.startsWith("cur:")) return handUses(b, g.slice(4));
  return b.out === "hit" && !!b.aim && aimKey(b.aim) === g;
};
</script>

<template>
  <section data-tree-page class="min-w-0 flex-1 p-4">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <h1 class="g-tabbar g-brush flex min-w-0 flex-1 items-center px-8 text-[22px] tracking-[0.18em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000,0_0_16px_rgba(255,200,110,0.3)]">{{ tr("クラフトの道 (ツリー)", "Craft route tree") }}</h1>
      <button type="button" class="g-btn sm" @click="close">{{ tr("← 戻る", "← Back") }}</button>
    </div>

    <div class="g-panel flex flex-col gap-2 px-3 py-2" :class="full ? '!fixed inset-0 z-[60] !m-0 rounded-none' : ''">
      <!-- 帯: 全体の数字 (まだ) ・1 つ戻す・拡大縮小・全画面 -->
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <span class="opacity-70">{{ tr("100 人回した時: 1 個あたり — 神 · 完成 —%", "100 runs: — div per item · —% done") }}</span>
        <span class="rounded-sm bg-white/10 px-1.5 text-[11px] opacity-70">{{ tr("計算はまだ繋いでいない", "Not calculated yet") }}</span>
        <span class="ml-auto flex items-center gap-1">
          <button type="button" data-tree-undo class="g-btn sm inline-flex items-center gap-1" :disabled="!t.canUndo.value" :title="tr('1 つ戻す (Ctrl+Z)', 'Undo (Ctrl+Z)')" @click="t.undo"><Icon name="undo" class="size-4" />{{ tr("1 つ戻す", "Undo") }}</button>
          <span class="flex items-center gap-0.5" role="group" :aria-label="tr('拡大縮小 (Ctrl + ホイールでも)', 'Zoom (also Ctrl + wheel)')" :title="tr('拡大縮小 (Ctrl + ホイールでも)', 'Zoom (also Ctrl + wheel)')">
            <button type="button" data-tree-zoom-out class="g-btn sm w-8" :aria-label="tr('縮める', 'Zoom out')" @click="v.zoomOut">−</button>
            <button type="button" data-tree-zoom-reset class="g-btn sm w-14 tabular-nums" :title="tr('等倍に戻す', 'Reset to 100%')" @click="v.setZoom(1)">{{ Math.round(zoom * 100) }}%</button>
            <button type="button" data-tree-zoom-in class="g-btn sm w-8" :aria-label="tr('広げる', 'Zoom in')" @click="v.zoomIn">＋</button>
            <button type="button" data-tree-fit class="g-btn sm" @click="v.fit">{{ tr("全体に合わせる", "Fit all") }}</button>
          </span>
          <button type="button" data-tree-tidy class="g-btn sm" :title="tr('段ごとに横一列・兄弟は親の下に等間隔・戻りの矢印は箱の外側 (1 つ戻すで元の並びへ)', 'Rows by depth, siblings evenly under the parent, return arrows outside the boxes (undo restores)')" @click="onTidy">{{ tr("整列", "Tidy") }}</button>
          <button type="button" data-tree-check class="g-btn sm" :disabled="checking" :title="tr('5 人をエンジンで辿って、止まる所・打てない手・付かない当たり・完成に着かない道を探す (費用は出さない)', 'Walk 5 runs with the engine to find dead ends, unusable crafts, unreachable hits and paths that never finish (no costs)')" @click="onCheck">{{ checking ? tr("精査中…", "Checking…") : tr("ルート精査", "Check route") }}</button>
          <button type="button" data-tree-memo class="g-btn sm inline-flex items-center gap-1" :aria-pressed="memoOpen" :title="tr('欲しい MOD とメモの窓 (ツリーを押しても閉じない)', 'Wanted mods & notes window (stays open while you edit)')" @click="memoOpen = !memoOpen"><Icon name="pencil" class="size-4" />{{ tr("メモ", "Notes") }}<span v-if="doc.note" class="size-1.5 rounded-full bg-amber-400" /></button>
          <button type="button" data-tree-full class="g-btn sm" :aria-pressed="full" @click="v.toggleFull">{{ full ? tr("全画面を閉じる", "Exit full screen") : tr("全画面に広げる", "Full screen") }}</button>
          <button type="button" class="g-btn sm" :title="tr('始まりの箱だけに戻す (1 つ戻すで戻せる)', 'Back to just the start box (undo restores it)')" @click="t.reset">{{ tr("白紙に戻す", "Clear") }}</button>
        </span>
      </div>
      <!-- ルート精査の結果 (押した時だけ) -->
      <div v-if="issues" data-tree-issues class="flex flex-col gap-1 rounded-md px-2 py-1.5 text-[12px]" :class="issues.length ? 'bg-rose-500/10' : 'bg-emerald-500/10'">
        <div class="flex items-center gap-2">
          <b :class="issues.length ? 'text-rose-200' : 'text-emerald-200'">{{ issues.length ? tr(`穴 ${issues.length} 件`, `${issues.length} issue(s)`) : tr("穴は見つからなかった (5 人で全部の枝を通した)", "No issues found (all branches walked by 5 runs)") }}</b>
          <button type="button" class="g-btn sm ml-auto" @click="issues = null">{{ tr("閉じる", "Close") }}</button>
        </div>
        <button v-for="(x, i) in issues" :key="i" type="button" data-tree-issue-row class="flex min-h-7 items-center gap-2 rounded px-1 text-left hover:bg-white/5" @click="goIssue(x.boxId)">
          <span class="shrink-0 rounded-sm bg-rose-600 px-1.5 text-[11px] font-bold text-white">!</span>
          <span class="max-w-[40%] shrink-0 truncate opacity-70" :title="boxName(x.boxId)">{{ boxName(x.boxId) }}</span>
          <span class="min-w-0 truncate" :title="x.text">{{ x.text }}</span>
        </button>
      </div>
      <p v-if="picking" class="rounded-md bg-cyan-500/15 px-2 py-1 text-[12px] text-cyan-100">{{ tr("戻り先の箱を押す (Esc でやめる)", "Click the box to return to (Esc cancels)") }}</p>
      <p v-else-if="viewOnly" class="rounded-md bg-white/[0.06] px-2 py-1 text-[12px] opacity-80">{{ tr("縮めて見ている間は箱を押すとそこへ寄る (組むのは 75% 以上で)", "While zoomed out, click a box to jump to it (edit at 75% or more)") }}</p>

      <div class="flex min-h-0 gap-2" :class="full ? 'flex-1' : 'h-[calc(100vh-230px)] min-h-[480px]'">
        <!-- ツリー -->
        <div ref="viewport" data-tree-canvas class="relative min-w-0 flex-1 cursor-move overflow-auto rounded-md bg-black/30" @pointerdown="onCanvasDown">
          <div class="relative" :style="{ width: `${area.w * zoom}px`, height: `${area.h * zoom}px` }">
            <div class="absolute left-0 top-0 origin-top-left" :style="{ width: `${area.w}px`, height: `${area.h}px`, transform: `scale(${zoom})` }">
              <svg class="pointer-events-none absolute inset-0" :width="area.w" :height="area.h">
                <defs>
                  <marker v-for="(c, k) in { ...COLOR, back: '#5fd0e0' }" :id="`tree-arrow-${k}`" :key="k" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" :fill="c" /></marker>
                </defs>
                <g v-for="e in edges" :key="e.id">
                  <path :d="e.stem" stroke="#e0b060" stroke-width="2.5" fill="none" />
                  <path v-for="o in e.to" :key="o.id" :d="o.d" :stroke="o.color" stroke-width="2.5" fill="none" :marker-end="`url(#tree-arrow-${doc.boxes[o.id]!.out})`" />
                </g>
                <path v-for="b in backs" :key="`back-${b.id}`" data-tree-back :d="b.d" stroke="#5fd0e0" stroke-width="2.5" stroke-linejoin="round" fill="none" marker-end="url(#tree-arrow-back)" />
                <path v-if="plusLine" data-tree-plus-line :d="plusLine" stroke="#5fd0e0" stroke-width="3" fill="none" marker-end="url(#tree-arrow-back)" />
              </svg>
              <!-- 矢印の上の札 = 打つ手 (押すと替える・消す) -->
              <button v-for="e in edges" :key="`hand-${e.id}`" type="button" data-tree-hand class="absolute max-w-[300px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border-2 border-amber-500/70 bg-[#221a10] px-3 py-1 text-[12px] font-bold text-amber-100 hover:bg-amber-500/25"
                :class="viewOnly ? 'pointer-events-none' : ''" :style="{ left: `${e.jx}px`, top: `${e.jy}px`, scale: String(inv) }" :title="handLabel(e.hand)" @click="panel = { kind: 'hand', id: e.id }">{{ handLabel(e.hand) }}</button>
              <TreeBox v-for="b in boxes" :key="b.id" :box="b" :x="posOf(b).x + ox" :y="posOf(b).y + oy" :removable="canRemove(doc, b.id)" :picking="!!picking && picking !== b.id"
                :selected="panel?.id === b.id || picking === b.id || plus?.target === b.id" :back-label="backLabel(b)" :view-only="viewOnly" :glow="glowOf(b)" :issue="issueOf(b)" :inv="inv"
                @drag="startDrag(b, $event)" @aim="onAim(b)" @plus="(k, e) => onPlus(b, k, e)" @remove="t.edit((d) => removeHit(d, b.id))"
                @back="picking = b.id" @clear-back="t.edit((d) => setBack(d, b.id, null))" @done="onDone(b)" @target="onTarget(b)" @focus="v.focusBox(b.id)"
                @note="panel = { kind: 'note', id: b.id }" @spam="onSpam(b)" />
            </div>
          </div>
        </div>

        <!-- 右の欄 -->
        <aside v-if="panel && panelBox" data-tree-panel class="flex shrink-0 flex-col overflow-y-auto rounded-md bg-white/[0.04] p-3" :class="panel.kind === 'trial' || panel.kind === 'hand' ? 'w-[400px]' : 'w-[320px]'">
          <TreeHandShelf v-if="panel.kind === 'hand'" :key="`h-${panel.id}`" :box-id="panel.id" :current="panelBox.hand" @pick="pickHand" @clear="clearHandOf" @close="closeHand" />
          <TreeTrial v-else-if="panel.kind === 'trial'" :key="`t-${panel.id}`" :box-id="panel.id" @close="panel = null" @next="panel = { kind: 'hand', id: panel.id }" @note="panel = { kind: 'note', id: panel.id }" />
          <TreeNote v-else-if="panel.kind === 'note'" :key="`n-${panel.id}`" :box-id="panel.id" @close="panel = null" />
          <TreeModPick v-else :key="`m-${panel.id}-${panel.kind}`" :mode="panel.kind === 'fracture' ? 'fracture' : 'hit'" :current="panel.kind === 'fracture' ? doc.fracture : panelBox.aim" @pick="pickAim" @close="panel = null" />
        </aside>
      </div>
    </div>
    <!-- 欲しい MOD とメモの浮かぶ窓 (ページの中で一番上、ツリーを押しても閉じない) -->
    <TreeMemoFloat v-model:open="memoOpen" v-model:glow="glowAim" />
  </section>
</template>
