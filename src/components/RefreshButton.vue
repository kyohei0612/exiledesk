<!--
  RefreshButton.vue — 手動更新のボタン (2026-09-21)

  オーナー指示 2026-09-21:「UI とか UX 周り確認しながら統一感持たせて。アドニアがいい例。
  更新指示と手動更新指示あるでしょ」。

  アドニアの賭けの再取得ボタンの形に揃える: 枠線 + ⟳ + 文言。
  画面ごとに枠線ボタン / 塗りつぶし + 🔄 絵文字 / 大きさ違い がばらけていたのを 1 つにする。

  文言は呼ぶ側が決める (取得中・レート制限・枠の残りは refetchState が作る)。
  巡回中に押せないのは fetch-busy.ts が refetchState に渡すので、ここでは何もしない。
-->
<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    disabled?: boolean;
    title?: string;
    /** 補助的な操作 (全取得など) は控えめな枠線にする */
    subtle?: boolean;
  }>(),
  { disabled: false, title: "", subtle: false },
);
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :title="title"
    :class="[
      'px-3 py-1 rounded-lg border text-[11px] tabular-nums transition-colors',
      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent hover:bg-white/5',
      subtle
        ? 'border-white/15 text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-text-primary)]'
        : 'border-amber-400/50 text-amber-200',
    ]"
  >
    <span aria-hidden="true">⟳</span>
    {{ label }}
  </button>
</template>
