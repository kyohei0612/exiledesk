/**
 * クラフト発見君 V2 — 集計結果 (UI 公開) の型
 *
 * types.ts から切り出し (2026-09-26)。
 */

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

/** ティア表 1 行 (services/mods/tiers.ts が装備タグで絞って組む) */
export interface ModTierRow {
  tier: number;
  /** stats[0] の範囲 (互換: 単一値 mod の判定に使う) */
  min: number;
  max: number;
  /** 全 stat の範囲 ("Adds # to #" は 2 要素) */
  mins: number[];
  maxs: number[];
  /** trade2 の下限に使う値。単一値 = min、複数値 ("Adds # to #") = 平均値範囲の中央 (trade2 は (X+Y)/2 で照合する) */
  filterMin: number;
  /** 必要 ilvl (Mods.Level) */
  level: number;
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
  /**
   * T1 の上限を**超えていた**件数 (2026-09-22)。
   *
   * 上位プレイヤーの装備に出ている数値は、**品質やルーンで底上げされた表示値**です。
   * 指輪とアミュレットはカタリストの品質が該当する種類の MOD を倍率で押し上げるので
   * (マナのカタリスト 20% なら最大マナ T1 の 189 が 226 になる)、素のティア表を超えます。
   * 実測 2026-09-22: T1 超えの超過倍率は指輪/アミュレットで ×1.05〜1.25 に固まっていて、
   * 20% 品質 (= ×1.2) とよく合う。
   *
   * ティア判定はこれを **T1 に丸めます**。つまり `inferredTier` / `usageTier` はその分
   * **高めに出ます**。件数をここに出して、画面で断れるようにする。
   *
   * 直すには装備の品質が要る。`CachedRareItem.quality` を 2026-09-22 に足したので、
   * 次の取得から入る。入ったら「表示値 ÷ (1 + 品質)」で素の値に戻して判定できる。
   */
  overCap?: number;
}

/** ベース別使用率エントリ (人数ベース、同一キャラの Ring1/Ring2 は 1 人) */
export interface BaseEntry {
  /** 表示名 (items-ja で日本語化、未登録は英語 baseType) */
  name: string;
  /** 英語 baseType (内部キー / 名寄せ用) */
  nameEn: string;
  /** このベースを装備していた人数 (重複排除済) */
  count: number;
  /**
   * このベースが付与していたスキルの内訳 (人数降順)。不在のアミュレット / 王笏など
   * 「スキルが付いたベース」だけ非空。それ以外は空配列。(2026-09-12)
   */
  skills: BaseSkillEntry[];
}

/** ベースが付与するスキル 1 種 (例: クリティカル時キャスト Lv17-20 · 12 人) */
export interface BaseSkillEntry {
  /** 表示名 (skills-ja-client で日本語化、未登録は英語) */
  name: string;
  nameEn: string;
  /** 観測したスキルレベルの最小 / 最大 (取れなければ null) */
  levelMin: number | null;
  levelMax: number | null;
  /** このスキルを付与するベースを装備していた人数 */
  count: number;
  /** 付与スキルの穴に入っていたジェム (人数降順) */
  gems: BaseGemEntry[];
}

export interface BaseGemEntry {
  name: string;
  nameEn: string;
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

/** スキル使用率 1 行 (2026-09-12)。poe.ninja のスキルグループから、同キャラ重複を除いて人数集計 */
export interface SkillUsage {
  /** 表示名 (skills-ja-client で日本語化) */
  name: string;
  nameEn: string;
  /** スピリットジェム (persistent) か。gems-client.json 由来、不明は false */
  spirit: boolean;
  /** メタジェム (トリガー等) か */
  meta: boolean;
  /** このスキルを持っていた人数 */
  count: number;
  percentage: number;
  /** このスキルが「そのキャラで DPS 最大のグループ」だった人数 (= 主力) */
  mainCount: number;
  /** 一緒に付いていたサポート (人数降順) */
  supports: { name: string; nameEn: string; count: number }[];
  /** 2026-09-16: レベル 21 以上で使っていた人数 */
  lvl21: number;
  /** 品質 23% 以上で使っていた人数 */
  q23: number;
  /** 両方 (限界突破) で使っていた人数 */
  both: number;
  /** 見えている中で一番高いレベル / 品質 (参考表示用) */
  maxLevel: number;
  maxQuality: number;
}

/** Rust SkillUsageStats のミラー (2026-09-14)。poe.ninja が表示しているスキル使用率 (search の集計、そのクラスの全キャラ) */
export interface SkillUsageStatsRaw {
  total: number;
  main: GemUsageCountRaw[];
  spirit: GemUsageCountRaw[];
  all: GemUsageCountRaw[];
}
export interface GemUsageCountRaw {
  name: string;
  count: number;
}
/** poe.ninja のスキル使用率 1 行 (表示用) */
export interface NinjaSkillStat {
  /** 表示名 (skills-ja-client で日本語化) */
  name: string;
  nameEn: string;
  count: number;
  /** 0..1 (人数 ÷ そのクラスの全キャラ) */
  percentage: number;
}
/** poe.ninja の Main Skills / Spirit Skills / All Skills (人数降順) */
export interface NinjaSkillStats {
  total: number;
  main: NinjaSkillStat[];
  spirit: NinjaSkillStat[];
  all: NinjaSkillStat[];
}

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
  /** スキル使用率 (人数降順)。古いキャッシュ (ν3 以前) では空 (2026-09-12) */
  skills: SkillUsage[];
  /** poe.ninja のスキル使用率 (そのクラスの全キャラ)。古いキャッシュでは無い (2026-09-14) */
  ninjaSkills?: NinjaSkillStats | null;
  /** 取得失敗時の理由 (UI でエラー表示用、成功時は undefined) */
  error?: string;
  /** このアセンダンシーの取得進捗 (N/M キャラ)。progress event 由来の場合のみ存在。 */
  fetchProgress?: {
    done: number;
    total: number;
  };
}
