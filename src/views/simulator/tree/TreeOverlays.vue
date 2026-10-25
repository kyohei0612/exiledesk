<!--
  TreeOverlays.vue — ツリーの箱を押した時の重ね窓をまとめて置く所 (2026-10-22 オーナー「箱を押す → 重ね窓で選ぶ → 閉じる で完結」)。
  0 完成形の設定 (TreeGoalPage)・スタート (TreeStartPage)。開いている印は use-tree の goalPage・startPage。
  シミュのどの段でも Ctrl+V でアイテムの文を取り込む口と、今の木が消える時の確かめの帯もここ (tree-paste.ts、PC とスマホの両方で付いている部品なので)
-->
<script setup lang="ts">
import TreeGoalPage from "./TreeGoalPage.vue";
import TreeStartPage from "./TreeStartPage.vue";
import { useTree } from "./use-tree";
import { confirmPaste, pendingPaste, usePasteAnywhere } from "./tree-paste";
import { tr } from "../../../i18n/lang";

const t = useTree();
usePasteAnywhere();
</script>

<template>
  <TreeGoalPage v-if="t.goalPage.value" />
  <TreeStartPage v-else-if="t.startPage.value" />
  <!-- 貼り付けで今の木が消える時だけ 1 回確かめる (ベースを替える時の確かめと同じ文、1 つ戻すで戻せる) -->
  <div v-if="pendingPaste" data-tree-paste-ask role="alertdialog" class="fixed inset-x-2 top-3 z-[80] mx-auto flex max-w-[640px] flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px] shadow-[0_10px_30px_rgba(0,0,0,0.7)]">
    <p class="min-w-0 flex-1">{{ tr(`貼ったアイテム (${pendingPaste.base}) の白紙から組み直します。今の木 (箱 ${pendingPaste.boxes} 個) が消えます (1 つ戻すで戻せます)。`, `Start over from the pasted item (${pendingPaste.base}). This tree (${pendingPaste.boxes} box(es)) will be removed (Undo brings it back).`) }}</p>
    <button type="button" class="g-btn sm" @click="pendingPaste = null">{{ tr("やめる", "Cancel") }}</button>
    <button type="button" data-tree-paste-ok class="g-btn sm" @click="confirmPaste">{{ tr("替える", "Change") }}</button>
  </div>
</template>
