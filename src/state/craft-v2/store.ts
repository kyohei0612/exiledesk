/**
 * クラフト発見 V2 / MOD 一覧 の reactive シングルトン (状態 + 警告ヘルパー)
 *
 * craft-v2-store.ts から切り出し (2026-09-07)。取得ロジックは fetch.ts、
 * 健全性 / 辞書チェックは health.ts。
 *
 * 設計方針:
 *   - Vue 3 `reactive` で十分 (pinia 不要、依存ゼロ)。
 *   - per-view な操作 state (selectedMods / activeAscendancyId / activeSlot 等) は画面側に残す。
 *     store には「fetch 由来の取得状態」と「health-check / dict-check 等のグローバル警告」のみ。
 */
import { reactive, ref } from "vue";
import type {
  AggregatedAscendancy,
  CharacterProgressInfo,
  LeagueInfo,
  SnapshotMeta,
} from "../../services/craft-v2/types";

// ---------------------------------------------------------------------------
// 警告履歴
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
  /** 警告詳細リスト (具体値) */
  details?: string[];
}
export const MAX_WARN_HISTORY = 5;

// ---------------------------------------------------------------------------
// ネットワーク状態 (取得中のレートリミット / retry 表示)
// ---------------------------------------------------------------------------
export interface NetworkStatusUi {
  globalPenaltyWaiting: boolean;
  globalPenaltyRemainingSecs: number;
  globalPenaltyReason: string | null;
  activeRetryCount: number;
  lastRetryReason: string | null;
  lastRetryRemainingSecs: number;
}

// ---------------------------------------------------------------------------
// Store 本体
// ---------------------------------------------------------------------------
export interface CraftV2Store {
  // 取得結果
  ascendancies: AggregatedAscendancy[];
  snapshot: SnapshotMeta | null;
  lastUpdatedAt: string | null;
  // 取得進行状態
  loading: boolean;
  /**
   * 2回目以降 (更新 / 自動再取得) の「バックグラウンド更新」モード。
   * true の間は UI を前回データのまま据え置き、完了したアセンダンシーだけ差し替える。
   * loading は「取得中 (ガード / ボタン無効化用)」として true のまま。
   */
  backgroundRefresh: boolean;
  fatalError: string | null;
  currentlyFetching: string | null;
  currentPhase: CharacterProgressInfo | null;
  showingFromCache: boolean;
  cacheItemCount: number;
  /** 表示中データの取得時刻 (epoch 秒)。キャッシュなら saved_at、取得完了なら完了時刻。自動更新の鮮度判定に使う */
  cacheSavedAt: number | null;
  networkStatus: NetworkStatusUi | null;
  // リーグ選択
  availableLeagues: LeagueInfo[];
  selectedLeagueUrl: string;
  leaguesLoadFailed: boolean;
  // 警告履歴
  warnHistory: WarnEntry[];
  expandedWarnTimestamps: Set<number>;
  /** 起動時 initial fetch を 1 回だけ走らせるためのガード */
  initialBootStarted: boolean;
}

export const craftV2Store: CraftV2Store = reactive({
  ascendancies: [],
  snapshot: null,
  lastUpdatedAt: null,
  loading: false,
  backgroundRefresh: false,
  fatalError: null,
  currentlyFetching: null,
  currentPhase: null,
  showingFromCache: false,
  cacheItemCount: 0,
  cacheSavedAt: null,
  networkStatus: null,
  availableLeagues: [],
  selectedLeagueUrl: "",
  leaguesLoadFailed: false,
  warnHistory: [],
  expandedWarnTimestamps: new Set<number>(),
  initialBootStarted: false,
});

/** 取得中だけ 1Hz で値を更新する「現在時刻」ref。UI が「動いてる」感を出す用。 */
export const nowMs = ref<number>(Date.now());

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
  craftV2Store.warnHistory = [entry, ...craftV2Store.warnHistory].slice(0, MAX_WARN_HISTORY);
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

/** M/D HH:MM (日付をまたぐキャッシュの表示用) */
export function formatDateTime(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** HH:MM:SS */
export function formatHms(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
