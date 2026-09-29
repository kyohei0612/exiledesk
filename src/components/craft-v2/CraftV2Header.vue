<!--
  CraftV2Header.vue — MOD 一覧画面のヘッダー
  タイトル / 出どころ (リーグ・取得時刻) / 取得の進み 1 行 + 細い棒 / 「更新」と「⋯」(リーグを変える・全部取り直す)。
  取得状態は craftV2Store を直接参照する。CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
  2026-09-29 オーナー「上の方の古い UI (更新・再取得) を今の画面に」: ボタンは「更新」1 つ、
    全取得とリーグの切り替えは「⋯」の中へ。進みの表示 (検索中 / キャラ取得中 / 待機 / 再試行、絵文字つき) は 1 行にまとめた。
-->
<script setup lang="ts">
import RefreshButton from "../RefreshButton.vue";
import { computed, onBeforeUnmount, ref } from "vue";
import { craftV2Store, refetchWithSelectedLeague } from "../../state/craft-v2-store";
import { TOP_ASCENDANCIES } from "../../services/craft-v2/runner";
import { resumeAtText, waitText } from "../../utils/wait-text";

defineProps<{
  phaseElapsedSecs: number;
  progressFraction: string;
  overallProgressPercent: number;
}>();
const emit = defineEmits<{ refresh: []; forceRefetch: [] }>();
const store = craftV2Store;

/** 今見ているリーグの名前 (取得済みの物 → 選んでいる物の順) */
const leagueName = computed<string>(() => {
  const url = store.snapshot?.league_url || store.selectedLeagueUrl;
  return store.availableLeagues.find((l) => l.url === url)?.name ?? store.snapshot?.snapshot_name ?? "";
});

/** レート制限 / 再試行の待ち中は「取得中」ではないので待機の表示に差し替える (オーナー指摘 2026-09-16) */
const penalty = computed(() => (store.loading && store.networkStatus?.globalPenaltyWaiting ? store.networkStatus : null));
const retry = computed(() => (store.loading && store.networkStatus && store.networkStatus.activeRetryCount > 0 ? store.networkStatus : null));
/** 手前で取っている時だけ進みを出す (裏の更新は表示が前回のままなので控えめな 1 語だけ) */
const foreground = computed(() => store.loading && !store.backgroundRefresh);

/** 「⋯」の中 (リーグを変える・全部取り直す) */
const menuOpen = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
function onDocClick(e: MouseEvent): void {
  if (menuRoot.value && !menuRoot.value.contains(e.target as Node)) menuOpen.value = false;
}
document.addEventListener("click", onDocClick);
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));
function run(fn: () => void): void {
  menuOpen.value = false;
  fn();
}
</script>

