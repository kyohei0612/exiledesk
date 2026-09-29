<!--
  BuildLoadout.vue — ビルドの中身 (スキル構成と持ち物) を「何が多いか」で見せる (2026-09-29)
  オーナー「各ビルドのスキル構成や装備構成を全部表示させて、何が多いのか知りたい。オーグメント・スキル構成・リネージュまで」
  「目が散る。見るべき大切な箇所に色を付けたい」→ 人数で 3 段に分ける:
    定番 (7 割以上) = 金色で太く / よく使う (4 割以上) = ふつう / 少数派 = 薄く、最初は畳む。
  一番上の「定番セット」は定番だけを種類をまたいで集めた物 (これだけ見ればそのビルドの形が分かる)。
  選んだビルド (か 3 ビルドの合計) の人だけの集計。アセンダンシー全体の使用率は自動ジェム監視へ移した。
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { AggregatedAscendancy, LoadoutEntry, SkillUsage } from "../../services/craft-v2/types";

const props = defineProps<{ agg: AggregatedAscendancy }>();

const n = computed(() => Math.max(1, props.agg.sampleSize));
type Tier = "core" | "common" | "rare";
/** 人数で 3 段 (定番 7 割以上 / よく使う 4 割以上 / 少数派) */
const tierOf = (count: number): Tier => (count / n.value >= 0.7 ? "core" : count / n.value >= 0.4 ? "common" : "rare");
const CHIP: Record<Tier, string> = {
  core: "bg-amber-400/20 text-amber-100 ring-amber-300/70 font-bold",
  common: "bg-white/[0.06] text-white/85 ring-white/15",
  rare: "bg-transparent text-white/40 ring-white/10",
};
const showRare = ref(false);
const lineageSet = computed(() => new Set((props.agg.loadout?.lineage ?? []).map((l) => l.nameEn)));
const visible = <T extends { count: number }>(list: T[]): T[] => (showRare.value ? list : list.filter((x) => tierOf(x.count) !== "rare"));
const rareCount = (list: Array<{ count: number }>): number => list.filter((x) => tierOf(x.count) === "rare").length;

/** スキルの並び: 主力 (DPS が一番) の人数 → 使っていた人数 */
const groups = computed(() => {
  const all = [...props.agg.skills].sort((a, b) => b.mainCount - a.mainCount || b.count - a.count);
  return [
    { key: "main", label: "メインスキル", list: all.filter((s) => s.mainCount > 0 && !s.spirit && !s.meta) },
    { key: "spirit", label: "スピリット", list: all.filter((s) => s.spirit) },
    { key: "other", label: "その他のスキル", list: all.filter((s) => s.mainCount === 0 && !s.spirit && !s.meta) },
  ].filter((g) => g.list.length);
});

const blocks = computed(() => {
  const l = props.agg.loadout;
  if (!l) return [];
  return [
    { key: "lineage", label: "リネージュサポート", list: l.lineage },
    { key: "augments", label: "オーグメント (ソケット)", list: l.augments },
    { key: "keystones", label: "キーストーン", list: l.keystones },
    { key: "flasks", label: "チャーム・フラスコ", list: l.flasks },
    { key: "jewels", label: "ジュエル", list: l.jewels },
  ];
});

/** 定番セット: 種類をまたいで定番 (7 割以上) だけ */
const core = computed(() => {
  const pick = (list: Array<{ name: string; nameEn: string; count: number }>) => list.filter((x) => tierOf(x.count) === "core");
  const main = groups.value.find((g) => g.key === "main")?.list ?? [];
  const spirit = groups.value.find((g) => g.key === "spirit")?.list ?? [];
  const mainSkill = main[0];
  const rows = [
    { label: "メイン", items: mainSkill ? [{ name: mainSkill.name, nameEn: mainSkill.nameEn, count: mainSkill.count }] : [] },
    { label: "サポート", items: mainSkill ? pick(mainSkill.supports) : [] },
    { label: "スピリット", items: pick(spirit) },
    ...blocks.value.map((b) => ({ label: b.label.replace(/ \(.*\)$/, ""), items: pick(b.list) })),
  ];
  return rows.filter((r) => r.items.length);
});
const pctW = (c: number): string => `${Math.round((c / n.value) * 100)}%`;
const skillVisible = (list: SkillUsage[]): SkillUsage[] => visible(list);
const top = (list: LoadoutEntry[]): LoadoutEntry[] => visible(list).slice(0, 30);
</script>

