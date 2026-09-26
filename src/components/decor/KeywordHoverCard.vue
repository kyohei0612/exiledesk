<!--
  KeywordHoverCard.vue — 下線 (キーワード) にカーソルを乗せた時の説明のカード (2026-09-26)
  説明はクライアントの KeywordPopups ([[keywords.ts]])。説明の中の下線からさらに奥へ辿れる ([[RichText.vue]])。
-->
<script setup lang="ts">
import { computed } from "vue";
import GameItemCard from "./GameItemCard.vue";
import RichText from "./RichText.vue";
import { keywordOf } from "../../services/keywords";

const props = defineProps<{ id: string; label: string; x: number; y: number; layerKey: number; pinned: boolean; z: number }>();
const kw = computed(() => keywordOf(props.id));
/** 空行で段落に分ける */
const paras = computed(() => (kw.value?.d ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean));
</script>

<template>
  <GameItemCard :show="true" :x="x" :y="y" :name="kw?.t ?? label" tone="keyword" :width="340" :layer-key="layerKey" :pinned="pinned" :z="z">
    <div class="text-left">
      <p v-for="(p, i) in paras" :key="i" class="g-desc text-[13px]" :class="i > 0 ? 'mt-2' : ''"><RichText :text="p" /></p>
      <p v-if="!paras.length" class="g-dim text-[12px]">説明のデータがありません</p>
    </div>
  </GameItemCard>
</template>
