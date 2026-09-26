/**
 * クラフト発見君 V2 — 起動オプション (runner.ts) の型
 *
 * types.ts から切り出し (2026-09-26)。
 */
import type { CharacterProgressInfo, CraftV2Cache, CraftV2ErrorPayload, SnapshotMeta } from "./raw";
import type { AggregatedAscendancy } from "./aggregate";

// ============================================================================
// 起動オプション (runner.ts)
// ============================================================================

export interface StartCraftDiscoveryV2Options {
  topNAscendancies?: number;
  topNPerAscendancy?: number;
  onProgress: (data: AggregatedAscendancy) => void;
  onError: (msg: string, payload?: CraftV2ErrorPayload) => void;
  onDone: (snapshot: SnapshotMeta) => void;
  /** invoke 自体が失敗した時のフック (致命的) */
  onFatal?: (msg: string) => void;
  /**
   * ディスクキャッシュからの即時 UI 反映フック (任意)。
   * キャッシュあり + useCache=true の時、invoke 発火前に各アセンダンシーを流す。
   */
  onCacheReady?: (data: AggregatedAscendancy[], cache: CraftV2Cache) => void;
  /**
   * onCacheReady の直後に呼ばれ、false を返すと poe.ninja への取得を行わない (キャッシュ表示のみ、2026-09-08)。
   * 起動時の「3 日以内のキャッシュなら取りに行かない」に使う。
   */
  shouldFetch?: (cache: CraftV2Cache | null) => boolean;
  /** ディスクキャッシュを使うかどうか (default true)。false は「キャッシュ削除 + 全取得」用 */
  useCache?: boolean;
  /** 取得対象リーグの url (例: "forbiddenrites")。undefined なら economyLeagues[0] */
  leagueUrl?: string;
  /** per-character 進捗イベントフック (Rust 側は 5 キャラ毎にバッチ emit) */
  onCharacterProgress?: (info: CharacterProgressInfo) => void;
}
