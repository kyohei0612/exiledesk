/**
 * 取得中の表示: 時計 / ネットワーク状態のポーリング、アセンダンシーの差し替え
 *
 * fetch.ts から切り出し (2026-09-26)。
 */
import { invoke } from "@tauri-apps/api/core";
import type { AggregatedAscendancy } from "../../../services/craft-v2/types";
import { craftV2Store, nowMs } from "../store";

interface NetworkStatusRaw {
  global_penalty_waiting: boolean;
  global_penalty_remaining_secs: number;
  global_penalty_reason: string | null;
  active_retry_count: number;
  last_retry_reason: string | null;
  last_retry_remaining_secs: number;
}

// store の外側に置く mutable refs (UnlistenFn / Timer は reactive 化不要)
let networkStatusPoller: ReturnType<typeof setInterval> | null = null;
let nowTicker: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// Tickers
// ---------------------------------------------------------------------------
export function startNowTicker(): void {
  if (nowTicker) clearInterval(nowTicker);
  nowTicker = setInterval(() => {
    nowMs.value = Date.now();
  }, 500);
}
export function stopNowTicker(): void {
  if (nowTicker) clearInterval(nowTicker);
  nowTicker = null;
}

export function startNetworkStatusPoller(): void {
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
export function stopNetworkStatusPoller(): void {
  if (networkStatusPoller) clearInterval(networkStatusPoller);
  networkStatusPoller = null;
  craftV2Store.networkStatus = null;
}

export function stopProgressUi(): void {
  craftV2Store.currentlyFetching = null;
  craftV2Store.currentPhase = null;
  stopNowTicker();
  stopNetworkStatusPoller();
}

// ---------------------------------------------------------------------------
// アセンダンシーの反映
// ---------------------------------------------------------------------------
/** バックグラウンド更新の「完了アセンダンシーだけ差し替える」用。進捗 state は触らない。 */
export function swapAscendancy(agg: AggregatedAscendancy): void {
  const idx = craftV2Store.ascendancies.findIndex((a) => a.id === agg.id);
  if (idx >= 0) craftV2Store.ascendancies.splice(idx, 1, agg);
  else craftV2Store.ascendancies.push(agg);
}

export function mergeAscendancy(agg: AggregatedAscendancy): void {
  swapAscendancy(agg);
  const fp = agg.fetchProgress;
  if (fp && fp.total > 0 && fp.done < fp.total) {
    craftV2Store.currentlyFetching = agg.name;
  } else if (craftV2Store.currentlyFetching === agg.name) {
    craftV2Store.currentlyFetching = null;
  }
}
