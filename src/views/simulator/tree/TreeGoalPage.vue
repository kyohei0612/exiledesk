<!--
  TreeGoalPage.vue — 「0 完成形の設定」の重ね窓 (2026-10-22 オーナー「ツリー特化。箱を押す → 重ね窓で選ぶ → 閉じる で完結」)。枠は ModalShell (前の TreeBasePage と同じ)。
  1 = ベース・レアリティ・アイテムレベル (適正): 上の行が TreeBasePick、下はベースのページと同じ BaseCatalog。ベースを選ぶと 2 へ。
  2 = 完成の MOD: エミュの「このベースに付く MOD」(StageModList) そのまま、段の行のボタンは「狙いにする」1 つ (もう一度押すと外す)。右に完成形のアイテムのカード (付き方を見ながら作る)。
  ベースを替えると白紙から (下の箱か始まりの MOD があれば 1 回確かめる、1 つ戻すで戻せる)。開いている印は use-tree の goalPage
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import BaseCatalog from "../../../components/items/BaseCatalog.vue";
import ModalShell from "../../../components/ui/ModalShell.vue";
import StageModList from "../../../components/for-share/mod-list/StageModList.vue";
import StageItemCard from "../../../components/for-share/item/StageItemCard.vue";
import { craftStage as s } from "../../../state/craft-stage";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { startOf } from "../../../services/simulator/tree/tree-model";
import TreeBasePick from "./TreeBasePick.vue";
import { useTree } from "./use-tree";

const t = useTree();
const step = computed(() => t.goalPage.value);
const startMods = computed(() => startOf(t.doc.value).mods.length);
const asking = ref<string | null>(null);
function close(): void { asking.value = null; t.goalPage.value = 0; }
function pick(en: string): void {
  if (en === t.doc.value.base) { t.goalPage.value = 2; return; }
  if (t.lostOnBase.value > 0 || startMods.value || t.goals.value.length) { asking.value = en; return; }
  apply(en);
}
function apply(en: string): void {
  asking.value = null;
  t.setBase(en, t.doc.value.itemLevel);
  t.goalPage.value = 2;
}
const pickGoal = { has: t.hasGoal, toggle: t.toggleGoal };
const CARD_W = 340;
</script>

<template>
  <ModalShell :open="true" rec="tree-goal" :title="tr('0 完成形の設定', '0 Final item')" :close-title="tr('ツリーへ戻る (Esc / 枠の外を押す)', 'Back to the tree (Esc / click outside)')" width="w-[88%] h-[86%]" full-on-phone body-class="px-3 pb-3" @close="close">
    <template #subheader>
      <!-- 1 → 2 の段 (押すとその段へ) -->
      <div data-tree-goal-steps class="flex items-center gap-2 px-3 pb-2">
        <button type="button" data-tree-goal-step="1" class="g-tab !min-h-[30px] !px-4 !text-[13px]" :class="step === 1 ? 'on' : ''" @click="t.goalPage.value = 1">{{ tr("1 ベース", "1 Base") }} <span class="ml-1 text-[11px] opacity-70">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }}</span></button>
        <span class="opacity-40">→</span>
        <button type="button" data-tree-goal-step="2" class="g-tab !min-h-[30px] !px-4 !text-[13px]" :class="step === 2 ? 'on' : ''" @click="t.goalPage.value = 2">{{ tr("2 完成の MOD", "2 Final mods") }} <span class="ml-1 rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums">{{ t.goals.value.length }}</span></button>
      </div>
    </template>
    <div v-if="step === 1" data-tree-goal-base class="flex min-w-0 flex-col gap-3">
      <TreeBasePick />
      <!-- ベースを替えると今の木が消える時だけ、1 回確かめる -->
      <div v-if="asking" data-tree-base-ask class="flex flex-wrap items-center gap-3 rounded-lg border border-rose-400/60 bg-[#2a1416] px-3 py-2 text-[13px]">
        <p class="min-w-0 flex-1">{{ tr(`${jaTypeName(asking)} の白紙から組み直します。今の木 (箱 ${t.lostOnBase.value} 個${startMods ? "・始まりの MOD" : ""}${t.goals.value.length ? "・完成の狙い" : ""}) が消えます (1 つ戻すで戻せます)。`, `Start over from a blank ${asking}. This tree (${t.lostOnBase.value} box(es)${startMods ? ", starting mods" : ""}${t.goals.value.length ? ", final targets" : ""}) will be removed (Undo brings it back).`) }}</p>
        <button type="button" class="g-btn sm" @click="asking = null">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" data-tree-base-ok class="g-btn sm" @click="apply(asking!)">{{ tr("替える", "Change") }}</button>
      </div>
      <BaseCatalog :data="s.data.value" :selected="t.doc.value.base" @pick="pick" />
    </div>
    <div v-else data-tree-goal-mods class="flex min-h-0 min-w-0 items-start gap-4">
      <div class="min-w-0 flex-1"><StageModList overlay :item="t.goalItem.value?.item ?? null" :pick="pickGoal" /></div>
      <!-- 完成形のカード (ページの送りでも見えるよう上に留める) -->
      <div data-tree-goal-card class="sticky top-0 flex shrink-0 flex-col gap-2" :style="{ width: `${CARD_W}px` }">
        <StageItemCard v-if="t.goalItem.value" :item="t.goalItem.value.item" :added="[]" :removed="[]" :holding="false" :flash-key="0" :width="CARD_W" />
        <p v-if="t.goalItem.value?.note" data-tree-goal-problem class="rounded-md border border-rose-400/50 bg-[#2a1416] px-2 py-1 text-[12px] text-rose-100">{{ tr(`付けられない狙いがある: ${t.goalItem.value.note}`, `A target can't be added: ${t.goalItem.value.note}`) }}</p>
        <p class="text-[12px] opacity-70">{{ tr("「狙いにする」= その段以上が付けば当たり。後の箱の当たりはこの狙いから選ぶ", "“Target” = a hit if that tier or better rolls. Later hit boxes pick from these targets") }}</p>
      </div>
    </div>
    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <button v-if="step === 2" type="button" class="g-btn sm" @click="t.goalPage.value = 1">{{ tr("← ベース", "← Base") }}</button>
        <button v-if="step === 1" type="button" data-tree-goal-next class="g-btn sm" @click="t.goalPage.value = 2">{{ tr("次へ: 完成の MOD →", "Next: final mods →") }}</button>
        <button v-else type="button" data-tree-goal-done class="g-btn sm" @click="close">{{ tr("決めた (ツリーへ)", "Done (back to the tree)") }}</button>
      </div>
    </template>
  </ModalShell>
</template>
