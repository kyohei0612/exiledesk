<!--
  SkillCompareTable.vue — スキルごとの比較 (2026-10-03 オーナー「各スキルごとの比較が現状できてない」)

  自分と相手のスキルの表を名前で突き合わせて 1 つの表に (決まりは services/pob-check/build-diff.ts の pairSkills):
  スキル (アイコン + 名前) / 自分の DPS / 相手の DPS / 差 / 1 発 / クリ率 / 1 秒の回数 (後ろ 3 つは 自分 → 相手)。
  片方にしか無いスキルは「—」。行を押すと上のバーのスキルをそれに (自分にある物だけ。SkillTable と同じ @focus)。
  見た目は SkillTable.vue と揃える (同じ字の大きさ・帯・色)
-->
<script setup lang="ts">
import { computed } from "vue";
import DiffBadge from "./DiffBadge.vue";
import { fmtNum } from "./fmt";
import { gemJa, type GameNumbers } from "../../services/pob-check/api";
import type { SkillPair } from "../../services/pob-check/build-diff";
import GemName from "../../components/decor/GemName.vue";
import GemIcon from "../../components/decor/GemIcon.vue";

/** pending = 試算がまだのスキル (「試算中」と出して押せない) */
const props = defineProps<{ rows: SkillPair[]; focusKey: string | null; pending?: Set<string> }>();
const isPending = (r: SkillPair): boolean => !!r.mine && !!props.pending?.has(r.mine.key);
const emit = defineEmits<{ (e: "focus", key: string): void }>();
const maxDps = computed(() => Math.max(1, ...props.rows.flatMap((r) => [r.mine?.s.game.dps ?? 0, r.target?.game.dps ?? 0])));

/** 自分 → 相手 の小さな文 (無い側は —) */
const pair = (a: GameNumbers | undefined, b: GameNumbers | undefined, f: (g: GameNumbers) => string): string => `${a ? f(a) : "—"} → ${b ? f(b) : "—"}`;
const oneHit = (g: GameNumbers): string => (g.hit > 0 ? fmtNum(g.hit) : "—");
const critPct = (g: GameNumbers): string => (g.hit > 0 ? `${g.critChance.toFixed(1)}%` : "—");
const speed = (g: GameNumbers): string => g.speed.toFixed(2);
/** 相手の方が大きい / 小さい で色 */
const cmpCls = (a: number | undefined, b: number | undefined): string => (a == null || b == null || Math.abs(a - b) < 1e-9 ? "" : b > a ? "text-emerald-200" : "text-rose-200/80");
</script>

<template>
  <div class="card overflow-hidden">
    <div class="grid grid-cols-[minmax(0,1fr)_6rem_6rem_5rem_7rem_6.5rem_6rem] items-center gap-x-3 border-b border-white/10 px-4 py-1.5 text-[10px] text-[var(--exile-color-text-tertiary)]">
      <span>スキル</span>
      <span class="text-right">自分の DPS</span>
      <span class="text-right text-sky-300/80">相手の DPS</span>
      <span class="text-right">差</span>
      <span class="text-right">ヒットダメージ</span>
      <span class="text-right">クリティカルヒット率</span>
      <span class="text-right">1 秒あたりの回数</span>
    </div>
    <div
      v-for="r in rows"
      :key="r.mine?.key ?? `t|${r.name}`"
      class="relative grid grid-cols-[minmax(0,1fr)_6rem_6rem_5rem_7rem_6.5rem_6rem] items-center gap-x-3 border-b border-white/5 px-4 py-1.5 last:border-b-0"
      :class="[isPending(r) ? 'cursor-wait opacity-60' : r.mine ? 'cursor-pointer hover:bg-white/[0.03]' : 'opacity-80', r.mine && r.mine.key === focusKey ? 'bg-amber-400/[0.06]' : '']"
      :title="isPending(r) ? '試算中 (済んだら押せます)' : r.mine ? '押すとこのスキルで 火力の差 / 内訳 を出す' : '相手にだけあるスキル'"
      @click="r.mine && !isPending(r) && emit('focus', r.mine.key)"
    >
      <!-- 自分 (暖色) と 相手 (空色) の帯を重ねる -->
      <div class="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-amber-400/[0.10] to-transparent" :style="{ width: `${((r.mine?.s.game.dps ?? 0) / maxDps) * 100}%` }" />
      <div class="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-sky-400/40" :style="{ width: `${((r.target?.game.dps ?? 0) / maxDps) * 100}%` }" />
      <p class="relative flex min-w-0 items-center gap-1.5 truncate text-[12px] font-bold">
        <GemIcon :en="r.name" :size="20" />
        <GemName :en="r.name" :label="gemJa(r.name)" class="truncate" />
        <span v-if="r.mine" class="rounded bg-white/10 px-1 text-[10px] font-semibold text-[var(--exile-color-text-secondary)]">Lv{{ r.mine.s.level }}</span>
        <span v-if="r.target && r.target.level !== r.mine?.s.level" class="rounded bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-200" title="相手のレベル">Lv{{ r.target.level }}</span>
        <span v-if="!r.mine" class="rounded bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-200">相手だけ</span>
        <span v-else-if="!r.target" class="rounded bg-white/10 px-1 text-[10px] font-semibold text-[var(--exile-color-text-tertiary)]">自分だけ</span>
        <span v-if="isPending(r)" class="flex items-center gap-1 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-200"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" />試算中</span>
      </p>
      <p class="relative text-right text-[15px] font-black tabular-nums text-amber-200">{{ r.mine ? fmtNum(r.mine.s.game.dps) : "—" }}</p>
      <p class="relative text-right text-[15px] font-black tabular-nums text-sky-200">{{ r.target ? fmtNum(r.target.game.dps) : "—" }}</p>
      <p class="relative text-right">
        <DiffBadge v-if="r.mine && r.target" :now="r.target.game.dps" :before="r.mine.s.game.dps" />
        <span v-else class="text-[11px] text-[var(--exile-color-text-tertiary)]">—</span>
      </p>
      <p class="relative text-right text-[11px] tabular-nums" :class="cmpCls(r.mine?.s.game.hit, r.target?.game.hit)">{{ pair(r.mine?.s.game, r.target?.game, oneHit) }}</p>
      <p class="relative text-right text-[11px] tabular-nums" :class="cmpCls(r.mine?.s.game.critChance, r.target?.game.critChance)">{{ pair(r.mine?.s.game, r.target?.game, critPct) }}</p>
      <p class="relative text-right text-[11px] tabular-nums" :class="cmpCls(r.mine?.s.game.speed, r.target?.game.speed)">{{ pair(r.mine?.s.game, r.target?.game, speed) }}</p>
    </div>
  </div>
</template>
