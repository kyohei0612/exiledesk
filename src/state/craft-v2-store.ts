/**
 * craft-v2-store.ts — クラフト発見 V2 / MOD 一覧 のシングルトン store
 * ===========================================================================
 *
 * 2026-05-23 オーナー指示「シームレスの徹底」:
 *   > 起動してからシームレスをもっとーにしてるから、そもそも起動して MOD 一覧に
 *   > いかなくても勝手に取得開始して置いて欲しい
 *
 * 解決策:
 *   - `App.vue` の `onMounted` で `ensureCraftV2Started()` を呼ぶことで、アプリ
 *     起動直後にバックグラウンドで MOD 一覧 fetch が走り始める。
 *   - 取得状態は全部この singleton (`craftV2Store`) に集約。
 *   - `CraftDiscoveryV2B.vue` (画面) はマウント時に `ensureCraftV2Started()` を呼ぶ
 *     だけで、store にデータがあれば即時表示・取得中なら従来通り進捗バー表示。
 *
 * 設計方針:
 *   - Vue 3 `reactive` で十分 (pinia 不要、依存ゼロ)。
 *   - per-view な操作 state (selectedMods / activeAscendancyId / activeSlot 等) は
 *     画面側 (ローカル ref) に残す。store には「fetch 由来の取得状態」と「health-check
 *     / dict-check 等のグローバル警告」のみを置く。
 *   - 重複起動防止: `loading` フラグ + 「fetch 完了済み」判定でガードする。
 *     具体的には `ascendancies.length > 0 && !fatalError` が「データあり」、
 *     `loading === true` が「取得中」。両方該当しない時のみ新規 fetch を起動。
 *   - 「更新」「全取得」「このリーグで再取得」ボタンは画面側からこの store の関数を呼ぶ。
 *     強制再取得時は `ensureCraftV2Started` のガードをバイパスする `forceStartFetch`
 *     を経由する。
 */
import { reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
  startCraftDiscoveryV2,
  clearCraftV2Cache,
  fetchEconomyLeagues,
  type AggregatedAscendancy,
  type CharacterProgressInfo,
  type LeagueInfo,
  type SnapshotMeta,
} from "../services/craft-discovery-v2";

// Phase ο-B: 辞書件数チェック用 (App.vue 起動時にも呼ぶので、ここに移して中央集約)
import uniqueModsJa from "../i18n/unique-mods-ja.json";
import uniqueNamesJa from "../i18n/unique-names-ja.json";
import poe2FlavourJa from "../i18n/poe2-flavour-ja.json";
import modTierAndGroup from "../i18n/mod-tier-and-group.json";
import trade2StatMapping from "../i18n/trade2-stat-mapping.json";

// ---------------------------------------------------------------------------
// 警告履歴 (Phase ο-B 由来、CraftDiscoveryV2B.vue から移植)
// ---------------------------------------------------------------------------
export type WarnSource =
  | "health-check"
  | "dict-check"
  | "fetch-character"
  | "trade2-search"
  | "craft-fetch"
  | "mod-select";
export type WarnLevel = "info" | "warn" | "error";
export interface WarnEntry {
  level: WarnLevel;
  message: string;
  /** Date.now() — 表示時は formatHms で HH:MM:SS に整形 */
  timestamp: number;
  source?: WarnSource;
  /** Phase ο-C: 警告詳細リスト (具体値) */
  details?: string[];
}
export const MAX_WARN_HISTORY = 5;

// ---------------------------------------------------------------------------
// ネットワーク状態 (取得中のレートリミット / retry 表示)
// ---------------------------------------------------------------------------
interface NetworkStatusRaw {
  global_penalty_waiting: boolean;
  global_penalty_remaining_secs: number;
  global_penalty_reason: string | null;
  active_retry_count: number;
  last_retry_reason: string | null;
  last_retry_remaining_secs: number;
}
export interface NetworkStatusUi {
  globalPenaltyWaiting: boolean;
  globalPenaltyRemainingSecs: number;
  globalPenaltyReason: string | null;
  activeRetryCount: number;
  lastRetryReason: string | null;
  lastRetryRemainingSecs: number;
}

