<!--
  TreeGoalNode.vue — ツリーの一番上の「0 完成形の設定」の箱 (2026-10-22 オーナー「ツリー特化」)。置き場は tree-goal.ts (スタートの箱の真上、木の形の外)。
  押すと重ね窓 (TreeGoalPage.vue) で ベース・レアリティ・アイテムレベル → 完成の MOD。押した判定はページの Vue Flow の node-click。下にスタートの箱への線と矢印
-->
<script setup lang="ts">
import { computed } from "vue";
import Icon from "../../../components/ui/Icon.vue";
import { BOX_W } from "../../../services/simulator/tree/tree-model";
import { jaTypeName } from "../../../i18n/item-names-ja";
import { tr } from "../../../i18n/lang";
import { GOAL_GAP, GOAL_H } from "./tree-goal";
import { useTree } from "./use-tree";
import { rarityName } from "./tree-names";

defineProps<{ selected?: boolean }>();
const t = useTree();
const RGB = "242,210,122";
const rarity = computed(() => rarityName(t.goalRarity.value));
const n = computed(() => t.goals.value.length);
</script>

<template>
  <div data-tree-goal class="relative cursor-pointer select-none rounded-xl border-[1.5px] bg-gradient-to-b from-[#221b10] to-[#120e08] px-2 py-1 text-[12px] hover:brightness-110"
    :style="{ width: `${BOX_W}px`, height: `${GOAL_H}px`, borderColor: `rgba(${RGB},${selected ? 0.95 : 0.7})`, boxShadow: `0 0 0 1px rgba(${RGB},0.3), 0 0 16px rgba(${RGB},0.25)` }"
    :title="tr('押すと完成形を決める (ベース・レアリティ・アイテムレベル → 完成の MOD)', 'Click to set the finished item (base, rarity, item level → final mods)')">
    <div class="flex h-6 items-center gap-1.5">
      <span class="flex size-5 shrink-0 items-center justify-center rounded-md" :style="{ background: `rgba(${RGB},0.18)`, color: `rgb(${RGB})` }"><Icon name="pin" class="size-3.5" /></span>
      <span class="truncate text-[11px] font-bold tracking-wide" :style="{ color: `rgb(${RGB})` }">{{ tr("0 完成形の設定", "0 Final item") }}</span>
      <span class="ml-auto shrink-0 text-[11px] opacity-70">{{ tr(`Lv ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " 適正" : ""}`, `ilvl ${t.doc.value.itemLevel}${t.doc.value.ilvlFit ? " fit" : ""}`) }}</span>
    </div>
    <p class="truncate text-[13px] font-bold leading-6">{{ tr(jaTypeName(t.doc.value.base), t.doc.value.base) }} <span class="text-[11px] font-normal opacity-70">{{ rarity }}</span></p>
    <p class="truncate leading-6" :class="n ? 'text-[#c8c8ff]' : 'text-amber-300'" :title="t.goals.value.map((a) => t.aimLabel(a)).join('\n')">
      {{ n ? tr(`狙い ${n} つ · ${t.startModLabel(t.goals.value[0]!)}`, `${n} target(s) · ${t.startModLabel(t.goals.value[0]!)}`) : tr("＋ 完成の MOD を決める", "+ Set the final mods") }}
    </p>
    <!-- スタートの箱への線と矢印 (木の線と同じ色) -->
    <svg class="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 overflow-visible" width="12" :height="GOAL_GAP">
      <path :d="`M 6 0 L 6 ${GOAL_GAP - 4}`" stroke="#a39a88" stroke-width="2" />
      <path :d="`M 1 ${GOAL_GAP - 10} L 6 ${GOAL_GAP - 2} L 11 ${GOAL_GAP - 10}`" stroke="#a39a88" stroke-width="2" fill="none" />
    </svg>
  </div>
</template>
