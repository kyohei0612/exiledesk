<!--
  EffectHoverCard.vue — poe2db 風ホバーカード (アイテム効果説明)
  Teleport で body 直下に出しテーブルの overflow クリップを回避する。
  CurrencyRanking.vue から切り出し (2026-09-07)。
-->
<script setup lang="ts">
import { computed } from "vue";
import type { RankedItem } from "../../api/poe2scout";
import { jaCurrency } from "../../i18n/currencies-ja";
import type { ItemEffect } from "../../views/currency/format";

const props = defineProps<{ item: RankedItem | null; effect: ItemEffect | null; x: number; y: number }>();

const style = computed(() => {
  const w = 340;
  let x = props.x + 18;
  let y = props.y + 18;
  if (typeof window !== "undefined") {
    if (x + w > window.innerWidth - 8) x = props.x - w - 18;
    if (y > window.innerHeight - 220) y = Math.max(8, window.innerHeight - 240);
  }
  return { left: `${x}px`, top: `${y}px`, width: `${w}px` };
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="item && effect"
      class="fixed z-[1000] pointer-events-none rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] shadow-2xl overflow-hidden"
      :style="style"
    >
      <div class="flex items-center gap-2 px-3 py-2 bg-[var(--exile-color-bg-elevated)] border-b border-[var(--exile-color-border-subtle)]">
        <img v-if="item.icon" :src="item.icon" :alt="item.text" class="w-7 h-7 object-contain shrink-0" />
        <span class="font-display text-[15px] text-[var(--exile-color-accent-focus)] leading-tight">{{ jaCurrency(item.text) }}</span>
      </div>
      <div class="px-3 py-2">
        <div v-if="effect.s" class="text-xs text-[var(--exile-color-text-secondary)] tabular-nums">
          スタック数: <span class="text-[var(--exile-color-text-primary)]">{{ effect.s }}</span>
        </div>
        <div v-if="effect.lv" class="text-xs text-[var(--exile-color-text-secondary)] tabular-nums">
          装備条件: <span class="text-[var(--exile-color-text-primary)]">{{ effect.lv }}</span>
        </div>
        <div v-if="effect.s || effect.lv" class="h-px my-2 bg-gradient-to-r from-transparent via-[var(--exile-color-border-brass)] to-transparent" />
        <p
          v-for="(line, idx) in effect.e"
          :key="idx"
          class="text-[13px] leading-snug text-[var(--exile-color-accent-focus)]"
          :class="idx > 0 ? 'mt-1' : ''"
        >
          {{ line }}
        </p>
      </div>
      <div class="px-3 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--exile-color-text-tertiary)] text-center">{{ item.text }}</div>
    </div>
  </Teleport>
</template>
