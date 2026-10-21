<!--
  TreeMemoFloat.vue — ツリーのメモの浮かぶ窓 (2026-10-22 オーナー「欲しい MOD 設定とかはメモの中に。メモはポップアップで、他のとこクリックしても後ろにいかない。
  見ながらツリーつくるから」「メモでは自由に MOD をメモに入れられる」「モッドとカレンシーもメモに出す、同じように使うカレンシーって枠組みでボタンとタグは」)。
  10-22 作り直し (オーナー「メモ帳の作りがお粗末」「動き完全に Windows のウィンドウの UIUX でおｋ」):
  - 動き = Windows の窓: 題の帯で動かす・題のダブルクリックで最大化 / 元に戻す・最小化 (帯の「メモ」に戻る)・最大化・閉じる、
    四辺と四隅 (枠の外へ少しはみ出した掴み所) で大きさ、画面の上の端へ引くと最大化・左右の端で半分 (離す前に行き先を薄く出す)、
    最大化中に題を引くと元の大きさに戻ってカーソルに付いてくる。ページの中だけの窓 (他のウィンドウの上には出ない)。
  - ツリーを押しても閉じず後ろに回らない。右の欄 (次の手・試し打ち) が開いて重なる時はその左へ避ける (自分で動かしたらそこに置く)。Esc でページを閉じない。
  - 中身: 欲しい MOD / 使うカレンシー の札 (上、札が多ければここだけ送る) とメモ欄 (下、残りの高さいっぱい)。札を押すと使っている箱が光る、
    メモで足した札は札の中の × で消す。＋ で開く選び窓は窓の中に重ねて出す (下に開いて見えない事が無いように)。
  - メモの文は打つたびに覚える (読み込み直しでも消えない)、ツリーの 1 つ戻すには入れない。開いているか・場所・大きさはこのブラウザに覚える (無くても使える)
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import CurrencyShelf from "../../craft-stage/CurrencyShelf.vue";
import ShelfButton from "../../craft-stage/ShelfButton.vue";
import TreeModPick from "./TreeModPick.vue";
import { craftStage as s, iconOf, nameOf } from "../../../state/craft-stage";
import { provideShelf, simHidden } from "../../../state/emulator/shelf-context";
import { aimKey, handKeysOf, handUses, toggleMemoAim, toggleMemoCurrency, type Aim, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { TREE_CATALYSTS } from "../../../services/simulator/tree/tree-hands";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";
import { pageZoom, toCss } from "../../../utils/zoom";
import { gesture } from "./use-gesture";

/** avoid: 右の欄が開いている (変わるたびに重なりを見直す。値は欄の種類と箱) */
const props = defineProps<{ avoid?: string | null }>();
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
  const by = new Map<string, { aim: Aim; n: number; memo: boolean }>();
  for (const b of Object.values(d.boxes)) if (b.out === "hit" && b.aim) { const k = aimKey(b.aim); const c = by.get(k); if (c) c.n++; else by.set(k, { aim: b.aim, n: 1, memo: false }); }
  for (const a of d.memoAims ?? []) { const k = aimKey(a); const c = by.get(k); if (c) c.memo = true; else by.set(k, { aim: a, n: 0, memo: true }); }
  return [...by.entries()].map(([k, v]) => ({ k, glowKey: k, aim: v.aim, label: t.aimLabel(v.aim), icon: "", n: v.n, memo: v.memo, main: main.has(k) }));
});
const curChips = computed(() => {
  const d = t.doc.value, fromTree = handKeysOf(d), memo = d.memoCurrencies ?? [];
  const keys = [...fromTree, ...memo.filter((k) => !fromTree.includes(k))];
  return keys.map((k) => ({ k, glowKey: `cur:${k}`, aim: undefined as Aim | undefined, label: nameOf(k), icon: iconOf(k) ?? "", memo: memo.includes(k), main: false, comp: false,
    n: Object.values(d.boxes).filter((b) => handUses(b, k)).length }));
});
const memoCurs = computed(() => t.doc.value.memoCurrencies ?? []);

