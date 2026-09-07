<!--
  ItemSummary.vue — 貼り付けた装備の解析結果 (ベース / レアリティ / mod 同定状況)
-->
<script setup lang="ts">
import type { ParsedItem } from "../../views/craft-profit/parse";

defineProps<{ item: ParsedItem }>();

const RARITY_JA: Record<string, string> = { normal: "ノーマル", magic: "マジック", rare: "レア", unique: "ユニーク", unknown: "不明" };
</script>

<template>
  <div class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 text-[12px]">
    <div class="flex items-baseline gap-3 flex-wrap">
      <span class="font-display text-[14px] text-[var(--exile-color-accent-focus)]">{{ item.name ?? "(名前なし)" }}</span>
      <span class="text-[var(--exile-color-text-secondary)]">{{ item.baseJa ?? item.baseEn ?? "ベース不明" }}</span>
      <span class="px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-elevated)] text-[11px]">{{ RARITY_JA[item.rarity] }}</span>
      <span v-if="item.itemClass" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ item.itemClass }}</span>
      <span v-if="item.itemLevel" class="text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">ilvl {{ item.itemLevel }}</span>
      <span v-if="item.corrupted" class="text-[11px] text-red-300">腐敗</span>
    </div>
    <ul class="mt-2 space-y-0.5">
      <li v-for="(m, i) in item.mods" :key="i" class="flex items-center gap-2">
        <template v-if="m.identified">
          <span
            :class="[
              'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold leading-none',
              m.affix === 'prefix' ? 'bg-[#9B7BCC]/25 text-[#C7A7E5]' : m.affix === 'suffix' ? 'bg-[#B8956A]/25 text-[#D6B98A]' : 'bg-[var(--exile-color-bg-elevated)]',
            ]"
            >{{ m.affix === "prefix" ? "P" : m.affix === "suffix" ? "S" : "?" }}</span
          >
          <span>{{ m.textJa }}</span>
          <span class="text-[10px] text-[var(--exile-color-text-tertiary)]">{{ m.textEn }}</span>
        </template>
        <template v-else>
          <span class="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] bg-red-900/40 text-red-200">!</span>
          <span class="text-red-200">{{ m.raw }}</span>
          <span class="text-[10px] text-red-300/70">同定できず (相場検索から外れます)</span>
        </template>
      </li>
      <li v-if="item.mods.length === 0" class="text-[var(--exile-color-text-tertiary)] italic">explicit mod なし</li>
    </ul>
    <p v-if="item.implicits.length" class="mt-1 text-[10px] text-[var(--exile-color-text-tertiary)]">暗黙: {{ item.implicits.join(" / ") }}</p>
  </div>
</template>
