<script setup lang="ts">
/**
 * シミュレーションの進み具合 (○ / 500 人)。この部品だけが数字を読むので、数字が変わっても描き直すのはここだけ
 * (2026-10-07: シミュレーションの画面で直に読んでいた時は、1 秒 25 回の更新のたびに画面全体が描き直され、計算 20 秒が 1 分半になっていた)。
 * 親は box (ただの入れ物) を渡すだけで、中の ref は読まない
 */
import type { Ref } from "vue";

defineProps<{ box: { progress: Ref<[number, number] | null> }; phase: string }>();
</script>

<template>
  <span class="ml-auto text-sky-200">{{ phase }}<template v-if="box.progress.value && phase === '試しています'"> {{ box.progress.value[0].toLocaleString() }} / {{ box.progress.value[1].toLocaleString() }} 人</template>…</span>
</template>
