<!--
  BuildLoadout.vue — ビルドの中身 (スキル構成と持ち物) を「何が多いか」で見せる (2026-09-29)
  オーナー「各ビルドのスキル構成や装備構成を全部表示させて、何が多いのか知りたい。オーグメント・スキル構成・リネージュまで」
  「目が散る。見るべき大切な箇所に色を付けたい」「種類ごとに色分け。色はカテゴリーで被らんように、黄色多い」→
    - 種類ごとに 1 色 (CAT)。黄色はキーストーンだけ
    - 人数で 3 段: 定番 (7 割以上) = その色を濃く太く / よく使う (4 割以上) = 薄く / 少数派 = 灰色、最初は畳む
    - 一番上の「定番セット」は定番だけを種類をまたいで集めた物 (これだけ見ればそのビルドの形が分かる)
  選んだビルドの人だけの集計。アセンダンシー全体の使用率は自動ジェム監視へ移した。
  メインスキルとスピリットには「監視へ +」(他の画面と同じ WatchToggleButton) と「計算 ↗」(ジェムコラプトの賭けへ)。
    オーナー 2026-09-29「今まで通り監視へボタンはいる、そこだけ」「監視と計算ボタンにしようか、計算もそのままいけちゃうし」
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { AggregatedAscendancy, AugmentKind, LoadoutEntry, SkillUsage } from "../../services/craft-v2/types";
import { SLOT_TABS } from "../../views/craft-v2/helpers";
import gemsRaw from "../../i18n/gems-client.json";
import WatchToggleButton from "../WatchToggleButton.vue";
import { openGemCorrupt } from "../../state/app-nav";

/** 監視に入れられるジェム (英語名)。ユニークの付与スキルなどは出さない (SkillUsageCard と同じ) */
const WATCHABLE = new Set((gemsRaw as { en: string }[]).map((g) => g.en));

const props = defineProps<{ agg: AggregatedAscendancy }>();

type Cat = "main" | "support" | "spirit" | "lineage" | "rune" | "soulcore" | "idol" | "other" | "keystone" | "flask" | "jewel";
/** 種類ごとの色 (被らないように。黄色はキーストーンだけ) */
const CAT: Record<Cat, { label: string; core: string; common: string; dot: string; bar: string }> = {
  main: { label: "メイン", core: "bg-sky-400/25 text-sky-50 ring-sky-300/80", common: "bg-sky-500/10 text-sky-100/90 ring-sky-400/30", dot: "bg-sky-300", bar: "bg-sky-300" },
  support: { label: "サポート", core: "bg-indigo-400/25 text-indigo-50 ring-indigo-300/80", common: "bg-indigo-500/10 text-indigo-100/90 ring-indigo-400/30", dot: "bg-indigo-300", bar: "bg-indigo-300" },
  spirit: { label: "スピリット", core: "bg-violet-400/25 text-violet-50 ring-violet-300/80", common: "bg-violet-500/10 text-violet-100/90 ring-violet-400/30", dot: "bg-violet-300", bar: "bg-violet-300" },
  lineage: { label: "リネージュ", core: "bg-fuchsia-400/25 text-fuchsia-50 ring-fuchsia-300/80", common: "bg-fuchsia-500/10 text-fuchsia-100/90 ring-fuchsia-400/30", dot: "bg-fuchsia-300", bar: "bg-fuchsia-300" },
  rune: { label: "ルーン", core: "bg-cyan-400/25 text-cyan-50 ring-cyan-300/80", common: "bg-cyan-500/10 text-cyan-100/90 ring-cyan-400/30", dot: "bg-cyan-300", bar: "bg-cyan-300" },
  soulcore: { label: "ソウルコア", core: "bg-orange-400/25 text-orange-50 ring-orange-300/80", common: "bg-orange-500/10 text-orange-100/90 ring-orange-400/30", dot: "bg-orange-300", bar: "bg-orange-300" },
  idol: { label: "アイドル", core: "bg-emerald-400/25 text-emerald-50 ring-emerald-300/80", common: "bg-emerald-500/10 text-emerald-100/90 ring-emerald-400/30", dot: "bg-emerald-300", bar: "bg-emerald-300" },
  other: { label: "その他", core: "bg-stone-400/25 text-stone-50 ring-stone-300/70", common: "bg-stone-500/10 text-stone-100/90 ring-stone-400/30", dot: "bg-stone-300", bar: "bg-stone-300" },
  keystone: { label: "キーストーン", core: "bg-amber-400/25 text-amber-50 ring-amber-300/80", common: "bg-amber-500/10 text-amber-100/90 ring-amber-400/30", dot: "bg-amber-300", bar: "bg-amber-300" },
  flask: { label: "チャーム・フラスコ", core: "bg-rose-400/25 text-rose-50 ring-rose-300/80", common: "bg-rose-500/10 text-rose-100/90 ring-rose-400/30", dot: "bg-rose-300", bar: "bg-rose-300" },
  jewel: { label: "ジュエル", core: "bg-lime-400/25 text-lime-50 ring-lime-300/80", common: "bg-lime-500/10 text-lime-100/90 ring-lime-400/30", dot: "bg-lime-300", bar: "bg-lime-300" },
};
const LEGEND: Cat[] = ["main", "support", "spirit", "lineage", "rune", "soulcore", "idol", "keystone", "flask", "jewel"];
const RARE = "bg-transparent text-white/40 ring-white/10";

