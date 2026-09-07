/**
 * クラフト発見君 V2 — 型定義
 *
 * craft-discovery-v2.ts から切り出し (2026-09-07)。
 *   - Rust 側 (poe_ninja_client.rs / craft_v2_storage.rs) の Serialize 構造体ミラー
 *   - 集計結果 (UI 公開) の型
 * ロジックは持たない。
 */

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
}

export interface CraftV2Progress {
  ascendancy: string;
  percentage: number;
  characters_done: number;
  characters_total: number;
  items: CharacterItems[];
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
}

export interface CachedAscendancy {
  class: string;
  percentage: number;
  characters: CachedCharacter[];
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

// ============================================================================
// 集計結果型 (UI 公開)
// ============================================================================

export type AffixKind = "P" | "S";

/**
 * 装備スロット種別 (8 種)。poe.ninja の `itemData.inventoryId` とのマッピングは
 * ninja-item.ts の `inventoryIdToSlot` を参照。Belt はオーナー指示で除外。
 */
export type SlotKey =
  | "ring"
  | "amulet"
  | "weapon"
  | "weapon2"
  | "helm"
  | "gloves"
  | "body"
  | "boots";

/** UI 横並びタブで使う順序付き全スロット定数 */
export const SLOT_KEYS: readonly SlotKey[] = [
  "ring",
  "amulet",
  "weapon",
  "weapon2",
  "helm",
  "gloves",
  "body",
  "boots",
] as const;

/** ティア表 1 行 (mod-tier-and-group.json の tiers[key][i]) */
export interface ModTierRow {
  tier: number;
  min: number;
  max: number;
  label: string;
}
/** UI 公開用: ModEntry.tiers の要素型 */
export type ModTier = ModTierRow;

export interface ModEntry {
  /** 表示用文字列 (平均値埋め込み済み、日本語訳可能ならば日本語) */
  text: string;
  /** prefix / suffix */
  affix: AffixKind;
  /** このテンプレートを「持っていた人数」 */
  count: number;
  /** 内部用: 正規化前テンプレート (英語 GGG 表記、`#` プレースホルダ) */
  rawTemplate: string;
  /** 内部用: 抽出した数値配列 (デバッグ用、表示には使わない) */
  values: number[];
  /**
   * この MOD が取りうる値域を T1/T2/... 降順で並べたリスト (mod-tier-and-group.json)。
   * bundle 非ヒットの MOD は空配列 (= ティア選択不可)。
   */
  tiers: ModTier[];
  /** この MOD が属するカテゴリ ID (例: `["IncreasedLife"]`)。排他選択に使う。 */
  groupIds: string[];
  /** 平均値から推定したティア (1-based、T1 = 最高)。tiers が空 or avg 不明なら undefined */
  inferredTier?: number;
  /**
   * 実リスティングの値分布で「最も使われているティア」(最頻ティア、1-based)。
   * 平均ベースの inferredTier と違い外れ値に引っ張られない。trade2 検索のデフォルトに使う。
   */
  usageTier?: number;
}

/** ベース別使用率エントリ (人数ベース、同一キャラの Ring1/Ring2 は 1 人) */
export interface BaseEntry {
  /** 表示名 (items-ja で日本語化、未登録は英語 baseType) */
  name: string;
  /** 英語 baseType (内部キー / 名寄せ用) */
  nameEn: string;
  /** このベースを装備していた人数 (重複排除済) */
  count: number;
}

export interface SlotMods {
  prefix: ModEntry[];
  suffix: ModEntry[];
  /** ベース別使用率 (人数降順)。UI は ring / amulet のみ描画する。 */
  bases: BaseEntry[];
}

/**
 * ホバーオーバーレイで表示するため、representative item の最低限のフィールドだけ保持する。
 */
export interface UniqueRepresentative {
  typeLine?: string;
  baseType?: string;
  /** poe.ninja の `data.name` 生値 = ユニュ正式名 (例: "Atziri's Splendour")。trade2 検索で優先。 */
  name?: string;
  implicitMods?: string[];
  explicitMods?: string[];
  flavourText?: string | string[];
  requirements?: unknown[];
  properties?: unknown[];
  level?: number;
  ilvl?: number;
}

/**
 * ユニーク使用率エントリ。同一キャラで同じユニークが複数スロットにあっても 1 にカウント。
 */
export interface UniqueUsage {
  /** 表示名 (日本語化済、未登録は英名フォールバック) */
  name: string;
  /** 英語 typeLine (オーバーレイのキー、辞書引きにも使う) */
  nameEn: string;
  /** このユニークを所持していたキャラ数 (重複排除済) */
  count: number;
  /** 全サンプル中の比率 (0.0〜1.0、`count / sampleSize`) */
  percentage: number;
  /** poe.ninja icon URL */
  icon: string;
  /** ホバーオーバーレイ用の代表 itemData (最初に取れたものを保持) */
  representative: UniqueRepresentative;
}

/** 8 スロット分の SlotMods をまとめた型 */
export type SlotModsBundle = { [K in SlotKey]: SlotMods };

export interface AggregatedAscendancy {
  /** id: `class` 英語表記を kebab-case 化したもの (UI key 用) */
  id: string;
  /** 英語クラス名 (Rust から来る生値、tab key) */
  classEn: string;
  /** 日本語表示名 (`jaAscendancy()` 経由) */
  name: string;
  /** 使用率 (%) */
  usagePercent: number;
  /** サンプル人数 (実際に取れた characters_done を入れる) */
  sampleSize: number;
  /** 装飾アイコン (錬金術記号) */
  icon: string;
  ring: SlotMods;
  amulet: SlotMods;
  weapon: SlotMods;
  weapon2: SlotMods;
  helm: SlotMods;
  gloves: SlotMods;
  body: SlotMods;
  boots: SlotMods;
  /** ユニーク使用率 (全スロット合算、互換維持) */
  uniques: UniqueUsage[];
  /** スロット別ユニーク使用率 (Ring1/Ring2 で同 unique = 1) */
  uniquesBySlot: { [K in SlotKey]: UniqueUsage[] };
  /** 取得失敗時の理由 (UI でエラー表示用、成功時は undefined) */
  error?: string;
  /** このアセンダンシーの取得進捗 (N/M キャラ)。progress event 由来の場合のみ存在。 */
  fetchProgress?: {
    done: number;
    total: number;
  };
}

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
  /** ディスクキャッシュを使うかどうか (default true)。false は「キャッシュ削除 + 全取得」用 */
  useCache?: boolean;
  /** 取得対象リーグの url (例: "forbiddenrites")。undefined なら economyLeagues[0] */
  leagueUrl?: string;
  /** per-character 進捗イベントフック (Rust 側は 5 キャラ毎にバッチ emit) */
  onCharacterProgress?: (info: CharacterProgressInfo) => void;
}
