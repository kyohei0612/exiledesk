<!--
  TreeGoalNode.vue — ツリーの枠の左上に浮かぶ「0 完成形の設定」の札 (2026-10-22 オーナー「ツリー特化」、10-23 に木の箱から外した)。
  10-23 オーナー「全体的にスタートが分かりづらい」: 木の一番上はスタートにし、完成形の設定は木を送っても見える左上へ。開くボタンは
  「ベース」(ベースの段) と「MOD」(完成の MOD の段を直接) の 2 つ (前は押すと必ずベースの段が先に出た)。重ね窓は TreeGoalPage.vue
-->
<script setup lang="ts">
import { computed } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { useTree } from "./use-tree";
import { rarityName } from "./tree-names";

const t = useTree();
const RGB = "242,210,122";
const rarity = computed(() => rarityName(t.goalRarity.value));
const n = computed(() => t.goals.value.length);
const marks = computed(() => t.goals.value.filter((a) => a.fractured).length);
</script>

<template>
  <div data-tree-goal class="pointer-events-auto w-[260px] max-w-[calc(100%-1rem)] select-none rounded-xl border-[1.5px] bg-gradient-to-b from-[#221b10]/95 to-[#120e08]/95 px-2 py-1.5 text-[12px] shadow-[0_6px_20px_rgba(0,0,0,0.6)]"
    :style="{ borderColor: `rgba(${RGB},${t.goalPage.value ? 0.95 : 0.7})` }">
    <div class="flex h-6 items-center gap-1.5">
      <span class="flex size-5 shrink-0 items-center justify-center rounded-md" :style="{ background: `rgba(${RGB},0.18)`, color: `rgb(${RGB})` }"><Icon name="pin" class="size-3.5" /></span>
      <span class="truncate text-[11px] font-bold tracking-wide" :style="{ color: `rgb(${RGB})` }">{{ tr("0 完成形の設定", "0 Final item") }}</span>
      <span class="ml-auto shrink-0 text-[11px] opacity-70">{{ tr(`Lv ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " 適正" : ""}`, `ilvl ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " fit" : ""}`) }}</span>
    </div>
    <div class="flex min-w-0 items-center gap-1.5">
      <p class="min-w-0 flex-1 truncate text-[13px] font-bold leading-7">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }} <span class="text-[11px] font-normal opacity-70">{{ rarity }}</span></p>
      <button type="button" data-tree-goal-open="base" class="g-btn sm shrink-0" :title="tr('ベース・レアリティ・アイテムレベルを選ぶ', 'Choose the base, rarity and item level')" @click="t.goalPage.value = 1">{{ tr("ベース", "Base") }}</button>
    </div>
    <div class="flex min-w-0 items-center gap-1.5">
      <p class="min-w-0 flex-1 truncate leading-7" :class="n ? 'text-[#c8c8ff]' : 'text-amber-300'" :title="t.goals.value.map((a) => `${a.fractured ? '✦ ' : ''}${t.aimLabel(a)}`).join('\n')">
        {{ n ? tr(`狙い ${n} つ${marks ? ` · ✦ ${marks}` : ""}`, `${n} target(s)${marks ? ` · ✦ ${marks}` : ""}`) : tr("完成の MOD はまだ", "No final mods yet") }}
      </p>
      <button type="button" data-tree-goal-open="mods" class="g-btn sm shrink-0" :title="tr('完成の MOD を決める (狙いにする・フラクチャーの印)', 'Set the final mods (targets and fracture marks)')" @click="t.goalPage.value = 2">{{ tr("MOD", "Mods") }}</button>
    </div>
  </div>
</template>
