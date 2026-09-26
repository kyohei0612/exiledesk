<!--
  WatchToggleButton.vue — 自動ジェム監視に入れる / 外すボタン (2026-09-26)
  スキル使用率 (SkillUsageCard) とジェムコラプトの賭けで同じ物を使う。押した時の動き (枠が埋まっていれば入れ替え先を聞く)
  は [[watch-replace.ts]] の toggleWatchGem。
-->
<script setup lang="ts">
import { isManualGem } from "../state/watch-settings";
import { toggleWatchGem } from "../state/watch-replace";

defineProps<{ gemEn: string; nameJa: string }>();
</script>

<template>
  <button
    type="button"
    class="shrink-0 whitespace-nowrap px-1 rounded border transition-colors"
    :class="isManualGem(gemEn)
      ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] hover:text-rose-300'
      : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]'"
    :title="isManualGem(gemEn) ? '自動ジェム監視から外す' : `${nameJa} を自動ジェム監視に入れて、3 条件の最安を取ります`"
    @click.stop="toggleWatchGem(gemEn)"
  >
    {{ isManualGem(gemEn) ? "監視中 ✓" : "監視へ +" }}
  </button>
</template>
