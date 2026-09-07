<!--
  CraftV2Header.vue — MOD 一覧画面のヘッダー
  タイトル / リーグ選択 / 進捗・フェーズ・ネットワーク状態 / 全体プログレスバー /
  スロットタブ / 更新・全取得ボタン。取得状態は craftV2Store を直接参照する。
  CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
-->
<script setup lang="ts">
import type { SlotKey } from "../../services/craft-v2/types";
import { craftV2Store, refetchWithSelectedLeague } from "../../state/craft-v2-store";
import { SLOT_TABS } from "../../views/craft-v2/helpers";

defineProps<{
  /** 選択中アセンダンシーのサンプル人数 (null なら未表示) */
  sampleSize: number | null;
  phaseElapsedSecs: number;
  progressFraction: string;
  overallProgressPercent: number;
}>();
const activeSlot = defineModel<SlotKey>("activeSlot", { required: true });
const emit = defineEmits<{ refresh: []; forceRefetch: [] }>();
const store = craftV2Store;
</script>

<template>
  <header class="flex items-start justify-between mb-3 gap-4 flex-wrap">
    <div class="min-w-0">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">
        上位プレイヤーMOD一覧
        <span class="text-[var(--exile-color-text-secondary)] text-sm"
          >(poe.ninja 連携 / 上位 10 アセンダンシー<template v-if="sampleSize != null">
            × 各 {{ sampleSize }} 人</template
          >)</span
        >
      </h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        上位プレイヤーのレア装備 (指輪 / アミュレット / 武器 / オフハンド / 兜 / 手袋 / 胴体 / 靴) の explicit MOD を prefix / suffix で集計 (人数降順)
      </p>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-0.5">※ 数値は実際に取れた人数分の平均値</p>

      <!-- リーグ選択 dropdown (動的取得、デフォは現リーグ) -->
      <div v-if="!store.leaguesLoadFailed && store.availableLeagues.length > 0" class="mt-2 flex items-center gap-2 text-[11px]">
        <label for="league-select" class="text-[var(--exile-color-text-secondary)]">リーグ:</label>
        <select
          id="league-select"
          v-model="store.selectedLeagueUrl"
          :disabled="store.loading"
          class="bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-brass)] rounded px-2 py-0.5 text-[var(--exile-color-text-primary)] focus:outline-none focus:border-[var(--exile-color-accent-focus)] disabled:opacity-50"
        >
          <option v-for="l in store.availableLeagues" :key="l.url" :value="l.url">{{ l.name }}</option>
        </select>
        <button
          type="button"
          @click="refetchWithSelectedLeague"
          :disabled="store.loading"
          class="px-2 py-0.5 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] hover:bg-[var(--exile-color-bg-surface)] hover:text-[var(--exile-color-accent-focus)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="選択中のリーグで再取得 (キャッシュは上書き)"
        >
          このリーグで再取得
        </button>
      </div>

      <!-- 進捗・最終更新 -->
      <div class="mt-2 flex items-center gap-3 flex-wrap text-[11px]">
        <span v-if="store.loading && !store.backgroundRefresh" class="inline-flex items-center gap-1.5 text-[var(--exile-color-accent-focus)]">
          <span class="inline-block w-2 h-2 rounded-full bg-[var(--exile-color-accent-focus)] animate-pulse" aria-hidden="true"></span>
          <template v-if="store.showingFromCache">キャッシュから {{ store.cacheItemCount }} 件即表示中、最新データ取得中…</template>
          <template v-else>
            取得中… {{ progressFraction }} アセンダンシー
            <span v-if="store.currentlyFetching" class="text-[var(--exile-color-text-secondary)]">(直近: {{ store.currentlyFetching }})</span>
          </template>
        </span>
        <!-- バックグラウンド更新中 (表示は前回のまま、完了アセンダンシーから順に差し替わる) -->
        <span
          v-if="store.backgroundRefresh"
          class="inline-flex items-center gap-1.5 text-[var(--exile-color-text-tertiary)]"
          title="表示は前回のまま、裏で最新データを取得中です。取得が完了したアセンダンシーから順に切り替わります。"
        >
          <span class="inline-block w-2 h-2 rounded-full bg-[var(--exile-color-text-tertiary)] animate-pulse" aria-hidden="true"></span>
          バックグラウンド更新中…
        </span>
        <!-- per-character 進捗フェーズ (search=青 / fetching=緑)。レート制限と共存表示 -->
        <span
          v-if="store.loading && store.currentPhase && store.currentPhase.phase === 'search'"
          class="inline-flex items-center gap-1 text-[11px] text-sky-300 font-medium"
          :title="`${store.currentPhase.ascendancy} の上位プレイヤーを検索中`"
        >
          <span aria-hidden="true" class="animate-pulse">🔍</span>
          上位プレイヤー検索中
          <span class="text-sky-200/80 text-[10px]">({{ store.currentPhase.ascendancy }})</span>
          <span class="text-sky-200/60 text-[10px] tabular-nums">⏱ {{ phaseElapsedSecs }} 秒</span>
        </span>
        <span
          v-else-if="store.loading && store.currentPhase && store.currentPhase.phase === 'fetching'"
          class="inline-flex items-center gap-1 text-[11px] text-emerald-300 font-medium"
          :title="`${store.currentPhase.ascendancy} のキャラ装備を取得中`"
        >
          <span aria-hidden="true" class="animate-pulse">📥</span>
          キャラ取得中
          <span class="text-emerald-200/90 tabular-nums"
            >{{ store.currentPhase.ascendancy }}: {{ store.currentPhase.charactersDone }}/{{ store.currentPhase.charactersTotal }}</span
          >
          <span v-if="store.currentPhase.currentConcurrency > 0" class="text-emerald-200/70 text-[10px] tabular-nums">
            ({{ store.currentPhase.currentConcurrency }} 並列)
          </span>
          <span class="text-emerald-200/60 text-[10px] tabular-nums">⏱ {{ phaseElapsedSecs }} 秒</span>
        </span>

        <!-- レート制限ペナルティ中の残秒数 -->
        <span
          v-if="store.loading && store.networkStatus?.globalPenaltyWaiting"
          class="inline-flex items-center gap-1 text-[11px] text-amber-300 font-medium"
          :title="
            store.networkStatus.globalPenaltyReason
              ? `Cloudflare/サーバから ${store.networkStatus.globalPenaltyReason} を受信、自動再開を待機中`
              : 'サーバからのレート制限解除を待機中'
          "
        >
          <span aria-hidden="true" class="animate-pulse">⏱</span>
          リミット制限待機中（{{ store.networkStatus.globalPenaltyRemainingSecs }} 秒）
          <span v-if="store.networkStatus.globalPenaltyReason" class="text-amber-200/70 text-[10px]">
            ({{ store.networkStatus.globalPenaltyReason }})
          </span>
        </span>

        <!-- retry sleep 中タスク数 (rate-limit とは別軸なので同時表示可) -->
        <span
          v-if="store.loading && store.networkStatus && store.networkStatus.activeRetryCount > 0"
          class="inline-flex items-center gap-1 text-[11px] text-orange-300 font-medium"
          :title="
            store.networkStatus.lastRetryReason
              ? `直近の再試行理由: ${store.networkStatus.lastRetryReason} (sleep 終了まで ${store.networkStatus.lastRetryRemainingSecs} 秒)`
              : 'サーバ応答エラーで再試行待機中'
          "
        >
          <span aria-hidden="true" class="animate-pulse">🔁</span>
          再試行中 {{ store.networkStatus.activeRetryCount }} 件
          <span v-if="store.networkStatus.lastRetryReason" class="text-orange-200/70 text-[10px]">
            ({{ store.networkStatus.lastRetryReason }} 残 {{ store.networkStatus.lastRetryRemainingSecs }} 秒)
          </span>
        </span>
        <span
          v-if="
            store.lastUpdatedAt &&
            !(store.loading && store.networkStatus?.globalPenaltyWaiting) &&
            !(store.loading && store.networkStatus && store.networkStatus.activeRetryCount > 0)
          "
          class="text-[var(--exile-color-text-secondary)]"
        >
          最終更新: {{ store.lastUpdatedAt }}
          <span v-if="store.snapshot" class="ml-1 text-[var(--exile-color-text-tertiary)]">({{ store.snapshot.snapshot_name }})</span>
        </span>
      </div>

      <!-- 全体プログレスバー (取得中だけ表示、完了したら自然消失) -->
      <div
        v-if="store.loading && !store.backgroundRefresh"
        class="mt-2 w-full max-w-[420px] h-1.5 rounded-full overflow-hidden bg-[var(--exile-color-bg-elevated)] border border-[var(--exile-color-border-subtle)]"
        :aria-label="`全体進捗 ${Math.round(overallProgressPercent)}%`"
        role="progressbar"
        :aria-valuenow="Math.round(overallProgressPercent)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="h-full bg-gradient-to-r from-[var(--exile-color-accent-focus)] to-[var(--exile-color-accent-focus-hover)] transition-[width] duration-500 ease-out"
          :style="{ width: overallProgressPercent + '%' }"
        ></div>
      </div>
    </div>

    <div class="flex items-center gap-2 flex-wrap">
      <!-- 8 スロット横並びタブ -->
      <div
        class="flex border border-[var(--exile-color-border-subtle)] rounded overflow-hidden text-[12px] font-display tracking-[0.04em]"
        role="tablist"
        aria-label="スロット切替"
      >
        <button
          v-for="(tab, idx) in SLOT_TABS"
          :key="tab.key"
          type="button"
          role="tab"
          :aria-selected="activeSlot === tab.key"
          @click="activeSlot = tab.key"
          :class="[
            'px-2.5 py-1.5 transition-colors inline-flex items-center gap-1 leading-none whitespace-nowrap',
            idx > 0 ? 'border-l border-[var(--exile-color-border-subtle)]' : '',
            activeSlot === tab.key
              ? 'bg-[var(--exile-color-bg-elevated)] text-[var(--exile-color-accent-focus)]'
              : 'text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
          ]"
          :title="tab.label"
        >
          <span aria-hidden="true">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- 更新 (差分) / 全取得 (キャッシュ削除) -->
      <button
        type="button"
        @click="emit('refresh')"
        :disabled="store.loading"
        :class="[
          'px-3 py-1.5 rounded border text-[13px] font-display tracking-[0.06em] transition-colors',
          store.loading
            ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed opacity-60'
            : 'border-[var(--exile-color-border-brass)] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]',
        ]"
        :title="store.loading ? '取得中…' : 'poe.ninja から差分更新 (キャッシュ活用)'"
      >
        <span aria-hidden="true">⟳</span> 更新
      </button>
      <button
        type="button"
        @click="emit('forceRefetch')"
        :disabled="store.loading"
        :class="[
          'px-3 py-1.5 rounded border text-[12px] font-display tracking-[0.06em] transition-colors',
          store.loading
            ? 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-tertiary)] cursor-not-allowed opacity-60'
            : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] hover:text-[var(--exile-color-text-primary)]',
        ]"
        :title="store.loading ? '取得中…' : 'キャッシュ削除 + 全取得 (リーグ更新等のリカバリ用)'"
      >
        <span aria-hidden="true">⌫</span> 全取得
      </button>
    </div>
  </header>
</template>