// ＋で足す (MOD の一覧 / カレンシーの棚)。窓の中に重ねて出す
const picker = ref<"mod" | "cur" | null>(null);
function addAim(a: Aim): void { t.edit((d) => toggleMemoAim(d, a)); picker.value = null; }
function toggleCur(k: string): void { t.edit((d) => toggleMemoCurrency(d, k)); }
function removeChip(c: { k: string; aim?: Aim }): void { if (c.aim) t.edit((d) => toggleMemoAim(d, c.aim!)); else toggleCur(c.k); }
// 棚はメモ用なので灰色にしない (どの手も足せる。並べ方のためにアイテムは始まりの見本を渡す)。押す = メモに足す / 消す
const item = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, "start", 1).item : null));
const held = ref<string | null>(null);
const omens = ref<string[]>([]);
provideShelf({ data: s.data, item, omens, held, usable: () => null, toggleOmen: (id) => toggleCur(id), hidden: simHidden });

// メモの文: 打つたびに覚える (0.3 秒まとめる)。欄から出た時・閉じた時・ページを離れる時はすぐ
const memo = ref(t.doc.value.note ?? "");
watch(() => t.doc.value.note, (v) => { if ((v ?? "") !== memo.value) memo.value = v ?? ""; });
let saveTimer = 0;
function saveMemo(): void { clearTimeout(saveTimer); t.setTreeNote(memo.value); }
function onInput(): void { clearTimeout(saveTimer); saveTimer = window.setTimeout(saveMemo, 300); }
window.addEventListener("pagehide", saveMemo);

// ---- 窓 (Windows の窓と同じ動き) ----
const RECT_KEY = "exiledesk.tree.memo-rect";
const MIN_W = 320, MIN_H = 260, SNAP = 6;
interface Rect { x: number; y: number; w: number; h: number }
type Snap = "max" | "left" | "right" | null;
/**
 * 画面の広さ (拡大前の CSS ピクセル)。html に zoom が掛かっている (WebApp.vue の fitZoom、1920 幅で 1.16) ので、
 * innerWidth・マウスの座標・getBoundingClientRect (実ピクセル) は toCss で割る。割らずに最大化すると窓が 1.16 倍に広がり、
 * 閉じる・元に戻すが画面の右の外へ出た (オーナー 10-22「一度拡大したら閉じれない」)
 */
const readView = (): { w: number; h: number } => ({ w: toCss(document.documentElement.clientWidth || innerWidth), h: toCss(document.documentElement.clientHeight || innerHeight) });
/** 画面の広さは ref に持つ (最大化の大きさが computed に残り、画面の幅・zoom が変わっても前の広さのままだった) */
const view = ref(readView());
const vw = (): number => view.value.w;
const vh = (): number => view.value.h;
const cssRect = (r: DOMRect): { left: number; top: number; right: number; bottom: number; width: number; height: number } => {
  const z = pageZoom();
  return { left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z };
};
const fit = (r: Rect): Rect => {
  const w = Math.min(Math.max(MIN_W, r.w), vw()), h = Math.min(Math.max(MIN_H, r.h), vh());
  // 横は窓全体を画面の中に (右の外へ出て閉じる・最大化のボタンが届かなくなった。オーナーの Chrome で 10-22)。
  // 縦は Windows と同じく題の帯が画面に残るまで (下ははみ出してよい。全部収めると最大化から引いた時に題がマウスから離れた)
  return { w, h, x: Math.min(Math.max(0, r.x), vw() - w), y: Math.min(Math.max(0, r.y), vh() - 56) };
};
const saved = ((): { rect: Rect; snap: Snap } | null => {
  try {
    const v = JSON.parse(localStorage.getItem(RECT_KEY) ?? "null");
    if (v && ["x", "y", "w", "h"].every((k) => typeof v[k] === "number")) return { rect: { x: v.x, y: v.y, w: v.w, h: v.h }, snap: ["max", "left", "right"].includes(v.snap) ? v.snap : null };
  } catch { /* 無くてよい */ }
  return null;
})();
/** 元の場所と大きさ (最大化・半分の間も覚えておき、戻す時に使う) */
const rect = ref<Rect | null>(saved?.rect ?? null);
const snap = ref<Snap>(saved?.snap ?? null);
const remember = (): void => { try { if (rect.value) localStorage.setItem(RECT_KEY, JSON.stringify({ ...rect.value, snap: snap.value })); } catch { /* 覚えられなくても使える */ } };
/** 初めて開いた時: ツリーの左下 (帯のボタンと右の欄を隠さない) */
function defaultRect(): Rect {
  const el = document.querySelector("[data-tree-canvas]");
  if (!el) return fit({ x: 16, y: vh() - 440, w: 360, h: 420 });
  const c = cssRect(el.getBoundingClientRect());
  const h = Math.min(420, Math.max(MIN_H, c.height - 24));
  return fit({ x: c.left + 12, y: Math.min(c.bottom, vh()) - h - 12, w: 360, h });
}
const snapRect = (k: Exclude<Snap, null>): Rect => k === "max" ? { x: 0, y: 0, w: vw(), h: vh() }
  : { x: k === "left" ? 0 : Math.ceil(vw() / 2), y: 0, w: Math.floor(vw() / 2), h: vh() };

