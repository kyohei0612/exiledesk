<!--
  TreeMemoFloat.vue — ツリーのメモの浮かぶ窓 (2026-10-22 オーナー「欲しい MOD 設定とかはメモの中に。メモはポップアップで、他のとこクリックしても後ろにいかない。
  見ながらツリーつくるから」「メモでは自由に MOD をメモに入れられる」「モッドとカレンシーもメモに出す、同じように使うカレンシーって枠組みでボタンとタグは」)。
  ページの中だけの窓 (他のウィンドウの上には出ない)。ツリーを押しても閉じず、閉じるのは窓の × と帯の「メモ」だけ。
  中身: 欲しい MOD / 使うカレンシー の 2 つの枠 (同じ作りの札)。ツリーから来た札 (当たりの箱の MOD・箱の手のカレンシー) は「ツリー」の印、メモで足した札は × で消せる。
  札を押すとその札を使っている箱が光る。＋で足す: MOD はツリーと同じ金の指輪の MOD の一覧、カレンシーはクラフト台の棚 (メモ用なので灰色にしない) + カタリスト。
  題の所をドラッグで動かせ、四辺と四隅を引っ張ると大きさが変わる (普通のウィンドウと同じ)。開いているか・場所・大きさはこのブラウザに覚える (無くても使える)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import CurrencyShelf from "../../craft-stage/CurrencyShelf.vue";
import ShelfButton from "../../craft-stage/ShelfButton.vue";
import TreeModPick from "./TreeModPick.vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import { provideShelf, simHidden } from "../../../state/emulator/shelf-context";
import { aimKey, handKeysOf, handUses, setNote, toggleMemoAim, toggleMemoCurrency, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

const open = defineModel<boolean>("open", { default: false });
/** 光らせる札 (MOD = aimKey、カレンシー = "cur:" + キー) */
const glow = defineModel<string | null>("glow", { default: null });
const t = useTree();

/** 完成の箱に着く道の札 (始まりからその箱まで通った当たりの箱の札) */
function pathAims(d: TreeDoc, id: string): Set<string> {
  const out = new Set<string>();
  for (let b: TreeDoc["boxes"][string] | undefined = d.boxes[id]; b; b = b.parent ? d.boxes[b.parent] : undefined) if (b.out === "hit" && b.aim) out.add(aimKey(b.aim));
  return out;
}
const modChips = computed(() => {
  const d = t.doc.value;
  const done = Object.values(d.boxes).filter((b) => b.done);
  const main = new Set(done.filter((b) => b.done === "main").flatMap((b) => [...pathAims(d, b.id)]));
  const comp = new Set(done.filter((b) => b.done === "compromise").flatMap((b) => [...pathAims(d, b.id)]));
  const by = new Map<string, { aim: Aim; n: number; tree: boolean; memo: boolean }>();
  for (const b of Object.values(d.boxes)) if (b.out === "hit" && b.aim) { const k = aimKey(b.aim); const c = by.get(k); if (c) c.n++; else by.set(k, { aim: b.aim, n: 1, tree: true, memo: false }); }
  for (const a of d.memoAims ?? []) { const k = aimKey(a); const c = by.get(k); if (c) c.memo = true; else by.set(k, { aim: a, n: 0, tree: false, memo: true }); }
  return [...by.entries()].map(([k, v]) => ({ k, aim: v.aim, label: t.aimLabel(v.aim), n: v.n, tree: v.tree, memo: v.memo, main: main.has(k), comp: comp.has(k) }));
});
const curChips = computed(() => {
  const d = t.doc.value, fromTree = handKeysOf(d), memo = d.memoCurrencies ?? [];
  const keys = [...fromTree, ...memo.filter((k) => !fromTree.includes(k))];
  return keys.map((k) => ({ k, glowKey: `cur:${k}`, tree: fromTree.includes(k), memo: memo.includes(k), n: Object.values(d.boxes).filter((b) => handUses(b, k)).length }));
});

// ＋で足す (MOD の一覧 / カレンシーの棚)
const picker = ref<"mod" | "cur" | null>(null);
function addAim(a: Aim): void { t.edit((d) => toggleMemoAim(d, a)); picker.value = null; }
function toggleCur(k: string): void { t.edit((d) => toggleMemoCurrency(d, k)); }
// 棚はメモ用なので灰色にしない (どの手も足せる。並べ方のためにアイテムは始まりの見本を渡す)。押す = メモに足す / 消す
const item = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, "start", 1).item : null));
const held = ref<string | null>(null);
const omens = ref<string[]>([]);
provideShelf({ data: s.data, item, omens, held, usable: () => null, toggleOmen: (id) => toggleCur(id), hidden: simHidden });

