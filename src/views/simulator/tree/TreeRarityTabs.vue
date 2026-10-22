<!--
  TreeRarityTabs.vue — レアリティの札 (ノーマル / マジック / レア、10-22 オーナー「ノーマルも足す」)。0 完成形の設定とスタートの重ね窓で使う
-->
<script setup lang="ts">
import type { TreeRarity } from "../../../services/simulator/tree/tree-model";
import { rarityName } from "./tree-names";

defineProps<{ modelValue: TreeRarity }>();
const emit = defineEmits<{ "update:modelValue": [r: TreeRarity] }>();
const ALL: readonly TreeRarity[] = ["normal", "magic", "rare"];
</script>

<template>
  <span class="flex items-center gap-1">
    <button v-for="r in ALL" :key="r" type="button" :data-tree-rarity="r" class="g-tab !min-h-[28px] !px-3 !text-[12px]" :class="modelValue === r ? 'on' : ''" @click="emit('update:modelValue', r)">{{ rarityName(r) }}</button>
  </span>
</template>