// 右の欄と右下の道具 (ミニマップ・ツールバー) を避ける (重なる時だけその左へ。自分で動かした後は避けない)
const avoidRects = ref<Array<ReturnType<typeof cssRect>>>([]);
const placedByUser = ref(false);
function measureAvoid(): void {
  const els = props.avoid ? [document.querySelector("[data-tree-panel]"), document.querySelector("[data-tree-tools]")] : [];
  avoidRects.value = els.filter((e): e is Element => !!e).map((e) => cssRect(e.getBoundingClientRect())).sort((a, z) => z.left - a.left);
}
watch(() => props.avoid, async () => { placedByUser.value = false; await nextTick(); measureAvoid(); }, { immediate: true });

const shown = computed((): Rect | null => {
  if (snap.value) return snapRect(snap.value);
  const r = rect.value;
  if (!r || placedByUser.value) return r;
  let x = r.x;
  for (const a of avoidRects.value) if (x < a.right && x + r.w > a.left && r.y < a.bottom && r.y + r.h > a.top) x = Math.max(0, a.left - r.w - 12);
  return x === r.x ? r : { ...r, x };
});

const preview = ref<Snap>(null);
const dragging = ref(false);
let stop: (() => void) | null = null;
/**
 * 引っ張る (dir: 動かす = "move"、辺と角 = n / s / e / w の組み合わせ)。押す / 引っ張るの判定・capture・座標の換算は use-gesture.ts
 * (遊びは 2px: 窓はつかんだらすぐ付いてくる方が Windows に近い)
 */
