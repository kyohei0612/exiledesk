<!--
  TreeOverlays.vue — ツリーの箱を押した時の重ね窓をまとめて置く所 (2026-10-22 オーナー「箱を押す → 重ね窓で選ぶ → 閉じる で完結」)。
  0 完成形の設定 (TreeGoalPage)・スタート (TreeStartPage)。開いている印は use-tree の goalPage・startPage。
  シミュのどの画面でも Ctrl+V でアイテムの文を取り込む口もここ (tree-paste.ts の usePasteAnywhere、PC とスマホの両方で付いている部品なので)
-->
<script setup lang="ts">
import TreeGoalPage from "./TreeGoalPage.vue";
import TreeStartPage from "./TreeStartPage.vue";
import TreeBoxModList from "./TreeBoxModList.vue";
import TreeLaneAsk from "./TreeLaneAsk.vue";
import TreeFracStop from "./TreeFracStop.vue";
import { useTree } from "./use-tree";
import { usePasteAnywhere } from "./tree-paste";

const t = useTree();
usePasteAnywhere();
</script>

<template>
  <TreeGoalPage v-if="t.goalPage.value" />
  <TreeStartPage v-else-if="t.startPage.value" />
  <!-- 箱から開く「MOD 一覧」の窓 (S-145h。ボタンは次に打つ手の窓と箱の大きい写しの窓) -->
  <TreeBoxModList />
  <!-- 削減の手を消す・打ち直す前の一言 (S-65c4、ほかの枠の手が消える時だけ) -->
  <TreeLaneAsk />
  <!-- 確定フラクチャーが置けない時のポップアップ (S-43a、選んだ MOD が冒涜で付いた / 品に無い) -->
  <TreeFracStop />
</template>