// ---------------------------------------------------------------------------
// Phase ο-B: 健全性チェック (Rust 戻り値型)
// ---------------------------------------------------------------------------
interface HealthCheckResult {
  poe_ninja_schema_ok: boolean;
  poe2db_html_ok: boolean;
  trade2_api_ok: boolean;
  unknown_inventory_ids_count: number;
  unknown_inventory_id_samples: Array<{ inventory_id: string; count: number }>;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Store 本体 (reactive シングルトン)
// ---------------------------------------------------------------------------
export interface CraftV2Store {
  // 取得結果
  ascendancies: AggregatedAscendancy[];
  snapshot: SnapshotMeta | null;
  lastUpdatedAt: string | null;
  // 取得進行状態
  loading: boolean;
  fatalError: string | null;
  currentlyFetching: string | null;
  currentPhase: CharacterProgressInfo | null;
  showingFromCache: boolean;
  cacheItemCount: number;
  networkStatus: NetworkStatusUi | null;
  // リーグ選択 (Phase ξ)
  availableLeagues: LeagueInfo[];
  selectedLeagueUrl: string;
  leaguesLoadFailed: boolean;
  // 警告履歴 (Phase ο-B)
  warnHistory: WarnEntry[];
  expandedWarnTimestamps: Set<number>;
  // ライフサイクル
  /** 起動時 initial fetch を 1 回だけ走らせるためのガード */
  initialBootStarted: boolean;
}

export const craftV2Store: CraftV2Store = reactive({
  ascendancies: [],
  snapshot: null,
  lastUpdatedAt: null,
  loading: false,
  fatalError: null,
  currentlyFetching: null,
  currentPhase: null,
  showingFromCache: false,
  cacheItemCount: 0,
  networkStatus: null,
  availableLeagues: [],
  selectedLeagueUrl: "",
  leaguesLoadFailed: false,
  warnHistory: [],
  expandedWarnTimestamps: new Set<number>(),
  initialBootStarted: false,
});

// ---------------------------------------------------------------------------
// store の外側に置く mutable refs (UnlistenFn / Timer は reactive 化不要)
// ---------------------------------------------------------------------------
let unlistenRef: UnlistenFn | null = null;
let networkStatusPoller: ReturnType<typeof setInterval> | null = null;
let autoRefetchUnlisten: UnlistenFn | null = null;

// 取得中だけ 1Hz で値を更新する「現在時刻」ref。UI が「動いてる」感を出す用 (Vue 側 watch で消費)。
export const nowMs = ref<number>(Date.now());
let nowTicker: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// 警告ヘルパー
// ---------------------------------------------------------------------------
export function pushWarn(
  level: WarnLevel,
  message: string,
  source?: WarnSource,
  details?: string[],
): void {
  const entry: WarnEntry = {
    level,
    message,
    timestamp: Date.now(),
    source,
    details: details && details.length > 0 ? details : undefined,
  };
  craftV2Store.warnHistory = [entry, ...craftV2Store.warnHistory].slice(
    0,
    MAX_WARN_HISTORY,
  );
}

export function clearWarns(): void {
  craftV2Store.warnHistory = [];
  craftV2Store.expandedWarnTimestamps = new Set<number>();
}

export function toggleWarnDetail(ts: number): void {
  const s = new Set(craftV2Store.expandedWarnTimestamps);
  if (s.has(ts)) s.delete(ts);
  else s.add(ts);
  craftV2Store.expandedWarnTimestamps = s;
}

// ---------------------------------------------------------------------------
// 時刻フォーマット
// ---------------------------------------------------------------------------
function formatHms(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---------------------------------------------------------------------------
// 内部: 取得のコア (旧 V2B.vue の startFetch 相当)
// ---------------------------------------------------------------------------
async function runFetch(useCache: boolean): Promise<void> {
  // 前回 listen を破棄してからスタート (重複 event 防止)
  if (unlistenRef) {
    try {
      unlistenRef();
    } catch {
      /* noop */
    }
    unlistenRef = null;
  }
  craftV2Store.ascendancies = [];
  craftV2Store.loading = true;
  craftV2Store.fatalError = null;
  craftV2Store.snapshot = null;
  craftV2Store.lastUpdatedAt = null;
  craftV2Store.currentlyFetching = null;
  craftV2Store.currentPhase = null;
  craftV2Store.showingFromCache = false;
  craftV2Store.cacheItemCount = 0;

  // 取得中だけ 1Hz tick (UI の経過秒数表示用)
  startNowTicker();
  // 取得中だけ networkStatus polling
  startNetworkStatusPoller();

  const un = await startCraftDiscoveryV2({
    topNAscendancies: 10,
    topNPerAscendancy: 50,
    useCache,
    leagueUrl: craftV2Store.selectedLeagueUrl || undefined,
    onCacheReady: (cachedAggs, cache) => {
      craftV2Store.ascendancies = [...cachedAggs];
      craftV2Store.showingFromCache = true;
      craftV2Store.cacheItemCount = cachedAggs.length;
      craftV2Store.snapshot = {
        league_url: cache.league_url,
        snapshot_name: cache.snapshot_name,
        version: cache.snapshot_version,
      };
      if (cache.saved_at) {
        craftV2Store.lastUpdatedAt =
          formatHms(new Date(cache.saved_at * 1000)) + " (キャッシュ)";
      }
    },
    onProgress: (agg) => {
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
      craftV2Store.snapshot = snap;
      craftV2Store.loading = false;
      craftV2Store.currentlyFetching = null;
      craftV2Store.currentPhase = null;
      craftV2Store.lastUpdatedAt = formatHms(new Date());
      craftV2Store.showingFromCache = false;
      stopNowTicker();
      stopNetworkStatusPoller();
    },
    onFatal: (msg) => {
      craftV2Store.fatalError = msg;
      craftV2Store.loading = false;
      craftV2Store.currentlyFetching = null;
      craftV2Store.currentPhase = null;
      craftV2Store.showingFromCache = false;
      stopNowTicker();
      stopNetworkStatusPoller();
    },
    onCharacterProgress: (info) => {
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

function mergeAscendancy(agg: AggregatedAscendancy): void {
  const idx = craftV2Store.ascendancies.findIndex((a) => a.id === agg.id);
  if (idx >= 0) {
    craftV2Store.ascendancies.splice(idx, 1, agg);
  } else {
    craftV2Store.ascendancies.push(agg);
  }
  const fp = agg.fetchProgress;
  if (fp && fp.total > 0 && fp.done < fp.total) {
    craftV2Store.currentlyFetching = agg.name;
  } else if (craftV2Store.currentlyFetching === agg.name) {
    craftV2Store.currentlyFetching = null;
  }
}

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

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 起動時 / 画面マウント時に呼ばれる「冪等な」起動エントリ。
 *
 * 重複起動防止ロジック:
 *   - `initialBootStarted` が立ってる → 既に 1 回起動済 = 何もしない
 *   - loading 中 → 進行中なので何もしない
 *   - データ取得済 (`ascendancies.length > 0 && !fatalError`) → 何もしない
 *   - それ以外 → リーグ一覧 + health-check + dict-check + fetch を順に走らせる
 *
 * App.vue (起動時) と CraftDiscoveryV2B.vue (画面マウント時) の両方から呼ばれるが、
 * 1 度走った後は no-op。
 */
export async function ensureCraftV2Started(): Promise<void> {
  if (craftV2Store.initialBootStarted) return;
  if (craftV2Store.loading) return;
  if (craftV2Store.ascendancies.length > 0 && !craftV2Store.fatalError) return;
  craftV2Store.initialBootStarted = true;

  // 0) 自動再取得 event listener を 1 度だけ仕込む (Phase 設定画面)
  //
  //    Rust 側 setup 内の tokio タスクが `auto_refetch_interval_secs` ごとに
  //    `craft-v2-auto-refetch` を emit してくる。受信したら refreshCraftV2()。
  //    loading 中なら refreshCraftV2 側で重複起動になるが、内部で前回 listen を
  //    破棄してから再 fetch するので安全 (runFetch 冒頭の `if (unlistenRef)`).
  if (!autoRefetchUnlisten) {
    try {
      autoRefetchUnlisten = await listen<void>("craft-v2-auto-refetch", () => {
        console.log("[craft-v2-store] auto-refetch triggered by scheduler");
        void refreshCraftV2();
      });
    } catch (err) {
      console.warn("[craft-v2-store] failed to listen auto-refetch:", err);
    }
  }

  // 1) リーグ一覧取得 (Phase ξ)
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

  // 2) 健全性チェック + 辞書件数チェック (Phase ο-B、独立で走らせる)
  void runHealthCheck();
  checkDictionaryFreshness();

  // 3) MOD 一覧の fetch を背景開始
  await runFetch(true);
}

/**
 * 「更新」ボタン (差分更新): キャッシュ活用で再取得。
 * 強制実行なので `ensureCraftV2Started` のガードはバイパスする (= 必ず再 fetch)。
 */
export async function refreshCraftV2(): Promise<void> {
  await runFetch(true);
}

/**
 * 「全取得」ボタン: ディスクキャッシュ削除 → 完全再取得 (Phase ζ)。
 */
export async function forceRefetchCraftV2(): Promise<void> {
  await clearCraftV2Cache();
  await runFetch(false);
}

/**
 * 「このリーグで再取得」ボタン (Phase ξ): selectedLeagueUrl で再 fetch。
 * Rust 側で league_url 不一致なら自動的にキャッシュ流用せず再取得 → 上書き保存。
 */
export async function refetchWithSelectedLeague(): Promise<void> {
  await runFetch(true);
}

/**
 * App / 画面 unmount 時の cleanup (現状は呼ばない — singleton なので global に持ち続ける)。
 * 将来 HMR で必要になった時の保険として export。
 */
export function disposeCraftV2Store(): void {
  if (unlistenRef) {
    try {
      unlistenRef();
    } catch {
      /* noop */
    }
    unlistenRef = null;
  }
  if (autoRefetchUnlisten) {
    try {
      autoRefetchUnlisten();
    } catch {
      /* noop */
    }
    autoRefetchUnlisten = null;
  }
  stopNowTicker();
  stopNetworkStatusPoller();
}

// ---------------------------------------------------------------------------
// Phase ο-B: 健全性チェック (Rust health_check_all)
// ---------------------------------------------------------------------------
export async function runHealthCheck(): Promise<void> {
  const prevCount = craftV2Store.warnHistory.length;
  try {
    const result = await invoke<HealthCheckResult>("health_check_all");
    if (!result.poe_ninja_schema_ok) {
      pushWarn("error", "poe.ninja API 構造変更を検出", "health-check");
    }
    if (!result.poe2db_html_ok) {
      pushWarn(
        "warn",
        "POE2DB HTML 構造変更の可能性 (辞書再生成検討)",
        "health-check",
      );
    }
    if (!result.trade2_api_ok) {
      pushWarn("warn", "trade2 API 仕様変更の可能性", "health-check");
    }
    if (result.unknown_inventory_ids_count > 0) {
      const samples = result.unknown_inventory_id_samples ?? [];
      const details = samples.map(
        (s) => `${s.inventory_id} × ${s.count} 件`,
      );
      pushWarn(
        "info",
        `未知 inventoryId ${result.unknown_inventory_ids_count} 件 (poe.ninja アイテム種別追加か)`,
        "health-check",
        details,
      );
    }
    for (const w of result.warnings) {
      pushWarn("warn", w, "health-check");
    }
    if (craftV2Store.warnHistory.length === prevCount) {
      pushWarn("info", "すべての外部 API が正常です", "health-check");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isUnimplemented = /not found|unregistered/i.test(msg);
    pushWarn(
      isUnimplemented ? "info" : "warn",
      isUnimplemented
        ? "health_check_all 未実装 (Phase ο-A 後に有効化)"
        : `health_check_all 失敗: ${msg}`,
      "health-check",
    );
  }
}

// ---------------------------------------------------------------------------
// Phase ο-B: 辞書件数チェック
// ---------------------------------------------------------------------------
const DICT_EXPECTED_MIN: Record<string, number> = {
  "unique-mods-ja": 1500,
  "unique-names-ja": 380,
  "poe2-flavour-ja": 3000,
  "mod-tier-and-group": 600,
  "trade2-stat-mapping": 500,
};

export function checkDictionaryFreshness(): void {
  const mtgTiersCount = Object.keys(
    (modTierAndGroup as { tiers?: Record<string, unknown> }).tiers ?? {},
  ).length;
  const mtgGroupsCount = Object.keys(
    (modTierAndGroup as { groups?: Record<string, unknown> }).groups ?? {},
  ).length;
  const mtgMin = Math.min(mtgTiersCount, mtgGroupsCount);

  const checks: Array<readonly [string, number]> = [
    [
      "unique-mods-ja",
      Object.keys(uniqueModsJa as Record<string, unknown>).length,
    ],
    [
      "unique-names-ja",
      Object.keys(uniqueNamesJa as Record<string, unknown>).length,
    ],
    [
      "poe2-flavour-ja",
      Object.keys(poe2FlavourJa as Record<string, unknown>).length,
    ],
    ["mod-tier-and-group", mtgMin],
    [
      "trade2-stat-mapping",
      Object.keys(trade2StatMapping as Record<string, unknown>).length,
    ],
  ];

  for (const [name, actual] of checks) {
    const expected = DICT_EXPECTED_MIN[name] ?? 0;
    if (actual < expected) {
      pushWarn(
        "warn",
        `辞書 ${name} が薄い (${actual}/${expected} 件) — 再生成を検討してください`,
        "dict-check",
      );
    }
  }
}
