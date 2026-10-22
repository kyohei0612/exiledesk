<!--
  DailyModList.vue — お題の狙いの MOD の一覧 (デイリーのモック、2026-10-22)。
  プレ / サフィの札・文・段の下限 (お題ごとに緩めた物)・創生の樹の印。pick を渡すとフラクチャー選びの行になる
-->
<script setup lang="ts">
import { tr } from "../../i18n/lang";
import { fillMod, type DailyMod } from "./daily-mock";

defineProps<{
  mods: DailyMod[];
  /** フラクチャー選び: 選んでいる行の番号 (null = 無し、undefined = まだ選んでいない) */
  pick?: number | null;
  pickable?: boolean;
  compact?: boolean;
}>();
const emit = defineEmits<{ (e: "pick", i: number): void }>();
</script>

<template>
  <ul class="grid gap-1" :class="compact ? 'text-[12px]' : 'text-[13px]'">
    <li v-for="(x, i) in mods" :key="i" :data-daily-mod="i">
      <component
        :is="pickable ? 'button' : 'div'"
        :type="pickable ? 'button' : undefined"
        class="flex w-full min-w-0 items-center gap-2 rounded-md px-2 text-left"
        :class="[
          compact ? 'py-0.5' : 'py-1.5 max-md:py-2',
          i % 2 ? '' : 'bg-white/[0.03]',
          pickable ? 'border hover:bg-white/[0.06]' : '',
          pickable && pick === i ? 'border-amber-400/70 bg-amber-500/15' : pickable ? 'border-transparent' : '',
        ]"
        :aria-pressed="pickable ? pick === i : undefined"
        @click="pickable && emit('pick', i)"
      >
        <span class="w-9 shrink-0 rounded-sm text-center text-[11px] font-bold" :class="x.side === 'prefix' ? 'bg-sky-500/15 text-sky-200' : 'bg-violet-500/15 text-violet-200'">{{ x.side === "prefix" ? tr("プレ", "Pre") : tr("サフィ", "Suf") }}</span>
        <span class="min-w-0 flex-1 break-words text-[var(--exile-color-text-primary)]" :class="pickable && pick === i ? 'text-amber-100' : ''">{{ fillMod(tr(x.ja, x.en), x.range) }}</span>
        <span v-if="x.genesis" class="shrink-0 rounded-sm bg-emerald-500/15 px-1.5 text-[11px] text-emerald-200">{{ tr("創生の樹", "Genesis Tree") }}</span>
        <span class="shrink-0 tabular-nums text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr(`T${x.minTier} 以上`, `T${x.minTier}+`) }}</span>
        <span v-if="pickable && pick === i" class="shrink-0 rounded-sm bg-amber-500/25 px-1.5 text-[11px] font-bold text-amber-100">{{ tr("フラクチャー", "Fractured") }}</span>
      </component>
    </li>
  </ul>
</template>
