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
  type DedupWarningInfo,
  CLUSTER_SIZES,
  MAX_LISTINGS_PER_CYCLE,
  TARGET_COUNT_WARN_THRESHOLD,
  DEDUP_WARN_THRESHOLD,
} from "../services/craft-discovery";
import {
  useCraftDiscoverySettings,
  PRICE_RANGE_PRESETS,
  TARGET_COUNT_PRESETS,
  HOT_WINDOW_HOURS,
  FUTURE_CATEGORIES,
  type AffixMode,
} from "../composables/useCraftDiscoverySettings";
import HotSeal from "../components/decor/HotSeal.vue";
import BaseCard from "../components/decor/BaseCard.vue";

// Phase 1 manual-controls.md: 設定 state は composable に集約、localStorage 自動 sync
const { settings, resetAll: resetAllSettings } = useCraftDiscoverySettings();

const leagues = ref<League[]>([]);
const currentLeague = ref<League | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const lastUpdated = ref<Date | null>(null);

// discoveryCategory: settings.selectedCategory への computed 双方向ブリッジ
//   既存テンプレが `discoveryCategory` を直接 v-model しているため互換維持。
const discoveryCategory = computed<DiscoveryCategory>({
  get: () => {
    const cat = settings.value.selectedCategory;
    // Phase 1 では ring/amulet のみ実 fetch 可、それ以外は ring に丸める
    return cat === "amulet" ? "amulet" : "ring";
  },
  set: (v: DiscoveryCategory) => {
    settings.value.selectedCategory = v;
  },
});
// 取得件数: settings.targetCount の双方向ブリッジ
const discoveryTargetCount = computed<number>({
  get: () => settings.value.targetCount,
  set: (v: number) => {
    settings.value.targetCount = v;
  },
});
const discoveryLoading = ref(false);
const discoveryProgress = ref<DiscoveryProgress | null>(null);
const discoveryError = ref<string | null>(null);
const discoveryResult = ref<DiscoveryResult | null>(null);
let discoveryAbortController: AbortController | null = null;

// Phase 1 取得開始時刻（ETA 算出用、線形外挿、manual-controls.md §2）
const discoveryStartedAtMs = ref<number | null>(null);

// Phase 1 1000 件取得時の警告モーダル制御
const showTargetCountWarn = ref(false);
const pendingTargetCount = ref<number | null>(null);

// Phase 1.x dedupRate 自動打切り通知（manual-controls.md §2）
//   - 800 件以上モードで重複率 > 70% の round が完了したとき、続行/打切りをユーザーに確認
//   - resolve は handleDedupWarning が runDiscovery 内 await から解放するために保持
const showDedupWarn = ref(false);
const dedupWarnInfo = ref<DedupWarningInfo | null>(null);
let dedupWarnResolver: ((cont: boolean) => void) | null = null;

/**
 * Phase 1.x: service 層から呼ばれる dedup 警告 callback.
 * モーダルを開き、ユーザーが続行/打切りを押すまで Promise を保留。
 */
function handleDedupWarning(info: DedupWarningInfo): Promise<boolean> {
  dedupWarnInfo.value = info;
  showDedupWarn.value = true;
  return new Promise<boolean>((resolve) => {
    dedupWarnResolver = resolve;
  });
}
function confirmDedupContinue(): void {
  showDedupWarn.value = false;
  const r = dedupWarnResolver;
  dedupWarnResolver = null;
  dedupWarnInfo.value = null;
  if (r) r(true);
}
function confirmDedupAbort(): void {
  showDedupWarn.value = false;
  const r = dedupWarnResolver;
  dedupWarnResolver = null;
  dedupWarnInfo.value = null;
  if (r) r(false);
}

function cancelDiscovery() {
  if (discoveryAbortController) {
    discoveryAbortController.abort();
  }
  // Phase 1.x.1: dedup 警告モーダル待ちで止まってる場合は resolve(false) でモーダルを閉じる。
  //   service 側で resolve 直後に signal.aborted を後置チェックし DiscoveryAbortedError を throw する
  //   （案 B）ため、ここから先は通常 abort フローと同じ UI 表示「中止しました…」に合流する。
  if (dedupWarnResolver) {
    confirmDedupAbort();
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
  discoveryResult.value = buildResultFromState(sampleState, settings.value.hotConfig, settings.value.affixMode, settings.value.tierInferEnabled);
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
      discoveryResult.value = buildResultFromState(loaded, settings.value.hotConfig, settings.value.affixMode, settings.value.tierInferEnabled);
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
      discoveryResult.value = buildResultFromState(loaded, settings.value.hotConfig, settings.value.affixMode, settings.value.tierInferEnabled);
    }
  } catch (e) {
    console.warn("discovery initial load failed:", e);
  }
});

/**
 * Phase 1 manual-controls.md §3: ホット閾値変更（時間窓 windowHours）時の再計算 watcher。
 * 再 fetch 不要、buildResultFromState を呼び直すだけで cluster.recentCount を再算出。
 * 件数閾値 minCount は呼び側 UI のホット判定で適用するため、ここでは windowHours のみ監視。
 */
watch(
  () => settings.value.hotConfig.windowHours,
  () => {
    if (!discoveryState.value) return;
    // listings は変わらず、recent 判定だけ更新するので即同期で OK
    discoveryResult.value = buildResultFromState(
      discoveryState.value,
      settings.value.hotConfig,
      settings.value.affixMode,
      settings.value.tierInferEnabled,
    );
  },
);

/**
 * Phase 1.5: prefix/suffix 区別モード変更時の再集計 watcher。
 * fetch 不要、bundle 逆引きだけなので即時 buildResultFromState 呼び直しで反映。
 */
watch(
  () => settings.value.affixMode,
  () => {
    if (!discoveryState.value) return;
    discoveryResult.value = buildResultFromState(
      discoveryState.value,
      settings.value.hotConfig,
      settings.value.affixMode,
      settings.value.tierInferEnabled,
    );
  },
);

/**
 * Phase 1.6: ティア推定 on/off 変更時の再集計 watcher。
 * fetch 不要、bundle 逆引きだけなので即時 buildResultFromState 呼び直しで反映。
 */
watch(
  () => settings.value.tierInferEnabled,
  () => {
    if (!discoveryState.value) return;
    discoveryResult.value = buildResultFromState(
      discoveryState.value,
      settings.value.hotConfig,
      settings.value.affixMode,
      settings.value.tierInferEnabled,
    );
  },
);

