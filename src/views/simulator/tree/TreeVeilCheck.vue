<script setup lang="ts">
/**
 * TreeVeilCheck.vue — 骨 (冒涜) の手の窓の「発現させる」☑ (10-27 夜オーナー、スイッチ boneLater)。既定は無し = 未発現のまま次へ (結果は「未発現の冒涜が付いた」)。
 * ☑ ありで、発現で出うる MOD 全部 (完成形に無い置き石も) から当たりにする MOD を選ぶ (狙う MOD の欄は TreeHandShelf のまま、候補だけ広い)。PC・スマホで同じ部品
 */
import { tr } from "../../../i18n/lang";

defineProps<{ modelValue: boolean; big?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();
</script>

<template>
  <label data-tree-hand-veil class="flex cursor-pointer items-start gap-2 text-[12px]" :class="big ? 'min-h-11 items-center' : 'min-h-7'">
    <input type="checkbox" class="mt-0.5 shrink-0" :class="big ? 'size-5' : ''" :checked="modelValue" @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
    <span class="min-w-0 break-words">{{ modelValue ? tr("発現させる (発現で出うる MOD から当たりを選ぶ)", "Reveal now (pick hits from the mods it can reveal)") : tr("発現させる (今は無し = 未発現のまま次へ)", "Reveal now (off = leave it unrevealed)") }}</span>
  </label>
</template>
