<!--
  DailySaveRecipe.vue — 挑戦の木を「レシピに保存」(D-36b)。右の完成形のカードの下の並び (DailyPlayBar の side) に置く。
  押すと名前の窓 (最初は「デイリー MM-DD <お題の品>」、変えられる) → 保存でシミュのレシピ一覧に写しを 1 つ。保存した後はボタンの字が「✓ 保存済み」になり、次に木を変えるまで残る (S-03b と同じ考え、帯の小さい並びに 1 行を足さない)
-->
<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { tr } from "../../i18n/lang";
import ModalShell from "../../components/ui/ModalShell.vue";
import { toRecipeV1 } from "../../services/simulator/tree/tree-recipe-v1";
import { useTree } from "../simulator/tree/use-tree";
import type { DailyTopic } from "./daily-api";
import { dailyRecipeName, dailySavedNow, saveDailyCopy } from "./daily-save";

const props = defineProps<{ topic: DailyTopic }>();
const t = useTree();
const open = ref(false);
const name = ref("");
const box = ref<HTMLInputElement | null>(null);
/** 保存した時の打ち方のままか (変えたら印を消す) */
const savedNow = computed(() => !!dailySavedNow.value && dailySavedNow.value === JSON.stringify(toRecipeV1(t.doc.value)));
function ask(): void {
  name.value = dailyRecipeName(props.topic);
  open.value = true;
  void nextTick(() => box.value?.select());
}
function save(): void {
  saveDailyCopy(props.topic, name.value, t.doc.value);
  open.value = false;
}
</script>

<template>
  <button type="button" class="g-btn sm" data-daily-save-recipe :title="tr('シミュのレシピ一覧に写しを保存する (挑戦の木とはつながらない)', 'Save a copy to your Simulator recipes (not linked to this challenge)')" @click="ask"><span v-if="savedNow" data-daily-saved class="text-emerald-300">✓ {{ tr("保存済み", "Saved") }}</span><template v-else>{{ tr("レシピに保存", "Save as recipe") }}</template></button>
  <ModalShell :open="open" :title="tr('レシピに保存', 'Save as recipe')" layer="confirm" width="w-full max-w-md" body-class="px-4 py-3" @close="open = false">
    <label class="block text-[13px] text-[var(--exile-color-text-secondary)]" for="daily-save-name">{{ tr("レシピの名前", "Recipe name") }}</label>
    <input id="daily-save-name" ref="box" v-model="name" data-daily-save-name type="text" maxlength="80" spellcheck="false" autocomplete="off" class="daily-input mt-1 w-full" @keydown.enter.prevent="save" />
    <p class="mt-2 text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ tr("シミュのレシピ一覧に写しを足す。保存した後は、挑戦の木とレシピのどちらを触っても、もう片方は変わらない。", "Adds a copy to your Simulator recipes. After saving, changing the challenge tree or the recipe won't change the other.") }}</p>
    <template #footer>
      <button type="button" class="g-btn sm ml-auto" data-daily-save-cancel @click="open = false">{{ tr("やめる", "Cancel") }}</button>
      <button type="button" class="g-btn sm" data-daily-save-ok @click="save">{{ tr("保存", "Save") }}</button>
    </template>
  </ModalShell>
</template>