<template>
  <header class="mb-3">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="min-w-0">
        <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">上位プレイヤーMOD一覧</h1>
        <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
          使用率の上位 {{ TOP_ASCENDANCIES }} アセンダンシーごとに、DPS 上位のスキル 3 つ × 10 人の、スキル・持ち物・装備で何が多いか。
        </p>
        <!-- 出どころと取得時刻は他の画面と同じ並び・同じ字で (2026-09-21) -->
        <p class="text-[11px] text-[var(--exile-color-text-tertiary)] mt-0.5">
          poe.ninja<template v-if="leagueName"> · {{ leagueName }}</template> ·
          <template v-if="store.lastUpdatedAt">{{ store.lastUpdatedAt }} 取得</template>
          <template v-else>未取得</template>
        </p>
      </div>

      <div ref="menuRoot" class="relative flex items-center gap-1.5">
        <RefreshButton
          :label="store.loading ? '取得中…' : '更新'"
          :disabled="store.loading"
          :title="store.loading ? '取得が終わるまで押せません' : 'poe.ninja から取り直す (表示は前回のまま、終わった所から入れ替わる)'"
          @click="emit('refresh')"
        />
        <button
          type="button"
          class="px-2 py-1 rounded-lg border border-white/15 text-[11px] leading-none text-[var(--exile-color-text-secondary)] hover:bg-white/5 hover:text-[var(--exile-color-text-primary)] transition-colors"
          :aria-expanded="menuOpen"
          aria-label="ほかの取り方"
          title="リーグを変える・全部取り直す"
          @click="menuOpen = !menuOpen"
        >
          ⋯
        </button>
        <div
          v-if="menuOpen"
          class="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-white/15 bg-[var(--exile-color-bg-elevated)] p-3 text-[11px] shadow-xl"
        >
          <template v-if="!store.leaguesLoadFailed && store.availableLeagues.length > 0">
            <label for="league-select" class="block text-[var(--exile-color-text-secondary)]">リーグ</label>
            <div class="mt-1 flex items-center gap-1.5">
              <select
                id="league-select"
                v-model="store.selectedLeagueUrl"
                class="min-w-0 flex-1 bg-[var(--exile-color-bg-surface)] border border-white/15 rounded px-2 py-1 text-[var(--exile-color-text-primary)] focus:outline-none focus:border-[var(--exile-color-accent-focus)]"
              >
                <option v-for="l in store.availableLeagues" :key="l.url" :value="l.url">{{ l.name }}</option>
              </select>
              <button
                type="button"
                :disabled="store.loading"
                class="shrink-0 px-2 py-1 rounded border border-white/15 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                @click="run(refetchWithSelectedLeague)"
              >
                取る
              </button>
            </div>
          </template>
          <button
            type="button"
            :disabled="store.loading"
            class="mt-2 block w-full rounded px-2 py-1.5 text-left hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
            @click="run(() => emit('forceRefetch'))"
          >
            全部取り直す
            <span class="block text-[10px] text-[var(--exile-color-text-tertiary)]">前回の結果を消して最初から (おかしい時用)</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 取得の進み (1 行)。待ちの間はその行を待ちの表示に差し替える -->
    <div v-if="store.loading" class="mt-2 text-[11px] tabular-nums">
      <p v-if="penalty" class="text-amber-300" :title="penalty.globalPenaltyReason ? `poe.ninja から ${penalty.globalPenaltyReason}` : ''">
        poe.ninja の制限で待機中 · あと {{ waitText(penalty.globalPenaltyRemainingSecs) }}<template v-if="resumeAtText(penalty.globalPenaltyRemainingSecs)">
          · {{ resumeAtText(penalty.globalPenaltyRemainingSecs) }} 頃に再開</template
        >
      </p>
      <p v-else-if="retry" class="text-orange-300" :title="retry.lastRetryReason ?? ''">
        poe.ninja が応答しないので取り直し待ち ({{ retry.activeRetryCount }} 件<template v-if="retry.lastRetryReason">
          · あと {{ waitText(retry.lastRetryRemainingSecs) }}</template
        >)
      </p>
      <p v-else-if="!foreground" class="text-[var(--exile-color-text-tertiary)]">裏で更新中 (表示は前回のまま、終わったアセンダンシーから入れ替わる)</p>
      <p v-else class="text-[var(--exile-color-accent-focus)]">
        <template v-if="store.showingFromCache">前回の結果を表示中 · </template>取得中 {{ progressFraction }} アセンダンシー
        <template v-if="store.currentPhase">
          <span class="text-[var(--exile-color-text-secondary)]">
            · {{ store.currentPhase.ascendancy }}
            <template v-if="store.currentPhase.phase === 'search'">の上位を探している</template>
            <template v-else>{{ store.currentPhase.charactersDone }} / {{ store.currentPhase.charactersTotal }} 人</template>
            · {{ phaseElapsedSecs }} 秒
          </span>
        </template>
      </p>
      <!-- 全体の進みの棒 (手前で取っている時だけ) -->
      <div
        v-if="foreground"
        class="mt-1.5 h-1 w-full max-w-[420px] overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        :aria-label="`全体の進み ${Math.round(overallProgressPercent)}%`"
        :aria-valuenow="Math.round(overallProgressPercent)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full bg-[var(--exile-color-accent-focus)] transition-[width] duration-500 ease-out" :style="{ width: overallProgressPercent + '%' }"></div>
      </div>
    </div>
  </header>
</template>
