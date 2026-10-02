<!--
  GemGroupCard.vue — スキルの組 1 つ。スキルジェムはレベル / 品質 / コラプト (+レベル) を変え、どのジェムも使う・外すを切り替える
  2026-10-02 見直し: サポートジェムはレベル・品質を変えない (出さない)、コラプトは「素」ではなく「コラプト +1」、組のオン・オフはスイッチ
-->
<script setup lang="ts">
import { gemJa, type GemView, type GroupView } from "../../services/pob-check/api";

/** ± のボタン */
const step = "h-5 w-5 rounded bg-white/5 text-[12px] leading-none text-[var(--exile-color-text-secondary)] hover:bg-white/15 disabled:opacity-30";
/**
 * レベルの上限: PoB のジェムの最大レベル (pck.lua の gemInfo。本家 validateGemLevel が丸める上限と同じ)。
 * コラプトの +1 はこの上とは別に乗る (PoB も「レベル」と「コラプトの +レベル」は別の欄) ので、ここでは素のレベルだけ見る
 */
const maxLevelOf = (g: GemView): number => g.maxLevel || 40;
const MAX_QUALITY = 23;

defineProps<{ group: GroupView; disabled: boolean }>();
const emit = defineEmits<{
  (e: "gem", j: number, field: "level" | "quality" | "corrupt" | "enabled", value: number | boolean): void;
  (e: "group", enabled: boolean): void;
}>();
</script>

<template>
  <div class="rounded-xl border p-3 transition-opacity" :class="group.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-black/20 opacity-55'">
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="truncate text-[13px] font-bold">
        {{ gemJa(group.gems[0]?.name ?? "") }}
        <span v-if="group.slot" class="ml-1 text-[11px] font-normal text-[var(--exile-color-text-tertiary)]">{{ group.slot }}</span>
      </p>
      <!-- 組のオン・オフ (スイッチ) -->
      <button
        type="button"
        class="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold"
        :class="group.enabled ? 'text-emerald-300' : 'text-[var(--exile-color-text-tertiary)]'"
        :disabled="disabled"
        :title="group.enabled ? 'この組を使っている (押すと使わない)' : 'この組を使っていない (押すと使う)'"
        @click="emit('group', !group.enabled)"
      >
        {{ group.enabled ? "オン" : "オフ" }}
        <span class="relative h-4 w-7 rounded-full transition-colors" :class="group.enabled ? 'bg-emerald-500/70' : 'bg-white/15'">
          <span class="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all" :class="group.enabled ? 'left-3.5' : 'left-0.5'" />
        </span>
      </button>
    </div>
    <ul class="space-y-1">
      <li v-for="gem in group.gems" :key="gem.j" class="flex h-7 items-center gap-2 rounded-lg px-2" :class="gem.enabled ? 'bg-white/[0.03]' : 'bg-transparent'">
        <!-- 使う / 外す (チェック) -->
        <button
          type="button"
          class="flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none"
          :class="gem.enabled ? (gem.support ? 'border-sky-400 bg-sky-500/60 text-white' : 'border-amber-400 bg-amber-500/70 text-black') : 'border-white/25 text-transparent'"
          :title="gem.enabled ? '使っている (押すと外す)' : '外している (押すと使う)'"
          :disabled="disabled"
          @click="emit('gem', gem.j, 'enabled', !gem.enabled)"
        >✓</button>
        <span
          class="min-w-0 flex-1 truncate text-[12px]"
          :class="[gem.support ? 'text-sky-100' : 'font-semibold text-amber-50', gem.enabled ? '' : 'text-[var(--exile-color-text-tertiary)] line-through']"
        >{{ gemJa(gem.name) }}</span>
        <template v-if="!gem.support">
          <!-- レベル -->
          <span class="flex items-center gap-0.5 text-[11px] tabular-nums">
            <button type="button" :class="step" :disabled="disabled || gem.level <= 1" @click="emit('gem', gem.j, 'level', gem.level - 1)">−</button>
            <span class="w-9 text-center">Lv{{ gem.level }}</span>
            <button type="button" :class="step" :disabled="disabled || gem.level >= maxLevelOf(gem)" :title="`最大 Lv${maxLevelOf(gem)}`" @click="emit('gem', gem.j, 'level', Math.min(maxLevelOf(gem), gem.level + 1))">+</button>
          </span>
          <!-- 品質 (0〜23%: コラプトで 23 が上限) -->
          <span class="flex items-center gap-0.5 text-[11px] tabular-nums">
            <button type="button" :class="step" :disabled="disabled || gem.quality <= 0" @click="emit('gem', gem.j, 'quality', Math.max(0, gem.quality - 1))">−</button>
            <span class="w-8 text-center">{{ gem.quality }}%</span>
            <button type="button" :class="step" :disabled="disabled || gem.quality >= MAX_QUALITY" :title="`最大 ${MAX_QUALITY}%`" @click="emit('gem', gem.j, 'quality', Math.min(MAX_QUALITY, gem.quality + 1))">+</button>
          </span>
          <!-- コラプトの +レベル -->
          <button
            type="button"
            class="w-[4.5rem] rounded px-1 py-px text-[11px] font-semibold"
            :class="gem.corrupt > 0 ? 'bg-rose-500/25 text-rose-200' : 'bg-white/5 text-[var(--exile-color-text-tertiary)] hover:bg-white/10'"
            :title="gem.corrupt > 0 ? 'コラプトで +レベル (押すと無し)' : 'コラプトの +1 レベルを試す'"
            :disabled="disabled"
            @click="emit('gem', gem.j, 'corrupt', gem.corrupt > 0 ? 0 : 1)"
          >{{ gem.corrupt > 0 ? `コラプト+${gem.corrupt}` : "コラプト" }}</button>
        </template>
        <span v-else class="text-[10px] text-[var(--exile-color-text-tertiary)]">サポート</span>
      </li>
    </ul>
  </div>
</template>
