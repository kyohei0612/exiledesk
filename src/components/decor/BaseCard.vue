<!--
  Phase A.7: visual-concept §5.2 カード共通ラッパ。
    - 背景 bg.surface / 外周 border.subtle 1px / radius 4px
    - hover で border.brass に切替（transition-colors のみ、shadow 無し）
    - 左上隅に CornerMark を自動配置（absolute、pointer-events-none、aria-hidden）
    - shadow / グラデは §4.5 / §5.2 で禁止のため使用しない
    - スロット: default（カード本体）/ corner（左上装飾の差し替え）/ overlay（追加 absolute 装飾）
  各カードは固有 padding やヘッダー pl-* を子要素側に持つ前提で、
  BaseCard 自体は内側の余白を強制しない（最小干渉）。
-->
<script setup lang="ts">
import CornerMark from "./CornerMark.vue";

withDefaults(
  defineProps<{
    /** hover で border を真鍮に切替えるか（デフォルト true） */
    hover?: boolean;
    /** ラップタグ（デフォルト 'div'。`li` や `article` に差し替え可） */
    as?: string;
  }>(),
  {
    hover: true,
    as: "div",
  },
);
</script>

<template>
  <component
    :is="as"
    class="relative overflow-hidden rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] transition-colors"
    :class="hover ? 'hover:border-[var(--exile-color-border-brass)]' : ''"
  >
    <!-- 左上隅の真鍮 L 字。差し替えたい場合は `#corner` slot を渡す。 -->
    <span class="absolute top-1 left-1 z-10 pointer-events-none">
      <slot name="corner">
        <CornerMark />
      </slot>
    </span>

    <!-- カード本体 -->
    <slot />

    <!-- HotSeal などの追加 absolute 装飾を流し込むスロット（カード内部の relative 基準を使える） -->
    <slot name="overlay" />
  </component>
</template>
