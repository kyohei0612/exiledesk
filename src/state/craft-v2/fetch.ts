/**
 * MOD 一覧の取得制御: 起動 / 更新 / 全取得 / リーグ再取得、バックグラウンド更新の据え置きロジック
 *
 * craft-v2-store.ts から切り出し (2026-09-07)。
 *
 * 2026-05-23 オーナー指示「シームレスの徹底」:
 *   App.vue の onMounted で `ensureCraftV2Started()` を呼ぶことで、アプリ起動直後に
 *   バックグラウンドで fetch が走り始める。画面はマウント時に同じ関数を呼ぶだけ (冪等)。
 *
 * 2026-06-28 バックグラウンド更新:
 *   2回目以降 (更新 / 自動再取得 / 再起動時のキャッシュ表示後) は UI を前回データのまま
 *   据え置き、各アセンダンシーの取得が完了するたびにその 1 つだけを差し替える。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { AggregatedAscendancy } from "../../services/craft-v2/types";
import { clearCraftV2Cache } from "../../services/craft-v2/cache";
import { fetchEconomyLeagues, startCraftDiscoveryV2 } from "../../services/craft-v2/runner";
import { craftV2Store, formatHms, nowMs, pushWarn } from "./store";
import { checkDictionaryFreshness, runHealthCheck } from "./health";

interface NetworkStatusRaw {
  global_penalty_waiting: boolean;
  global_penalty_remaining_secs: number;
  global_penalty_reason: string | null;
  active_retry_count: number;
  last_retry_reason: string | null;
  last_retry_remaining_secs: number;
}

// store の外側に置く mutable refs (UnlistenFn / Timer は reactive 化不要)
let unlistenRef: UnlistenFn | null = null;
let networkStatusPoller: ReturnType<typeof setInterval> | null = null;
let autoRefetchUnlisten: UnlistenFn | null = null;
let nowTicker: ReturnType<typeof setInterval> | null = null;

/** バックグラウンド更新中、未完了アセンダンシーの最新集計を一時保持 (完了時に表示へ swap) */
const bgStaging = new Map<string, AggregatedAscendancy>();

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------
function startNowTicker(): void {
  if (nowTicker) clearInterval(nowTicker);
  nowTicker = setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
}
function stopNowTicker(): void {
  if (nowTicker) clearInterval(nowTicker);
  nowTicker = null;
}

function startNetworkStatusPoller(): void {
  if (networkStatusPoller) clearInterval(networkStatusPoller);
  networkStatusPoller = setInterval(async () => {
    try {
      const s = await invoke<NetworkStatusRaw>("get_network_status");
      if (s.global_penalty_waiting || s.active_retry_count > 0) {
        craftV2Store.networkStatus = {
          globalPenaltyWaiting: s.global_penalty_waiting,
          globalPenaltyRemainingSecs: s.global_penalty_remaining_secs,
          globalPenaltyReason: s.global_penalty_reason,
          activeRetryCount: s.active_retry_count,
          lastRetryReason: s.last_retry_reason,
          lastRetryRemainingSecs: s.last_retry_remaining_secs,
        };
      } else {
        craftV2Store.networkStatus = null;
      }
    } catch {
      // command 未登録時 (旧バイナリ等) は静かに無視
    }
  }, 1000);
}
function stopNetworkStatusPoller(): void {
  if (networkStatusPoller) clearInterval(networkStatusPoller);
  networkStatusPoller = null;
  craftV2Store.networkStatus = null;
}

function stopProgressUi(): void {
  craftV2Store.currentlyFetching = null;
  craftV2Store.currentPhase = null;
  stopNowTicker();
  stopNetworkStatusPoller();
}

// ---------------------------------------------------------------------------
// アセンダンシーの反映
// ---------------------------------------------------------------------------
/** バックグラウンド更新の「完了アセンダンシーだけ差し替える」用。進捗 state は触らない。 */
function swapAscendancy(agg: AggregatedAscendancy): void {
  const idx = craftV2Store.ascendancies.findIndex((a) => a.id === agg.id);
  if (idx >= 0) craftV2Store.ascendancies.splice(idx, 1, agg);
  else craftV2Store.ascendancies.push(agg);
}