/**
 * Phase 1 manual-controls.md §1: 価格レンジ変更時の累積データ破棄。
 * 価格帯が違う listing が混在すると中央値が汚染されるためレンジ確定時に reset。
 * UI 側でレンジを変えただけでは破棄せず、「適用」ボタンで明示破棄する設計（誤操作回避）。
 */
async function applyPriceRangeReset(): Promise<void> {
  // dialog を出してから破棄するのは UI 側に任せる（confirmPriceRangeReset 経由）。
  await performReset();
}

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

// 既存項目: settings 経由（localStorage 自動 sync）
const minCountThreshold = computed<number>({
  get: () => settings.value.minCountThreshold,
  set: (v) => (settings.value.minCountThreshold = v),
});
const topNDisplay = computed<number>({
  get: () => settings.value.topNDisplay,
  set: (v) => (settings.value.topNDisplay = v),
});
const freshHotPct = computed<number>({
  get: () => settings.value.freshHotPct,
  set: (v) => (settings.value.freshHotPct = v),
});
const freshWarmPct = computed<number>({
  get: () => settings.value.freshWarmPct,
  set: (v) => (settings.value.freshWarmPct = v),
});
const freshColdPct = computed<number>({
  get: () => settings.value.freshColdPct,
  set: (v) => (settings.value.freshColdPct = v),
});

const freshHotThreshold = computed(() => freshHotPct.value / 100);
const freshWarmThreshold = computed(() => freshWarmPct.value / 100);
const freshColdThreshold = computed(() => freshColdPct.value / 100);

// Phase 1.5: prefix/suffix 区別モード（"split" 時のみ UI でバッジ表示）
const affixMode = computed<AffixMode>({
  get: () => settings.value.affixMode,
  set: (v: AffixMode) => (settings.value.affixMode = v),
});
const affixSplitEnabled = computed(() => affixMode.value === "split");

// Phase 1.6: ティア推定 on/off
const tierInferEnabled = computed<boolean>({
  get: () => settings.value.tierInferEnabled,
  set: (v: boolean) => (settings.value.tierInferEnabled = v),
});

/**
 * Phase 1.6: クラスタ全体の最低 tier ラベル。
 * 各 mod の minTier の **最大値**（= 最も弱い tier 保証）を採用、"T3+" 形式で返す。
 * 全 mod が推定不能なら null（バッジ非表示）。
 */
function clusterMinTierLabel(c: ClusterCount): string | null {
  if (!c.modTiers || c.modTiers.length === 0) return null;
  let worst: number | null = null;
  for (const t of c.modTiers) {
    if (t.minTier === null) continue;
    if (worst === null || t.minTier > worst) worst = t.minTier;
  }
  return worst === null ? null : `T${worst}+`;
}

/**
 * Phase 1.6: 個別 mod の tier ラベル（"T2+" / "T?" / 非表示）。
 * - 推定不能 (tier=null) で family ヒットあり (tierTotal>0) なら "T?"
 * - family 非ヒット (tierTotal=0) は何も返さない（バッジ非表示）
 */
function modTierLabel(c: ClusterCount, j: number): string | null {
  const t = c.modTiers?.[j];
  if (!t) return null;
  if (t.minTier !== null) return `T${t.minTier}+`;
  if (t.tierTotal > 0) return "T?";
  return null;
}

/** Phase 1.6: 個別 mod tier の詳細 tooltip */
function modTierTooltip(c: ClusterCount, j: number): string {
  const t = c.modTiers?.[j];
  if (!t) return "";
  if (t.minTier !== null) {
    const totalSuffix = t.tierTotal > 0 ? ` / 全 ${t.tierTotal} tier` : "";
    const valueSuffix =
      t.minValue !== null ? ` / 下限値 ${t.minValue}` : "";
    return `cluster 内 全 listing がこの mod を T${t.minTier} 以上で持つ${totalSuffix}${valueSuffix}`;
  }
  if (t.tierTotal > 0) {
    return `tier 推定不能（magnitude 取得失敗、family ${t.tierTotal} tier）`;
  }
  return "tier 推定不能（bundle 非ヒット mod）";
}

// Phase 1 manual-controls.md §3: ホット件数閾値を呼び側で適用するための computed
const hotMinCount = computed(() => settings.value.hotConfig.minCount);
const hotWindowHours = computed(() => settings.value.hotConfig.windowHours);

// サンプル不足判定（オーナー指示 2026-05-21 残課題 #7: <5 件で警告 + 続行可）
const SAMPLE_LOW_THRESHOLD = 5;
const isSampleLow = computed(() => {
  if (!discoveryResult.value) return false;
  return discoveryResult.value.totalListings < SAMPLE_LOW_THRESHOLD;
});

/** 全テスト設定をデフォルトに戻す（composable 経由、localStorage も更新） */
function resetTestSettings() {
  resetAllSettings();
}

/**
 * Phase 1 manual-controls.md §2: 1000 件選択時の警告モーダル制御。
 * 直接 settings.targetCount を書き換える代わりに pending として保留 → 確認後反映。
 */
function selectTargetCountPreset(preset: number, requiresWarn: boolean): void {
  if (requiresWarn && preset >= TARGET_COUNT_WARN_THRESHOLD) {
    pendingTargetCount.value = preset;
    showTargetCountWarn.value = true;
    return;
  }
  settings.value.targetCount = preset;
}
function confirmTargetCountWarn(): void {
  if (pendingTargetCount.value !== null) {
    settings.value.targetCount = pendingTargetCount.value;
  }
  showTargetCountWarn.value = false;
  pendingTargetCount.value = null;
}
function cancelTargetCountWarn(): void {
  showTargetCountWarn.value = false;
  pendingTargetCount.value = null;
}

/**
 * Phase 1 manual-controls.md §1: 価格レンジ変更時の累積データ強制リセット。
 * オーナー指示 (2026-05-21 残課題 #2): レンジ変更で累積破棄。
 *   - 単純化のため「価格レンジを適用してリセット」ボタンを設定パネルに置く（confirm 付き）
 *   - 値だけ動かしても自動破棄しない（誤操作回避）
 */
async function confirmAndResetForPriceRange(): Promise<void> {
  // 累積データ無しなら確認不要
  if (!discoveryState.value || discoveryState.value.allListings.length === 0) {
    return;
  }
  const ok = window.confirm(
    `価格レンジを変更すると累積データ ${discoveryState.value.allListings.length} 件は破棄されます。\n続行しますか？`,
  );
  if (!ok) return;
  await applyPriceRangeReset();
}

