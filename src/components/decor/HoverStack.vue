<!--
  HoverStack.vue — ホバーの重なりを描く (App.vue に 1 つ) (2026-09-26)
  段の決まりは [[hover-stack.ts]]。上の段ほど前に出す。
-->
<script setup lang="ts">
import { hoverStack } from "../../state/hover-stack";
import UniqueHoverCard from "../unique-trend/UniqueHoverCard.vue";
import CurrencyHoverCard from "../currency/CurrencyHoverCard.vue";
import KeywordHoverCard from "./KeywordHoverCard.vue";
import GemHoverCard from "./GemHoverCard.vue";
</script>

<template>
  <template v-for="(l, i) in hoverStack.layers.value" :key="l.key">
    <UniqueHoverCard v-if="l.payload.kind === 'unique'" :row="l.payload.row" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <CurrencyHoverCard v-else-if="l.payload.kind === 'currency'" :item="l.payload.item" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <GemHoverCard v-else-if="l.payload.kind === 'gem'" :en="l.payload.en" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <KeywordHoverCard v-else :id="l.payload.id" :label="l.payload.label" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
  </template>
</template>
