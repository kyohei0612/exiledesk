/* 自動生成: POE2Tube contracts/craft-stage-result.schema.json から json-schema-to-typescript で作る (手で直さない)。作り直しは scripts/build-craft-stage-contract.mjs */

export type Schema = string;
export type GeneratedAt = string;
export type ExiledeskVersion = string;
/**
 * HTC データのパッチ (例 '0.5.0')
 */
export type Patch = string;
export type League = string | null;
export type PriceUnit = "exalted" | "divine" | "chaos";
export type Schema1 = string;
/**
 * 動画の題材名 (表示用)
 */
export type Title = string | null;
/**
 * HTC の英語ベース名。ExileDesk 側は itemBaseFor(data, base) で引く
 */
export type Base = string;
export type ItemLevel = number;
export type StartRarity = "normal" | "magic" | "rare";
/**
 * 途中から始める時のゲーム内アイテムテキスト (Ctrl+C 貼り付け)。無ければ白
 */
export type StartPaste = string | null;
/**
 * mulberry32 の起点。1 手ごとの seed は ExileDesk が seed+index で派生させる
 */
export type Seed = number;
/**
 * @minItems 1
 */
export type Steps = [PlanStep, ...PlanStep[]];
export type Currency = string;
/**
 * お告げ id (price-keys.json の omens キー、例 OmenofDextralExaltation)
 */
export type Omen = string | null;
export type Times = number;
/**
 * 台本用の覚え書き (ExileDesk は無視してよい)
 */
export type Note = string | null;
/**
 * @minItems 1
 */
export type Steps1 = [StageStep, ...StageStep[]];
export type Index = number;
export type Currency1 = string;
export type CurrencyJa = string;
export type Omen1 = string | null;
export type OmenJa = string | null;
export type Seed1 = number;
export type Applied = boolean;
export type Reason = string | null;
/**
 * 表示名 (レアなら生成名、それ以外はベース名)
 */
export type Name = string;
export type Base1 = string;
export type BaseJa = string | null;
export type ItemLevel1 = number;
export type Rarity = "normal" | "magic" | "rare";
export type Quality = number;
export type Corrupted = boolean;
/**
 * @maxItems 3
 */
export type Prefixes = [] | [StageMod] | [StageMod, StageMod] | [StageMod, StageMod, StageMod];
export type ModId = string;
export type Family = string;
export type Side = "prefix" | "suffix";
/**
 * HTC の Tier.name (例 'T3')
 */
export type TierName = string;
/**
 * その段の要求アイテムレベル (Tier.ilvl)
 */
export type ModLevel = number;
/**
 * 公式日本語 1 行、数値埋め込み済 (jaOfMod + fillHashes)
 */
export type TextJa = string;
export type TextEn = string;
export type Values = number[];
/**
 * [[min,max], ...] 段の幅
 */
export type Ranges = number[][];
export type Fractured = boolean;
export type Desecrated = boolean;
export type Crafted = boolean;
/**
 * @maxItems 3
 */
export type Suffixes = [] | [StageMod] | [StageMod, StageMod] | [StageMod, StageMod, StageMod];
export type Added = StageMod[];
export type Removed = StageMod[];
export type RarityFrom = "normal" | "magic" | "rare";
export type RarityTo = "normal" | "magic" | "rare";
/**
 * カレンシー 1 個の相場 (price_unit 建て)
 */
export type Each = number;
/**
 * この手で使った個数 (お告げ込みなら 2)
 */
export type Amount = number;
export type Subtotal = number;
/**
 * ここまでの累計
 */
export type Cumulative = number;
export type TotalCost = number;

/**
 * 結果 JSON (ExileDesk → POE2Tube)。ExileDesk が将来足すキーは無視する (extra=ignore).
 */
export interface CraftStageResult {
  schema: Schema;
  generated_at: GeneratedAt;
  exiledesk_version: ExiledeskVersion;
  patch: Patch;
  league?: League;
  price_unit: PriceUnit;
  plan: CraftStagePlan;
  steps: Steps1;
  final: StageItem;
  total_cost: TotalCost;
  [k: string]: unknown;
}
/**
 * 手順 JSON (POE2Tube → ExileDesk).
 */
export interface CraftStagePlan {
  schema?: Schema1;
  title?: Title;
  base: Base;
  item_level?: ItemLevel;
  start_rarity?: StartRarity;
  start_paste?: StartPaste;
  seed: Seed;
  steps: Steps;
}
/**
 * 手順 1 つ。``times`` で同じカレンシーの連打を表す (Chaos ×5 など).
 */
export interface PlanStep {
  currency: Currency;
  omen?: Omen;
  times?: Times;
  note?: Note;
}
/**
 * 1 手の記録。``applied=False`` はその状態では使えなかった手 (理由は ``reason``).
 */
export interface StageStep {
  index: Index;
  currency: Currency1;
  currency_ja: CurrencyJa;
  omen?: Omen1;
  omen_ja?: OmenJa;
  seed: Seed1;
  applied?: Applied;
  reason?: Reason;
  before: StageItem;
  after: StageItem;
  changed: StageChange;
  cost: StageCost;
  [k: string]: unknown;
}
/**
 * ある時点のアイテム全体.
 */
export interface StageItem {
  name: Name;
  base: Base1;
  base_ja?: BaseJa;
  item_level: ItemLevel1;
  rarity: Rarity;
  quality?: Quality;
  corrupted?: Corrupted;
  prefixes?: Prefixes;
  suffixes?: Suffixes;
  [k: string]: unknown;
}
/**
 * アイテムに付いている MOD 1 行 (数値まで確定した本物).
 */
export interface StageMod {
  mod_id: ModId;
  family: Family;
  side: Side;
  tier_name: TierName;
  mod_level: ModLevel;
  text_ja: TextJa;
  text_en: TextEn;
  values?: Values;
  ranges?: Ranges;
  fractured?: Fractured;
  desecrated?: Desecrated;
  crafted?: Crafted;
  [k: string]: unknown;
}
export interface StageChange {
  added?: Added;
  removed?: Removed;
  rarity_from: RarityFrom;
  rarity_to: RarityTo;
  [k: string]: unknown;
}
export interface StageCost {
  each: Each;
  amount: Amount;
  subtotal: Subtotal;
  cumulative: Cumulative;
  [k: string]: unknown;
}
