<!--
  SkillTable.vue — スキルの火力を 1 行ずつ (2026-10-02 カードから詰めた表に。変える所までスクロールせずに済むように)
  左に DPS の割合の帯、名前と印、DPS と比べる元との差、1 発 / クリティカル / クリ率 / 1 秒の回数、ダメージの種類の色
-->
<script setup lang="ts">
import DiffBadge from "./DiffBadge.vue";
import { fmtNum, TYPE_STYLE } from "./fmt";
import { gemJa, type GroupView, type SkillView } from "../../services/pob-check/api";

defineProps<{
  rows: Array<{ g: GroupView; s: SkillView; key: string; count: number }>;
  before: Map<string, SkillView>;
  total: number;
}>();

function parts(s: SkillView): Array<{ type: string; pct: number; color: string; ja: string }> {
  const sum = s.game.parts.reduce((a, p) => a + p.hit, 0) || 1;
  return s.game.parts.map((p) => ({ type: p.type, pct: (p.hit / sum) * 100, ...(TYPE_STYLE[p.type] ?? { ja: p.type, color: "#999" }) }));
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
    <div class="grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_5.5rem_4.5rem_4.5rem] items-center gap-x-3 border-b border-white/10 px-4 py-1.5 text-[10px] text-[var(--exile-color-text-tertiary)]">
      <span>スキル</span>
      <span class="text-right">DPS</span>
      <span class="text-right">1 発</span>
      <span class="text-right">クリティカル</span>
      <span class="text-right">クリ率</span>
      <span class="text-right">1 秒の回数</span>
    </div>
    <div
      v-for="x in rows"
      :key="x.key"
      class="relative grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem_5.5rem_4.5rem_4.5rem] items-center gap-x-3 border-b border-white/5 px-4 py-2 last:border-b-0 hover:bg-white/[0.03]"
    >
      <!-- 全体に占める割合の帯 (後ろ) -->
      <div class="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400/[0.10] to-transparent" :style="{ width: `${total > 0 ? (x.s.game.dps / total) * 100 : 0}%` }" />
      <div class="relative min-w-0">
        <p class="flex items-center gap-1.5 truncate text-[13px] font-bold">
          {{ gemJa(x.s.name) }}
          <span class="rounded bg-white/10 px-1 text-[10px] font-semibold text-[var(--exile-color-text-secondary)]">Lv{{ x.s.level }}</span>
          <span v-if="x.count > 1" class="rounded bg-white/10 px-1 text-[10px] font-semibold text-[var(--exile-color-text-secondary)]" title="同じスキルが同じ数字で複数あるので 1 行にまとめました (合計には 1 つ分だけ)">×{{ x.count }}</span>
          <span
            v-if="x.s.triggered"
            class="rounded bg-violet-500/20 px-1 text-[10px] font-semibold text-violet-200"
            title="メタジェム (状態異常時キャストなど) から出るスキル。PoB は発動の頻度を計算しないので、自分で撃った扱いの数字"
          >自動</span>
        </p>
        <div class="mt-1 flex items-center gap-2">
          <div class="flex h-1 w-24 overflow-hidden rounded-full bg-white/5">
            <div v-for="p in parts(x.s)" :key="p.type" :style="{ width: `${p.pct}%`, background: p.color }" :title="`${p.ja} ${p.pct.toFixed(0)}%`" />
          </div>
          <span class="text-[10px] tabular-nums text-[var(--exile-color-text-tertiary)]">全体の {{ total > 0 ? ((x.s.game.dps / total) * 100).toFixed(0) : 0 }}%</span>
        </div>
      </div>
      <div class="relative text-right">
        <p class="text-[17px] font-black leading-tight tabular-nums text-amber-200">{{ fmtNum(x.s.game.dps) }}</p>
        <DiffBadge :now="x.s.game.dps" :before="before.get(x.key)?.game.dps" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ fmtNum(x.s.game.hit) }}</p>
        <DiffBadge :now="x.s.game.hit" :before="before.get(x.key)?.game.hit" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ fmtNum(x.s.game.crit) }}</p>
        <DiffBadge :now="x.s.game.crit" :before="before.get(x.key)?.game.crit" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ x.s.game.critChance.toFixed(1) }}%</p>
        <DiffBadge :now="x.s.game.critChance" :before="before.get(x.key)?.game.critChance" />
      </div>
      <div class="relative text-right">
        <p class="text-[13px] tabular-nums">{{ x.s.game.speed.toFixed(2) }}</p>
        <DiffBadge :now="x.s.game.speed" :before="before.get(x.key)?.game.speed" />
      </div>
    </div>
  </div>
</template>
