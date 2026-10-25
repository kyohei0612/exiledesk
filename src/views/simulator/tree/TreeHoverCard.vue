<!--
  TreeHoverCard.vue — 箱に乗せた時のアイテムのカード (2026-10-22 オーナー「ホバーでカード表示、その時点でのアイテムの MOD 構成を表示させて」)。
  中身はその箱の見本 (tree-sample の sampleOf: 親の見本に親の手をエンジンで打った物) をクラフト台と同じ StageItemCard で。外れは「外れ MOD」の行 (tree-row-tags)。
  ツリーの枠の中に収める (箱の右、入らなければ左。上下は枠の中)。押せない (pointer-events-none)。消すのはページ (マウスを外す・Esc・押す・ホイール)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { treeRowTags } from "./tree-row-tags";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

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
    <!-- 戻り先を同じ形の箱へ自動でつないだ箱 (tree-run の linkSameShape。押せば別の箱にも替えられる、10-22 オーナー) -->
    <p v-if="t.doc.value.boxes[boxId]?.autoBack" data-tree-auto-back class="mb-1 rounded-md bg-cyan-950/90 px-2 py-1 text-[12px] text-cyan-100">{{ tr("↩ 狙いの MOD が同じ箱へ自動でつないだ (狙い以外の MOD は違ってよい。戻り先の札で替えられる)", "↩ Auto-linked to the box with the same target mods (other mods may differ; change it from the return tag)") }}</p>
    <StageItemCard :item="item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="CARD_W" compact :row-tags="tags" />
  </div>
</template>