const memo = ref(t.doc.value.note ?? "");
watch(() => t.doc.value.note, (v) => { memo.value = v ?? ""; });
function saveMemo(): void { if ((t.doc.value.note ?? "") !== memo.value) t.edit((d) => setNote(d, null, memo.value)); }

// 場所と大きさ (普通のウィンドウと同じく、四辺と四隅のどこを引っ張っても大きさが変わり、中身はそのまま伸び縮みする。オーナー 10-22)。
// 覚えるのはこのブラウザだけ (無くても使える)
const RECT_KEY = "exiledesk.tree.memo-rect";
const MIN_W = 300, MIN_H = 220;
interface Rect { x: number; y: number; w: number; h: number }
const fit = (r: Rect): Rect => {
  const w = Math.min(Math.max(MIN_W, r.w), innerWidth), h = Math.min(Math.max(MIN_H, r.h), innerHeight);
  return { w, h, x: Math.min(Math.max(0, r.x), innerWidth - Math.min(w, 120)), y: Math.min(Math.max(0, r.y), innerHeight - 48) };
};
const rect = ref<Rect>((() => {
  try { const v = JSON.parse(localStorage.getItem(RECT_KEY) ?? "null"); if (v && ["x", "y", "w", "h"].every((k) => typeof v[k] === "number")) return v as Rect; } catch { /* 無くてよい */ }
  return { x: Math.max(16, innerWidth - 400 - 220), y: 180, w: 400, h: 520 };
})());
const remember = (): void => { try { localStorage.setItem(RECT_KEY, JSON.stringify(rect.value)); } catch { /* 覚えられなくても使える */ } };
let stop: (() => void) | null = null;
/** 引っ張る (dir: 動かす = "move"、辺と角 = n / s / e / w の組み合わせ) */
function grab(e: PointerEvent, dir: string): void {
  if (dir === "move" && (e.target as HTMLElement).closest("button")) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY, r0 = { ...rect.value };
  const move = (m: PointerEvent): void => {
    const dx = m.clientX - sx, dy = m.clientY - sy;
    if (dir === "move") { rect.value = fit({ ...r0, x: r0.x + dx, y: r0.y + dy }); return; }
    let { x, y, w, h } = r0;
    if (dir.includes("e")) w = r0.w + dx;
    if (dir.includes("s")) h = r0.h + dy;
    if (dir.includes("w")) { w = Math.max(MIN_W, r0.w - dx); x = r0.x + r0.w - w; }
    if (dir.includes("n")) { h = Math.max(MIN_H, r0.h - dy); y = r0.y + r0.h - h; }
    rect.value = fit({ x, y, w, h });
  };
  const up = (): void => { window.removeEventListener("pointermove", move); stop = null; remember(); };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
}
/** 引っ張る所 (辺は 8px の帯、角は 14px) */
const EDGES: Array<{ dir: string; cls: string }> = [
  { dir: "n", cls: "inset-x-3 top-0 h-2 cursor-ns-resize" }, { dir: "s", cls: "inset-x-3 bottom-0 h-2 cursor-ns-resize" },
  { dir: "w", cls: "inset-y-3 left-0 w-2 cursor-ew-resize" }, { dir: "e", cls: "inset-y-3 right-0 w-2 cursor-ew-resize" },
  { dir: "nw", cls: "left-0 top-0 size-3.5 cursor-nwse-resize" }, { dir: "ne", cls: "right-0 top-0 size-3.5 cursor-nesw-resize" },
  { dir: "sw", cls: "bottom-0 left-0 size-3.5 cursor-nesw-resize" }, { dir: "se", cls: "bottom-0 right-0 size-3.5 cursor-nwse-resize" },
];
const onWinResize = (): void => { rect.value = fit(rect.value); };
window.addEventListener("resize", onWinResize);
onBeforeUnmount(() => { stop?.(); window.removeEventListener("resize", onWinResize); saveMemo(); });
watch(open, (v) => { if (!v) { saveMemo(); picker.value = null; } else void nextTick(onWinResize); }, { immediate: true });
const chipCls = (on: boolean): string => (on ? "border-amber-300 bg-amber-500/25 text-amber-50" : "border-amber-500/40 bg-white/[0.04] text-[#c8c8ff] hover:border-amber-300/80");
</script>