const n = computed(() => Math.max(1, props.agg.sampleSize));
type Tier = "core" | "common" | "rare";
/** 人数で 3 段 (定番 7 割以上 / よく使う 4 割以上 / 少数派) */
const tierOf = (count: number): Tier => (count / n.value >= 0.7 ? "core" : count / n.value >= 0.4 ? "common" : "rare");
/** 札の色 = 種類の色 × 段 (定番は太字) */
const chip = (cat: Cat, count: number): string => {
  const t = tierOf(count);
  return t === "rare" ? RARE : t === "core" ? `${CAT[cat].core} font-bold` : CAT[cat].common;
};
const showRare = ref(false);
const lineageSet = computed(() => new Set((props.agg.loadout?.lineage ?? []).map((l) => l.nameEn)));
const supportCat = (nameEn: string): Cat => (lineageSet.value.has(nameEn) ? "lineage" : "support");
const visible = <T extends { count: number }>(list: T[]): T[] => (showRare.value ? list : list.filter((x) => tierOf(x.count) !== "rare"));
const rareCount = (list: Array<{ count: number }>): number => list.filter((x) => tierOf(x.count) === "rare").length;
const top = (list: LoadoutEntry[]): LoadoutEntry[] => visible(list).slice(0, 30);

/** スキルの並び: 主力 (DPS が一番) の人数 → 使っていた人数 */
const groups = computed(() => {
  const all = [...props.agg.skills].sort((a, b) => b.mainCount - a.mainCount || b.count - a.count);
  return [
    { key: "main", cat: "main" as Cat, label: "メインスキル", list: all.filter((s) => s.mainCount > 0 && !s.spirit && !s.meta) },
    { key: "spirit", cat: "spirit" as Cat, label: "スピリット", list: all.filter((s) => s.spirit) },
    { key: "other", cat: "main" as Cat, label: "その他のスキル", list: all.filter((s) => s.mainCount === 0 && !s.spirit && !s.meta) },
  ].filter((g) => g.list.length);
});

const AUG_ORDER: AugmentKind[] = ["rune", "soulcore", "idol", "other"];
const augCat = (k: AugmentKind | undefined): Cat => (k === "rune" || k === "soulcore" || k === "idol" ? k : "other");
const blocks = computed(() => {
  const l = props.agg.loadout;
  if (!l) return [];
  return [
    { key: "lineage", cat: "lineage" as Cat, label: "リネージュサポート", list: l.lineage },
    { key: "keystones", cat: "keystone" as Cat, label: "キーストーン", list: l.keystones },
    { key: "flasks", cat: "flask" as Cat, label: "チャーム・フラスコ", list: l.flasks },
    { key: "jewels", cat: "jewel" as Cat, label: "ジュエル", list: l.jewels },
  ];
});
/** オーグメントを種類ごとに (見えている物だけ) */
const augGroups = computed(() => {
  const list = props.agg.loadout?.augments ?? [];
  return AUG_ORDER.map((k) => ({ kind: k, cat: augCat(k), list: top(list.filter((e) => (e.kind ?? "other") === k)) })).filter((g) => g.list.length);
});

