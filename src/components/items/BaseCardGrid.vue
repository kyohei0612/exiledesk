<!--
  BaseCardGrid.vue — ベースのカードの並び (ゲーム内の絵・必要レベル・素の数値・固有の効果)。BaseCatalog.vue から切り出し (2026-10-10)。
  PC は押した部位のタイルの行のすぐ下に、スマホと名前で探す時は一覧の下に出す
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { CATALOG_CLS_JA, type CatalogRow } from "../../services/items/base-catalog";
import BaseHoverCard from "./BaseHoverCard.vue";
import type { CardAnchor } from "../../utils/fit-card";
import { toCss } from "../../utils/zoom";
import { baseArt } from "../../services/craft-stage/base-art";
import { gemArt } from "../../services/craft-stage/skill-art";

const props = defineProps<{ list: CatalogRow[]; selected?: string | null; note?: (en: string) => string; showCls?: boolean; /** 最初は 2 行だけ出して「もっと見る」で全部 (名前で探す時は全部) */ fold?: boolean }>();
const emit = defineEmits<{ pick: [en: string] }>();
/** ベースの絵 (スキルジェムはジェムの絵) */
const artOf = (en: string): string | null => baseArt(en) ?? gemArt(en);

/**
 * 乗せて 0.4 秒で詳しいカード (棚のカレンシーのカードと同じ間。すぐ出すと一覧の上でカーソルを動かすだけで誤爆する)。
 * 指の端末 (hover の無い画面) では出さない。押したら消す
 */
const hover = ref<{ b: CatalogRow; anchor: CardAnchor } | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
const touchOnly = typeof matchMedia === "function" && matchMedia("(hover: none)").matches;
function enter(e: MouseEvent, b: CatalogRow): void {
  if (touchOnly) return;
  const el = e.currentTarget as HTMLElement;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const r = el.getBoundingClientRect();
    hover.value = { b, anchor: { left: toCss(r.left), right: toCss(r.right), top: toCss(r.top) } };
  }, 400);
}
function leave(): void { clearTimeout(timer); hover.value = null; }
onBeforeUnmount(leave);

/**
 * 最初は 2 行だけ (2026-10-10 オーナー「使うの基本上 2 行だから 3 行以降はもっと見るで、デフォはたたむ、開いてもスクロールはいらない」)。
 * 1 行の数は並びの幅から (カードの最小 260px + 隙間 8px、スマホは 2 列)
 */
const grid = ref<HTMLElement | null>(null);
const cols = ref(4);
const more = ref(false);
let ro: ResizeObserver | null = null;
const measure = (): void => { const w = grid.value?.clientWidth ?? 0; if (w) cols.value = window.innerWidth < 768 ? 2 : Math.max(1, Math.floor((w + 8) / (260 + 8))); };
onMounted(() => { measure(); if (grid.value) { ro = new ResizeObserver(measure); ro.observe(grid.value); } });
onBeforeUnmount(() => ro?.disconnect());
// 種類が変わったら畳む。今のベースが 3 行目より下なら開いておく (選んだ物が見えないと困る)
watch(() => props.list, () => { more.value = props.list.findIndex((b) => b.en === props.selected) >= cols.value * 2; }, { immediate: true });
const limit = computed(() => (props.fold && !more.value ? cols.value * 2 : Infinity));
const shown = computed(() => props.list.slice(0, limit.value));
const rest = computed(() => Math.max(0, props.list.length - shown.value.length));
</script>

<template>
  <div>
  <div ref="grid" class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2 pr-1 max-md:grid-cols-2 max-md:gap-1.5">
    <button
      v-for="b in shown"
      :key="b.en"
      type="button"
      class="g-plain g-item flex items-center gap-2 bg-clip-padding px-1 py-0.5 text-left transition max-md:flex-col max-md:gap-1 max-md:text-center"
      :class="b.en === selected ? 'bg-[rgba(163,52,42,0.35)]' : 'bg-black/50 hover:bg-white/[0.06]'"
      @click="leave(); emit('pick', b.en)"
      @mouseenter="enter($event, b)"
      @mouseleave="leave"
    >
      <img v-if="artOf(b.en)" :src="artOf(b.en)!" alt="" loading="lazy" class="h-12 w-12 shrink-0 object-contain md:h-16 md:w-16" draggable="false" />
      <span v-else class="h-12 w-12 shrink-0 md:h-16 md:w-16" />
      <span class="min-w-0 flex-1 max-md:w-full">
        <span class="flex items-baseline gap-2 max-md:flex-col max-md:items-center max-md:gap-0">
          <b class="text-[13px] md:text-[15px]" :class="b.en === selected ? 'text-amber-100' : ''">{{ b.ja }}</b>
          <span v-if="b.lvl" class="ml-auto shrink-0 text-[10px] opacity-50 max-md:ml-0 md:text-[12px]">Lv {{ b.lvl }}</span>
        </span>
        <span v-if="showCls" class="block text-[10px] opacity-50">{{ CATALOG_CLS_JA.get(b.cls) ?? b.cls }}</span>
        <span v-if="b.stats" class="block truncate text-[11px] text-rarity-magic md:text-[13px]">{{ b.stats }}</span>
        <span v-if="b.implicit" class="block truncate text-[11px] text-rarity-magic md:text-[13px]">{{ b.implicit }}</span>
        <span v-if="note?.(b.en)" class="block truncate text-[10.5px] text-sky-300">{{ note(b.en) }}</span>
      </span>
    </button>
    <p v-if="!list.length" class="col-span-full py-4 text-center opacity-50">見つかりません</p>
    <BaseHoverCard v-if="hover" :b="hover.b" :anchor="hover.anchor" :art="artOf(hover.b.en)" :note="note?.(hover.b.en)" />
  </div>
  <!-- 3 行目から下 -->
  <button v-if="fold && (rest > 0 || more) && list.length > cols * 2" type="button" class="g-plain mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-[13px] text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)]" @click="more = !more">{{ more ? "たたむ ▴" : `もっと見る (あと ${rest}) ▾` }}</button>
  </div>
</template>
