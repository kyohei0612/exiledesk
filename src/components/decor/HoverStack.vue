<!--
  HoverStack.vue — ホバーの重なりを描く (App.vue に 1 つ) (2026-09-26)
  段の決まりは [[hover-stack.ts]]。上の段ほど前に出す。
-->
<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { hoverStack } from "../../state/hover-stack";
import KeywordHoverCard from "./KeywordHoverCard.vue";
// 後から読む (2026-10-19 スマホ強化: 最初に読む JS を縮める。その画面・カードを出す時に初めて読む)。ユニークの訳 (2.7MB)・PoB・スキルの絵の表などが最初の塊に入っていた
const UniqueHoverCard = defineAsyncComponent(() => import("../unique-trend/UniqueHoverCard.vue"));
const CurrencyHoverCard = defineAsyncComponent(() => import("../currency/CurrencyHoverCard.vue"));
const GemHoverCard = defineAsyncComponent(() => import("./GemHoverCard.vue"));
const BuildItemHoverCard = defineAsyncComponent(() => import("../build-copy/BuildItemHoverCard.vue"));
const BaseItemHoverCard = defineAsyncComponent(() => import("../items/BaseItemHoverCard.vue"));
import StageCurrencyCard from "../../views/craft-stage/StageCurrencyCard.vue";
</script>

<template>
  <template v-for="(l, i) in hoverStack.layers.value" :key="l.key">
    <UniqueHoverCard v-if="l.payload.kind === 'unique'" :row="l.payload.row" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <CurrencyHoverCard v-else-if="l.payload.kind === 'currency'" :item="l.payload.item" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <GemHoverCard v-else-if="l.payload.kind === 'gem'" :en="l.payload.en" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <BuildItemHoverCard v-else-if="l.payload.kind === 'build'" :item="l.payload.item" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <BaseItemHoverCard v-else-if="l.payload.kind === 'base'" :en="l.payload.en" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <StageCurrencyCard v-else-if="l.payload.kind === 'shelf'" :k="l.payload.k" :reason="l.payload.reason" :omen="l.payload.omen" :item="l.payload.item" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
    <KeywordHoverCard v-else :id="l.payload.id" :label="l.payload.label" :x="l.x" :y="l.y" :layer-key="l.key" :pinned="l.pinned" :z="1000 + i" />
  </template>
</template>