/** 定番セット: 種類をまたいで定番 (7 割以上) だけ */
const core = computed(() => {
  const isCore = (x: { count: number }) => tierOf(x.count) === "core";
  const main = groups.value.find((g) => g.key === "main")?.list ?? [];
  const spirit = groups.value.find((g) => g.key === "spirit")?.list ?? [];
  const mainSkill = main[0];
  const l = props.agg.loadout;
  type Item = { name: string; nameEn: string; count: number; cat: Cat; cls?: string };
  const as = <T extends { name: string; nameEn: string; count: number }>(list: T[], cat: (x: T) => Cat): Item[] =>
    list.filter(isCore).map((x) => ({ name: x.name, nameEn: x.nameEn, count: x.count, cat: cat(x) }));
  // 装備: 部位ごとに一番多いユニーク / レアのベース (定番の物だけ)。色はゲームのレアリティの色
  const gear: Item[] = SLOT_TABS.flatMap((t) => {
    const u = props.agg.uniquesBySlot?.[t.key]?.[0];
    const b = props.agg[t.key].bases[0];
    const best = u && (!b || u.count >= b.count) ? { name: u.name, nameEn: u.nameEn, count: u.count, unique: true } : b ? { name: b.name, nameEn: b.nameEn, count: b.count, unique: false } : null;
    if (!best || !isCore(best)) return [];
    const cls = `bg-white/10 ring-white/30 ${best.unique ? "text-rarity-unique" : "text-rarity-rare"}`;
    return [{ name: `${t.label}: ${best.name}`, nameEn: best.nameEn, count: best.count, cat: "other" as Cat, cls }];
  });
  const rows: Array<{ label: string; items: Item[] }> = [
    { label: "装備", items: gear },
    { label: "メイン", items: mainSkill ? [{ name: mainSkill.name, nameEn: mainSkill.nameEn, count: mainSkill.count, cat: "main" }] : [] },
    { label: "サポート", items: mainSkill ? as(mainSkill.supports, (x) => supportCat(x.nameEn)) : [] },
    { label: "スピリット", items: as(spirit, () => "spirit") },
    { label: "オーグメント", items: l ? as(l.augments, (x) => augCat(x.kind)) : [] },
    { label: "キーストーン", items: l ? as(l.keystones, () => "keystone") : [] },
    { label: "チャーム・フラスコ", items: l ? as(l.flasks, () => "flask") : [] },
    { label: "ジュエル", items: l ? as(l.jewels, () => "jewel") : [] },
  ];
  return rows.filter((r) => r.items.length);
});
const pctW = (c: number): string => `${Math.round((c / n.value) * 100)}%`;
const skillVisible = (list: SkillUsage[]): SkillUsage[] => visible(list);
</script>