<template>
  <!-- ページの中で一番上 (全画面のツリーより上)。ツリーを押しても閉じない -->
  <div v-if="open" data-tree-memo-float class="g-panel !fixed z-[80] flex flex-col overflow-hidden !bg-[#16120d] text-[13px] shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
    :style="{ left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` }">
    <div class="mx-2 mt-2 flex shrink-0 cursor-move select-none items-center gap-2 rounded px-1 py-0.5 hover:bg-white/[0.04]" data-tree-memo-handle @pointerdown="grab($event, 'move')">
      <Icon name="pencil" class="size-4 opacity-80" />
      <b class="flex-1">{{ tr("メモ", "Notes") }}</b>
      <button type="button" class="flex size-7 items-center justify-center rounded hover:bg-white/10" :title="tr('閉じる', 'Close')" @click="open = false"><Icon name="x" class="size-4" /></button>
    </div>

    <!-- 中身 (窓の中で送る。メモ欄は残りの高さいっぱい) -->
    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-1">
    <!-- 欲しい MOD -->
    <section data-tree-aims>
      <p class="mb-1 flex items-center gap-2 text-[12px] text-[var(--exile-color-text-secondary)]">
        <span class="flex-1">{{ tr("欲しい MOD", "Wanted mods") }}</span>
        <button type="button" data-tree-memo-add-mod class="g-btn sm" :aria-pressed="picker === 'mod'" @click="picker = picker === 'mod' ? null : 'mod'">＋ MOD</button>
      </p>
      <div class="flex flex-wrap gap-1">
        <div v-for="c in modChips" :key="c.k" class="flex min-w-0 max-w-full items-center">
          <button type="button" data-tree-aim-chip class="flex min-h-7 min-w-0 items-center gap-1 rounded-md border px-2 text-left text-[12px]" :class="chipCls(glow === c.k)"
            :aria-pressed="glow === c.k" :title="c.n ? tr(`この札を使っている箱 ${c.n} 個を光らせる`, `Highlight the ${c.n} boxes using this`) : tr('ツリーではまだ使っていない', 'Not used in the tree yet')" @click="glow = glow === c.k ? null : c.k">
            <span class="min-w-0 truncate">{{ c.label }}</span>
            <span v-if="c.main" class="shrink-0 rounded-sm bg-amber-400/30 px-1 text-[10px] font-bold text-amber-100">{{ tr("本命", "Main") }}</span>
            <span v-if="c.comp" class="shrink-0 rounded-sm bg-slate-400/30 px-1 text-[10px] font-bold text-slate-100">{{ tr("妥協", "Comp.") }}</span>
            <span v-if="c.tree" class="shrink-0 rounded-sm bg-sky-500/25 px-1 text-[10px] text-sky-100">{{ tr("ツリー", "Tree") }}</span>
          </button>
          <button v-if="c.memo" type="button" class="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10" :title="tr('メモから消す', 'Remove from notes')" @click="t.edit((d) => toggleMemoAim(d, c.aim))"><Icon name="x" class="size-3.5" /></button>
        </div>
        <span v-if="!modChips.length" class="text-[12px] opacity-50">{{ tr("＋ MOD で足す・当たりの箱で選ぶとここに並ぶ", "Add with + MOD, or pick mods in hit boxes") }}</span>
      </div>
      <div v-if="picker === 'mod'" class="mt-2 flex max-h-[45vh] min-h-0 flex-col rounded-md bg-black/30 p-2">
        <TreeModPick mode="hit" :current="null" @pick="addAim" @close="picker = null" />
      </div>
    </section>

    <!-- 使うカレンシー -->
    <section data-tree-currencies>
      <p class="mb-1 flex items-center gap-2 text-[12px] text-[var(--exile-color-text-secondary)]">
        <span class="flex-1">{{ tr("使うカレンシー", "Currency to use") }}</span>
        <button type="button" data-tree-memo-add-cur class="g-btn sm" :aria-pressed="picker === 'cur'" @click="picker = picker === 'cur' ? null : 'cur'">{{ tr("＋ カレンシー", "+ Currency") }}</button>
      </p>
      <div class="flex flex-wrap gap-1">
        <div v-for="c in curChips" :key="c.k" class="flex min-w-0 max-w-full items-center">
          <button type="button" data-tree-cur-chip class="flex min-h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-left text-[12px]" :class="chipCls(glow === c.glowKey)"
            :aria-pressed="glow === c.glowKey" :title="c.n ? tr(`この手を使っている箱 ${c.n} 個を光らせる`, `Highlight the ${c.n} boxes using this`) : tr('ツリーではまだ使っていない', 'Not used in the tree yet')" @click="glow = glow === c.glowKey ? null : c.glowKey">
            <img v-if="iconOf(c.k)" :src="iconOf(c.k)" alt="" class="size-5 shrink-0 object-contain" />
            <span class="min-w-0 truncate">{{ nameOf(c.k) }}</span>
            <span v-if="c.tree" class="shrink-0 rounded-sm bg-sky-500/25 px-1 text-[10px] text-sky-100">{{ tr("ツリー", "Tree") }}</span>
          </button>
          <button v-if="c.memo" type="button" class="flex size-7 shrink-0 items-center justify-center rounded hover:bg-white/10" :title="tr('メモから消す', 'Remove from notes')" @click="toggleCur(c.k)"><Icon name="x" class="size-3.5" /></button>
        </div>
        <span v-if="!curChips.length" class="text-[12px] opacity-50">{{ tr("＋ カレンシーで足す・箱の手を決めるとここに並ぶ", "Add with + Currency, or set crafts in boxes") }}</span>
      </div>
      <div v-if="picker === 'cur'" data-tree-memo-shelf class="mt-2 max-h-[45vh] overflow-y-auto rounded-md bg-black/30 p-2">
        <p class="mb-1 flex items-center text-[11px] opacity-70"><span class="flex-1">{{ tr("押すとメモに足す (もう一度で消す)", "Click to add (again to remove)") }}</span><button type="button" class="g-btn sm" @click="picker = null">{{ tr("閉じる", "Close") }}</button></p>
        <p class="mb-0.5 text-[10px] opacity-60">{{ tr("カタリスト", "Catalysts") }}</p>
        <div class="mb-2 flex flex-wrap gap-1.5"><ShelfButton v-for="k in TREE_CATALYSTS" :key="k" :k="k" @pick="toggleCur" /></div>
        <CurrencyShelf full @hold="toggleCur" />
      </div>
    </section>

    <textarea v-model="memo" data-tree-memo-text rows="4" class="min-h-24 w-full flex-1 resize-none rounded-md border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60" :placeholder="tr('このツリーのメモ (狙い・相場・決めた事など)', 'Notes for this tree (goals, prices, decisions…)')" @blur="saveMemo" />
    </div>
    <!-- 四辺と四隅を引っ張ると大きさが変わる -->
    <div v-for="g in EDGES" :key="g.dir" :data-tree-memo-resize="g.dir" class="absolute z-10 touch-none" :class="g.cls" @pointerdown="grab($event, g.dir)" />
  </div>
</template>
