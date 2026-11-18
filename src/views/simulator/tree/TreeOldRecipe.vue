<!--
  TreeOldRecipe.vue — 古いレシピの木の上の 1 行と組み直しのボタン (S-104e、スイッチ oldRecipeView): 組み方の版の違う写しをそのまま出している間だけ。
  見た目は TreeDailyPast と同じ帯の線。押すと打ち方から今の決まりで組み直す (use-tree の renewOld)。印の判定は tree-built の isOldRecipe
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../../i18n/lang";
import { isOldRecipe } from "../../../services/simulator/tree/tree-built";
import { useTree } from "./use-tree";
import { oldChecking } from "./tree-old-same";
import { flag } from "../../../web/release-flags";

const t = useTree();
const on = computed(() => isOldRecipe(t.doc.value) && !oldChecking.value); // 比べている間は出さない (S-104g ⑥)
/** (スイッチ recipeFrozen、S-104g ①) 保存したまま開いている・組み直しは人が選ぶ (100 人回す・最終チェックは組み直してから回す) */
const frozen = computed(() => flag("recipeFrozen"));
</script>

<template>
  <p v-if="on" data-tree-old-recipe class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-[var(--exile-color-border-brass)] pl-2 text-[12px] leading-snug text-[var(--exile-color-text-secondary)]">
    <span v-if="frozen" class="text-[var(--exile-color-text-title)]">{{ tr("古いレシピ: 前の版の決まりで組んだ木を、保存した時のまま出しています。", "Old recipe: shown as saved, built under earlier rules.") }}</span>
    <span v-else class="text-[var(--exile-color-text-title)]">{{ tr("古いレシピ: 前の決まりで組んだツリーをそのまま出しています。100 人回す・最終チェックはできません。", "Old recipe: this tree is shown as it was built under earlier rules. Running 100 and the final check are off.") }}</span>
    <button type="button" data-tree-old-rebuild class="g-btn sm shrink-0 whitespace-nowrap" :disabled="t.loading.value" @click="t.renewOld()">{{ frozen ? tr("新しい版で組み直す", "Rebuild with current rules") : tr("今の決まりで組み直す", "Rebuild with current rules") }}</button>
  </p>
</template>
