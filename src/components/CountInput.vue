<!--
  CountInput.vue — 「空欄なら灰色の既定値を使う」数の入力欄 (2026-09-20)

  収支の「使った数」「売れた数」用。空欄でも灰色の値 (1 回の数 × 回数、期待値) が
  そのまま計算に入っているので、▲▼・矢印キー・ホイールはその値から 1 ずつ動かす。
  値の意味は今まで通り: 空欄 = null = 自動 (灰色の値を使う)。
-->
<script setup lang="ts">
import NumStep from "./NumStep.vue";

withDefaults(
  defineProps<{
    placeholderValue?: number | null;
    placeholderText?: string;
    width?: string;
  }>(),
  { placeholderValue: null, placeholderText: "0", width: "w-20" },
);
const model = defineModel<number | null>({ default: null });
</script>

<template>
  <NumStep v-model="model" :placeholder-value="placeholderValue" :placeholder-text="placeholderText" :width="width" integer />
</template>
