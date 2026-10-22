<!--
  TreeOverlays.vue — ツリーの箱を押した時の重ね窓をまとめて置く所 (2026-10-22 オーナー「箱を押す → 重ね窓で選ぶ → 閉じる で完結」)。
  0 完成形の設定 (TreeGoalPage)・スタート (TreeStartPage)。開いている印は use-tree の goalPage・startPage
-->
<script setup lang="ts">
import TreeGoalPage from "./TreeGoalPage.vue";
import TreeStartPage from "./TreeStartPage.vue";
import { useTree } from "./use-tree";

const t = useTree();
</script>

<template>
  <TreeGoalPage v-if="t.goalPage.value" />
  <TreeStartPage v-else-if="t.startPage.value" />
</template>
