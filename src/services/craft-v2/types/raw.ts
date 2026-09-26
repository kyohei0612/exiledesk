/**
 * クラフト発見君 V2 — Rust 側構造体のミラー型 (progress / キャッシュ / リーグ一覧)
 *
 * types.ts から切り出し (2026-09-26)。
 */
import type { SkillUsageStatsRaw } from "./aggregate";

// ============================================================================
// Rust 側構造体ミラー型 (poe_ninja_client.rs の Serialize 構造体と一致)
// ============================================================================

export interface SnapshotMeta {
  league_url: string;
  snapshot_name: string;
  version: string;
}

export interface CharacterItems {
  account: string;
  name: string;
  /** poe.ninja items[] 配列の生 JSON (Rust 側は serde_json::Value で透過) */
  items: unknown[];
  /** poe.ninja skills[] (スキルグループ) の生 JSON。古い payload には無い (2026-09-12) */
  skills?: unknown[];
}

export interface CraftV2Progress {
  ascendancy: string;
  percentage: number;
  characters_done: number;
  characters_total: number;
  items: CharacterItems[];
  /** 2026-09-14: poe.ninja のスキル使用率 (そのクラスの全キャラ)。辞書が取れなかった時は null */
  skill_stats?: SkillUsageStatsRaw | null;
}

export interface CraftV2ErrorPayload {
  ascendancy?: string;
  phase?: string;
  error?: string;
}

/**
 * per-character 進捗イベント (Rust `craft-v2-character-progress` のミラー、camelCase 変換済)。
 * ヘッダーに「現在の動作 (search / fetching / completed)」と「並列度」を表示する。
 */
export interface CharacterProgressInfo {
  ascendancy: string;
  charactersDone: number;
  charactersTotal: number;
  /** 現在 fetch 中の並列タスク数 (snapshot) */
  currentConcurrency: number;
  /** "search" = 上位プレイヤー検索中 / "fetching" = キャラ取得中 / "completed" = アセ完了 */
  phase: "search" | "fetching" | "completed";
}

/** Rust 側 serde の snake_case payload (UI に渡す前に camelCase に変換) */
export interface CharacterProgressInfoRaw {
  ascendancy: string;
  characters_done: number;
  characters_total: number;
  current_concurrency: number;
  phase: "search" | "fetching" | "completed";
}

// Phase ξ: poe.ninja の economyLeagues 一覧 (動的取得)
export interface LeagueInfo {
  url: string;
  name: string;
  is_hardcore: boolean;
  is_ssf: boolean;
}

// ----------------------------------------------------------------------------
// Phase ζ: ディスクキャッシュ型 (Rust 側 CraftV2Cache のミラー)
// ----------------------------------------------------------------------------

export interface CachedRareItem {
  inventory_id: string;
  explicit_mods: string[];
  /** poe.ninja `extended.subcategories`。古いキャッシュは無いので optional。 */
  subcategories?: string[];
  /**
   * ベース別使用率集計用の baseType (例: "Sapphire Ring")。
   * 古いキャッシュ / 旧バイナリでは undefined になるため optional。
   */
  base_type?: string;
  /** 2026-09-12: 付与スキル (例: "Level 20 Cast on Critical")。古いキャッシュは無い。 */
  granted_skills?: string[];
  /**
   * 2026-09-22: 品質 (%)。ブリーチのエッセンスで最大品質を上げてから MOD を消す作り方を
   * 見分けるのに使う。古いキャッシュには無い。
   */
  quality?: number;
  /** 2026-09-12: 付与スキルの穴に入っていたジェム名 (例: ["Frost Wall"])。 */
  socketed_gems?: string[];
}

export interface CachedUniqueItem {
  inventory_id: string;
  type_line: string;
  base_type: string;
  name: string;
  icon: string;
  implicit_mods: string[];
  explicit_mods: string[];
  /** string | string[] | null どれもありうる (poe.ninja 仕様) */
  flavour_text?: unknown;
  requirements?: unknown;
  properties?: unknown;
  item_level?: number;
  level?: number;
  subcategories?: string[];
}

export interface CachedCharacter {
  account: string;
  name: string;
  rare_items: CachedRareItem[];
  unique_items: CachedUniqueItem[];
  fetched_at: number;
  /** 2026-09-12: スキルグループ (Rust CachedSkillGroup のミラー)。旧キャッシュには無い */
  skills?: CachedSkillGroup[];
}

export interface CachedSkillGroup {
  /** 2026-09-16: レベル / 品質のランキング用にジェム単位で持つ (Rust CachedGem のミラー) */
  mains: CachedGem[];
  supports: string[];
  dps: number;
}

export interface CachedGem {
  name: string;
  level?: number | null;
  quality?: number | null;
}

export interface CachedAscendancy {
  class: string;
  percentage: number;
  characters: CachedCharacter[];
  /** 2026-09-14: poe.ninja のスキル使用率。旧キャッシュには無い */
  skill_stats?: SkillUsageStatsRaw | null;
}

export interface CraftV2Cache {
  snapshot_version: string;
  league_url: string;
  snapshot_name: string;
  saved_at: number;
  ascendancies: CachedAscendancy[];
}

/** `craft_v2_fetch_all` の戻り値 / `craft-v2-done` event payload */
export interface CraftV2FetchResult {
  snapshot: SnapshotMeta;
  cache: CraftV2Cache;
}