<template>
  <div class="space-y-4">
    <!-- 定番セット (これだけ見ればビルドの形が分かる) -->
    <section v-if="core.length" class="rounded-xl border border-white/20 bg-white/[0.04] p-4">
      <h2 class="mb-2 flex items-baseline gap-2 text-sm font-bold text-white">
        ★ 定番セット <span class="text-[11px] font-normal text-white/50">{{ agg.sampleSize }} 人のうち 7 割以上が使っている物</span>
      </h2>
      <div class="grid gap-x-4 gap-y-1.5 [grid-template-columns:auto_1fr]">
        <template v-for="r in core" :key="r.label">
          <span class="pt-0.5 text-[11px] font-bold tracking-wider text-white/50">{{ r.label }}</span>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="e in r.items" :key="e.nameEn" class="rounded-md px-2 py-0.5 text-[13px] font-bold ring-1" :class="e.cls ?? CAT[e.cat].core" :title="e.nameEn"
              >{{ e.name }} <span class="text-[11px] font-normal tabular-nums opacity-70">{{ e.count }}/{{ agg.sampleSize }}</span></span
            >
          </div>
        </template>
      </div>
    </section>

    <!-- 凡例 -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/55">
      <span v-for="c in LEGEND" :key="c" class="inline-flex items-center gap-1"><span class="h-2.5 w-2.5 rounded-sm" :class="CAT[c].dot" />{{ CAT[c].label }}</span>
      <span class="text-white/35">· 太字で濃い = 定番 (7 割以上)、薄い = よく使う (4 割以上)</span>
      <button type="button" class="ml-auto rounded px-2 py-0.5 ring-1 ring-white/15 hover:bg-white/10" @click="showRare = !showRare">
        {{ showRare ? "少数派を隠す" : "少数派 (4 割未満) も出す" }}
      </button>
    </div>

    <div class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
      <!-- スキル構成 -->
      <section class="rounded-xl border border-white/10 bg-black/25 p-4">
        <h2 class="mb-3 text-sm font-bold text-white/90">スキル構成</h2>
        <div v-for="g in groups" :key="g.key" class="mb-3 last:mb-0">
          <p class="mb-1 text-[11px] font-bold tracking-wider text-white/45">{{ g.label }}</p>
          <ul class="space-y-2">
            <li v-for="s in skillVisible(g.list)" :key="s.nameEn">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate" :class="tierOf(s.count) === 'core' ? 'text-[14px] font-bold text-white' : 'text-[13px] text-white/75'" :title="s.nameEn">{{ s.name }}</span>
                <span class="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10"><span class="block h-full rounded-full" :class="CAT[g.cat].bar" :style="{ width: pctW(s.count) }" /></span>
                <span class="w-12 shrink-0 text-right text-[12px] tabular-nums text-white/60">{{ s.count }}/{{ agg.sampleSize }}</span>
                <!-- 列は全部の行で空けて棒の位置を揃える (ボタンはメインとスピリットだけ) -->
                <span class="flex w-[11.5rem] shrink-0 justify-end gap-1">
                  <template v-if="g.key !== 'other' && WATCHABLE.has(s.nameEn)">
                    <button
                      type="button"
                      class="shrink-0 whitespace-nowrap rounded border border-[var(--exile-color-border-brass)] px-1 text-[10px] text-[var(--exile-color-accent-focus)] transition-colors hover:bg-[var(--exile-color-bg-elevated)]"
                      :title="`ジェムコラプトの賭けで ${s.name} を計算する`"
                      @click="openGemCorrupt(s.nameEn)"
                    >
                      計算 ↗
                    </button>
                    <WatchToggleButton :gem-en="s.nameEn" :name-ja="s.name" class="text-[10px]" />
                  </template>
                </span>
              </div>
              <div v-if="visible(s.supports).length" class="mt-1 flex flex-wrap gap-1 pl-2">
                <span
                  v-for="sp in visible(s.supports).slice(0, 12)"
                  :key="sp.nameEn"
                  class="rounded px-1.5 py-0.5 text-[11px] ring-1"
                  :class="chip(supportCat(sp.nameEn), sp.count)"
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
        <h2 class="mb-3 text-sm font-bold text-white/90">持ち物</h2>
        <div v-if="agg.loadout" class="mb-3">
          <p class="mb-1 text-[11px] font-bold tracking-wider text-white/45">オーグメント (ソケット)</p>
          <div v-for="g in augGroups" :key="g.kind" class="mb-1.5 flex items-start gap-2">
            <span class="mt-0.5 inline-flex w-20 shrink-0 items-center gap-1 text-[11px] text-white/55"><span class="h-2 w-2 rounded-full" :class="CAT[g.cat].dot" />{{ CAT[g.cat].label }}</span>
            <div class="flex flex-wrap gap-1">
              <span v-for="e in g.list" :key="e.nameEn" class="rounded px-1.5 py-0.5 text-[12px] ring-1" :class="chip(g.cat, e.count)" :title="e.nameEn"
                >{{ e.name }} <span class="tabular-nums opacity-60">{{ e.count }}/{{ agg.sampleSize }}</span></span
              >
            </div>
          </div>
          <p v-if="!augGroups.length" class="text-[11px] text-white/30">{{ agg.loadout.augments.length ? `少数派 ${agg.loadout.augments.length} 件のみ` : "なし" }}</p>
        </div>
        <div v-for="b in blocks" :key="b.key" class="mb-3 last:mb-0">
          <p class="mb-1 text-[11px] font-bold tracking-wider text-white/45">{{ b.label }}</p>
          <div v-if="top(b.list).length" class="flex flex-wrap gap-1">
            <span v-for="e in top(b.list)" :key="e.nameEn" class="rounded px-1.5 py-0.5 text-[12px] ring-1" :class="chip(b.cat, e.count)" :title="e.nameEn"
              >{{ e.name }} <span class="tabular-nums opacity-60">{{ e.count }}/{{ agg.sampleSize }}</span></span
            >
          </div>
          <p v-else class="text-[11px] text-white/30">{{ b.list.length ? `少数派 ${b.list.length} 件のみ` : "なし" }}</p>
        </div>
        <p v-if="!agg.loadout" class="text-[12px] text-white/40">持ち物の情報がありません (「更新」で取り直すと入ります)</p>
      </section>
    </div>
  </div>
</template>