function grab(e: PointerEvent, dir: string): void {
  if (!shown.value) return;
  if (dir === "move" && (e.target as HTMLElement).closest("button")) return;
  if (dir !== "move" && snap.value) return; // 最大化・半分の間は大きさを変えない (Windows と同じ)
  let r0 = { ...shown.value };
  stop = gesture(e, {
    slop: 2,
    onStart: (p) => {
      dragging.value = true; placedByUser.value = true;
      // 最大化・半分の時に題を引くと、元の大きさに戻ってカーソルの所に付いてくる
      if (dir === "move" && snap.value) {
        const base = rect.value ?? defaultRect(), cur = shown.value!;
        const sx = p.x - p.dx, sy = p.y - p.dy, fx = (sx - cur.x) / cur.w;
        r0 = { ...base, x: sx - base.w * fx, y: Math.max(0, sy - 16) };
        snap.value = null;
      }
    },
    onMove: (p) => {
      if (dir === "move") {
        rect.value = fit({ ...r0, x: r0.x + p.dx, y: r0.y + p.dy });
        preview.value = p.y <= SNAP ? "max" : p.x <= SNAP ? "left" : p.x >= vw() - SNAP ? "right" : null;
        return;
      }
      let { x, y, w, h } = r0;
      if (dir.includes("e")) w = Math.min(r0.w + p.dx, vw() - r0.x);
      if (dir.includes("s")) h = Math.min(r0.h + p.dy, vh() - r0.y);
      if (dir.includes("w")) { w = Math.max(MIN_W, r0.w - p.dx); x = r0.x + r0.w - w; }
      if (dir.includes("n")) { h = Math.max(MIN_H, r0.h - p.dy); y = r0.y + r0.h - h; }
      rect.value = fit({ x, y, w, h });
    },
    onEnd: () => {
      stop = null; dragging.value = false;
      if (preview.value) { snap.value = preview.value; preview.value = null; }
      remember();
    },
    onCancel: () => { stop = null; dragging.value = false; preview.value = null; },
  });
}
function toggleMax(): void { snap.value = snap.value ? null : "max"; remember(); }
/** 最小化 = 帯の「メモ」に戻す (中身は残る。Windows のタスクバーと同じ役) */
function minimize(): void { open.value = false; }
/**
 * 掴み所は見た目の窓の端に合わせる (Windows と同じく端の外 4px 〜 内 6px、角は 20px)。窓の枠 (.g-panel の 18px の絵の縁) の中から
 * 測るので -22px から。前は枠の内側から測っていて、見た目の端・角を掴んでも何も起きず、掴み所は端より 14px 内側にあった
 * (オーナー 10-22「メモが動かせない」、オーナーの Chrome で elementFromPoint で確かめた)
 */
const FRAME = 18;
const E = -(FRAME + 4), L = 10, C = 20;
const EDGES: Array<{ dir: string; style: Record<string, string>; cursor: string }> = [
  { dir: "n", style: { top: `${E}px`, left: `${E + C}px`, right: `${E + C}px`, height: `${L}px` }, cursor: "cursor-ns-resize" },
  { dir: "s", style: { bottom: `${E}px`, left: `${E + C}px`, right: `${E + C}px`, height: `${L}px` }, cursor: "cursor-ns-resize" },
  { dir: "w", style: { left: `${E}px`, top: `${E + C}px`, bottom: `${E + C}px`, width: `${L}px` }, cursor: "cursor-ew-resize" },
  { dir: "e", style: { right: `${E}px`, top: `${E + C}px`, bottom: `${E + C}px`, width: `${L}px` }, cursor: "cursor-ew-resize" },
  { dir: "nw", style: { left: `${E}px`, top: `${E}px`, width: `${C}px`, height: `${C}px` }, cursor: "cursor-nwse-resize" },
  { dir: "ne", style: { right: `${E}px`, top: `${E}px`, width: `${C}px`, height: `${C}px` }, cursor: "cursor-nesw-resize" },
  { dir: "sw", style: { left: `${E}px`, bottom: `${E}px`, width: `${C}px`, height: `${C}px` }, cursor: "cursor-nesw-resize" },
  { dir: "se", style: { right: `${E}px`, bottom: `${E}px`, width: `${C}px`, height: `${C}px` }, cursor: "cursor-nwse-resize" },
];
/** 枠の上の帯 (大きさを変える 6px より下) も題の帯と同じく動かす所 (Windows の題の帯は窓の上の端まで) */
const TOP_BAND = { top: `${E + L}px`, left: `${E + C}px`, right: `${E + C}px`, height: `${FRAME + 4 - L + 4}px` };
// 広さを読むのは WebApp.vue の fitZoom (同じ resize で zoom を掛け直す) の後
const onWinResize = (): void => { requestAnimationFrame(() => { view.value = readView(); if (rect.value) rect.value = fit(rect.value); measureAvoid(); }); };
window.addEventListener("resize", onWinResize);
window.addEventListener("scroll", measureAvoid, true);
onBeforeUnmount(() => {
  stop?.(); saveMemo(); window.removeEventListener("keydown", onWinKey, true);
  window.removeEventListener("resize", onWinResize); window.removeEventListener("scroll", measureAvoid, true); window.removeEventListener("pagehide", saveMemo);
});
/** 最大化・半分の時の Esc は、どこを押していても先に窓を元に戻す (ページを閉じない) */
function onWinKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || !open.value || !snap.value || picker.value) return;
  e.preventDefault(); e.stopImmediatePropagation();
  snap.value = null; remember();
}
window.addEventListener("keydown", onWinKey, true);
watch(open, async (v) => {
  if (!v) { saveMemo(); picker.value = null; return; }
  await nextTick();
  if (!rect.value) { rect.value = defaultRect(); remember(); } else onWinResize();
}, { immediate: true });

