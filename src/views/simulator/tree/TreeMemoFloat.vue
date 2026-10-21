<!--
  TreeMemoFloat.vue — ツリーのメモの浮かぶ窓 (2026-10-22 オーナー「欲しい MOD 設定とかはメモの中に。メモはポップアップで、他のとこクリックしても後ろにいかない。
  見ながらツリーつくるから」)。ページの中だけの窓 (他のウィンドウの上には出ない)。ツリーを押しても閉じず、閉じるのは窓の × と帯の「メモ」だけ。
  中身: 欲しい MOD (このツリーで使っている当たりの札。完成の箱 (本命 / 妥協) に着く道の札には印、押すとその札の箱が光る) とツリー全体のメモ。
  題の所をドラッグで動かせる。開いているか・場所はこのブラウザに覚える (無くても使える)。メモは欄を離れた時に保存 (1 つ戻すが 1 文字ずつにならないよう)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { aimKey, setNote, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const open = defineModel<boolean>("open", { default: false });
const glow = defineModel<string | null>("glow", { default: null });
const t = useTree();

/** 完成の箱に着く道の札 (始まりからその箱まで通った当たりの箱の札) */
function pathAims(d: TreeDoc, id: string): Set<string> {
  const out = new Set<string>();
  for (let b: TreeDoc["boxes"][string] | undefined = d.boxes[id]; b; b = b.parent ? d.boxes[b.parent] : undefined) if (b.out === "hit" && b.aim) out.add(aimKey(b.aim));
  return out;
}
const chips = computed(() => {
  const d = t.doc.value;
  const done = Object.values(d.boxes).filter((b) => b.done);
  const main = new Set(done.filter((b) => b.done === "main").flatMap((b) => [...pathAims(d, b.id)]));
  const comp = new Set(done.filter((b) => b.done === "compromise").flatMap((b) => [...pathAims(d, b.id)]));
  const by = new Map<string, { aim: Aim; n: number }>();
  for (const b of Object.values(d.boxes)) if (b.out === "hit" && b.aim) { const k = aimKey(b.aim); const c = by.get(k); if (c) c.n++; else by.set(k, { aim: b.aim, n: 1 }); }
  return [...by.entries()].map(([k, v]) => ({ k, label: t.aimLabel(v.aim), n: v.n, main: main.has(k), comp: comp.has(k) }));
});

const memo = ref(t.doc.value.note ?? "");
watch(() => t.doc.value.note, (v) => { memo.value = v ?? ""; });
function saveMemo(): void { if ((t.doc.value.note ?? "") !== memo.value) t.edit((d) => setNote(d, null, memo.value)); }

// 場所 (画面の左上からの px) と大きさ。覚えるのはこのブラウザだけ。右下の角を引っ張ると大きさを変えられる
const KEY = "exiledesk.tree.memo-pos";
const SIZE_KEY = "exiledesk.tree.memo-size";
const W = 360;
const size = ref<{ w: number; h: number | null }>((() => {
  try { const v = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null"); if (v && typeof v.w === "number") return { w: v.w, h: typeof v.h === "number" ? v.h : null }; } catch { /* 無くてよい */ }
  return { w: W, h: null };
})());
const box = ref<HTMLElement | null>(null);
let ro: ResizeObserver | null = null;
let saveT = 0;
watch(box, (el) => {
  ro?.disconnect();
  if (!el) return;
  ro = new ResizeObserver(() => {
    const r = el.getBoundingClientRect();
    size.value = { w: Math.round(r.width), h: Math.round(r.height) };
    clearTimeout(saveT);
    saveT = window.setTimeout(() => { try { localStorage.setItem(SIZE_KEY, JSON.stringify(size.value)); } catch { /* 覚えられなくても使える */ } }, 300);
  });
  ro.observe(el);
});
const pos = ref<{ x: number; y: number }>((() => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); if (v && typeof v.x === "number" && typeof v.y === "number") return v; } catch { /* 無くてよい */ }
  return { x: Math.max(16, innerWidth - W - 220), y: 180 };
})());
const clamp = (p: { x: number; y: number }): { x: number; y: number } => ({ x: Math.min(Math.max(0, p.x), innerWidth - 120), y: Math.min(Math.max(0, p.y), innerHeight - 48) });
let stop: (() => void) | null = null;
function drag(e: PointerEvent): void {
  if ((e.target as HTMLElement).closest("button")) return;
  const sx = e.clientX - pos.value.x, sy = e.clientY - pos.value.y;
  const move = (m: PointerEvent): void => { pos.value = clamp({ x: m.clientX - sx, y: m.clientY - sy }); };
  const up = (): void => { window.removeEventListener("pointermove", move); stop = null; try { localStorage.setItem(KEY, JSON.stringify(pos.value)); } catch { /* 覚えられなくても使える */ } };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
}
onBeforeUnmount(() => { stop?.(); ro?.disconnect(); saveMemo(); });
watch(open, (v) => { if (!v) saveMemo(); else void nextTick(() => { pos.value = clamp(pos.value); }); }, { immediate: true });
</script>