// 価格レンジプリセット適用 (UI ボタン)
function applyPriceRangePreset(preset: { min: number; max: number }): void {
  settings.value.priceRange = { min: preset.min, max: preset.max };
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
      priceRange: settings.value.priceRange,
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
  discoveryStartedAtMs.value = Date.now();
  discoveryAbortController = new AbortController();
  try {
    const res = await runDiscovery({
      league: currentLeague.value.Value,
      category: discoveryCategory.value,
      targetCount: discoveryTargetCount.value,
      // Phase 1 manual-controls: 価格レンジ + ホット閾値を service 層に渡す
      priceRange: settings.value.priceRange,
      hotConfig: settings.value.hotConfig,
      // Phase 1.5: prefix/suffix 集計モード
      affixMode: settings.value.affixMode,
      // Phase 1.6: ティア推定（同等以上 tier の trade2 query 拡張）
      inferTiers: settings.value.tierInferEnabled,
      prevState: discoveryState.value ?? undefined,
      signal: discoveryAbortController.signal,
      onProgress: (p) => {
        discoveryProgress.value = p;
      },
      // Phase 1.x: 800 件以上モードで重複率 70% 超え時、続行/打切りをユーザーに確認
      onDedupWarning: handleDedupWarning,
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
    discoveryStartedAtMs.value = null;
  }
}

/**
 * Phase 1.x ETA cycle bias 補正（manual-controls.md §2、残課題 #2）.
 *
 * 問題:
 *   - 旧実装は「経過時間 × 残件数 / 取得件数」の単純線形外挿
 *   - search 段階（rate limit 7s/req）と fetch 段階（10 件 batch）で速度差大
 *   - 結果、中盤で残時間が過小評価されがち
 *
 * 補正方式 = round 単位の段階モデル:
 *   - 1 round = 1 search + 最大 10 batch fetch + inter-sort sleep ≒ 11 × 7s = 77s（API time）
 *   - 完了 round 数が 1 以上なら elapsed / completedRounds を 1 round 実測時間として採用
 *   - 0 round 完了時は理論値 (~11 × SLEEP_BETWEEN_REQ_MS) で初期推定
 *   - 現在 round の進捗は fetchedThisRound / 100 から算出
 *
 * これにより search 段階で「ほぼ進まない」見かけにならず、roundsRemaining ベースで安定推定。
 */
/** 1 round = 1 search + 10 batch fetch + 1 inter-sort sleep = 12 × SLEEP_BETWEEN_REQ_MS の保守的推定 */
const ROUND_SEC_THEORETICAL = 12 * 7; // 84s（SLEEP_BETWEEN_REQ_MS=7000 と整合）

const discoveryEtaSec = computed<number | null>(() => {
  const start = discoveryStartedAtMs.value;
  const prog = discoveryProgress.value;
  if (!start || !prog) return null;
  const target = discoveryTargetCount.value;
  const fetched = prog.fetchedListings ?? 0;
  if (fetched >= target) return 0;

  const elapsedSec = (Date.now() - start) / 1000;
  if (elapsedSec < 1) return null;

  // sortsTotal は service 層が露出。未受信のあいだは ceil(target/100) で代替。
  const sortsTotal =
    prog.sortsTotal && prog.sortsTotal > 0
      ? prog.sortsTotal
      : Math.max(1, Math.ceil(target / 100));
  // searchedSorts は 0-based の「進行中 round index」。
  // fetch フェーズでは「現 round はまだ完了してない」ので、完了済 = searchedSorts.
  const roundsCompleted = Math.max(0, prog.searchedSorts ?? 0);

  // 1 round 平均所要時間: 実測 (完了 round >= 1) or 理論値
  const avgRoundSec =
    roundsCompleted >= 1
      ? elapsedSec / roundsCompleted
      : ROUND_SEC_THEORETICAL;

  // 現在 round の進捗 (0.0 - 1.0): その round 中で取った件数 / 100
  //   累積 fetched から既完了 round 分 (roundsCompleted * 100 件想定) を引いた残り。
  //   重複弾きで実際は 100 件取れない場合があるが、ETA は保守推定で OK。
  const fetchedThisRound = Math.max(
    0,
    Math.min(100, fetched - roundsCompleted * 100),
  );
  const currentRoundProgress = fetchedThisRound / 100;

  // 残り = 未完了 round 数 - 現 round 進捗
  const roundsRemaining = Math.max(
    0,
    sortsTotal - roundsCompleted - currentRoundProgress,
  );
  const remainSec = Math.ceil(avgRoundSec * roundsRemaining);
  return remainSec;
});

const discoveryFetchedListings = computed(
  () => discoveryProgress.value?.fetchedListings ?? 0,
);

function fmtEta(sec: number | null): string {
  if (sec === null) return "計算中";
  if (sec <= 0) return "間もなく完了";
  if (sec < 60) return `あと約 ${sec}s`;
  const min = Math.ceil(sec / 60);
  return `あと約 ${min} 分`;
}
</script>

<template>
  <div class="p-8 overflow-auto h-full">
    <div class="flex items-baseline justify-between mb-1">
      <h2 class="text-2xl font-semibold">🔍 クラフト発見ランキング</h2>
      <button
        @click="refresh"
        :disabled="loading"
        class="px-3 py-1.5 rounded text-xs bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 transition"
      >
        {{ loading ? "更新中…" : "🔄 リーグ更新" }}
      </button>
    </div>
    <p class="text-xs text-[var(--exile-color-text-secondary)] mb-6">
      トレード市場で同じ MOD が複数被ってる listing を集計して、いまクラフトされてる構成を可視化。
      <span v-if="currentLeague" class="ml-2">
        リーグ: <span class="text-[var(--exile-color-accent-focus)]">{{ currentLeague.Value }}</span>
      </span>
      <span v-if="lastUpdated" class="ml-2">
        最終更新: <span class="text-[var(--exile-color-text-primary)]">{{ fmtDate(lastUpdated) }}</span>
      </span>
    </p>

    <div v-if="error" class="mb-4 p-3 rounded bg-[color-mix(in_srgb,var(--exile-color-signal-error)_10%,transparent)] border border-[var(--exile-color-signal-error)] text-[var(--exile-color-signal-error)] text-xs">
      {{ error }}
    </div>

    <div class="mb-6 p-5 rounded-lg bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)]">
      <div class="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 class="text-sm uppercase tracking-wider text-[var(--exile-color-text-secondary)]">
          同 MOD 被り（ティア無視・累積取得）
        </h3>
        <div class="flex gap-2 items-center">
          <button
            @click="showTestSettings = !showTestSettings"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              showTestSettings
                ? 'bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_30%,transparent)] text-[var(--exile-color-accent-mystic)] border-[var(--exile-color-accent-mystic)]'
                : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
            title="テスト版用の開発者設定（閾値・表示件数を調整）"
          >
            ⚙ テスト設定
          </button>
          <select
            v-model="discoveryCategory"
            :disabled="discoveryLoading"
            class="text-xs px-2 py-1 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)]"
            title="Phase 1 では指輪/アミュレットのみ。Phase 2a で防具 5 種、Phase 2b で武器を追加予定。"
          >
            <option value="ring">指輪</option>
            <option value="amulet">アミュレット</option>
            <!-- Phase 1 hook: Phase 2a/2b で追加されるカテゴリを disabled でプレビュー表示 -->
            <option
              v-for="fc in FUTURE_CATEGORIES"
              :key="fc.value"
              :value="fc.value"
              disabled
            >{{ fc.label }}（Phase {{ fc.phase }} で追加予定）</option>
          </select>
          <button
            v-if="!discoveryLoading"
            @click="startDiscovery"
            :disabled="!currentLeague"
            class="px-3 py-1 rounded text-[10px] bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50"
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
            class="px-2 py-1 rounded text-[10px] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[color-mix(in_srgb,var(--exile-color-signal-error)_15%,transparent)] hover:text-[var(--exile-color-signal-error)] transition"
            title="累積データを破棄してリセット"
          >
            🗑 リセット
          </button>
          <button
            v-if="!discoveryLoading"
            @click="runSampleDiscovery"
            class="px-2 py-1 rounded text-[10px] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]"
            title="サンプル 10 件で集計ロジックを動かす（trade2 取得不要、動作確認用）"
          >
            🧪 サンプルで試す
          </button>
        </div>
      </div>

      <p
        v-if="discoveryProgress"
        class="text-xs text-[var(--exile-color-text-secondary)] font-mono mb-2"
      >
        [{{ discoveryProgress.phase }}] {{ discoveryProgress.message }}
      </p>
      <p
        v-if="discoveryError"
        class="text-xs text-[var(--exile-color-signal-error)] mb-2 font-mono whitespace-pre-wrap break-all"
      >
        {{ discoveryError }}
      </p>

      <!-- Phase 1 manual-controls.md §2: 取得中のプログレスバー + ETA + キャンセル -->
      <div
        v-if="discoveryLoading"
        class="mb-3 p-3 rounded border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-canvas)] space-y-1"
      >
        <div class="flex items-center justify-between text-[10px] font-mono">
          <span class="text-[var(--exile-color-text-secondary)]">
            取得中: <span class="text-[var(--exile-color-accent-focus)] font-semibold">{{ discoveryFetchedListings }}</span> /
            {{ discoveryTargetCount }} 件
          </span>
          <span class="text-[var(--exile-color-text-secondary)]">{{ fmtEta(discoveryEtaSec) }}</span>
        </div>
        <progress
          :value="discoveryFetchedListings"
          :max="discoveryTargetCount"
          class="w-full h-2 rounded overflow-hidden"
        />
      </div>

      <!-- Phase 1 manual-controls.md: 取得件数プリセット（300/500/800/1000、1000 は警告モーダル） -->
      <div class="mb-3 flex gap-2 items-center flex-wrap">
        <span class="text-[10px] text-[var(--exile-color-text-secondary)]">取得件数:</span>
        <div class="flex gap-1">
          <button
            v-for="preset in TARGET_COUNT_PRESETS"
            :key="preset.value"
            @click="selectTargetCountPreset(preset.value, preset.warn)"
            :disabled="discoveryLoading"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition disabled:opacity-50',
              discoveryTargetCount === preset.value
                ? 'bg-[var(--exile-color-accent-focus)] text-black border-[var(--exile-color-accent-focus)] font-semibold'
                : preset.warn
                  ? 'border-[var(--exile-color-signal-warn)] text-[var(--exile-color-signal-warn)] hover:bg-[color-mix(in_srgb,var(--exile-color-signal-warn)_15%,transparent)]'
                  : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
            :title="preset.warn ? '実験プリセット：約 15 分、全損リスクあり' : `${preset.value} 件、所要 ${Math.ceil(preset.value / 100 * 0.5)} 分前後`"
          >{{ preset.label }}</button>
        </div>
        <span class="text-[10px] text-[var(--exile-color-text-secondary)] ml-2">
          / 上限 {{ MAX_LISTINGS_PER_CYCLE }}（実装上）
        </span>
      </div>

      <!-- Phase 1 残課題 #7: サンプル不足（<5 件）で警告バナー、続行可 -->
      <div
        v-if="isSampleLow && discoveryResult"
        class="mb-3 p-2 rounded border border-[var(--exile-color-signal-warn)] bg-[color-mix(in_srgb,var(--exile-color-signal-warn)_15%,transparent)] text-[var(--exile-color-signal-warn)] text-[10px]"
      >
        ⚠ サンプル {{ discoveryResult.totalListings }} 件のみ。クラスタリングの信頼性は低めです。
        取得を追加するか価格レンジを広げると改善します。
      </div>

      <!-- Phase 1.x: dedupRate 自動打切り通知（manual-controls.md §2、残課題 #1）
           - 800 件以上モードで重複率 70% 超え時のみ発火
           - 続行 = 残 round 実行 / 打切り = 現累積で集計 -->
      <div
        v-if="showDedupWarn && dedupWarnInfo"
        class="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--exile-color-bg-canvas)_75%,transparent)]"
      >
        <div class="max-w-md p-5 rounded-lg border border-[var(--exile-color-signal-warn)] bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-text-primary)]">
          <h4 class="text-sm font-semibold mb-3 text-[var(--exile-color-signal-warn)]">
            ⚠ 重複率 {{ Math.round(dedupWarnInfo.dedupRate * 100) }}%（推奨上限 {{ Math.round(DEDUP_WARN_THRESHOLD * 100) }}%）
          </h4>
          <p class="text-xs leading-relaxed mb-3">
            これ以上取得しても新規 listing が少ない可能性があります。
          </p>
          <ul class="text-[10px] text-[var(--exile-color-text-secondary)] leading-relaxed mb-4 list-disc list-inside space-y-1">
            <li>完了 round: {{ dedupWarnInfo.roundsCompleted }} / {{ dedupWarnInfo.roundsTotal }}</li>
            <li>新規取得: {{ dedupWarnInfo.newListingsSoFar }} 件</li>
            <li>残 round: {{ dedupWarnInfo.roundsTotal - dedupWarnInfo.roundsCompleted }}（続行すると更に API 消費）</li>
          </ul>
          <div class="flex gap-2 justify-end">
            <button
              @click="confirmDedupAbort"
              class="px-3 py-1 rounded text-[10px] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]"
              title="残 round を実行せず、現時点の累積で集計"
            >打切り（現累積で集計）</button>
            <button
              @click="confirmDedupContinue"
              class="px-3 py-1 rounded text-[10px] bg-[var(--exile-color-signal-warn)] text-[var(--exile-color-bg-canvas)] font-semibold hover:opacity-90"
              title="残 round を全て実行（無駄になる可能性あり）"
            >続行（残 {{ dedupWarnInfo.roundsTotal - dedupWarnInfo.roundsCompleted }} round）</button>
          </div>
        </div>
      </div>

      <!-- Phase 1 manual-controls.md §2: 1000 件選択時の警告モーダル（オーナー指示の文言） -->
      <div
        v-if="showTargetCountWarn"
        class="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--exile-color-bg-canvas)_75%,transparent)]"
        @click.self="cancelTargetCountWarn"
      >
        <div class="max-w-md p-5 rounded-lg border border-[var(--exile-color-signal-warn)] bg-[var(--exile-color-bg-surface)] text-[var(--exile-color-text-primary)]">
          <h4 class="text-sm font-semibold mb-3 text-[var(--exile-color-signal-warn)]">
            ⚠ {{ pendingTargetCount }} 件取得の確認
          </h4>
          <p class="text-xs leading-relaxed mb-4">
            約 15 分かかります。途中キャンセル可。続行？
          </p>
          <ul class="text-[10px] text-[var(--exile-color-text-secondary)] leading-relaxed mb-4 list-disc list-inside space-y-1">
            <li>Wi-Fi 切断 / アプリ最小化 / OS スリープで全損リスク</li>
            <li>trade2 API の挙動上、実 listing 数は 600-800 件程度になることが多い</li>
          </ul>
          <div class="flex gap-2 justify-end">
            <button
              @click="cancelTargetCountWarn"
              class="px-3 py-1 rounded text-[10px] border border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]"
            >キャンセル</button>
            <button
              @click="confirmTargetCountWarn"
              class="px-3 py-1 rounded text-[10px] bg-[var(--exile-color-signal-warn)] text-[var(--exile-color-bg-canvas)] font-semibold hover:opacity-90"
            >続行（{{ pendingTargetCount }} 件取得）</button>
          </div>
        </div>
      </div>

      <div v-if="discoveryState" class="mb-3 text-[10px] text-[var(--exile-color-text-secondary)] font-mono space-y-0.5">
        <div>
          累積 <span class="text-[var(--exile-color-accent-focus)] font-semibold">{{ discoveryState.allListings.length }}</span> 件
          ／ <span class="text-[var(--exile-color-accent-focus)]">{{ discoveryState.cycleCount }}</span> サイクル
          <span v-if="discoveryResult && discoveryResult.cycleCount > 0">
            ／ 直近サイクル: +<span class="text-[var(--exile-color-signal-success)]">{{ discoveryResult.newListingsThisCycle }}</span> 新規
            <span v-if="discoveryResult.dedupRate > 0">
              ／ -<span class="text-[var(--exile-color-signal-warn)]">{{ Math.round(discoveryResult.dedupRate * 100) }}%</span> 重複弾き
            </span>
          </span>
        </div>
        <div class="text-[var(--exile-color-text-secondary)]/70">
          ※ 累積モード: 取得ボタンで +{{ discoveryTargetCount }} 件追加（同じ listing は弾く）。即売れ判定は前サイクルの listing が今サイクルで消えてるかで測定。
        </div>
      </div>

      <div
        v-if="discoveryResult"
        class="mb-3 text-[10px] text-[var(--exile-color-text-secondary)] font-mono flex flex-wrap gap-x-4 gap-y-1"
      >
        <span v-for="n in CLUSTER_SIZES" :key="n">
          {{ n }}mod 被り <span class="text-[var(--exile-color-accent-focus)]">{{ discoveryResult.clustersBySize[n].length }}</span> 種
        </span>
        <span>空 mod {{ fmtPct(discoveryResult.emptyModRate) }}</span>
        <span v-if="discoveryResult.failedSorts.length">
          失敗 sort: <span class="text-[var(--exile-color-signal-error)]">{{ discoveryResult.failedSorts.join(", ") }}</span>
        </span>
      </div>

      <div
        v-if="showTestSettings"
        class="mb-3 p-3 rounded border border-[var(--exile-color-accent-mystic)] bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_15%,transparent)] space-y-3"
      >
        <div class="flex items-baseline justify-between mb-1">
          <span class="text-[11px] font-semibold text-[var(--exile-color-accent-mystic)]">⚙ テスト設定（開発者用、Phase 1 manual-controls）</span>
          <button
            @click="resetTestSettings"
            class="text-[10px] px-2 py-0.5 rounded border border-[var(--exile-color-accent-mystic)] text-[var(--exile-color-accent-mystic)] hover:bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_25%,transparent)]"
            title="価格レンジ / 取得件数 / ホット閾値 / 既存項目すべてを default に戻す（localStorage も更新）"
          >
            🔄 デフォルトに戻す
          </button>
        </div>

        <!-- Phase 1 §1: 価格レンジ（divine 固定、min/max + プリセット 4 種） -->
        <section class="p-2 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] space-y-2">
          <div class="text-[10px] font-semibold text-[var(--exile-color-accent-focus)]">💰 価格レンジ（divine 固定）</div>
          <div class="flex items-center gap-2 flex-wrap text-[10px]">
            <label class="flex items-center gap-1">
              <span class="text-[var(--exile-color-text-secondary)]">min</span>
              <input
                type="number"
                v-model.number="settings.priceRange.min"
                :min="1"
                :max="1999"
                :step="1"
                class="w-20 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] font-mono"
              />
            </label>
            <span class="text-[var(--exile-color-text-secondary)]">–</span>
            <label class="flex items-center gap-1">
              <span class="text-[var(--exile-color-text-secondary)]">max</span>
              <input
                type="number"
                v-model.number="settings.priceRange.max"
                :min="2"
                :max="2000"
                :step="1"
                class="w-20 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-surface)] border border-[var(--exile-color-border-subtle)] font-mono"
              />
            </label>
            <span class="text-[var(--exile-color-text-secondary)]">div</span>
            <div class="flex gap-1 ml-2">
              <button
                v-for="preset in PRICE_RANGE_PRESETS"
                :key="preset.label"
                @click="applyPriceRangePreset(preset)"
                :class="[
                  'px-2 py-0.5 rounded text-[10px] border transition',
                  settings.priceRange.min === preset.min && settings.priceRange.max === preset.max
                    ? 'bg-[var(--exile-color-accent-focus)] text-black border-[var(--exile-color-accent-focus)] font-semibold'
                    : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
                ]"
              >{{ preset.label }} {{ preset.min }}-{{ preset.max }}</button>
            </div>
            <button
              @click="confirmAndResetForPriceRange"
              :disabled="!discoveryState || discoveryState.allListings.length === 0"
              class="ml-auto px-2 py-0.5 rounded text-[10px] border border-[var(--exile-color-signal-warn)] text-[var(--exile-color-signal-warn)] hover:bg-[color-mix(in_srgb,var(--exile-color-signal-warn)_15%,transparent)] disabled:opacity-40 disabled:cursor-not-allowed"
              title="価格レンジ変更を反映して累積データをリセット（オーナー指示 2026-05-21）"
            >🔄 適用してリセット</button>
          </div>
          <p class="text-[9px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            ※ Phase 1 は divine 固定（chaos/exalt 切替は残課題 #1）。レンジ変更後は「適用してリセット」で累積データを破棄。
          </p>
        </section>

        <!-- Phase 1 §2: 取得件数（ヘッダー外のプリセットボタンと連動、ここでは設定説明） -->
        <section class="p-2 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] space-y-1">
          <div class="text-[10px] font-semibold text-[var(--exile-color-accent-focus)]">📥 取得件数</div>
          <p class="text-[10px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            現在の選択: <span class="text-[var(--exile-color-text-primary)] font-semibold">{{ discoveryTargetCount }}</span> 件。
            上の取得件数プリセットボタンで変更可。1000 件は警告モーダル付き（約 15 分）。
          </p>
        </section>

        <!-- Phase 1 §3: ホット判定（時間窓 radio + 件数 slider） -->
        <section class="p-2 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] space-y-2">
          <div class="text-[10px] font-semibold text-[var(--exile-color-accent-focus)]">🔥 ホット判定（再 fetch 不要、即時再計算）</div>
          <div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span class="text-[var(--exile-color-text-secondary)]">時間窓:</span>
            <div class="flex gap-1">
              <label
                v-for="h in HOT_WINDOW_HOURS"
                :key="h"
                :class="[
                  'px-2 py-0.5 rounded border transition cursor-pointer',
                  settings.hotConfig.windowHours === h
                    ? 'bg-[var(--exile-color-accent-hot)] text-[var(--exile-color-text-primary)] border-[var(--exile-color-accent-hot)] font-semibold'
                    : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
                ]"
              >
                <input
                  type="radio"
                  :value="h"
                  v-model="settings.hotConfig.windowHours"
                  class="hidden"
                />
                {{ h }}h
              </label>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span class="text-[var(--exile-color-text-secondary)] w-24">件数閾値:</span>
            <input
              type="range"
              v-model.number="settings.hotConfig.minCount"
              :min="5"
              :max="50"
              :step="5"
              class="flex-1 max-w-xs"
            />
            <span class="text-[var(--exile-color-text-primary)] font-mono font-semibold w-14 text-right">{{ settings.hotConfig.minCount }} 件</span>
            <span class="text-[var(--exile-color-text-secondary)]/60">(5-50, step 5)</span>
          </div>
          <p class="text-[9px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            ※ 直近 {{ hotWindowHours }}h 内に {{ hotMinCount }} 件以上の新規出品があるクラスタに 🔥 ホット印。スライダー変更で即時再計算。
          </p>
        </section>

        <!-- Phase 1 §4: カテゴリ拡張 hook（Phase 2a/2b で実装、Phase 1 ではプレビューのみ） -->
        <section class="p-2 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] space-y-1 opacity-70">
          <div class="text-[10px] font-semibold text-[var(--exile-color-text-secondary)]">🛡 カテゴリ拡張（Phase 2 で追加予定）</div>
          <ul class="text-[10px] text-[var(--exile-color-text-secondary)] leading-relaxed list-disc list-inside space-y-0.5">
            <li v-for="fc in FUTURE_CATEGORIES" :key="fc.value">
              {{ fc.label }} - Phase {{ fc.phase }}
              <span class="text-[var(--exile-color-text-secondary)]/60">（正規化マップ拡張 + categoryToOption 追加で対応）</span>
            </li>
          </ul>
          <p class="text-[9px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            ※ Phase 1 ではカテゴリ select の disabled プレビューのみ。実装優先順は 2a: ベルト→グローブ→ヘルム、2b: 武器。
          </p>
        </section>

        <!-- Phase 1.6 §6: ティア推定トグル（再 fetch 不要、bundle 逆引き、trade2 query 拡張） -->
        <section class="p-2 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] space-y-2">
          <div class="text-[10px] font-semibold text-[var(--exile-color-accent-focus)]">🎯 ティア推定（Phase 1.6）</div>
          <div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span class="text-[var(--exile-color-text-secondary)]">tier 表示 + 同等以上検索:</span>
            <div class="flex gap-1">
              <button
                @click="tierInferEnabled = true"
                :class="[
                  'px-2 py-0.5 rounded border transition',
                  tierInferEnabled
                    ? 'bg-[var(--exile-color-accent-focus)] text-black border-[var(--exile-color-accent-focus)] font-semibold'
                    : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
                ]"
                title="クラスタ各 mod に最低 tier (Tn+) を表示し、trade2 検索時にその tier 以上の listing を絞る"
              >On</button>
              <button
                @click="tierInferEnabled = false"
                :class="[
                  'px-2 py-0.5 rounded border transition',
                  !tierInferEnabled
                    ? 'bg-[var(--exile-color-text-secondary)] text-[var(--exile-color-bg-canvas)] border-[var(--exile-color-text-secondary)] font-semibold'
                    : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
                ]"
                title="ティア推定 off（観測 stat min のみで trade2 検索、従来動作）"
              >Off</button>
            </div>
          </div>
          <p class="text-[9px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            ※ bundle text_en family 内で listing の magnitude を range 突合し tier 番号 (1=最強) 推定。trade2 検索は「同等以上 tier」で同流派 listing がずらっと並ぶ（POE2 オーバーレイ流儀の再現）。
          </p>
        </section>

        <!-- Phase 1.5 §5: prefix/suffix 区別トグル（再 fetch 不要、bundle 逆引き集計） -->
        <section class="p-2 rounded border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-canvas)] space-y-2">
          <div class="text-[10px] font-semibold text-[var(--exile-color-accent-focus)]">🏷 prefix/suffix 区別（Phase 1.5）</div>
          <div class="flex items-center gap-2 flex-wrap text-[10px]">
            <span class="text-[var(--exile-color-text-secondary)]">集計モード:</span>
            <div class="flex gap-1">
              <button
                @click="affixMode = 'split'"
                :class="[
                  'px-2 py-0.5 rounded border transition',
                  affixMode === 'split'
                    ? 'bg-[var(--exile-color-accent-focus)] text-black border-[var(--exile-color-accent-focus)] font-semibold'
                    : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
                ]"
                title="各 mod に P/S バッジを付け、クラスタごとに prefix 数 + suffix 数を表示"
              >P / S 区別 On</button>
              <button
                @click="affixMode = 'merged'"
                :class="[
                  'px-2 py-0.5 rounded border transition',
                  affixMode === 'merged'
                    ? 'bg-[var(--exile-color-text-secondary)] text-[var(--exile-color-bg-canvas)] border-[var(--exile-color-text-secondary)] font-semibold'
                    : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
                ]"
                title="バッジ非表示・構成表示なし（従来動作）"
              >Off (merged)</button>
            </div>
          </div>
          <p class="text-[9px] text-[var(--exile-color-text-secondary)] leading-relaxed">
            ※ mods-bundle.json から構築した text→affix Map (prefix 1324 / suffix 1268) で逆引き判定。曖昧 mod（同 text で両用）は 7 件のみ「不明」灰色。
          </p>
        </section>

        <!-- 既存項目: 表示制御（minCountThreshold / topNDisplay / freshHot/Warm/Cold） -->
        <div class="text-[10px] font-semibold text-[var(--exile-color-accent-mystic)]">⚙ 表示制御（既存項目）</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
          <label class="flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)] w-40">表示の最低件数</span>
            <input
              type="number"
              v-model.number="minCountThreshold"
              :min="1"
              :max="50"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] font-mono"
            />
            <span class="text-[var(--exile-color-text-secondary)]/60">件以上のクラスタを表示</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)] w-40">表示件数</span>
            <input
              type="number"
              v-model.number="topNDisplay"
              :min="5"
              :max="200"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] font-mono"
            />
            <span class="text-[var(--exile-color-text-secondary)]/60">上位 N 件</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)] w-40">🔥 新鮮率「ホット」閾値</span>
            <input
              type="number"
              v-model.number="freshHotPct"
              :min="50"
              :max="100"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] font-mono"
            />
            <span class="text-[var(--exile-color-text-secondary)]/60">% 以上で赤表示</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)] w-40">🟡 新鮮率「ぬるい」閾値</span>
            <input
              type="number"
              v-model.number="freshWarmPct"
              :min="20"
              :max="70"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] font-mono"
            />
            <span class="text-[var(--exile-color-text-secondary)]/60">% 以上でアンバー</span>
          </label>
          <label class="flex items-center gap-2">
            <span class="text-[var(--exile-color-text-secondary)] w-40">🟠 新鮮率「冷たい」閾値</span>
            <input
              type="number"
              v-model.number="freshColdPct"
              :min="0"
              :max="40"
              :step="5"
              class="w-16 px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] font-mono"
            />
            <span class="text-[var(--exile-color-text-secondary)]/60">% 以上でオレンジ（未満は灰）</span>
          </label>
        </div>
        <p class="text-[9px] text-[var(--exile-color-text-secondary)] mt-2 leading-relaxed">
          ※ これらは本番ユーザーには見せない予定。配布版では「自動で最適表示」になる想定。
          いまは開発検証用に開放中。
        </p>
      </div>

      <div class="flex gap-2 mb-3 flex-wrap items-center">
        <span class="text-[10px] text-[var(--exile-color-text-secondary)]">被り mod 数:</span>
        <div class="flex gap-1">
          <button
            v-for="n in CLUSTER_SIZES"
            :key="n"
            @click="clusterSize = n"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition min-w-[44px]',
              clusterSize === n
                ? 'bg-[var(--exile-color-accent-focus)] text-black border-[var(--exile-color-accent-focus)] font-semibold'
                : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
          >
            {{ n }} mod
          </button>
        </div>
        <span class="text-[10px] text-[var(--exile-color-text-secondary)] ml-3">並び順:</span>
        <div class="flex gap-1">
          <button
            @click="sortMode = 'fresh'"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              sortMode === 'fresh'
                ? 'bg-[var(--exile-color-accent-hot)] text-[var(--exile-color-text-primary)] border-[var(--exile-color-accent-hot)] font-semibold'
                : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
            :title="`新鮮率（直近 ${hotWindowHours}h ÷ 累積）が高い構成を優先 = 古い在庫が無く、市場が回ってる ≒ 売れてる`"
          >
            🔥 新鮮率
          </button>
          <button
            @click="sortMode = 'recent'"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              sortMode === 'recent'
                ? 'bg-[var(--exile-color-signal-success)] text-[var(--exile-color-bg-canvas)] border-[var(--exile-color-signal-success)] font-semibold'
                : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
            :title="`直近 ${hotWindowHours}h 以内に出品された listing が多い構成を優先（絶対数の新鮮さ）`"
          >
            🆕 直近 {{ hotWindowHours }}h
          </button>
          <button
            @click="sortMode = 'count'"
            :class="[
              'px-2 py-1 rounded text-[10px] border transition',
              sortMode === 'count'
                ? 'bg-[var(--exile-color-accent-focus)] text-black border-[var(--exile-color-accent-focus)] font-semibold'
                : 'border-[var(--exile-color-border-subtle)] text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)]',
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
        <BaseCard
          as="li"
          v-for="(c, i) in discoveryClusterRanking"
          :key="c.clusterHash"
          @click="openCluster(c)"
          class="cursor-pointer"
          :class="{ 'opacity-60 cursor-wait': openingClusterHash === c.clusterHash }"
          :title="`クリックで trade2 サイトを開く（${clusterSize} mod フィルタ入り）`"
        >
          <HotSeal
            v-if="c.freshRate >= freshHotThreshold || c.recentCount >= hotMinCount"
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
              :title="`新鮮率 = 直近 ${hotWindowHours}h (${c.recentCount}件) / 累積 (${c.count}件) → 高いほど「売れて回ってる」傾向`"
            >
              🔥 {{ Math.round(c.freshRate * 100) }}%
            </span>
            <span
              class="px-1.5 py-0.5 rounded text-[var(--exile-color-text-secondary)]"
              :title="`直近 ${hotWindowHours}h 以内に新規出品された listing 数`"
            >
              🆕 {{ c.recentCount }} / {{ c.count }}
            </span>
            <!-- Phase 1.6: クラスタ全体の最低 tier 表示（worst-mod の minTier、tier 番号は大きいほど弱い） -->
            <span
              v-if="tierInferEnabled && clusterMinTierLabel(c)"
              class="px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-tertiary)] font-mono font-semibold"
              :title="`クラスタ内全 listing が保証する最低 tier。trade2 検索もこの tier 以上で絞る（オーバーレイ流儀の再現）`"
            >🎯 {{ clusterMinTierLabel(c) }}</span>
            <!-- Phase 1.5: クラスタ構成 (prefix N + suffix N + ?) -->
            <span
              v-if="affixSplitEnabled"
              class="px-1.5 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] flex items-center gap-1"
              :title="`Phase 1.5 prefix/suffix 区別: bundle 逆引きで判定。? = 曖昧 mod（bundle 非ヒット or text 重複）`"
            >
              <span
                v-if="c.prefixCount > 0"
                class="text-[var(--exile-color-text-link)] font-semibold"
              >P{{ c.prefixCount }}</span>
              <span
                v-if="c.prefixCount > 0 && c.suffixCount > 0"
                class="text-[var(--exile-color-text-secondary)]/60"
              >+</span>
              <span
                v-if="c.suffixCount > 0"
                class="text-[var(--exile-color-accent-mystic)] font-semibold"
              >S{{ c.suffixCount }}</span>
              <span
                v-if="c.affixUnknownCount > 0"
                class="text-[var(--exile-color-text-secondary)]"
                :title="`affix 不明 ${c.affixUnknownCount} 件（bundle 非ヒット or 曖昧 text）`"
              > ?{{ c.affixUnknownCount }}</span>
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
              class="text-[13px] text-[var(--exile-color-text-link)] leading-relaxed flex items-center justify-center gap-1.5"
              :title="c.modKeys[j]"
            >
              <!-- Phase 1.5: 個別 mod の prefix/suffix バッジ
                   - prefix: text-link (青寄り) / suffix: accent-mystic (紫) / unknown: text-secondary 灰 -->
              <span
                v-if="affixSplitEnabled && c.affixTypes && c.affixTypes[j]"
                :class="[
                  'inline-block px-1 rounded text-[9px] font-bold leading-none align-middle',
                  c.affixTypes[j] === 'prefix'
                    ? 'bg-[color-mix(in_srgb,var(--exile-color-text-link)_25%,transparent)] text-[var(--exile-color-text-link)]'
                    : c.affixTypes[j] === 'suffix'
                      ? 'bg-[color-mix(in_srgb,var(--exile-color-accent-mystic)_25%,transparent)] text-[var(--exile-color-accent-mystic)]'
                      : 'bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-secondary)]'
                ]"
                :title="c.affixTypes[j] === 'prefix' ? 'プレフィックス' : c.affixTypes[j] === 'suffix' ? 'サフィックス' : 'affix 不明（bundle 非ヒット or 曖昧）'"
              >{{ c.affixTypes[j] === 'prefix' ? 'P' : c.affixTypes[j] === 'suffix' ? 'S' : '?' }}</span>
              <span>{{ raw }}</span>
              <!-- Phase 1.6: 各 mod の tier 情報併記（family 不明な mod は何も表示しない、推定不能は T?） -->
              <span
                v-if="tierInferEnabled && modTierLabel(c, j)"
                class="inline-block px-1 rounded text-[10px] font-mono leading-none align-middle text-[var(--exile-color-text-tertiary)] bg-[var(--exile-color-bg-canvas)]"
                :title="modTierTooltip(c, j)"
              >{{ modTierLabel(c, j) }}</span>
            </div>
          </div>

          <div class="px-3 py-1 bg-[var(--exile-color-bg-surface)] border-t border-[var(--exile-color-border-subtle)] text-center text-[10px] text-[var(--exile-color-text-secondary)] font-mono">
            モッド {{ c.modKeys.length }} 個（{{ clusterSize }} mod 一致グループ）
          </div>
        </BaseCard>
      </ol>

      <p
        v-else-if="discoveryResult"
        class="text-xs text-[var(--exile-color-text-secondary)] italic py-4"
      >
        該当する被り（出現 {{ minCountThreshold }}+）がありませんでした。クラスタサイズを下げる or 取得し直してみてください。
      </p>
      <p
        v-else
        class="text-xs text-[var(--exile-color-text-secondary)] italic py-4"
      >
        取得ボタンを押すと 3 ソート × 最大 100 件 = 最大 300 件を集計します（約 4 分、trade2 rate limit 厳守）。
      </p>

      <p class="text-[10px] text-[var(--exile-color-text-secondary)] mt-3 leading-relaxed">
        <strong>🔥 即売れ率</strong>: 前回 snapshot から今回までに **listing が消えた割合**。50%+ = 即売れ ✅ / 20-50% = 普通 / 20% 未満 = 売れ残り傾向。<br />
        <strong>クラスタ N mod 被り</strong>: listing 同士で N 個の mod が一致するグループ（C(6,N) 組合せ全列挙）。N=1 で単一 mod、N=6 で完全一致。<br />
        <strong>同 mod 判定</strong>: トレード表示の mod text から数値（ティア）を除去した文字列で一致判定。DB 不使用、表示文字列そのままで突合。<br />
        <strong>集計対象</strong>: explicit mod のみ（暗黙 / 刻印 / クラフト / ルーン除外）。「ダメージをアタックに追加する」系は属性問わず束ねて 1 mod 扱い。
      </p>
    </div>
  </div>
</template>