/** Esc: 選び窓を閉じる → 最大化・半分を元に戻す。窓の中で押した Esc でページを閉じない */
function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  e.preventDefault();
  if (picker.value) picker.value = null;
  else if (snap.value) { snap.value = null; remember(); }
}
const chipCls = (on: boolean, used: boolean): string =>
  on ? "border-amber-300 bg-amber-500/25 text-amber-50" : used ? "border-amber-500/45 bg-white/[0.04] text-[#c8c8ff]" : "border-white/20 bg-white/[0.02] text-[#c8c8ff]/80";
</script>

<template>
  <!-- 端へ引いた時の行き先 (離すとこの形になる) -->
  <div v-if="open && preview" class="pointer-events-none fixed z-[79] rounded-md border-2 border-amber-300/70 bg-amber-200/10 transition-all"
    :style="{ left: `${snapRect(preview).x + 6}px`, top: `${snapRect(preview).y + 6}px`, width: `${snapRect(preview).w - 12}px`, height: `${snapRect(preview).h - 12}px` }" />
  <!-- ページの中で一番上 (全画面のツリーより上)。ツリーを押しても閉じない -->
  <div v-if="open && shown" data-tree-memo-float role="dialog" :aria-label="tr('メモ', 'Notes')" class="g-panel !fixed z-[80] flex flex-col !bg-[#16120d] text-[13px]"
    :class="[snap ? '' : 'shadow-[0_14px_40px_rgba(0,0,0,0.7)]', dragging ? 'select-none' : 'transition-[left,top,width,height] duration-150']"
    :style="{ left: `${shown.x}px`, top: `${shown.y}px`, width: `${shown.w}px`, height: `${shown.h}px` }" @keydown="onKey">
    <!-- 題の帯 (Windows の題と同じ: 引いて動かす・ダブルクリックで最大化 / 元に戻す) -->
    <div data-tree-memo-handle class="g-tabbar !min-h-[38px] -mx-1 -mt-1 flex shrink-0 cursor-default select-none items-center gap-1 pl-5 pr-2"
      @pointerdown="grab($event, 'move')" @dblclick="($event.target as HTMLElement).closest('button') || toggleMax()">
      <Icon name="pencil" class="size-4 shrink-0 text-[var(--exile-color-text-title)] opacity-90" />
      <b class="g-brush min-w-0 flex-1 truncate text-[16px] tracking-[0.14em] text-[var(--exile-color-text-title)] [text-shadow:0_2px_2px_#000]">{{ tr("メモ", "Notes") }}</b>
      <button type="button" data-tree-memo-min class="flex size-7 items-center justify-center rounded text-[var(--exile-color-text-secondary)] hover:bg-white/10 hover:text-white" :title="tr('最小化 (帯の「メモ」で戻す)', 'Minimize (reopen from Notes)')" :aria-label="tr('最小化', 'Minimize')" @click="minimize">
        <span class="mt-2 block h-0.5 w-3 bg-current" />
      </button>
      <button type="button" data-tree-memo-max class="flex size-7 items-center justify-center rounded text-[var(--exile-color-text-secondary)] hover:bg-white/10 hover:text-white" :title="snap ? tr('元に戻す', 'Restore') : tr('最大化', 'Maximize')" :aria-label="snap ? tr('元に戻す', 'Restore') : tr('最大化', 'Maximize')" @click="toggleMax">
        <span v-if="!snap" class="block size-3 rounded-[2px] border-2 border-current" />
        <span v-else class="relative block size-3"><span class="absolute right-0 top-0 size-2.5 rounded-[2px] border-2 border-current" /><span class="absolute bottom-0 left-0 size-2.5 rounded-[2px] border-2 border-current bg-[#16120d]" /></span>
      </button>
      <button type="button" data-tree-memo-close class="flex size-7 items-center justify-center rounded text-[var(--exile-color-text-secondary)] hover:bg-rose-600/80 hover:text-white" :title="tr('閉じる', 'Close')" :aria-label="tr('閉じる', 'Close')" @click="open = false"><Icon name="x" class="size-4" /></button>
    </div>

    <!-- 中身: 札 (上、多ければここだけ送る) とメモ欄 (下、残りの高さいっぱい)。選び窓は中身の上に重ねる -->
    <div class="relative flex min-h-0 flex-1 flex-col pt-2">
      <div data-tree-memo-chips class="flex max-h-[45%] shrink-0 flex-col gap-2 overflow-y-auto px-1 pb-2" :inert="!!picker">
        <section v-for="sec in [{ key: 'mod', title: tr('欲しい MOD', 'Wanted mods'), add: tr('＋ MOD', '+ Mod'), chips: modChips, empty: tr('当たりの箱で選んだ MOD がここに並ぶ', 'Mods picked in hit boxes appear here') },
                                { key: 'cur', title: tr('使うカレンシー', 'Currency to use'), add: tr('＋ カレンシー', '+ Currency'), chips: curChips, empty: tr('箱の手で使う物がここに並ぶ', 'Crafts used in boxes appear here') }]"
          :key="sec.key" :data-tree-aims="sec.key === 'mod' ? '' : undefined" :data-tree-currencies="sec.key === 'cur' ? '' : undefined">
          <div class="mb-1 flex min-h-7 items-center gap-2">
            <span class="flex-1 text-[12px] font-bold tracking-wide text-[var(--exile-color-text-secondary)]">{{ sec.title }}</span>
            <button type="button" :data-tree-memo-add-mod="sec.key === 'mod' ? '' : undefined" :data-tree-memo-add-cur="sec.key === 'cur' ? '' : undefined"
              class="g-btn sm" @click="picker = sec.key as 'mod' | 'cur'">{{ sec.add }}</button>
          </div>
          <div class="flex flex-wrap gap-1">
            <span v-for="c in sec.chips" :key="c.k" class="inline-flex min-h-7 min-w-0 max-w-full items-center rounded-md border text-[12px]" :class="chipCls(glow === c.glowKey, c.n > 0)">
              <button type="button" :data-tree-aim-chip="sec.key === 'mod' ? '' : undefined" :data-tree-cur-chip="sec.key === 'cur' ? '' : undefined"
                class="flex min-h-7 min-w-0 items-center gap-1.5 pl-2 text-left" :class="c.memo ? 'pr-0.5' : 'pr-2'" :aria-pressed="glow === c.glowKey"
                :title="c.n ? tr(`この札を使っている箱 ${c.n} 個を光らせる`, `Highlight the ${c.n} boxes using this`) : tr('ツリーではまだ使っていない', 'Not used in the tree yet')"
                @click="glow = glow === c.glowKey ? null : c.glowKey">
                <img v-if="c.icon" :src="c.icon" alt="" class="size-5 shrink-0 object-contain" />
                <span class="min-w-0 truncate">{{ c.label }}</span>
                <span v-if="c.main" class="shrink-0 rounded-sm bg-amber-400/30 px-1 text-[10px] font-bold text-amber-100">{{ tr("完成", "Done") }}</span>
                <span v-if="c.n" class="shrink-0 tabular-nums text-[11px] text-sky-200/80">×{{ c.n }}</span>
              </button>
              <button v-if="c.memo" type="button" class="flex size-6 shrink-0 items-center justify-center rounded text-white/60 hover:bg-white/10 hover:text-white" :title="tr('メモから消す', 'Remove from notes')" :aria-label="tr('メモから消す', 'Remove from notes')" @click="removeChip(c)"><Icon name="x" class="size-3.5" /></button>
            </span>
            <span v-if="!sec.chips.length" class="text-[12px] opacity-50">{{ sec.empty }}</span>
          </div>
        </section>
      </div>
      <div class="g-divider mx-1 shrink-0" />
      <textarea v-model="memo" data-tree-memo-text :inert="!!picker" class="mt-2 min-h-[96px] w-full flex-1 resize-none rounded-md border border-white/15 bg-black/40 px-2.5 py-2 leading-relaxed outline-none focus:border-amber-400/60"
        :placeholder="tr('このツリーのメモ (狙い・相場・決めた事など)', 'Notes for this tree (goals, prices, decisions…)')" @input="onInput" @blur="saveMemo" />

      <!-- 選び窓 (中身の上に重ねる。閉じる・Esc で戻る) -->
      <div v-if="picker" data-tree-memo-picker class="absolute inset-0 z-20 flex flex-col rounded-md bg-[#120e0a] p-2">
        <TreeModPick v-if="picker === 'mod'" class="min-h-0 flex-1" mode="hit" :current="null" :title="tr('欲しい MOD を足す', 'Add a wanted mod')" autofocus @pick="addAim" @close="picker = null" />
        <template v-else>
          <div class="mb-1 flex items-center gap-2">
            <b class="flex-1 text-[14px]">{{ tr("使うカレンシーを足す", "Add currency to use") }}</b>
            <button type="button" class="g-btn sm" @click="picker = null">{{ tr("閉じる", "Close") }}</button>
          </div>
          <!-- メモにある物 (押すと消す)。棚の上では選んだ印が出ないのでここに並べる -->
          <div class="mb-1 flex min-h-8 flex-wrap items-center gap-1 rounded bg-white/[0.04] px-1.5 py-1 text-[11px]">
            <span class="opacity-70">{{ tr("メモにある:", "In notes:") }}</span>
            <button v-for="k in memoCurs" :key="k" type="button" class="flex size-7 items-center justify-center rounded hover:bg-rose-600/40" :title="tr(`${nameOf(k)} を消す`, `Remove ${nameOf(k)}`)" @click="toggleCur(k)">
              <img v-if="iconOf(k)" :src="iconOf(k)" alt="" class="size-6 object-contain" /><span v-else class="truncate">{{ nameOf(k) }}</span>
            </button>
            <span v-if="!memoCurs.length" class="opacity-50">{{ tr("無し (棚を押すと足す)", "None (click the shelf to add)") }}</span>
          </div>
          <div data-tree-memo-shelf class="min-h-0 flex-1 overflow-y-auto pr-1">
            <p class="mb-0.5 text-[11px] opacity-60">{{ tr("カタリスト", "Catalysts") }}</p>
            <div class="mb-2 flex flex-wrap gap-1.5"><ShelfButton v-for="k in TREE_CATALYSTS" :key="k" :k="k" @pick="toggleCur" /></div>
            <CurrencyShelf full @hold="toggleCur" />
          </div>
        </template>
      </div>
    </div>
    <!-- 右下の掴みの印 (大きさを変えられる所) -->
    <svg v-if="!snap" class="pointer-events-none absolute -bottom-[14px] -right-[14px] size-3 text-amber-200/60" viewBox="0 0 12 12"><path d="M11 3 L3 11 M11 7 L7 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    <!-- 四辺と四隅を引っ張ると大きさが変わる (最大化・半分の間は無し) -->
    <!-- 枠の上の帯 = 題の帯と同じ (引いて動かす・ダブルクリックで最大化 / 元に戻す) -->
    <div data-tree-memo-topband class="absolute z-20 cursor-default touch-none" :style="TOP_BAND" @pointerdown="grab($event, 'move')" @dblclick="toggleMax" />
    <template v-if="!snap"><div v-for="g in EDGES" :key="g.dir" :data-tree-memo-resize="g.dir" class="absolute z-30 touch-none" :class="g.cursor" :style="g.style" @pointerdown="grab($event, g.dir)" /></template>
  </div>
</template>