function mergeAscendancy(agg: AggregatedAscendancy): void {
  swapAscendancy(agg);
  const fp = agg.fetchProgress;
  if (fp && fp.total > 0 && fp.done < fp.total) {
    craftV2Store.currentlyFetching = agg.name;
  } else if (craftV2Store.currentlyFetching === agg.name) {
    craftV2Store.currentlyFetching = null;
  }
}

// ---------------------------------------------------------------------------
// 取得のコア
// ---------------------------------------------------------------------------
async function runFetch(useCache: boolean, opts?: { background?: boolean; bgWhenCached?: boolean }): Promise<void> {
  if (unlistenRef) {
    try {
      unlistenRef();
    } catch {
      /* noop */
    }
    unlistenRef = null;
  }

  // 既存データがある場合のみバックグラウンド更新 (据え置き) が有効
  const background = opts?.background === true && craftV2Store.ascendancies.length > 0;
  // 初回ロードでもキャッシュが表示できたら以降をバックグラウンド更新へ切替える (リーグ切替には適用しない)
  const bgWhenCached = opts?.bgWhenCached === true;
  bgStaging.clear();

  if (background) {
    craftV2Store.loading = true;
    craftV2Store.backgroundRefresh = true;
    craftV2Store.fatalError = null;
    craftV2Store.currentlyFetching = null;
    craftV2Store.currentPhase = null;
  } else {
    craftV2Store.ascendancies = [];
    craftV2Store.loading = true;
    craftV2Store.backgroundRefresh = false;
    craftV2Store.fatalError = null;
    craftV2Store.snapshot = null;
    craftV2Store.lastUpdatedAt = null;
    craftV2Store.currentlyFetching = null;
    craftV2Store.currentPhase = null;
    craftV2Store.showingFromCache = false;
    craftV2Store.cacheItemCount = 0;
    startNowTicker();
    startNetworkStatusPoller();
  }

  const un = await startCraftDiscoveryV2({
    topNAscendancies: 10,
    topNPerAscendancy: 50,
    useCache,
    leagueUrl: craftV2Store.selectedLeagueUrl || undefined,
    onCacheReady: (cachedAggs, cache) => {
      if (craftV2Store.backgroundRefresh) return; // 据え置き中はキャッシュで上書きしない
      craftV2Store.ascendancies = [...cachedAggs];
      craftV2Store.showingFromCache = true;
      craftV2Store.cacheItemCount = cachedAggs.length;
      craftV2Store.snapshot = {
        league_url: cache.league_url,
        snapshot_name: cache.snapshot_name,
        version: cache.snapshot_version,
      };
      if (cache.saved_at) {
        craftV2Store.lastUpdatedAt = formatHms(new Date(cache.saved_at * 1000)) + " (キャッシュ)";
      }
      if (bgWhenCached && cachedAggs.length > 0) {
        craftV2Store.backgroundRefresh = true;
        craftV2Store.showingFromCache = false;
        bgStaging.clear();
        stopNowTicker();
        stopNetworkStatusPoller();
      }
    },
    onProgress: (agg) => {
      if (craftV2Store.backgroundRefresh) {
        // 据え置き: 完了したアセンダンシーだけ差し替え、途中経過は staging に溜める
        bgStaging.set(agg.id, agg);
        const fp = agg.fetchProgress;
        if (fp && fp.total > 0 && fp.done >= fp.total) {
          swapAscendancy(agg);
          bgStaging.delete(agg.id);
        }
        return;
      }
      if (craftV2Store.showingFromCache) {
        craftV2Store.showingFromCache = false;
        craftV2Store.lastUpdatedAt = "差分取得中…";
      }
      mergeAscendancy(agg);
    },
    onError: (msg) => {
      pushWarn("warn", msg, "craft-fetch");
      craftV2Store.currentlyFetching = null;
    },
    onDone: (snap) => {
      if (craftV2Store.backgroundRefresh) {
        for (const agg of bgStaging.values()) swapAscendancy(agg);
        bgStaging.clear();
      }
      craftV2Store.snapshot = snap;
      craftV2Store.loading = false;
      craftV2Store.backgroundRefresh = false;
      craftV2Store.lastUpdatedAt = formatHms(new Date());
      craftV2Store.showingFromCache = false;
      stopProgressUi();
    },
    onFatal: (msg) => {
      if (craftV2Store.backgroundRefresh) {
        // 据え置きデータを壊さず警告に留める
        pushWarn("warn", "バックグラウンド更新に失敗しました: " + msg, "craft-fetch");
        craftV2Store.loading = false;
        craftV2Store.backgroundRefresh = false;
        bgStaging.clear();
        stopProgressUi();
        return;
      }
      craftV2Store.fatalError = msg;
      craftV2Store.loading = false;
      craftV2Store.showingFromCache = false;
      stopProgressUi();
    },
    onCharacterProgress: (info) => {
      if (craftV2Store.backgroundRefresh) {
        // completed を「アセンダンシー取得完了」シグナルとして使い staging を swap
        // (progress の done>=total は部分失敗だと立たないため、必ず 1 回出る completed を主トリガにする)
        if (info.phase === "completed") {
          const id = info.ascendancy.toLowerCase().replace(/\s+/g, "-");
          const staged = bgStaging.get(id);
          if (staged) {
            swapAscendancy(staged);
            bgStaging.delete(id);
          }
        }
        return;
      }
      if (info.phase === "completed") {
        if (craftV2Store.currentPhase?.ascendancy === info.ascendancy) {
          craftV2Store.currentPhase = null;
        }
      } else {
        craftV2Store.currentPhase = info;
      }
    },
  });
  unlistenRef = un;
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 起動時 / 画面マウント時に呼ばれる冪等な起動エントリ。
 * 起動済み / 取得中 / データ取得済 のいずれかなら何もしない。
 */
export async function ensureCraftV2Started(): Promise<void> {
  if (craftV2Store.initialBootStarted) return;
  if (craftV2Store.loading) return;
  if (craftV2Store.ascendancies.length > 0 && !craftV2Store.fatalError) return;
  craftV2Store.initialBootStarted = true;

  // リーグ一覧 fetch 等を await する数秒間に空状態 UI がフラッシュしないよう先に loading を立てる
  craftV2Store.loading = true;

  // 自動再取得 event listener を 1 度だけ仕込む (Rust 側スケジューラが emit)。取得中はスキップ。
  if (!autoRefetchUnlisten) {
    try {
      autoRefetchUnlisten = await listen<void>("craft-v2-auto-refetch", () => {
        if (craftV2Store.loading) {
          console.log("[craft-v2-store] auto-refetch skipped (fetch already in progress)");
          return;
        }
        console.log("[craft-v2-store] auto-refetch triggered by scheduler");
        void refreshCraftV2();
      });
    } catch (err) {
      console.warn("[craft-v2-store] failed to listen auto-refetch:", err);
    }
  }

  try {
    const leagues = await fetchEconomyLeagues();
    craftV2Store.availableLeagues = leagues;
    craftV2Store.leaguesLoadFailed = false;
    if (!craftV2Store.selectedLeagueUrl && leagues.length > 0) {
      craftV2Store.selectedLeagueUrl = leagues[0].url;
    }
  } catch (err) {
    console.warn("[craft-v2-store] fetchEconomyLeagues failed:", err);
    craftV2Store.leaguesLoadFailed = true;
  }

  void runHealthCheck();
  checkDictionaryFreshness();

  await runFetch(true, { bgWhenCached: true });
}

/** 「更新」ボタン (差分更新): 既存データがあればバックグラウンド更新。 */
export async function refreshCraftV2(): Promise<void> {
  await runFetch(true, { background: true });
}

/** 「全取得」ボタン: ディスクキャッシュ削除 → 完全再取得。 */
export async function forceRefetchCraftV2(): Promise<void> {
  await clearCraftV2Cache();
  await runFetch(false);
}

/** 「このリーグで再取得」ボタン: selectedLeagueUrl で再 fetch。 */
export async function refetchWithSelectedLeague(): Promise<void> {
  await runFetch(true);
}

/** cleanup (現状は呼ばない — singleton なので global に持ち続ける)。HMR 用の保険。 */
export function disposeCraftV2Store(): void {
  for (const un of [unlistenRef, autoRefetchUnlisten]) {
    if (!un) continue;
    try {
      un();
    } catch {
      /* noop */
    }
  }
  unlistenRef = null;
  autoRefetchUnlisten = null;
  stopNowTicker();
  stopNetworkStatusPoller();
}
