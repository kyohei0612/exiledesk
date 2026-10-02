<!--
  SkillCard.vue — スキル 1 つの火力 (ゲーム内の表記: 敵の耐性・呪い・露出なし)
  大きく DPS と比べる元との差、下に 1 発 / クリティカル / クリティカル率 / 1 秒の回数、ダメージの種類の色の帯
-->
<script setup lang="ts">
import { computed } from "vue";
import DiffBadge from "./DiffBadge.vue";
import { fmtNum, TYPE_STYLE } from "./fmt";
import { gemJa, type SkillView } from "../../services/pob-check/api";

const props = defineProps<{ skill: SkillView; before?: SkillView; share: number; count?: number }>();
const g = computed(() => props.skill.game);
const parts = computed(() => {
  const sum = g.value.parts.reduce((a, p) => a + p.hit, 0) || 1;
  return g.value.parts.map((p) => ({ ...p, pct: (p.hit / sum) * 100, ...(TYPE_STYLE[p.type] ?? { ja: p.type, color: "#999" }) }));
});
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="truncate text-[15px] font-bold text-[var(--exile-color-text-primary)]">{{ gemJa(skill.name) }}</p>
        <p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--exile-color-text-tertiary)]">
          <span class="rounded bg-white/10 px-1.5 py-px text-[var(--exile-color-text-secondary)]">Lv {{ skill.level }}</span>
          <span v-if="skill.triggered" class="rounded bg-violet-500/20 px-1.5 py-px text-violet-200" title="メタジェム (状態異常時キャストなど) から出るスキル。PoB は発動の頻度を計算しないので、自分で撃った扱いの数字">自動で発動</span>
          <span v-if="(count ?? 1) > 1" class="rounded bg-white/10 px-1.5 py-px text-[var(--exile-color-text-secondary)]" title="同じスキルが同じ数字で複数あるので 1 枚にまとめました (合計には 1 つ分だけ)">×{{ count }}</span>
          <span class="tabular-nums">全体の {{ share.toFixed(0) }}%</span>
        </p>
      </div>
      <div class="shrink-0 text-right">
        <p class="text-[22px] font-bold leading-none tabular-nums text-amber-200">{{ fmtNum(g.dps) }}</p>
        <p class="mt-1 flex items-center justify-end gap-1 text-[10px] text-[var(--exile-color-text-tertiary)]">DPS <DiffBadge :now="g.dps" :before="before?.game.dps" /></p>
      </div>
    </div>
    <!-- ダメージの種類の帯 -->
    <div class="mt-3 flex h-1.5 overflow-hidden rounded-full bg-white/5">
      <div v-for="p in parts" :key="p.type" :style="{ width: `${p.pct}%`, background: p.color }" :title="`${p.ja} ${p.pct.toFixed(0)}%`" />
    </div>
    <div class="mt-3 grid grid-cols-4 gap-2 text-center">
      <div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">1 発</p>
        <p class="text-[13px] font-semibold tabular-nums">{{ fmtNum(g.hit) }}</p>
        <DiffBadge :now="g.hit" :before="before?.game.hit" />
      </div>
      <div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">クリティカル</p>
        <p class="text-[13px] font-semibold tabular-nums">{{ fmtNum(g.crit) }}</p>
        <DiffBadge :now="g.crit" :before="before?.game.crit" />
      </div>
      <div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">クリ率</p>
        <p class="text-[13px] font-semibold tabular-nums">{{ g.critChance.toFixed(1) }}%</p>
        <DiffBadge :now="g.critChance" :before="before?.game.critChance" />
      </div>
      <div>
        <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">1 秒の回数</p>
        <p class="text-[13px] font-semibold tabular-nums">{{ g.speed.toFixed(2) }}</p>
        <DiffBadge :now="g.speed" :before="before?.game.speed" />
      </div>
    </div>
  </div>
</template>
