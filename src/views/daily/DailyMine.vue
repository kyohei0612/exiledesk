<!--
  DailyMine.vue — 自分の結果の置き場 (デイリーのモック、2026-10-22)。
  平均の費用・完成率 (90% で解決)・試した日・フラクチャーした MOD。未挑戦はその一言だけ
-->
<script setup lang="ts">
import { computed } from "vue";
import { tr } from "../../i18n/lang";
import { fillMod, SOLVE_RATE, type DailyTopic } from "./daily-mock";

const props = defineProps<{ topic: DailyTopic; compact?: boolean }>();
const r = computed(() => props.topic.mine);
const solved = computed(() => !!r.value && r.value.rate >= SOLVE_RATE);
const frac = computed(() => {
  const i = r.value?.fractured;
  const x = i == null ? null : props.topic.mods[i];
  return x ? fillMod(tr(x.ja, x.en), x.range) : null;
});
</script>

<template>
  <div data-daily-mine class="min-w-0 rounded-md bg-black/30 px-3 py-2" :class="compact ? 'text-[12px]' : 'text-[13px]'">
    <p class="mb-1 text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("自分の結果", "Your result") }}</p>
    <p v-if="!r" class="opacity-60">{{ tr("まだ挑戦していません", "Not tried yet") }}</p>
    <template v-else>
      <p class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span><b class="text-[18px] tabular-nums text-[var(--exile-color-text-primary)]">{{ r.avg.toFixed(1) }}</b> <span class="opacity-70">{{ tr("神 (平均)", "div (avg)") }}</span></span>
        <span class="tabular-nums" :class="solved ? 'text-emerald-300' : 'text-amber-300'">{{ tr(`完成率 ${Math.round(r.rate * 100)}%`, `${Math.round(r.rate * 100)}% complete`) }}</span>
        <span class="rounded-sm px-1.5 text-[11px] font-bold" :class="solved ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/15 text-amber-200'">{{ solved ? tr("解決", "Solved") : tr(`あと ${Math.round((SOLVE_RATE - r.rate) * 100)}% で解決`, `${Math.round((SOLVE_RATE - r.rate) * 100)}% to solve`) }}</span>
      </p>
      <p v-if="!compact" class="mt-1 min-w-0 truncate text-[11px] opacity-60">{{ tr(`${r.at} · フラクチャー: ${frac ?? "無し"}`, `${r.at} · Fractured: ${frac ?? "none"}`) }}</p>
    </template>
  </div>
</template>
