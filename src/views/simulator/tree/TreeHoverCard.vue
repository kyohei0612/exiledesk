<!--
  TreeHoverCard.vue — 箱に乗せた時のアイテムのカード (2026-10-22 オーナー「ホバーでカード表示、その時点でのアイテムの MOD 構成を表示させて」)。
  中身はその箱の見本 (tree-sample の sampleOf: 親の見本に親の手をエンジンで打った物) をクラフト台と同じ StageItemCard で。外れは「外れ MOD」の行 (tree-row-tags)。
  ツリーの枠の中に収める (箱の右、入らなければ左。上下は枠の中)。押せない (pointer-events-none)。消すのはページ (マウスを外す・Esc・押す・ホイール)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import StageItemCard from "../../craft-stage/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "./tree-row-tags";
import { useTree } from "./use-tree";

const props = defineProps<{ boxId: string; rect: { left: number; top: number; right: number; bottom: number; W: number; H: number } }>();
const t = useTree();
const CARD_W = 300, GAP = 12;
const item = computed(() => (s.data.value ? sampleOf(s.data.value, t.doc.value, props.boxId, 1).item : null));
const tags = computed(() => (s.data.value && item.value ? treeRowTags(s.data.value, t.doc.value, t.doc.value.boxes[props.boxId]?.unwanted ?? [], item.value) : null));
const el = ref<HTMLElement | null>(null);
const style = computed(() => {
  const r = props.rect, h = el.value?.offsetHeight ?? 260;
  const left = r.right + GAP + CARD_W <= r.W - 8 ? r.right + GAP : Math.max(8, r.left - GAP - CARD_W);
  const top = Math.min(Math.max(8, r.top), Math.max(8, r.H - h - 8));
  return { left: `${left}px`, top: `${top}px`, width: `${CARD_W}px` };
});
</script>

<template>
  <div v-if="item" ref="el" data-tree-hover-card class="pointer-events-none absolute z-40 drop-shadow-[0_10px_24px_rgba(0,0,0,0.75)]" :style="style">
    <StageItemCard :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="CARD_W" compact :row-tags="tags" />
  </div>
</template>