<template>
  <div class="space-y-4">
    <!-- 定番セット (これだけ見ればビルドの形が分かる) -->
    <section v-if="core.length" class="rounded-xl border border-amber-300/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent p-4">
      <h2 class="mb-2 flex items-baseline gap-2 text-sm font-bold text-amber-100">
        ★ 定番セット <span class="text-[11px] font-normal text-amber-100/60">{{ agg.sampleSize }} 人のうち 7 割以上が使っている物</span>
      </h2>
      <div class="grid gap-x-4 gap-y-1.5 [grid-template-columns:auto_1fr]">
        <template v-for="r in core" :key="r.label">
          <span class="pt-0.5 text-[11px] font-bold tracking-wider text-amber-100/60">{{ r.label }}</span>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="e in r.items"
              :key="e.nameEn"
              class="rounded-md px-2 py-0.5 text-[13px] font-bold ring-1"
              :class="lineageSet.has(e.nameEn) ? 'bg-fuchsia-500/20 text-fuchsia-100 ring-fuchsia-300/60' : CHIP.core"
              :title="e.nameEn"
              >{{ e.name }} <span class="text-[11px] font-normal tabular-nums opacity-70">{{ e.count }}/{{ agg.sampleSize }}</span></span
            >
          </div>
        </template>
      </div>
    </section>

    <div class="flex items-center gap-3 text-[11px] text-white/50">
      <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-amber-400/60" />定番 (7 割以上)</span>
      <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-white/30" />よく使う (4 割以上)</span>
      <span class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm bg-fuchsia-400/60" />リネージュ</span>
      <button type="button" class="ml-auto rounded px-2 py-0.5 ring-1 ring-white/15 hover:bg-white/10" @click="showRare = !showRare">
        {{ showRare ? "少数派を隠す" : "少数派 (4 割未満) も出す" }}
      </button>
    </div>

    <div class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
      <!-- スキル構成 -->
      <section class="rounded-xl border border-white/10 bg-black/25 p-4">
        <h2 class="mb-3 text-sm font-bold text-amber-100">スキル構成</h2>
        <div v-for="g in groups" :key="g.key" class="mb-3 last:mb-0">
          <p class="mb-1 text-[11px] font-bold tracking-wider text-white/45">{{ g.label }}</p>
          <ul class="space-y-2">
            <li v-for="s in skillVisible(g.list)" :key="s.nameEn">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate" :class="tierOf(s.count) === 'core' ? 'text-[14px] font-bold text-sky-100' : 'text-[13px] text-sky-100/80'" :title="s.nameEn">{{ s.name }}</span>
                <span class="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10"
                  ><span class="block h-full rounded-full" :class="tierOf(s.count) === 'core' ? 'bg-amber-300' : 'bg-sky-400/60'" :style="{ width: pctW(s.count) }"
                /></span>
                <span class="w-12 shrink-0 text-right text-[12px] tabular-nums text-white/60">{{ s.count }}/{{ agg.sampleSize }}</span>
              </div>
              <div v-if="visible(s.supports).length" class="mt-1 flex flex-wrap gap-1 pl-2">
                <span
                  v-for="sp in visible(s.supports).slice(0, 12)"
                  :key="sp.nameEn"
                  class="rounded px-1.5 py-0.5 text-[11px] ring-1"
                  :class="lineageSet.has(sp.nameEn) ? 'bg-fuchsia-500/15 text-fuchsia-200 ring-fuchsia-400/40' : CHIP[tierOf(sp.count)]"
                  :title="sp.nameEn + (lineageSet.has(sp.nameEn) ? ' (リネージュ)' : '')"
                  >{{ sp.name }} <span class="tabular-nums opacity-60">{{ sp.count }}</span></span
                >
              </div>
            </li>
          </ul>
          <p v-if="!showRare && rareCount(g.list)" class="mt-1 text-[11px] text-white/30">少数派 {{ rareCount(g.list) }} 件は隠しています</p>
        </div>
        <p v-if="!groups.length" class="text-[12px] text-white/40">スキルの情報がありません (「更新」で取り直すと入ります)</p>
      </section>

      <!-- 持ち物 -->
      <section class="rounded-xl border border-white/10 bg-black/25 p-4">
        <h2 class="mb-3 text-sm font-bold text-amber-100">持ち物</h2>
        <div v-for="b in blocks" :key="b.key" class="mb-3 last:mb-0">
          <p class="mb-1 text-[11px] font-bold tracking-wider text-white/45">{{ b.label }}</p>
          <div v-if="top(b.list).length" class="flex flex-wrap gap-1">
            <span
              v-for="e in top(b.list)"
              :key="e.nameEn"
              class="rounded px-1.5 py-0.5 text-[12px] ring-1"
              :class="b.key === 'lineage' && tierOf(e.count) !== 'rare' ? 'bg-fuchsia-500/15 text-fuchsia-100 ring-fuchsia-400/50' : CHIP[tierOf(e.count)]"
              :title="e.nameEn"
              >{{ e.name }} <span class="tabular-nums opacity-60">{{ e.count }}/{{ agg.sampleSize }}</span></span
            >
          </div>
          <p v-else class="text-[11px] text-white/30">{{ b.list.length ? `少数派 ${b.list.length} 件のみ` : "なし" }}</p>
        </div>
        <p v-if="!blocks.length" class="text-[12px] text-white/40">持ち物の情報がありません (「更新」で取り直すと入ります)</p>
      </section>
    </div>
  </div>
</template>
