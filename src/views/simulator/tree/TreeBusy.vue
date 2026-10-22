<!--
  TreeBusy.vue — ツリーの枠の真ん中に浮かべる読み込み中の表示 (くるくる + 何をしているか一言 + 進み n/m)。
  2026-10-22 オーナー「待ち時間のローディング画面を出さないとバグってるのか分からない」。共通の部品 (ジン部長) が来たら差し替える仮の物
-->
<script setup lang="ts">
defineProps<{ text: string; n?: number; of?: number }>();
</script>

<template>
  <div data-tree-busy role="status" aria-live="polite" class="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-xl border border-amber-400/40 bg-[#15110c]/95 px-4 py-3 text-[13px] text-amber-100 shadow-[0_8px_24px_rgba(0,0,0,0.7)]">
    <span class="size-5 shrink-0 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" aria-hidden="true" />
    <span>{{ text }}<template v-if="of"> {{ n ?? 0 }}/{{ of }}</template></span>
  </div>
</template>
