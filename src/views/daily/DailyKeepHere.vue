<!--
  DailyKeepHere.vue — 挑戦の帯の「保存」(D-36e ①、スイッチ dailySaveSplit)。今の木をデイリーの中だけ (端末の控え = 読み直し・「続きから始める」で開く物) に今すぐ書く。
  名前の窓は出さず、シミュのレシピ一覧には足さない (レシピに残すのは完成形のカードの下の DailySaveRecipe)。押した後は「✓ 保存済み」、次に木を変えるまで残す
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import { useTree } from "../simulator/tree/use-tree";
import { dailyKeptNow, keepDailyNow } from "./daily-save";

const props = defineProps<{ id: string; dev?: boolean }>();
const t = useTree();
const keptNow = computed(() => !!dailyKeptNow.value && dailyKeptNow.value === JSON.stringify(toRecipeV1(t.doc.value)));
</script>

<template>
  <button type="button" class="g-btn sm" data-daily-keep :title="tr('この挑戦の今のツリーをデイリーの中に保存する (一覧の「続きから始める」で開く。シミュのレシピには足さない)', 'Save this challenge tree inside the daily (reopen it with Continue on the list; not added to your Simulator recipes)')" @click="keepDailyNow(props.id, t.doc.value, !!props.dev)"><span v-if="keptNow" data-daily-kept class="text-emerald-300">✓ {{ tr("保存済み", "Saved") }}</span><template v-else>{{ tr("保存", "Save") }}</template></button>
</template>
