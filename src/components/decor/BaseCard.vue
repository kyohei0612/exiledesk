<!--
  BaseCard.vue — カード共通ラッパ
    - 2026-09-27 からクラフト計算機と同じ見た目: 角丸 (rounded-xl) / 薄い白の枠 / うっすら明るい背景。hover で枠を少し明るく
    - solid: ダイアログなど下が透けると読めない物は不透明の面
    - スロット: default（カード本体）/ overlay（追加 absolute 装飾）
  各カードは固有 padding を子要素側に持つ前提で、BaseCard 自体は内側の余白を強制しない（最小干渉）。
-->
<script setup lang="ts">
// 2026-09-27 見た目をクラフト計算機にそろえた (オーナー「全体的に全タブの UI この感じに合わせようか」):
// 角丸・薄い白の枠・うっすら明るい背景。真鍮の L 字 (CornerMark) はやめた。ダイアログは solid で不透明に
withDefaults(
  defineProps<{
    /** hover で枠を少し明るくするか（デフォルト true） */
    hover?: boolean;
    /** ラップタグ（デフォルト 'div'。`li` や `article` に差し替え可） */
    as?: string;
    /** 背景を不透明に (ダイアログなど、下が透けると読めない物) */
    solid?: boolean;
  }>(),
  {
    hover: true,
    as: "div",
    solid: false,
  },
);
</script>

<template>
  <component
    :is="as"
    class="relative overflow-hidden rounded-xl border border-white/10 transition-colors"
    :class="[hover ? 'hover:border-white/20' : '', solid ? 'bg-[var(--exile-color-bg-surface)]' : 'bg-white/[0.03]']"
  >
    <!-- カード本体 -->
    <slot />

    <!-- HotSeal などの追加 absolute 装飾を流し込むスロット（カード内部の relative 基準を使える） -->
    <slot name="overlay" />
  </component>
</template>