<template>
  <!-- ページの中で一番上 (全画面のツリーより上)。ツリーを押しても閉じない -->
  <div v-if="open" ref="box" data-tree-memo-float class="g-panel !fixed z-[80] !bg-[#16120d] flex min-h-[200px] min-w-[280px] max-w-[90vw] resize flex-col gap-2 overflow-auto p-3 text-[13px] shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px`, width: `${size.w}px`, ...(size.h ? { height: `${size.h}px` } : {}), maxHeight: '90vh' }">
    <div class="-m-1 flex cursor-move select-none items-center gap-2 rounded px-1 py-0.5 hover:bg-white/[0.04]" data-tree-memo-handle @pointerdown="drag">
      <Icon name="pencil" class="size-4 opacity-80" />
      <b class="flex-1">{{ tr("メモ", "Notes") }}</b>
      <button type="button" class="flex size-7 items-center justify-center rounded hover:bg-white/10" :title="tr('閉じる', 'Close')" @click="open = false"><Icon name="x" class="size-4" /></button>
    </div>
    <div data-tree-aims>
      <p class="mb-1 text-[12px] text-[var(--exile-color-text-secondary)]">{{ tr("欲しい MOD (押すとその札の箱が光る)", "Wanted mods (click to highlight boxes)") }}</p>
      <div class="flex flex-col gap-1">
        <button v-for="c in chips" :key="c.k" type="button" data-tree-aim-chip class="flex min-h-7 min-w-0 items-center gap-1 rounded-md border px-2 text-left text-[12px]"
          :class="glow === c.k ? 'border-amber-300 bg-amber-500/25 text-amber-50' : 'border-amber-500/40 bg-white/[0.04] text-[#c8c8ff] hover:border-amber-300/80'"
          :aria-pressed="glow === c.k" :title="tr(`この札を使っている箱 ${c.n} 個を光らせる`, `Highlight the ${c.n} boxes using this`)" @click="glow = glow === c.k ? null : c.k">
          <span class="min-w-0 flex-1 truncate">{{ c.label }}</span>
          <span v-if="c.main" class="shrink-0 rounded-sm bg-amber-400/30 px-1 text-[10px] font-bold text-amber-100">{{ tr("本命", "Main") }}</span>
          <span v-if="c.comp" class="shrink-0 rounded-sm bg-slate-400/30 px-1 text-[10px] font-bold text-slate-100">{{ tr("妥協", "Comp.") }}</span>
        </button>
        <span v-if="!chips.length" class="text-[12px] opacity-50">{{ tr("当たりの箱で MOD を選ぶとここに並ぶ", "Pick mods in hit boxes to list them here") }}</span>
      </div>
    </div>
    <textarea v-model="memo" data-tree-memo-text rows="6" class="min-h-24 w-full flex-1 resize-none rounded-md border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60" :placeholder="tr('このツリーのメモ (狙い・相場・決めた事など)', 'Notes for this tree (goals, prices, decisions…)')" @blur="saveMemo" />
  </div>
</template>
