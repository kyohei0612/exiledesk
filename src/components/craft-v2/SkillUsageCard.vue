<!--
  SkillUsageCard.vue — スキル使用率 (2026-09-12、2026-09-14 に poe.ninja と同じ集計へ作り直し)
  オーナー指摘 (2026-09-14): 「上位の人の集計じゃない。poe.ninja が出しているのは登録キャラ全体のジェム使用率。忍者と同じく使用率順にそのまま」。
  → poe.ninja の search レスポンスの集計 (Main Skills / Spirit Skills / All Skills、そのクラスの全キャラ) を使用率順に出す。
     % は poe.ninja の画面と同じく 人数 ÷ そのクラスの全キャラ (2026-09-13 に Frost Bomb 20% などで一致を確認)。
  サポートの内訳だけは、装備の集計に使っている上位キャラのスキルグループから出す (poe.ninja の集計には無いため)。
-->
<script setup lang="ts">
import GemName from "../decor/GemName.vue";
import { computed, ref } from "vue";
import BaseCard from "../decor/BaseCard.vue";
import type { NinjaSkillStat, NinjaSkillStats, SkillUsage } from "../../services/craft-v2/types";
import gemsRaw from "../../i18n/gems-client.json";
import { openGemCorrupt } from "../../state/app-nav";
// 自動ジェム監視に入れる / 外す (枠が埋まっていれば入れ替えを聞く)。ジェムコラプトの賭けと共通の部品 (2026-09-26)
import WatchToggleButton from "../WatchToggleButton.vue";

/** ジェムコラプトの賭けで計算できるジェム (英語名)。ユニークの付与スキルやサポートは対象外 */
const CORRUPTIBLE = new Set((gemsRaw as { en: string }[]).map((g) => g.en));

const props = defineProps<{
  /** poe.ninja の集計 (古いキャッシュでは null) */
  ninja: NinjaSkillStats | null;
  /** 上位キャラのスキルグループ集計 (サポートの内訳用) */
  skills: SkillUsage[];
  sampleSize: number;
  ascendancyName: string;
}>();

const PAGE = 20;
const showAll = ref<Record<string, boolean>>({});
const expanded = ref<Record<string, boolean>>({});
const sampleByName = computed(() => new Map(props.skills.map((s) => [s.nameEn, s])));
const supportsOf = (nameEn: string) => sampleByName.value.get(nameEn)?.supports ?? [];

const sections = computed(() => {
  const n = props.ninja;
  if (!n) return [];
  return [
    { key: "main", label: "メインスキル", en: "Main Skills", icon: "✦", list: n.main },
    { key: "spirit", label: "スピリットスキル", en: "Spirit Skills", icon: "◈", list: n.spirit },
    { key: "all", label: "全スキル (サポート含む)", en: "All Skills", icon: "❖", list: n.all },
  ];
});
const visible = (key: string, list: NinjaSkillStat[]): NinjaSkillStat[] => (showAll.value[key] ? list : list.slice(0, PAGE));

/** poe.ninja と同じく整数 %。1% 未満は "<1%" */
function pct(p: number): string {
  const v = p * 100;
  return v >= 1 ? `${Math.round(v)}%` : v > 0 ? "<1%" : "0%";
}
const fmtCount = (n: number): string => n.toLocaleString("ja-JP");
</script>

