<script setup lang="ts">
/**
 * クラフト発見ランキング
 *
 * オーナー指示 (2026-05-19):
 *   - 「沢山出品されてる中で、同じMODが複数被ってる（ティア無視）ものを可視化」
 *   - 「5MOD被りか4MOD被りか選べるように」
 * オーナー指示 (2026-05-19、配布向けスコープ縮小):
 *   - リーグ情報 / 通貨レート / 推移グラフ / 母集団件数 section を切除
 *   - クラフト発見ランキングのみ残す
 */
import { ref, computed, onMounted, watch } from "vue";
import {
  fetchLeagues,
  type League,
} from "../api/poe2scout";
import {
  runDiscovery,
  saveDiscoveryState,
  loadDiscoveryState,
  clearDiscoveryState,
  buildResultFromState,
  getSampleListings,
  openClusterInTrade2,
  DiscoveryAbortedError,
  type DiscoveryCategory,
  type DiscoveryProgress,
  type DiscoveryResult,
  type DiscoveryState,
  type ClusterSize,
  type ClusterCount,
  CLUSTER_SIZES,
  MAX_LISTINGS_PER_CYCLE,
  LISTING_COUNT_PRESETS,
  DEFAULT_LISTING_COUNT,
  RECENT_WINDOW_HOURS,
} from "../services/craft-discovery";
import HotSeal from "../components/decor/HotSeal.vue";
import CornerMark from "../components/decor/CornerMark.vue";

const leagues = ref<League[]>([]);
const currentLeague = ref<League | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);

const discoveryCategory = ref<DiscoveryCategory>("ring");
const discoveryLoading = ref(false);
const discoveryProgress = ref<DiscoveryProgress | null>(null);
const discoveryError = ref<string | null>(null);
const discoveryResult = ref<DiscoveryResult | null>(null);
const discoveryTargetCount = ref<number>(DEFAULT_LISTING_COUNT);
let discoveryAbortController: AbortController | null = null;

function cancelDiscovery() {
  if (discoveryAbortController) {
    discoveryAbortController.abort();
  }
}

function runSampleDiscovery() {
  const sampleListings = getSampleListings();
  const sampleState: DiscoveryState = {
    seenIds: new Set(sampleListings.map((l) => l.id)),
    allListings: sampleListings,
    cycleCount: 0,
    category: discoveryCategory.value,
  };
  discoveryState.value = sampleState;
  discoveryResult.value = buildResultFromState(sampleState);
  discoveryProgress.value = {
    phase: "done",
    message: `🧪 サンプル ${sampleListings.length} 件で集計（trade2 取得無し、ロジック動作確認用）`,
  };
  discoveryError.value = null;
}

const discoveryState = ref<DiscoveryState | null>(null);

watch(discoveryCategory, async (newCat) => {
  discoveryState.value = null;
  discoveryResult.value = null;
  discoveryProgress.value = null;
  discoveryError.value = null;
  if (!currentLeague.value) return;
  try {
    const loaded = await loadDiscoveryState(newCat, currentLeague.value.Value);
    if (loaded) {
      discoveryState.value = loaded;
      discoveryResult.value = buildResultFromState(loaded);
    }
  } catch (e) {
    console.warn("discovery load failed:", e);
  }
});

watch(currentLeague, async (league) => {
  if (!league) return;
  if (discoveryState.value || discoveryLoading.value) return;
  try {
    const loaded = await loadDiscoveryState(discoveryCategory.value, league.Value);
    if (loaded) {
      discoveryState.value = loaded;
      discoveryResult.value = buildResultFromState(loaded);
    }
  } catch (e) {
    console.warn("discovery initial load failed:", e);
  }
});

async function performReset() {
  const cat = discoveryCategory.value;
  const leagueName = currentLeague.value?.Value;
  discoveryState.value = null;
  discoveryResult.value = null;
  discoveryProgress.value = null;
  discoveryError.value = null;
  if (leagueName) {
    try {
      await clearDiscoveryState(cat, leagueName);
    } catch (e) {
      console.warn("discovery clear failed:", e);
    }
  }
}

const clusterSize = ref<ClusterSize>(5);

