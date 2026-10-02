<!--
  GemGroupCard.vue — スキルの組 1 つ。ジェムごとにレベル / 品質 / コラプト (+レベル) を ± で変え、オン・オフを切り替える
-->
<script setup lang="ts">
import { gemJa, type GroupView } from "../../services/pob-check/api";

/** ± のボタン */
const step = "h-5 w-5 rounded bg-white/5 text-[12px] leading-none text-[var(--exile-color-text-secondary)] hover:bg-white/15 disabled:opacity-30";

defineProps<{ group: GroupView; disabled: boolean }>();
const emit = defineEmits<{
  (e: "gem", j: number, field: "level" | "quality" | "corrupt" | "enabled", value: number | boolean): void;
  (e: "group", enabled: boolean): void;
}>();
</script>

<template>
  <div class="rounded-xl border p-3" :class="group.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-black/20 opacity-60'">
    <div class="mb-2 flex items-center justify-between gap-2">
      <p class="truncate text-[13px] font-semibold">
        {{ gemJa(group.gems[0]?.name ?? "") }}
        <span v-if="group.slot" class="ml-1 text-[11px] font-normal text-[var(--exile-color-text-tertiary)]">{{ group.slot }}</span>
      </p>
      <button
        type="button"
        class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
        :class="group.enabled ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-[var(--exile-color-text-tertiary)]'"
        :disabled="disabled"
        @click="emit('group', !group.enabled)"
      >{{ group.enabled ? "使う" : "使わない" }}</button>
    </div>
    <ul class="space-y-1">
      <li v-for="gem in group.gems" :key="gem.j" class="flex items-center gap-2 rounded-lg px-2 py-1" :class="gem.enabled ? 'bg-white/[0.03]' : 'opacity-50'">
        <button
          type="button"
          class="h-3.5 w-3.5 shrink-0 rounded-full border"
          :class="gem.enabled ? (gem.support ? 'border-sky-300 bg-sky-400/70' : 'border-amber-300 bg-amber-400/80') : 'border-white/30'"
          :title="gem.enabled ? '使っている (押すと外す)' : '外している (押すと使う)'"
          :disabled="disabled"
          @click="emit('gem', gem.j, 'enabled', !gem.enabled)"
        />
        <span class="min-w-0 flex-1 truncate text-[12px]" :class="gem.support ? 'text-sky-100' : 'text-amber-50'">{{ gemJa(gem.name) }}</span>
        <!-- レベル -->
        <span class="flex items-center gap-0.5 text-[11px] tabular-nums">
          <button type="button" :class="step" :disabled="disabled || gem.level <= 1" @click="emit('gem', gem.j, 'level', gem.level - 1)">−</button>
          <span class="w-9 text-center">Lv{{ gem.level }}</span>
          <button type="button" :class="step" :disabled="disabled" @click="emit('gem', gem.j, 'level', gem.level + 1)">+</button>
        </span>
        <!-- 品質 -->
        <span class="flex items-center gap-0.5 text-[11px] tabular-nums">
          <button type="button" :class="step" :disabled="disabled || gem.quality <= 0" @click="emit('gem', gem.j, 'quality', Math.max(0, gem.quality - 1))">−</button>
          <span class="w-8 text-center">{{ gem.quality }}%</span>
          <button type="button" :class="step" :disabled="disabled" @click="emit('gem', gem.j, 'quality', gem.quality + 1)">+</button>
        </span>
        <!-- コラプトの +レベル -->
        <button
          type="button"
          class="w-11 rounded px-1 py-px text-[11px] font-semibold"
          :class="gem.corrupt > 0 ? 'bg-rose-500/25 text-rose-200' : 'bg-white/5 text-[var(--exile-color-text-tertiary)]'"
          title="コラプトの +レベル (押すと 0 ↔ +1)"
          :disabled="disabled"
          @click="emit('gem', gem.j, 'corrupt', gem.corrupt > 0 ? 0 : 1)"
        >{{ gem.corrupt > 0 ? `+${gem.corrupt}` : "素" }}</button>
      </li>
    </ul>
  </div>
</template>

