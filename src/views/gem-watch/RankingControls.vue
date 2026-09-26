<!--
  RankingControls.vue — 使用率ランキングの操作 (アセンダンシーの選択 / 取得 / 上位を自動で入れる設定)
  GemWatch.vue から切り出し (2026-09-26)。見た目・文言・動きは変えていない。
  使用率ランキング (GemBreak.vue) の #controls に差し込む。ランキングの状態は親から受け取る。
-->
<script setup lang="ts">
import { computed } from "vue";
import { jaAscendancy } from "../../i18n/ascendancies-ja";
import { fmtClock } from "../../utils/format-time";
import { ascendancies } from "../../state/ascendancy-list";
import { WATCH_METRIC_LABEL, type updateWatchSettings, type WatchMetric, type WatchSettings } from "../../state/watch-settings";

const props = defineProps<{
  settings: WatchSettings;
  /** 監視の枠が埋まっているか (「監視へ +」が押せない理由を画面に出す) */
  watchFull: boolean;
  rankingBusy: boolean;
  rankingWaiting: boolean;
  rankingNeedFetch: boolean;
  /** 出している結果の取得時刻 (unix 秒)。0 = まだ無い */
  rankingFetchedAt: number;
}>();
const emit = defineEmits<{
  (e: "apply", patch: Parameters<typeof updateWatchSettings>[0]): void;
  (e: "fetch"): void;
}>();

/**
 * プルダウンに出すアセンダンシー: poe.ninja の**使用率が多い順に上位 8 個**
 * (オーナー指示 2026-09-20:「範囲は忍者の上位 8 アセンダンシーを…使用率だけ多い順に並べて上から。
 *  これはアプリを開くときにチェックして違うなら変える」)。一覧は起動のたびに取り直す。
 * 今選んでいる物が 8 位圏外に落ちても、選択が消えないように残す。
 */
const topAscendancies = computed(() => {
  const sorted = [...ascendancies.value].sort((a, b) => b.percentage - a.percentage);
  const top = sorted.slice(0, 8);
  const cur = props.settings.klass;
  if (cur && !top.some((a) => a.class === cur)) {
    const hit = sorted.find((a) => a.class === cur);
    if (hit) top.push(hit);
  }
  return top;
});
</script>

<template>
  <!-- 押せない理由はその場に出す (オーナー報告 2026-09-20「監視へが反応しない」= 枠が埋まっていた) -->
  <span v-if="watchFull" class="text-[11px] text-amber-300">
    監視は {{ settings.maxGems }} ジェムまでです (今 {{ settings.manual.length }})。上の一覧から外すと「監視へ +」が押せます
  </span>
  <label class="inline-flex items-center gap-2 min-w-0">
    <span class="text-[var(--exile-color-text-secondary)]">アセンダンシー</span>
    <select class="sel w-64" :value="settings.klass" @change="emit('apply', { klass: ($event.target as HTMLSelectElement).value })">
      <option value="">全アセンダンシー (リーグ全体の上位)</option>
      <option v-for="a in topAscendancies" :key="a.class" :value="a.class">{{ jaAscendancy(a.class) }} ({{ a.percentage.toFixed(1) }}%)</option>
    </select>
  </label>
  <button
    type="button"
    :disabled="rankingBusy"
    class="px-3 py-1 rounded border font-display tracking-[0.06em] hover:bg-[var(--exile-color-bg-elevated)] disabled:cursor-not-allowed"
    :class="rankingNeedFetch && !rankingBusy ? 'border-amber-500/70 bg-amber-500/15 text-amber-200' : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)]'"
    title="選んだアセンダンシーの使用率を poe.ninja から取り直します (上位 100 人)。一度取った分はそのまま出るので、取り直したい時だけ押してください"
    @click="emit('fetch')"
  >
    {{ rankingBusy ? (rankingWaiting ? "待機中…" : "取得中…") : rankingNeedFetch ? "ランキングを取得" : "ランキングを取り直す" }}
  </button>
  <!-- 取り直していないことが分かるように、出している結果の取得時刻を出す (オーナー指摘 2026-09-20) -->
  <span v-if="rankingFetchedAt" class="text-[11px] text-[var(--exile-color-text-tertiary)] whitespace-nowrap">
    {{ fmtClock(rankingFetchedAt) }} に取得した分を表示中
  </span>
  <label class="inline-flex items-center gap-2">
    <input type="checkbox" :checked="settings.autoTop" @change="emit('apply', { autoTop: ($event.target as HTMLInputElement).checked })" />
    上位を自動で監視に入れる
  </label>
  <label v-if="settings.autoTop" class="inline-flex items-center gap-2">
    <span class="text-[var(--exile-color-text-secondary)]">基準</span>
    <select class="sel w-52" :value="settings.metric" @change="emit('apply', { metric: ($event.target as HTMLSelectElement).value as WatchMetric })">
      <option v-for="(label, key) in WATCH_METRIC_LABEL" :key="key" :value="key">{{ label }}</option>
    </select>
  </label>
  <label v-if="settings.autoTop" class="inline-flex items-center gap-2">
    <span class="text-[var(--exile-color-text-secondary)]">人数の下限</span>
    <input type="number" min="1" max="100" class="sel w-16" :value="settings.minUsers" @change="emit('apply', { minUsers: Number(($event.target as HTMLInputElement).value) })" />
  </label>
</template>
