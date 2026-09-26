/**
 * 取得のコア (runFetch) と自動更新の鮮度しきい値
 *
 * fetch.ts から切り出し (2026-09-26)。
 */
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { AggregatedAscendancy } from "../../../services/craft-v2/types";
import { startCraftDiscoveryV2 } from "../../../services/craft-v2/runner";
import { craftV2Store, formatDateTime, formatHms, pushWarn } from "../store";
import {
  mergeAscendancy,
  startNetworkStatusPoller,
  startNowTicker,
  stopNetworkStatusPoller,
  stopNowTicker,
  stopProgressUi,
  swapAscendancy,
} from "./progress-ui";

/**
 * 自動更新の鮮度しきい値 (2026-09-08 オーナー指示: 起動のたびに取りに行くのは重い。3 日空いたら更新)。
 * 手動の「更新」「全取得」「このリーグで再取得」は鮮度に関係なくいつでも動く (取得中なら中断して再開)。
 */
export const CRAFT_V2_STALE_SECS = 3 * 24 * 3600;

export function isCraftV2CacheStale(savedAtSec: number | null | undefined): boolean {
  if (!savedAtSec) return true;
  return Date.now() / 1000 - savedAtSec >= CRAFT_V2_STALE_SECS;
}

// store の外側に置く mutable refs (UnlistenFn / Timer は reactive 化不要)
let unlistenRef: UnlistenFn | null = null;

/** バックグラウンド更新中、未完了アセンダンシーの最新集計を一時保持 (完了時に表示へ swap) */
const bgStaging = new Map<string, AggregatedAscendancy>();

// ---------------------------------------------------------------------------
// 取得のコア
// ---------------------------------------------------------------------------
export async function runFetch(useCache: boolean, opts?: { background?: boolean; bgWhenCached?: boolean; onlyIfStale?: boolean }): Promise<void> {
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
  const onlyIfStale = opts?.onlyIfStale === true;
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
      craftV2Store.cacheSavedAt = cache.saved_at || null;
      if (cache.saved_at) {
        craftV2Store.lastUpdatedAt = formatDateTime(new Date(cache.saved_at * 1000)) + " (キャッシュ)";
      }
    },
    shouldFetch: (cache) => {
      const hasCache = !!cache && craftV2Store.ascendancies.length > 0;
      if (onlyIfStale && hasCache && !isCraftV2CacheStale(cache?.saved_at)) {
        // 3 日以内: キャッシュ表示のままで終了 (poe.ninja に行かない)
        const savedAt = cache?.saved_at ?? 0;
        const next = new Date((savedAt + CRAFT_V2_STALE_SECS) * 1000);
        craftV2Store.lastUpdatedAt = `${formatDateTime(new Date(savedAt * 1000))} (キャッシュ / 次回自動更新 ${formatDateTime(next)})`;
        craftV2Store.loading = false;
        craftV2Store.backgroundRefresh = false;
        stopProgressUi();
        return false;
      }
      if (bgWhenCached && hasCache) {
        craftV2Store.backgroundRefresh = true;
        craftV2Store.showingFromCache = false;
        bgStaging.clear();
        stopNowTicker();
        stopNetworkStatusPoller();
      }
      return true;
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
      craftV2Store.cacheSavedAt = Math.floor(Date.now() / 1000);
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