<template>
  <div class="@container">
    <p v-if="!ninja" class="text-[12px] text-[var(--exile-color-text-tertiary)] px-1">
      poe.ninja のスキル使用率がまだありません。上の「更新」で取り直すと入ります。
    </p>
    <template v-else>
      <p class="text-[11px] text-[var(--exile-color-text-secondary)] mb-2 px-1">
        poe.ninja と同じ集計: {{ ascendancyName }} の登録キャラ全体 {{ fmtCount(ninja.total) }} 人のうち、そのジェムを使っている割合 (使用率順)
      </p>
      <div class="grid grid-cols-1 @4xl:grid-cols-2 @6xl:grid-cols-3 gap-4 items-start">
        <BaseCard v-for="sec in sections" :key="sec.key">
          <div class="p-4 pl-5">
            <div class="flex items-baseline justify-between mb-2 gap-2">
              <h2 class="font-display tracking-[0.08em] text-[var(--exile-color-accent-focus)] text-base flex items-baseline gap-2 min-w-0">
                <span aria-hidden="true">{{ sec.icon }}</span>
                <span class="shrink-0">{{ sec.label }}</span>
                <span class="text-[10px] tracking-wider text-[var(--exile-color-text-tertiary)] truncate">{{ sec.en }}</span>
              </h2>
            </div>
            <ul class="space-y-0.5">
              <li v-for="s in visible(sec.key, sec.list)" :key="s.nameEn" class="py-1 px-1 -mx-1 rounded hover:bg-[var(--exile-color-bg-elevated)]">
                <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3">
                  <div class="flex items-baseline gap-1.5 min-w-0">
                    <button
                      type="button"
                      class="min-w-0 text-left truncate text-[13px] disabled:cursor-default"
                      :title="s.nameEn"
                      :disabled="supportsOf(s.nameEn).length === 0"
                      @click="expanded[sec.key + s.nameEn] = !expanded[sec.key + s.nameEn]"
                    >
                      <GemName :en="s.nameEn" :label="s.name" />
                      <span v-if="supportsOf(s.nameEn).length > 0" class="ml-1 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ expanded[sec.key + s.nameEn] ? "▲" : "▼" }}</span>
                    </button>
                    <!-- 2026-09-14: ジェムコラプトの賭けへ (そのジェムで計算開始) -->
                    <button
                      v-if="CORRUPTIBLE.has(s.nameEn)"
                      type="button"
                      class="shrink-0 whitespace-nowrap text-[10px] px-1 rounded border border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] transition-colors"
                      :title="`ジェムコラプトの賭けで ${s.name} を計算する`"
                      @click="openGemCorrupt(s.nameEn)"
                    >
                      コラプト計算 ↗
                    </button>
                    <!-- ここからも自動ジェム監視に入れられるように (オーナー指示 2026-09-20:
                         「上位プレイヤーMOD からも監視入れれるようにしてくれ」)。
                         枠が埋まっていれば、押した時にどれと入れ替えるか聞く -->
                    <WatchToggleButton v-if="CORRUPTIBLE.has(s.nameEn)" :gem-en="s.nameEn" :name-ja="s.name" class="text-[10px]" />
                  </div>
                  <span class="tabular-nums text-[11px] text-[var(--exile-color-text-tertiary)]">{{ fmtCount(s.count) }} 人</span>
                  <span class="tabular-nums text-[13px] w-11 text-right">{{ pct(s.percentage) }}</span>
                </div>
                <div class="mt-0.5 h-1 rounded bg-[var(--exile-color-bg-elevated)] overflow-hidden">
                  <div class="h-full bg-[var(--exile-color-accent-focus)]/60" :style="{ width: `${Math.min(100, s.percentage * 100)}%` }" />
                </div>
                <div v-if="expanded[sec.key + s.nameEn]" class="ml-3 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--exile-color-text-secondary)]">
                  <span class="text-[var(--exile-color-text-tertiary)]">上位 {{ sampleSize }} 人で一緒に使っていたサポート:</span>
                  <span v-for="sp in supportsOf(s.nameEn).slice(0, 10)" :key="sp.nameEn" :title="sp.nameEn" class="tabular-nums">
                    {{ sp.name }}<span class="text-[var(--exile-color-text-tertiary)]">×{{ sp.count }}</span>
                  </span>
                </div>
              </li>
              <li v-if="sec.list.length === 0" class="text-[12px] text-[var(--exile-color-text-tertiary)] italic">該当なし</li>
            </ul>
            <button
              v-if="sec.list.length > PAGE"
              type="button"
              class="mt-2 text-[11px] text-[var(--exile-color-text-secondary)] hover:text-[var(--exile-color-accent-focus)] underline tabular-nums"
              @click="showAll[sec.key] = !showAll[sec.key]"
            >
              {{ showAll[sec.key] ? `▲ 上位 ${PAGE} 件だけ` : `▼ 残り ${sec.list.length - PAGE} 件を見る` }}
            </button>
          </div>
        </BaseCard>
      </div>

    </template>
  </div>
</template>