const showTestSettings = ref(false);
const minCountThreshold = ref(2);
const topNDisplay = ref(30);
const freshHotPct = ref(80);
const freshWarmPct = ref(40);
const freshColdPct = ref(20);

const freshHotThreshold = computed(() => freshHotPct.value / 100);
const freshWarmThreshold = computed(() => freshWarmPct.value / 100);
const freshColdThreshold = computed(() => freshColdPct.value / 100);

function resetTestSettings() {
  minCountThreshold.value = 2;
  topNDisplay.value = 30;
  freshHotPct.value = 80;
  freshWarmPct.value = 40;
  freshColdPct.value = 20;
}

const openingClusterHash = ref<string | null>(null);

async function openCluster(c: ClusterCount) {
  if (!currentLeague.value) return;
  if (openingClusterHash.value) return;
  openingClusterHash.value = c.clusterHash;
  try {
    const res = await openClusterInTrade2({
      cluster: c,
      league: currentLeague.value.Value,
      category: discoveryCategory.value,
    });
    if (res.missingMods.length > 0) {
      console.warn(
        `trade2 遷移: ${res.statCount} stat フィルタで開いた、${res.missingMods.length} mod は逆引き不可:`,
        res.missingMods,
      );
    }
  } catch (e) {
    const msg = typeof e === "string" ? e : (e as Error).message;
    discoveryError.value = `trade2 遷移失敗: ${msg}`;
  } finally {
    openingClusterHash.value = null;
  }
}

type SortMode = "fresh" | "recent" | "count";
const sortMode = ref<SortMode>("fresh");

const discoveryClusterRanking = computed(() => {
  if (!discoveryResult.value) return [];
  const list = discoveryResult.value.clustersBySize[clusterSize.value]
    .filter((c) => c.count >= minCountThreshold.value);
  if (sortMode.value === "fresh") {
    return list
      .slice()
      .sort((a, b) => b.freshRate - a.freshRate || b.count - a.count)
      .slice(0, topNDisplay.value);
  }
  if (sortMode.value === "recent") {
    return list
      .slice()
      .sort((a, b) => b.recentCount - a.recentCount || b.count - a.count)
      .slice(0, topNDisplay.value);
  }
  return list
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, topNDisplay.value);
});

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const list = await fetchLeagues();
    leagues.value = list;
    const cur = list.find((l) => l.IsCurrent && !l.Value.startsWith("HC"));
    currentLeague.value = cur ?? null;
    lastUpdated.value = new Date();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

async function startDiscovery() {
  if (!currentLeague.value) return;
  if (discoveryLoading.value) return;
  discoveryLoading.value = true;
  discoveryError.value = null;
  discoveryProgress.value = null;
  discoveryAbortController = new AbortController();
  try {
    const res = await runDiscovery({
      league: currentLeague.value.Value,
      category: discoveryCategory.value,
      targetCount: discoveryTargetCount.value,
      prevState: discoveryState.value ?? undefined,
      signal: discoveryAbortController.signal,
      onProgress: (p) => {
        discoveryProgress.value = p;
      },
    });
    discoveryResult.value = res;
    discoveryState.value = res.state;
    if (currentLeague.value) {
      try {
        await saveDiscoveryState(res.state, currentLeague.value.Value);
      } catch (saveErr) {
        console.warn("discovery save failed:", saveErr);
      }
    }
  } catch (e) {
    if (e instanceof DiscoveryAbortedError) {
      discoveryProgress.value = {
        phase: "done",
        message: "中止しました（取得済み listing は破棄）",
      };
    } else {
      discoveryError.value = typeof e === "string" ? e : (e as Error).message;
    }
  } finally {
    discoveryLoading.value = false;
    discoveryAbortController = null;
  }
}
</script>

