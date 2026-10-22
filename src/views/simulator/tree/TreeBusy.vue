<!--
  TreeBusy.vue — 読み込み中の小さな札 (くるくる + 一言 + 進み n/m)。題の横・精査の帯の上など邪魔にならない所に置き、終わったら消す。
  2026-10-22 オーナー「読み込みながら徐々に出す」(真ん中を覆う形はやめた)。共通の札 (ジン部長の BusyTag) が来たら差し替える仮の物
-->
<script setup lang="ts">
defineProps<{ text: string; n?: number; of?: number }>();
</script>

<template>
  <span data-tree-busy role="status" aria-live="polite" class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/30 bg-black/40 px-2 py-0.5 text-[12px] font-normal tracking-normal text-amber-100/90 [text-shadow:none]">
    <span class="size-3 shrink-0 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" aria-hidden="true" />
    <span class="whitespace-nowrap tabular-nums">{{ text }}<template v-if="of"> {{ n ?? 0 }}/{{ of }}</template></span>
  </span>
</template>
