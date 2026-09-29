<!--
  BuildLoadout.vue — ビルドの中身 (スキル構成と持ち物) を「何が多いか」で見せる (2026-09-29)
  オーナー「各ビルドのスキル構成や装備構成を全部表示させて、何が多いのか知りたい。オーグメント・スキル構成・リネージュまで」。
  選んだビルド (か 3 ビルドの合計) の人だけの集計。スキルはメイン (DPS が一番のグループ) → スピリット → その他の順、
  各スキルに一緒に付けていたサポートを人数順 (リネージュは色を変える)。アセンダンシー全体の使用率は自動ジェム監視へ移した。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { AggregatedAscendancy, LoadoutEntry, SkillUsage } from "../../services/craft-v2/types";

const props = defineProps<{ agg: AggregatedAscendancy }>();

const n = computed(() => Math.max(1, props.agg.sampleSize));
const lineageSet = computed(() => new Set((props.agg.loadout?.lineage ?? []).map((l) => l.nameEn)));
/** スキルの並び: 主力 (DPS が一番) の人数 → 使っていた人数 */
const groups = computed(() => {
  const all = [...props.agg.skills].sort((a, b) => b.mainCount - a.mainCount || b.count - a.count);
  return [
    { key: "main", label: "メインスキル", list: all.filter((s) => s.mainCount > 0 && !s.spirit && !s.meta) },
    { key: "spirit", label: "スピリット", list: all.filter((s) => s.spirit) },
    { key: "other", label: "その他のスキル", list: all.filter((s) => s.mainCount === 0 && !s.spirit && !s.meta) },
  ].filter((g) => g.list.length);
});
const shownOther = ref(false);
const OTHER_LIMIT = 8;
const listOf = (g: { key: string; list: SkillUsage[] }): SkillUsage[] => (g.key === "other" && !shownOther.value ? g.list.slice(0, OTHER_LIMIT) : g.list);

const blocks = computed(() => {
  const l = props.agg.loadout;
  if (!l) return [];
  return [
    { key: "lineage", label: "リネージュサポート", tone: "text-fuchsia-200 bg-fuchsia-500/15 ring-fuchsia-400/40", list: l.lineage },
    { key: "augments", label: "オーグメント (ソケット)", tone: "text-sky-100 bg-sky-500/10 ring-sky-400/30", list: l.augments },
    { key: "keystones", label: "キーストーン", tone: "text-amber-100 bg-amber-500/10 ring-amber-400/30", list: l.keystones },
    { key: "flasks", label: "チャーム・フラスコ", tone: "text-emerald-100 bg-emerald-500/10 ring-emerald-400/30", list: l.flasks },
    { key: "jewels", label: "ジュエル", tone: "text-violet-100 bg-violet-500/10 ring-violet-400/30", list: l.jewels },
  ];
});
const pctW = (c: number): string => `${Math.round((c / n.value) * 100)}%`;
const top = (list: LoadoutEntry[]): LoadoutEntry[] => list.slice(0, 24);
</script>

<template>
  <div class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
    <!-- スキル構成 -->
    <section class="rounded-xl border border-white/10 bg-black/25 p-4">
      <h2 class="mb-3 flex items-baseline gap-2 text-sm font-bold text-amber-100">
        スキル構成 <span class="text-[11px] font-normal text-white/45">{{ agg.sampleSize }} 人のうち何人が使っていたか・一緒に付けていたサポート</span>
      </h2>
      <div v-for="g in groups" :key="g.key" class="mb-3 last:mb-0">
        <p class="mb-1 text-[11px] font-bold tracking-wider text-white/50">{{ g.label }}</p>
        <ul class="space-y-2">
          <li v-for="s in listOf(g)" :key="s.nameEn">
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-[13px] text-sky-100" :title="s.nameEn">{{ s.name }}</span>
              <span class="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full bg-sky-400/70" :style="{ width: pctW(s.count) }" /></span>
              <span class="w-14 shrink-0 text-right text-[12px] tabular-nums text-white/70">{{ s.count }}/{{ agg.sampleSize }}</span>
            </div>
            <div v-if="s.supports.length" class="mt-1 flex flex-wrap gap-1 pl-2">
              <span
                v-for="sp in s.supports.slice(0, 10)"
                :key="sp.nameEn"
                class="rounded px-1.5 py-0.5 text-[11px] ring-1"
                :class="lineageSet.has(sp.nameEn) ? 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40' : 'bg-white/5 text-white/70 ring-white/10'"
                :title="sp.nameEn + (lineageSet.has(sp.nameEn) ? ' (リネージュ)' : '')"
                >{{ sp.name }} <span class="tabular-nums text-white/40">{{ sp.count }}</span></span
              >
            </div>
          </li>
        </ul>
        <button
          v-if="g.key === 'other' && g.list.length > OTHER_LIMIT"
          type="button"
          class="mt-1 text-[11px] text-white/45 underline hover:text-white/80"
          @click="shownOther = !shownOther"
        >
          {{ shownOther ? "少なくする" : `ほか ${g.list.length - OTHER_LIMIT} 件` }}
        </button>
      </div>
      <p v-if="!groups.length" class="text-[12px] text-white/40">スキルの情報がありません (「更新」で取り直すと入ります)</p>
    </section>

    <!-- 持ち物 -->
    <section class="rounded-xl border border-white/10 bg-black/25 p-4">
      <h2 class="mb-3 flex items-baseline gap-2 text-sm font-bold text-amber-100">
        持ち物 <span class="text-[11px] font-normal text-white/45">使っていた人数の多い順</span>
      </h2>
      <div v-for="b in blocks" :key="b.key" class="mb-3 last:mb-0">
        <p class="mb-1 text-[11px] font-bold tracking-wider text-white/50">{{ b.label }}</p>
        <div v-if="b.list.length" class="flex flex-wrap gap-1">
          <span v-for="e in top(b.list)" :key="e.nameEn" class="rounded px-1.5 py-0.5 text-[12px] ring-1" :class="b.tone" :title="e.nameEn">
            {{ e.name }} <span class="tabular-nums opacity-60">{{ e.count }}/{{ agg.sampleSize }}</span>
          </span>
        </div>
        <p v-else class="text-[11px] text-white/35">なし</p>
      </div>
      <p v-if="!blocks.length" class="text-[12px] text-white/40">持ち物の情報がありません (「更新」で取り直すと入ります)</p>
    </section>
  </div>
</template>