<template>
  <div class="p-8 overflow-auto h-full">
    <div class="flex items-baseline justify-between mb-1">
      <h2 class="text-2xl font-semibold">🔍 クラフト発見ランキング</h2>
      <button
        @click="refresh"
        :disabled="loading"
        class="px-3 py-1.5 rounded text-xs bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
      >
        {{ loading ? "更新中…" : "🔄 リーグ更新" }}
      </button>
    </div>
    <p class="text-xs text-[var(--color-text-muted)] mb-6">
      トレード市場で同じ MOD が複数被ってる listing を集計して、いまクラフトされてる構成を可視化。
      <span v-if="currentLeague" class="ml-2">
        リーグ: <span class="text-[var(--color-accent)]">{{ currentLeague.Value }}</span>
      </span>
      <span v-if="lastUpdated" class="ml-2">
        最終更新: <span class="text-[var(--color-text)]">{{ fmtDate(lastUpdated) }}</span>
      </span>
    </p>

    <div v-if="error" class="mb-4 p-3 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-error)_10%,transparent)] border border-[var(--exile-color-signal-error)] text-[var(--exile-color-signal-error)] text-xs">
      {{ error }}
    </div>

    <div class="mb-6 p-5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
      <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 class="text-sm uppercase tracking-wider text-[var(--color-text-muted)]">
          同 MOD 被り（ティア無視・累積取得）
        </h3>
        <div class="flex gap-2 items-center">
          <button
            @click="showTestSettings = !showTestSettings"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              showTestSettings
                ? 'bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_30%,transparent)] text-[var(--exile-color-accent-mystic)] border-[var(--exile-color-accent-mystic)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
            ]"
            title="テスト版用の開発者設定（閾値・表示件数を調整）"
          >
            ⚙ テスト設定
          </button>
          <select
            v-model="discoveryCategory"
            :disabled="discoveryLoading"
            class="text-xs px-2 py-1 rounded bg-[var(--color-bg)] border border-[var(--color-border)]"
          >
            <option value="ring">指輪</option>
            <option value="amulet">アミュレット</option>
          </select>
          <button
            v-if="!discoveryLoading"
            @click="startDiscovery"
            :disabled="!currentLeague"
            class="px-3 py-1 rounded text-[10px] bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            :title="discoveryState ? `累積に +${discoveryTargetCount} 件追加（重複は弾く）` : `初回取得 ${discoveryTargetCount} 件`"
          >
            {{
              discoveryState
                ? `📥 +${discoveryTargetCount} 件追加（累積 ${discoveryState.allListings.length}）`
                : `📥 初回取得 ${discoveryTargetCount} 件`
            }}
          </button>
          <button
            v-else
            @click="cancelDiscovery"
            class="px-3 py-1 rounded text-[10px] bg-[var(--exile-color-signal-error)] text-[var(--exile-color-bg-canvas)] hover:opacity-90 transition"
            title="取得を中止（待機中ならすぐ反応、API リクエスト中なら完了後）"
          >
            ⏹ 中止
          </button>
          <button
            v-if="!discoveryLoading && discoveryState"
            @click="performReset"
            class="px-2 py-1 rounded text-[10px] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[color-mix(in_srgb,var(--exile-color-signal-error)_15%,transparent)] hover:text-[var(--exile-color-signal-error)] transition"
            title="累積データを破棄してリセット"
          >
            🗑 リセット
          </button>
          <button
            v-if="!discoveryLoading"
            @click="runSampleDiscovery"
            class="px-2 py-1 rounded text-[10px] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
            title="サンプル 10 件で集計ロジックを動かす（trade2 取得不要、動作確認用）"
          >
            🧪 サンプルで試す
          </button>
        </div>
      </div>

      <p
        v-if="discoveryProgress"
        class="text-xs text-[var(--color-text-muted)] font-mono mb-2"
      >
        [{{ discoveryProgress.phase }}] {{ discoveryProgress.message }}
      </p>
      <p
        v-if="discoveryError"
        class="text-xs text-[var(--exile-color-signal-error)] mb-2 font-mono whitespace-pre-wrap break-all"
      >
        {{ discoveryError }}
      </p>

      <div class="mb-3 flex gap-2 items-center flex-wrap">
        <span class="text-[10px] text-[var(--color-text-muted)]">取得件数:</span>
        <input
          type="number"
          v-model.number="discoveryTargetCount"
          :min="10"
          :max="MAX_LISTINGS_PER_CYCLE"
          :step="10"
          :disabled="discoveryLoading"
          class="w-20 px-2 py-1 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-mono"
        />
        <span class="text-[10px] text-[var(--color-text-muted)]">/ 最大 {{ MAX_LISTINGS_PER_CYCLE }}</span>
        <div class="flex gap-1 ml-2">
          <button
            v-for="preset in LISTING_COUNT_PRESETS"
            :key="preset"
            @click="discoveryTargetCount = preset"
            :disabled="discoveryLoading"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition disabled:opacity-50',
              discoveryTargetCount === preset
                ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)] font-semibold'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
            ]"
          >{{ preset }}</button>
        </div>
      </div>

      <div v-if="discoveryState" class="mb-3 text-[10px] text-[var(--color-text-muted)] font-mono space-y-0.5">
        <div>
          累積 <span class="text-[var(--color-accent)] font-semibold">{{ discoveryState.allListings.length }}</span> 件
          ／ <span class="text-[var(--color-accent)]">{{ discoveryState.cycleCount }}</span> サイクル
          <span v-if="discoveryResult && discoveryResult.cycleCount > 0">
            ／ 直近サイクル: +<span class="text-[var(--exile-color-signal-success)]">{{ discoveryResult.newListingsThisCycle }}</span> 新規
            <span v-if="discoveryResult.dedupRate > 0">
              ／ -<span class="text-[var(--exile-color-signal-warn)]">{{ Math.round(discoveryResult.dedupRate * 100) }}%</span> 重複弾き
            </span>
          </span>
        </div>
        <div class="text-[var(--color-text-muted)]/70">
          ※ 累積モード: 取得ボタンで +{{ discoveryTargetCount }} 件追加（同じ listing は弾く）。即売れ判定は前サイクルの listing が今サイクルで消えてるかで測定。
        </div>
      </div>

      <div
        v-if="discoveryResult"
        class="mb-3 text-[10px] text-[var(--color-text-muted)] font-mono flex flex-wrap gap-x-4 gap-y-1"
      >
        <span v-for="n in CLUSTER_SIZES" :key="n">
          {{ n }}mod 被り <span class="text-[var(--color-accent)]">{{ discoveryResult.clustersBySize[n].length }}</span> 種
        </span>
        <span>空 mod {{ fmtPct(discoveryResult.emptyModRate) }}</span>
        <span v-if="discoveryResult.failedSorts.length">
          失敗 sort: <span class="text-[var(--exile-color-signal-error)]">{{ discoveryResult.failedSorts.join(", ") }}</span>
        </span>
      </div>

      <div
        v-if="showTestSettings"
        class="mb-3 p-3 rounded border border-[var(--exile-color-accent-mystic)] bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_15%,transparent)] space-y-2"
      >
        <div class="flex items-baseline justify-between mb-1">
          <span class="text-[11px] font-semibold text-[var(--exile-color-accent-mystic)]">⚙ テスト設定（開発者用）</span>
          <button
            @click="resetTestSettings"
            class="text-[10px] px-2 py-0.5 rounded border border-[var(--exile-color-accent-mystic)] text-[var(--exile-color-accent-mystic)] hover:bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_25%,transparent)]"
          >
            🔄 デフォルトに戻す
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
          <label class="flex items-center gap-2">
            <span class="text-[var(--color-text-muted)] w-40">表示の最低件数</span>
            <input
              type="number"
              v-model.number="minCountThreshold"
              :min="1"
              :max="50"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono"
            />
            <span class="text-[var(--color-text-muted)]/60">件以上のクラスタを表示</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--color-text-muted)] w-40">表示件数</span>
            <input
              type="number"
              v-model.number="topNDisplay"
              :min="5"
              :max="200"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono"
            />
            <span class="text-[var(--color-text-muted)]/60">上位 N 件</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--color-text-muted)] w-40">🔥 新鮮率「ホット」閾値</span>
            <input
              type="number"
              v-model.number="freshHotPct"
              :min="50"
              :max="100"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono"
            />
            <span class="text-[var(--color-text-muted)]/60">% 以上で赤表示</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--color-text-muted)] w-40">🟡 新鮮率「ぬるい」閾値</span>
            <input
              type="number"
              v-model.number="freshWarmPct"
              :min="20"
              :max="70"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono"
            />
            <span class="text-[var(--color-text-muted)]/60">% 以上でアンバー</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--color-text-muted)] w-40">🟠 新鮮率「冷たい」閾値</span>
            <input
              type="number"
              v-model.number="freshColdPct"
              :min="0"
              :max="40"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] font-mono"
            />
            <span class="text-[var(--color-text-muted)]/60">% 以上でオレンジ（未満は灰）</span>
          </label>
        </div>
        <p class="text-[9px] text-[var(--exile-color-text-secondary)] mt-2 leading-relaxed">
          ※ これらは本番ユーザーには見せない予定。配布版では「自動で最適表示」になる想定。
          いまは開発検証用に開放中。
        </p>
      </div>

      <div class="flex gap-2 mb-3 flex-wrap items-center">
        <span class="text-[10px] text-[var(--color-text-muted)]">被り mod 数:</span>
        <div class="flex gap-1">
          <button
            v-for="n in CLUSTER_SIZES"
            :key="n"
            @click="clusterSize = n"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition min-w-[44px]',
              clusterSize === n
                ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)] font-semibold'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
            ]"
          >
            {{ n }} mod
          </button>
        </div>
        <span class="text-[10px] text-[var(--color-text-muted)] ml-3">並び順:</span>
        <div class="flex gap-1">
          <button
            @click="sortMode = 'fresh'"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              sortMode === 'fresh'
                ? 'bg-[var(--exile-color-accent-hot)] text-[var(--exile-color-text-primary)] border-[var(--exile-color-accent-hot)] font-semibold'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
            ]"
            :title="`新鮮率（直近 ${RECENT_WINDOW_HOURS}h ÷ 累積）が高い構成を優先 = 古い在庫が無く、市場が回ってる ≒ 売れてる`"
          >
            🔥 新鮮率
          </button>
          <button
            @click="sortMode = 'recent'"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              sortMode === 'recent'
                ? 'bg-[var(--exile-color-signal-success)] text-[var(--exile-color-bg-canvas)] border-[var(--exile-color-signal-success)] font-semibold'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
            ]"
            :title="`直近 ${RECENT_WINDOW_HOURS}h 以内に出品された listing が多い構成を優先（絶対数の新鮮さ）`"
          >
            🆕 直近 {{ RECENT_WINDOW_HOURS }}h
          </button>
          <button
            @click="sortMode = 'count'"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              sortMode === 'count'
                ? 'bg-[var(--color-accent)] text-black border-[var(--color-accent)] font-semibold'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]',
            ]"
            title="累積出品数が多い構成を優先（= 量産されてる）"
          >
            📊 累積件数
          </button>
        </div>
      </div>

      <ol
        v-if="discoveryClusterRanking.length"
        class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[800px] overflow-auto pr-2"
      >
        <li
          v-for="(c, i) in discoveryClusterRanking"
          :key="c.clusterHash"
          @click="openCluster(c)"
          class="rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] hover:border-[var(--color-border-brass)] cursor-pointer transition overflow-hidden relative"
          :class="{ 'opacity-60 cursor-wait': openingClusterHash === c.clusterHash }"
          :title="`クリックで trade2 サイトを開く（${clusterSize} mod フィルタ入り）`"
        >
          <CornerMark class="absolute top-1 left-1 z-10 pointer-events-none" />
          <HotSeal
            v-if="c.freshRate >= freshHotThreshold"
            class="absolute top-1 left-3 z-10 pointer-events-none"
          />
          <div
            v-if="openingClusterHash === c.clusterHash"
            class="absolute top-2 right-2 text-[10px] text-[var(--exile-color-signal-warn)] bg-[var(--exile-color-bg-elevated)] px-2 py-0.5 rounded font-mono z-10"
          >
            🔗 開封中…
          </div>
          <div class="px-3 py-1.5 pl-10 bg-[var(--exile-color-bg-surface)] border-b border-[var(--exile-color-border-subtle)] flex items-center justify-between text-[10px] font-mono gap-2 flex-wrap">
            <span class="text-[var(--exile-color-text-secondary)] font-semibold">#{{ i + 1 }}</span>
            <span
              class="px-1.5 py-0.5 rounded font-semibold"
              :class="
                c.freshRate >= freshHotThreshold
                  ? 'bg-[color-mix(in_srgb,var(--exile-color-accent-hot)_40%,transparent)] text-[var(--exile-color-text-primary)]'
                  : c.freshRate >= freshWarmThreshold
                    ? 'bg-[color-mix(in_srgb,var(--exile-color-signal-warn)_30%,transparent)] text-[var(--exile-color-signal-warn)]'
                    : c.freshRate >= freshColdThreshold
                      ? 'bg-[color-mix(in_srgb,var(--exile-color-signal-warn)_15%,transparent)] text-[var(--exile-color-text-secondary)]'
                      : 'bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-secondary)]'
              "
              :title="`新鮮率 = 直近 ${RECENT_WINDOW_HOURS}h (${c.recentCount}件) / 累積 (${c.count}件) → 高いほど「売れて回ってる」傾向`"
            >
              🔥 {{ Math.round(c.freshRate * 100) }}%
            </span>
            <span
              class="px-1.5 py-0.5 rounded text-[var(--exile-color-text-secondary)]"
              :title="`直近 ${RECENT_WINDOW_HOURS}h 以内に新規出品された listing 数`"
            >
              🆕 {{ c.recentCount }} / {{ c.count }}
            </span>
          </div>

          <div
            v-if="c.priceMedian !== null"
            class="px-3 py-1 border-b border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] text-[10px] font-mono text-[var(--exile-color-text-secondary)] flex items-center justify-between"
            :title="`中央値計算: divine 建て listing ${c.pricedCount} 件 / 全 ${c.count} 件`"
          >
            <span>
              💰 中央値 <span class="text-[var(--exile-color-text-primary)] font-semibold">{{ c.priceMedian.toFixed(0) }}</span> div
            </span>
            <span class="text-[var(--exile-color-text-secondary)]">
              {{ c.priceP25?.toFixed(0) }}–{{ c.priceP75?.toFixed(0) }} div (P25–P75)
            </span>
            <span class="text-[var(--exile-color-text-secondary)]">{{ c.pricedCount }}件</span>
          </div>

          <div class="px-4 py-3 space-y-1 text-center">
            <div
              v-for="(raw, j) in c.rawSamples"
              :key="j"
              class="text-[13px] text-[var(--exile-color-text-link)] leading-relaxed"
              :title="c.modKeys[j]"
            >
              {{ raw }}
            </div>
          </div>

          <div class="px-3 py-1 bg-[var(--exile-color-bg-surface)] border-t border-[var(--exile-color-border-subtle)] text-center text-[10px] text-[var(--exile-color-text-secondary)] font-mono">
            モッド {{ c.modKeys.length }} 個（{{ clusterSize }} mod 一致グループ）
          </div>
        </li>
      </ol>

      <p
        v-else-if="discoveryResult"
        class="text-xs text-[var(--color-text-muted)] italic py-4"
      >
        該当する被り（出現 {{ minCountThreshold }}+）がありませんでした。クラスタサイズを下げる or 取得し直してみてください。
      </p>
      <p
        v-else
        class="text-xs text-[var(--color-text-muted)] italic py-4"
      >
        取得ボタンを押すと 3 ソート × 最大 100 件 = 最大 300 件を集計します（約 4 分、trade2 rate limit 厳守）。
      </p>

      <p class="text-[10px] text-[var(--color-text-muted)] mt-3 leading-relaxed">
        <strong>🔥 即売れ率</strong>: 前回 snapshot から今回までに **listing が消えた割合**。50%+ = 即売れ ✅ / 20-50% = 普通 / 20% 未満 = 売れ残り傾向。<br />
        <strong>クラスタ N mod 被り</strong>: listing 同士で N 個の mod が一致するグループ（C(6,N) 組合せ全列挙）。N=1 で単一 mod、N=6 で完全一致。<br />
        <strong>同 mod 判定</strong>: トレード表示の mod text から数値（ティア）を除去した文字列で一致判定。DB 不使用、表示文字列そのままで突合。<br />
        <strong>集計対象</strong>: explicit mod のみ（暗黙 / 刻印 / クラフト / ルーン除外）。「ダメージをアタックに追加する」系は属性問わず束ねて 1 mod 扱い。
      </p>
    </div>
  </div>
</template>
