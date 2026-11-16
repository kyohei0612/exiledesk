<!--
  TreeOldRecipe.vue — 古いレシピの木の上の 1 行と組み直しのボタン (S-104e、スイッチ oldRecipeView): 組み方の版の違う写しをそのまま出している間だけ。
  見た目は TreeDailyPast と同じ帯の線。押すと打ち方から今の決まりで組み直す (use-tree の renewOld)。印の判定は tree-built の isOldRecipe
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { isOldRecipe } from "../../../services/simulator/tree/tree-built";
import { useTree } from "./use-tree";

const t = useTree();
const on = computed(() => isOldRecipe(t.doc.value));
</script>

<template>
  <p v-if="on" data-tree-old-recipe class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-[var(--exile-color-border-brass)] pl-2 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">
    <span class="text-[var(--exile-color-text-title)]">{{ tr("古いレシピ: 前の決まりで組んだ木をそのまま出しています。100 人回す・最終チェックはできません。", "Old recipe: this tree is shown as it was built under earlier rules. Running 100 and the final check are off.") }}</span>
    <button type="button" data-tree-old-rebuild class="g-btn sm shrink-0 whitespace-nowrap" :disabled="t.loading.value" @click="t.renewOld()">{{ tr("今の決まりで組み直す", "Rebuild with current rules") }}</button>
  </p>
</template>
