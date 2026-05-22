/**
 * クラフト発見君 V2 — TS 集計層 (Phase γ)
 *
 * 目的:
 *   Rust 側 (`craft_v2_fetch_all`) から漸進的に届く CharacterItems を受け取り、
 *   アセンダンシー × スロット (Ring / Amulet) × affix (prefix / suffix) で集計、
 *   人数降順の `AggregatedAscendancy` を UI に渡す。
 *
 * Phase β との接続:
 *   - `window.listen("craft-v2-progress", ...)` でアセンダンシー単位の結果を受信
 *   - `invoke("craft_v2_fetch_all", { topNAscendancies, topNPerAscendancy })` で起動
 *   - listen / invoke は Tauri ランタイム前提 (ブラウザ dev は `isTauriRuntime()` でガード)
 *
 * 設計書:
 *   - research/topics/poe2-ninja-build-mod-extraction.md  (運用ポリシー)
 *   - engineering/docs/phase-beta-rust-client.md          (Rust 側 event 設計)
 *
 * @author craft-discovery 君B (Phase γ)
 * @date 2026-05-22
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { jaAscendancy, ascendancyIcon } from "../i18n/ascendancies-ja";
import { jaCurrency } from "../i18n/currencies-ja";
import { getModStatIds } from "../data/mod-translations";
import modsBundle from "../i18n/mods-bundle.json";
import trade2StatMapping from "../i18n/trade2-stat-mapping.json";
import modTierAndGroup from "../i18n/mod-tier-and-group.json";
import { SecurityStatus, Rarity } from "../constants/trade2";

/**
 * GGG 内部 stat ID → trade2 stat ID 辞書 (例: `base_maximum_life` →
 * `explicit.stat_3299347043`)。`scripts/build-trade2-stat-mapping.mjs` で
 * 生成 (mods-bundle text と trade2 公式 stats data の text 突合)。
 *
 * 2026-05-22: `openTrade2ForSelectedMods` で trade2 API に投げる前に
 * 必ずこの辞書経由で変換する (GGG 内部 ID をそのまま投げると HTTP 400
 * "Invalid stat provided" が返るため)。
 */
const TRADE2_STAT_MAPPING = trade2StatMapping as Readonly<Record<string, string>>;

/**
 * Phase ι: 静的データから引く tier 表 / group 表 (scripts/build-mod-tier-and-group.mjs 生成)。
 *
 * - key: `normalizeModTemplate(text_en)` (= ModEntry.rawTemplate と同形式)
 * - tiers[key]: T1 (強) → Tn (弱) の降順 list、UI のティアドロップダウンに使う
 * - groups[key]: その MOD が属する category 名の配列、UI の排他選択に使う
 */
interface ModTierRow {
  tier: number;
  min: number;
  max: number;
  label: string;
}
interface ModTierAndGroupJson {
  tiers: Record<string, ModTierRow[]>;
  groups: Record<string, string[]>;
}
const _modTierAndGroup = modTierAndGroup as ModTierAndGroupJson;

/**
 * Data-M2 修正 (2026-05-22): mod-tier-and-group.json のキーはリッチテキスト
 * `[Tag|Display]` / `[Tag]` 形式を保持しているため、ninja の生 explicitMods (= マーカー無し)
 * を normalizeModTemplate しただけでは never hit する。
 * 各キーごとに「stripped 版 (= リッチテキスト除去版)」も alias として同データで引けるように
 * 辞書ラッパを構築する。stripped 衝突時は最初勝ち (= 元キー優先)。
 */
function stripRichTextMarkers(s: string): string {
  return s
    .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
    .replace(/\[([^|\]]+)\]/g, "$1");
}

function buildTierGroupWithAliases<T>(
  src: Readonly<Record<string, T>>,
): Readonly<Record<string, T>> {
  const out: Record<string, T> = { ...src };
  for (const k of Object.keys(src)) {
    const stripped = stripRichTextMarkers(k);
    if (stripped && stripped !== k && !(stripped in out)) {
      out[stripped] = src[k];
    }
  }
  return out;
}

const _modTiers: Readonly<Record<string, ModTierRow[]>> = buildTierGroupWithAliases(
  _modTierAndGroup.tiers,
);
const _modGroups: Readonly<Record<string, string[]>> = buildTierGroupWithAliases(
  _modTierAndGroup.groups,
);

/** UI 公開用: ModEntry.tiers の要素型 */
export type ModTier = ModTierRow;

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

// ----------------------------------------------------------------------------
// Phase ζ: ディスクキャッシュ型 (Rust 側 CraftV2Cache のミラー)
// ----------------------------------------------------------------------------

export interface CachedRareItem {
  inventory_id: string;
  explicit_mods: string[];
  /**
   * Phase ν: poe.ninja `extended.subcategories`。古いキャッシュは無いので optional。
   * weapon2 サブタブ分割 (shield / focus / quiver / main) で参照する。
   */
  subcategories?: string[];
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
  /** 任意の JSON */
  requirements?: unknown;
  properties?: unknown;
  item_level?: number;
  level?: number;
  /** Phase ν: ユニーク盾 / フォーカス / クィーバー振り分け用 */
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

/**
 * `craft_v2_fetch_all` の戻り値 / `craft-v2-done` event payload (Phase ζ)。
 * 旧: SnapshotMeta だけ → 新: { snapshot, cache }
 */
export interface CraftV2FetchResult {
  snapshot: SnapshotMeta;
  cache: CraftV2Cache;
}

// ============================================================================
// 集計結果型 (UI 公開)
// ============================================================================

export type AffixKind = "P" | "S";
/**
 * 装備スロット種別 (2026-05-22 拡張: Ring/Amulet → 8 種)
 *
 * poe.ninja の `itemData.inventoryId` 値とのマッピング:
 *   - "ring"    ← "Ring" / "Ring2"
 *   - "amulet"  ← "Amulet"
 *   - "weapon"  ← "Weapon"   (メインハンド)
 *   - "weapon2" ← "Weapon2"  (オフハンド・サブ武器)
 *   - "helm"    ← "Helm"
 *   - "gloves"  ← "Gloves"
 *   - "body"    ← "BodyArmour"
 *   - "boots"   ← "Boots"
 *   - (Belt は除外: オーナー指示 2026-05-22)
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
   * Phase ι: この MOD が取りうる値域を T1/T2/... 降順で並べたリスト。
   * - `mod-tier-and-group.json` から rawTemplate キーで引く
   * - UI 側ではドロップダウンで「ティア指定して下限値を trade2 query に詰める」用途
   * - bundle 非ヒット (heuristic / fallback) の MOD は空配列 (= ティア選択不可)
   */
  tiers: ModTier[];
  /**
   * Phase ι: この MOD が属するカテゴリ ID (例: `["IncreasedLife"]`)。
   * - `mod-tier-and-group.json` から rawTemplate キーで引く
   * - UI 側で「同 group の MOD は同時に選べない (= 排他選択)」を実装するための逆引き
   * - bundle 非ヒットの MOD は空配列
   */
  groupIds: string[];
  /**
   * 平均値から推定したティア (1-based、T1 = 最高)。
   * - tiers が空 or avg 不明なら undefined
   * - UI 側で「最大ライフ +114 (T1)」のように表示する用途
   */
  inferredTier?: number;
}

export interface SlotMods {
  prefix: ModEntry[];
  suffix: ModEntry[];
}

/**
 * ユニーク使用率エントリ (アセンダンシー × 全スロット集計、スロット切替には依存しない)
 *
 * 同一キャラで同じユニークが複数スロット (例: 指輪 2 個) に装備されていても 1 にカウント (Set で de-dup)。
 * 代表 itemData は最初に取れたインスタンスを保持し、ホバーオーバーレイの MOD 説明に使う。
 */
export interface UniqueUsage {
  /** 表示名 (`jaCurrency()` で日本語化済、未登録は英名フォールバック) */
  name: string;
  /** 英語 typeLine (オーバーレイのキー、辞書引きにも使う) */
  nameEn: string;
  /** このユニークを所持していたキャラ数 (重複排除済) */
  count: number;
  /** 全サンプル中の比率 (0.0〜1.0、`count / sampleSize`) */
  percentage: number;
  /** poe.ninja icon URL (オーバーレイで表示) */
  icon: string;
  /** ホバーオーバーレイ用の代表 itemData (最初に取れたものを保持) */
  representative: UniqueRepresentative;
}

/**
 * ホバーオーバーレイで表示するため、representative item の最低限のフィールドだけ保持する。
 * poe.ninja の item 構造から必要なフィールドだけ抜く。
 */
export interface UniqueRepresentative {
  typeLine?: string;
  baseType?: string;
  /**
   * poe.ninja の `data.name` 生値 = ユニュ正式名 (例: "Atziri's Splendour")。
   * `typeLine` はベース表示 (例: "Sacrificial Regalia") で trade2 name index と不一致のことがある。
   * trade2 ユニュ検索ではこの `name` を優先する (2026-05-22 オーナー指示)。
   */
  name?: string;
  /** ベース implicit mod */
  implicitMods?: string[];
  /** explicit mod (ユニーク MOD) */
  explicitMods?: string[];
  /** ユニーク独自の fluff テキスト */
  flavourText?: string | string[];
  /** 要求レベル等のメタ ({ name, values, ... } 構造) */
  requirements?: unknown[];
  /** 武器/防具の properties ({ name, values, ... } 構造) */
  properties?: unknown[];
  level?: number;
  ilvl?: number;
}

/**
 * 8 スロット分の SlotMods をまとめた型 (AggregatedAscendancy 内で使用)
 */
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
  // ---- 8 スロット分の prefix / suffix 集計 ----
  ring: SlotMods;
  amulet: SlotMods;
  weapon: SlotMods;
  weapon2: SlotMods;
  helm: SlotMods;
  gloves: SlotMods;
  body: SlotMods;
  boots: SlotMods;
  /**
   * ユニーク使用率 (アセンダンシー × 全スロット、人数降順)
   * スロット切替に**依存しない** (全スロットでの出現を集計するため)。
   *
   * Phase μ (2026-05-22): 互換維持用に残す。UI は通常 `uniquesBySlot` を見るが、
   * 将来「全スロット表示」モード復活時のために削除しない。
   */
  uniques: UniqueUsage[];
  /**
   * Phase μ (2026-05-22): スロット別ユニーク使用率。
   *
   * オーナー指示: 「指輪のとこのユニークに何故か兜とかのユニークも交じってるから」を解消するため、
   * `activeSlot` に応じて表示するユニークを切り替えられるよう、各スロットごとに別バケットで集計する。
   *
   * - key: SlotKey
   * - value: そのスロットに装備されていたユニークの UniqueUsage[] (人数降順)
   * - 同キャラ × 同ユニーク × 同スロット は 1 にカウント (Ring1/Ring2 で同 unique = 1)
   */
  uniquesBySlot: { [K in SlotKey]: UniqueUsage[] };
  /** 取得失敗時の理由 (UI でエラー表示用、成功時は undefined) */
  error?: string;
  /**
   * Phase θ: このアセンダンシーの取得進捗 (N/M キャラ)。
   * - progress event 由来の場合のみ存在 (キャッシュ由来は undefined)
   * - UI 側で各タブの小バー表示に使う (取得中: done < total)
   */
  fetchProgress?: {
    done: number;
    total: number;
  };
}

// ============================================================================
// MOD 正規化 + 逆引きインデックス構築 (mods-bundle.json から)
// ============================================================================

/**
 * MOD bundle entry の最小サブセット型 (実体は他フィールドも持つ)。
 * key は bundle 内の ID (例: "AbyssMod1HMaceAmanamuPrefixDamage...")
 */
interface ModBundleEntry {
  text_en?: string;
  text_ja?: string;
  type?: "prefix" | "suffix";
  groups?: string[];
}

type ModBundleDict = Record<string, ModBundleEntry>;

/**
 * 数値を `#` プレースホルダに置換するための正規表現。
 *
 * 入力例:
 *   - explicitMod (実値):  "+47 to maximum Life"             → "+# to maximum Life"
 *   - bundle text_en:       "+(30-40) to maximum Life"        → "+# to maximum Life"
 *   - explicit (レンジ):    "Adds 2 to 5 Lightning Damage"    → "Adds # to # Lightning Damage"
 *   - bundle (レンジ):      "Adds (1-3) to (4-7) Lightning"   → "Adds # to # Lightning"
 *   - explicit (%/小数):    "9.4% increased Cast Speed"       → "#% increased Cast Speed"
 *   - bundle (%/小数):      "(8-10)% increased Cast Speed"    → "#% increased Cast Speed"
 *
 * 順序が重要:
 *   1. レンジ括弧 `(min-max)` → `#`
 *   2. 単一括弧 `(num)` → `#`
 *   3. 裸の数値 `-?\d+(\.\d+)?` → `#`
 *   最後に `% ` の余白統一は不要 (テンプレートは元々隣接)
 */
function normalizeModTemplate(text: string): string {
  let s = text;
  // Data-L6 (2026-05-22): em-dash (U+2014) / en-dash (U+2013) を通常ハイフン化。
  // poe2db スクレイプ系 (unique-mods-ja.json / mod-tier-and-group.json) は em-dash 混入、
  // poe.ninja / bundle は通常ハイフン。UniqueTooltip 側でも同じ正規化を入れている整合。
  s = s.replace(/[—–]/g, "-");
  // (min-max) → #   (POE2 bundle のレンジ表記)
  s = s.replace(/\(-?\d+(?:\.\d+)?-{1}-?\d+(?:\.\d+)?\)/g, "#");
  // (num) → #       (単一括弧囲み、bundle で稀にある)
  s = s.replace(/\(-?\d+(?:\.\d+)?\)/g, "#");
  // 裸の数値 → #    (explicitMod 実値 + bundle 残り)
  s = s.replace(/-?\d+(?:\.\d+)?/g, "#");
  return s.trim();
}

/**
 * 入力文字列から数値部分だけを順序保ったまま抽出する。
 *
 *   "+47 to maximum Life"         → [47]
 *   "Adds 2 to 5 Lightning"       → [2, 5]
 *   "9.4% increased Cast Speed"   → [9.4]
 */
function extractNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?/g);
  if (!matches) return [];
  return matches.map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

/**
 * mods-bundle.json から逆引きインデックスを構築する。
 *
 * key = normalizeModTemplate(text_en)
 * value = { type, text_ja_template, original_text_en }
 *
 * 衝突 (同 key に複数 entry がぶつかる) は最初の entry を採用。
 * 衝突発生時のメモ: 同じ表示テンプレートでも内部 stat / spawn 重み付けが
 * 違うことはあるが、UI 上の「人数集計」用途では区別不要なため最初勝ち。
 */
interface ModBundleIndexEntry {
  affix: AffixKind;
  textJaTemplate: string | null;
  textEnTemplate: string;
}

const _modBundleIndex: Map<string, ModBundleIndexEntry> = (() => {
  const dict = modsBundle as ModBundleDict;
  // 同じ正規化テンプレートに複数 entry が存在するので、各テンプレートで prefix/suffix を集計し
  // **多数決** で affix を確定する (同数なら prefix 優先)。
  // 元は「最初勝ち」だったが、`CorruptionIncreasedLife1` (suffix, 1件) が辞書順で先頭に来て、
  // 本来 prefix 13 件の `+# to maximum Life` を suffix と誤分類していたバグを 2026-05-22 修正。
  //
  // Data-M1 修正 (2026-05-22): bundle の text_en には `\n` 区切りの multi-line MOD が
  // 301 件含まれる (例: `(110-154)% increased Physical Damage\n15% reduced Attack Speed`)。
  // poe.ninja の `explicitMods` は 1 mod = 1 行で並ぶため、multi-line bundle entry の
  // 正規化キー全体では never hit する。各行ごとにも別個に登録する (同 affix を継承)。
  // 同 ja text_ja があれば同様に行分割して紐付け、行数不一致時は ja は null フォールバック。
  interface Tally {
    prefix: number;
    suffix: number;
    textJaTemplate: string | null;
  }
  const tally = new Map<string, Tally>();
  /**
   * 1 (text_en, type, text_ja?) を tally に積む。
   * multi-line text_en の場合、全体テンプレに加えて行ごとにも積む (Data-M1)。
   */
  const accumulate = (
    rawTextEn: string,
    rawTextJa: string | undefined,
    type: "prefix" | "suffix",
  ) => {
    const tplKey = normalizeModTemplate(rawTextEn);
    if (!tplKey) return;
    const cur = tally.get(tplKey) ?? {
      prefix: 0,
      suffix: 0,
      textJaTemplate: null,
    };
    if (type === "prefix") cur.prefix += 1;
    else cur.suffix += 1;
    if (!cur.textJaTemplate && rawTextJa) {
      cur.textJaTemplate = normalizeModTemplate(rawTextJa);
    }
    tally.set(tplKey, cur);
  };
  for (const key in dict) {
    const e = dict[key];
    if (!e || !e.text_en || !e.type) continue;
    // 1) 全体テンプレ (multi-line ならまるごと改行を含めて) を登録
    accumulate(e.text_en, e.text_ja, e.type);
    // 2) Data-M1: multi-line bundle entry は 1 行ずつ ja と zip して個別登録
    if (e.text_en.includes("\n")) {
      const enLines = e.text_en
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const jaLines =
        typeof e.text_ja === "string" && e.text_ja
          ? e.text_ja
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
          : [];
      // ja の行数が en と一致する場合のみ位置突合、ズレてれば ja=undefined フォールバック
      const jaMatch = enLines.length === jaLines.length;
      for (let i = 0; i < enLines.length; i++) {
        accumulate(enLines[i], jaMatch ? jaLines[i] : undefined, e.type);
      }
    }
  }
  const map = new Map<string, ModBundleIndexEntry>();
  for (const [tplKey, t] of tally) {
    const affix: AffixKind = t.prefix >= t.suffix ? "P" : "S";
    map.set(tplKey, {
      affix,
      textJaTemplate: t.textJaTemplate,
      textEnTemplate: tplKey,
    });
  }
  return map;
})();

/**
 * heuristic prefix/suffix 分類 (bundle に該当なしの fallback)
 *
 * 設計指針:
 *   - prefix 寄り: ライフ/マナ/ダメージ追加・%増加・+1 全〇〇スキル
 *   - suffix 寄り: 耐性・属性 (+#)・速度系・確率系・吸収・再生
 *   - 不明は suffix (POE は suffix の種類数が多い)
 */
function heuristicAffix(tpl: string): AffixKind {
  // suffix 強シグナル (耐性・属性・吸収・再生・確率・速度)
  if (
    /Resistance/i.test(tpl) ||
    /chance to/i.test(tpl) ||
    /Leech/i.test(tpl) ||
    /Regeneration/i.test(tpl) ||
    /Recouped/i.test(tpl) ||
    /Cast Speed/i.test(tpl) ||
    /Attack Speed/i.test(tpl) ||
    /Movement Speed/i.test(tpl) ||
    /Stun Threshold/i.test(tpl)
  ) {
    return "S";
  }
  // 個別属性 (Strength/Dex/Int) は suffix
  if (/\+# to (Strength|Dexterity|Intelligence|all Attributes)/i.test(tpl)) {
    return "S";
  }
  // prefix 強シグナル (ライフ/マナ/ダメージ追加/+1 skill level)
  if (
    /\+# to maximum (Life|Mana|Energy Shield)/i.test(tpl) ||
    /Adds # to # .*Damage/i.test(tpl) ||
    /\+# to Level of all/i.test(tpl) ||
    /increased Spell Damage/i.test(tpl) ||
    /increased.*Damage/i.test(tpl) ||
    /increased Critical/i.test(tpl)
  ) {
    return "P";
  }
  // 不明は suffix
  return "S";
}

// ============================================================================
// テンプレート → 表示文字列 (平均値埋め込み)
// ============================================================================

/**
 * `#` プレースホルダ列を avg 値で順序通り埋める。
 *   - values が空: テンプレートをそのまま返す
 *   - レンジ MOD (# が 2 個以上): 全 # を順序通りに 1 個ずつ埋める
 *   - 小数 1 桁で四捨五入 (整数の場合は整数表示)
 */
function fillTemplate(template: string, avgValues: number[]): string {
  let i = 0;
  return template.replace(/#/g, () => {
    if (i >= avgValues.length) return "#";
    const v = avgValues[i++];
    return formatAvgNumber(v);
  });
}

function formatAvgNumber(v: number): string {
  if (!Number.isFinite(v)) return "?";
  // 整数なら整数表示、小数なら 1 桁
  const rounded = Math.round(v * 10) / 10;
  if (Number.isInteger(rounded)) return rounded.toFixed(0);
  return rounded.toFixed(1);
}

// ============================================================================
// poe.ninja items[] からのフィルタ + 集計
// ============================================================================

/**
 * 1 item に対する型ガード。Rust から `unknown[]` として渡るため、最低限の検査を行う。
 *
 * poe.ninja の character endpoint の items[] は以下の **wrapper 構造** (リサーチ A 実機確認):
 * ```
 * {
 *   itemSlot: "Ring1",
 *   itemData: {
 *     frameType: 2,
 *     inventoryId: "Ring",
 *     explicitMods: ["+47 to maximum Life", ...]
 *   }
 * }
 * ```
 * 2026-05-22 の Phase γ では誤って `item.frameType` 直アクセスしていたため修正済。
 */
interface PoeNinjaItem {
  itemSlot?: string;
  itemData?: {
    frameType?: number;
    inventoryId?: string;
    explicitMods?: string[];
    implicitMods?: string[];
    /**
     * POE1 では「Mageblood」等のユニュ名だったが、POE2 では `baseType` 寄りの「ベース表示」
     * (例: "Sacrificial Regalia") が入るケースあり。trade2 検索には `name` フィールド優先。
     */
    typeLine?: string;
    /** ベースタイプ (例: "Heavy Belt") */
    baseType?: string;
    /**
     * 2026-05-22: poe.ninja `data.name` 生値 = ユニュ正式名 (例: "Atziri's Splendour")。
     * trade2 name index に登録されてる名前。typeLine と別の場合があるので独立保持。
     */
    name?: string;
    /** poe.ninja アイコン URL */
    icon?: string;
    flavourText?: string | string[];
    requirements?: unknown[];
    properties?: unknown[];
    level?: number;
    ilvl?: number;
    /**
     * Phase ν: poe.ninja `extended.subcategories`。
     * weapon2 バケットをサブ武器 / 盾 / フォーカス / クィーバーに分割するために使う。
     * 例: `["shield"]`, `["focus"]`, `["quiver"]`, `["bow"]`, `["onesword"]`, `["wand"]`
     */
    extended?: {
      subcategories?: string[];
    };
  };
}

function isPoeNinjaItem(x: unknown): x is PoeNinjaItem {
  return typeof x === "object" && x !== null;
}

/**
 * inventoryId (poe.ninja の生値) を UI スロットキーに変換。
 *
 * マッピング表 (オーナー指示 2026-05-22):
 *   Ring / Ring2             → "ring"
 *   Amulet                   → "amulet"
 *   Weapon                   → "weapon"
 *   Weapon2/Offhand/Offhand2 → "weapon2"
 *   Helm                     → "helm"
 *   Gloves                   → "gloves"
 *   BodyArmour               → "body"
 *   Boots                    → "boots"
 *   (Belt は除外)
 *
 * 該当しない場合は null。
 *
 * 第 2 引数 `subcategories` は将来のサブスロット分割 (盾/フォーカス/クィーバー 等)
 * 用に予約済 (Rust 側で抽出は続行)。現在は未使用。
 */
function inventoryIdToSlot(
  inventoryId: string,
  _subcategories: readonly string[],
): SlotKey | null {
  switch (inventoryId) {
    case "Ring":
    case "Ring2":
      return "ring";
    case "Amulet":
      return "amulet";
    case "Weapon":
      return "weapon";
    case "Weapon2":
    case "Offhand":
    case "Offhand2":
      return "weapon2";
    case "Helm":
      return "helm";
    case "Gloves":
      return "gloves";
    case "BodyArmour":
      return "body";
    case "Boots":
      return "boots";
    // Data-L5 (2026-05-22): "Belt" は意図的に除外。
    // オーナー指示「ベルトは現状ティア帯のスコープ外、混ぜると指輪枠に紛れて UX を汚す」
    // ことから default 落とし扱い。将来追加する場合は SLOT_KEYS と uniquesBySlot 初期化、
    // slotToTradeCategory ("accessory.belt") を同時に拡張する必要がある。
    default:
      return null;
  }
}

/**
 * Rare (frameType=2) かつ 8 スロットいずれかな item を抽出。
 * frameType=2 (Rare) のみ MOD 集計対象。ユニーク (frameType=3) は別ルートで集計する。
 *
 * 将来のサブスロット分割 (盾/フォーカス/クィーバー 等) に備えて
 * `extended.subcategories` も渡している (現状未使用)。
 */
function classifyEquipItem(item: PoeNinjaItem): SlotKey | null {
  const data = item.itemData;
  if (!data) return null;
  if (data.frameType !== 2) return null;
  if (!data.inventoryId) return null;
  const subcats = data.extended?.subcategories ?? [];
  return inventoryIdToSlot(data.inventoryId, subcats);
}

/**
 * ユニーク (frameType=3) の判定。8 スロットいずれかに装備されているもののみ対象。
 * 戻り値: その item のスロットキー (null なら集計対象外)
 *
 * 将来のサブスロット分割に備えて subcategories も伝搬する (現状未使用)。
 */
function classifyUniqueItem(item: PoeNinjaItem): SlotKey | null {
  const data = item.itemData;
  if (!data) return null;
  if (data.frameType !== 3) return null;
  if (!data.inventoryId) return null;
  const subcats = data.extended?.subcategories ?? [];
  return inventoryIdToSlot(data.inventoryId, subcats);
}

/**
 * 1 character の items から (slot, mod 群) を抽出してカウンタに加算。
 *
 * 同一キャラが Ring を 2 個装備していることはあるが、テンプレートが同じなら
 * 「その人物が prefix:#ライフ を持っていた」事実は 1 度しかカウントしない
 * (Set でテンプレート de-dup)。
 */
interface SlotCounter {
  /** template key → 集計 entry */
  prefix: Map<string, AggregatedModBucket>;
  suffix: Map<string, AggregatedModBucket>;
}

interface AggregatedModBucket {
  template: string;
  /** このテンプレートを持っていた人数 (重複排除済) */
  count: number;
  /** 全 occurrence の数値配列 (avg / max / min 計算用) */
  values: number[][];
  /** 日本語テンプレート (bundle 由来、なければ null) */
  textJaTemplate: string | null;
}

function emptySlotCounter(): SlotCounter {
  return {
    prefix: new Map<string, AggregatedModBucket>(),
    suffix: new Map<string, AggregatedModBucket>(),
  };
}

type AscendancySlotCounters = { [K in SlotKey]: SlotCounter };

/**
 * ユニーク集計用のバケット (アセンダンシー単位)
 * key = nameEn (typeLine) で名寄せ。同一キャラ内の de-dup は呼び側の Set で行う。
 */
interface UniqueBucket {
  nameEn: string;
  /** このユニークを所持していたキャラ数 (重複排除済) */
  count: number;
  /** 代表 itemData (最初に見たものを保持) */
  representative: UniqueRepresentative;
  /** 代表 icon URL */
  icon: string;
}

interface AscendancyCounter {
  slots: AscendancySlotCounters;
  /**
   * 全スロット合算のユニーク集計 (互換維持)。key = nameEn (typeLine)。
   * 同キャラで同ユニークが複数スロットに装備されていても 1 にカウント (呼び側の Set で de-dup)。
   */
  uniques: Map<string, UniqueBucket>;
  /**
   * Phase μ (2026-05-22): スロット別ユニーク集計。
   * key = SlotKey、value = Map<typeLine, UniqueBucket>。
   * 同キャラ × 同ユニーク × 同スロット は 1 にカウント (Ring1/Ring2 をまとめて 1)。
   */
  uniquesBySlot: { [K in SlotKey]: Map<string, UniqueBucket> };
}

function emptyAscendancyCounter(): AscendancyCounter {
  return {
    slots: {
      ring: emptySlotCounter(),
      amulet: emptySlotCounter(),
      weapon: emptySlotCounter(),
      weapon2: emptySlotCounter(),
      helm: emptySlotCounter(),
      gloves: emptySlotCounter(),
      body: emptySlotCounter(),
      boots: emptySlotCounter(),
    },
    uniques: new Map<string, UniqueBucket>(),
    uniquesBySlot: {
      ring: new Map<string, UniqueBucket>(),
      amulet: new Map<string, UniqueBucket>(),
      weapon: new Map<string, UniqueBucket>(),
      weapon2: new Map<string, UniqueBucket>(),
      helm: new Map<string, UniqueBucket>(),
      gloves: new Map<string, UniqueBucket>(),
      body: new Map<string, UniqueBucket>(),
      boots: new Map<string, UniqueBucket>(),
    },
  };
}

/**
 * mod text を正規化し、bundle index から affix / ja template を引き、
 * 該当する SlotCounter[affix] に登録する。
 *
 * - bundle hit: affix と textJaTemplate を採用
 * - bundle miss: heuristic で affix 推定、textJaTemplate=null (英語フォールバック)
 */
function addModToSlot(
  slot: SlotCounter,
  modText: string,
  perCharSeen: Set<string>,
): void {
  if (!modText || typeof modText !== "string") return;
  const tpl = normalizeModTemplate(modText);
  if (!tpl) return;

  const idx = _modBundleIndex.get(tpl);
  const affix: AffixKind = idx ? idx.affix : heuristicAffix(tpl);
  const textJaTemplate = idx ? idx.textJaTemplate : null;

  // 同キャラ重複ガード ("ring1 + ring2 同じ MOD" を 1 にする)
  //
  // Data-L3 注意 (2026-05-22): perCharSeen ヒット時 (= 同キャラ 2 個目以降) も
  // values だけは push しているため、Ring1 + Ring2 に同じ MOD が付いてるキャラの
  // 数値は avg 計算に「2 回」入る。count は 1 のままなので人数集計は正確だが、
  // 平均値の重みが「指輪 2 本 + 同じ MOD」キャラに偏る (= ティア推定が高めに出やすい)。
  // オーナー判断: 「装備個数で重み付くのは実装上の傾向値として許容、後日修正検討」。
  // 修正したい場合: `if (bucket) bucket.values.push(...)` の行を削除する (一文字)。
  const seenKey = `${affix}::${tpl}`;
  if (perCharSeen.has(seenKey)) {
    // count は加算しないが、values は記録 (平均は MOD 個数 base)
    const bucket = affix === "P" ? slot.prefix.get(tpl) : slot.suffix.get(tpl);
    if (bucket) bucket.values.push(extractNumbers(modText));
    return;
  }
  perCharSeen.add(seenKey);

  const map = affix === "P" ? slot.prefix : slot.suffix;
  let bucket = map.get(tpl);
  if (!bucket) {
    bucket = {
      template: tpl,
      count: 0,
      values: [],
      textJaTemplate,
    };
    map.set(tpl, bucket);
  } else if (!bucket.textJaTemplate && textJaTemplate) {
    // 後発で bundle hit したら ja template を採用
    bucket.textJaTemplate = textJaTemplate;
  }
  bucket.count += 1;
  bucket.values.push(extractNumbers(modText));
}

/**
 * 1 character の items[] を見て:
 *   - レア装備 (frameType=2): スロット別に MOD 集計 (8 スロット対応)
 *   - ユニーク装備 (frameType=3): キャラ単位 de-dup でユニーク使用率に加算
 *
 * 同一キャラ内の de-dup ポリシー:
 *   - MOD: スロット別 (Ring1 + Ring2 で同じ MOD を持っていても 1 と数える)
 *   - ユニーク (全スロット集計): アセンダンシー単位
 *       (同キャラで同一ユニーク = nameEn が複数スロットにあっても 1)
 *   - ユニーク (スロット別集計, Phase μ): スロット単位
 *       (同キャラで Ring1/Ring2 に同じユニーク装備でもそのスロットでは 1)
 */
function ingestCharacterItems(
  asc: AscendancyCounter,
  charItems: CharacterItems,
): void {
  if (!Array.isArray(charItems.items)) return;

  // スロット別「このキャラで見たテンプレート」セット (8 スロット分)
  const seenPerSlot: Record<SlotKey, Set<string>> = {
    ring: new Set<string>(),
    amulet: new Set<string>(),
    weapon: new Set<string>(),
    weapon2: new Set<string>(),
    helm: new Set<string>(),
    gloves: new Set<string>(),
    body: new Set<string>(),
    boots: new Set<string>(),
  };

  // このキャラで既にカウントしたユニーク (nameEn) を保持 (全スロット集計用、互換維持)
  const seenUniques = new Set<string>();

  // Phase μ: このキャラで既にカウントしたユニーク (nameEn) を保持 (スロット別集計用)
  const seenUniquesPerSlot: Record<SlotKey, Set<string>> = {
    ring: new Set<string>(),
    amulet: new Set<string>(),
    weapon: new Set<string>(),
    weapon2: new Set<string>(),
    helm: new Set<string>(),
    gloves: new Set<string>(),
    body: new Set<string>(),
    boots: new Set<string>(),
  };

  for (const raw of charItems.items) {
    if (!isPoeNinjaItem(raw)) continue;

    // --- Rare 装備の MOD 集計 ---
    const rareSlot = classifyEquipItem(raw);
    if (rareSlot) {
      const mods = Array.isArray(raw.itemData?.explicitMods)
        ? raw.itemData!.explicitMods!
        : [];
      const seen = seenPerSlot[rareSlot];
      const slotCounter = asc.slots[rareSlot];
      for (const modText of mods) {
        addModToSlot(slotCounter, modText, seen);
      }
      continue;
    }

    // --- ユニーク (frameType=3) の名前集計 ---
    const uniqueSlot = classifyUniqueItem(raw);
    if (uniqueSlot) {
      addUniqueToAscendancy(
        asc,
        raw,
        uniqueSlot,
        seenUniques,
        seenUniquesPerSlot[uniqueSlot],
      );
    }
  }
}

/**
 * 1 ユニークアイテムをアセンダンシー集計に追加する。
 *
 * Phase μ (2026-05-22): 全スロット集計 (`asc.uniques`) と
 * スロット別集計 (`asc.uniquesBySlot[slot]`) の両方に登録する。
 *
 * 同一キャラの de-dup:
 *   - 全スロット集計: `seenUniques` (アセンダンシー単位、複数スロットに同 unique でも 1)
 *   - スロット別集計: `seenUniquesInSlot` (スロット単位、Ring1/Ring2 で同 unique でも 1)
 */
function addUniqueToAscendancy(
  asc: AscendancyCounter,
  item: PoeNinjaItem,
  slot: SlotKey,
  seenUniques: Set<string>,
  seenUniquesInSlot: Set<string>,
): void {
  const data = item.itemData;
  if (!data) return;
  const nameEn = data.typeLine;
  if (!nameEn || typeof nameEn !== "string") return;

  // 代表 itemData を 1 度だけ作る (片方の bucket でも欠けてたら使えるよう lazy)
  let representative: UniqueRepresentative | null = null;
  const ensureRepresentative = (): UniqueRepresentative => {
    if (representative) return representative;
    representative = {
      typeLine: data.typeLine,
      baseType: data.baseType,
      name: typeof data.name === "string" && data.name ? data.name : undefined,
      implicitMods: Array.isArray(data.implicitMods)
        ? [...data.implicitMods]
        : undefined,
      explicitMods: Array.isArray(data.explicitMods)
        ? [...data.explicitMods]
        : undefined,
      flavourText: data.flavourText,
      requirements: Array.isArray(data.requirements)
        ? [...data.requirements]
        : undefined,
      properties: Array.isArray(data.properties)
        ? [...data.properties]
        : undefined,
      level: typeof data.level === "number" ? data.level : undefined,
      ilvl: typeof data.ilvl === "number" ? data.ilvl : undefined,
    };
    return representative;
  };
  const iconUrl = typeof data.icon === "string" ? data.icon : "";

  // ---- 全スロット集計 (互換維持) ----
  // Data-L4 注意 (2026-05-22): `representative` は bucket 作成時 (= 最初に観測した
  // インスタンス) で固定される。同名ユニーク (e.g. Mageblood) を所持する複数キャラ
  // のロール値は混ざらず、UI ツールチップでは「最初の 1 件のロール」しか出ない。
  // 仕様: 「平均ロール」は別ロジックが必要 (Phase 2 で検討)、現状は代表値表示で十分。
  if (!seenUniques.has(nameEn)) {
    seenUniques.add(nameEn);
    let bucket = asc.uniques.get(nameEn);
    if (!bucket) {
      bucket = {
        nameEn,
        count: 0,
        representative: ensureRepresentative(),
        icon: iconUrl,
      };
      asc.uniques.set(nameEn, bucket);
    }
    bucket.count += 1;
  }

  // ---- スロット別集計 (Phase μ) ----
  if (!seenUniquesInSlot.has(nameEn)) {
    seenUniquesInSlot.add(nameEn);
    const slotMap = asc.uniquesBySlot[slot];
    let slotBucket = slotMap.get(nameEn);
    if (!slotBucket) {
      slotBucket = {
        nameEn,
        count: 0,
        representative: ensureRepresentative(),
        icon: iconUrl,
      };
      slotMap.set(nameEn, slotBucket);
    }
    slotBucket.count += 1;
  }
}

// ============================================================================
// AscendancyCounter → AggregatedAscendancy (UI 公開形式)
// ============================================================================

function finalizeBuckets(
  buckets: Map<string, AggregatedModBucket>,
  affix: AffixKind,
): ModEntry[] {
  const entries: ModEntry[] = [];
  for (const bucket of buckets.values()) {
    // 各 # 位置ごとの平均値を計算
    const placeholderCount = (bucket.template.match(/#/g) || []).length;
    const avgPerPos: number[] = new Array(placeholderCount).fill(0);
    const cntPerPos: number[] = new Array(placeholderCount).fill(0);
    const flatValues: number[] = [];
    for (const arr of bucket.values) {
      for (let i = 0; i < placeholderCount; i++) {
        if (i < arr.length && Number.isFinite(arr[i])) {
          avgPerPos[i] += arr[i];
          cntPerPos[i] += 1;
          flatValues.push(arr[i]);
        }
      }
    }
    const avgValues = avgPerPos.map((sum, i) =>
      cntPerPos[i] > 0 ? sum / cntPerPos[i] : NaN,
    );

    // 日本語テンプレート優先、なければ英語テンプレート
    const tpl = bucket.textJaTemplate ?? bucket.template;
    // poe.ninja の MOD 文字列は `[Tag|Display]` 形式のリッチテキストマーカーを含む。
    // ゲーム内表示と同じく Display 側のみ残して整形する (2026-05-22)。
    // Data-M3 修正 (2026-05-22): 単独 `[Tag]` (= `|` 無し) は Display 部 = Tag なので、
    // `[X]` → `X` に変換して UI にブラケットが残らないようにする。
    const text = fillTemplate(tpl, avgValues)
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
      .replace(/\[([^|\]]+)\]/g, "$1");
    // Phase ι: tier / group ルックアップ (rawTemplate キーで引く)
    // - 2026-05-22 修正: リッチテキスト除去版でも lookup する fallback
    //   (bundle text_en は `[Tag|Display]` 込み、ninja explicitMods はマーカー込み or なし、
    //    両者を揃えるために plain text 版でも引く)
    const strippedTpl = bucket.template
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
      .replace(/\[([^|\]]+)\]/g, "$1");
    const tiers =
      _modTiers[bucket.template] ?? _modTiers[strippedTpl] ?? [];
    const groupIds =
      _modGroups[bucket.template] ?? _modGroups[strippedTpl] ?? [];

    // 平均値から推定 tier (avg がどの tier の min-max 範囲に入るか)。
    // Data-M4 修正 (2026-05-22): 単一プレースホルダ (`#` 1 個) の MOD のみ
    // 計算可能、それ以外 (e.g. `Adds # to # Lightning Damage`) は `avgValues[0]` だけ
    // 見て誤った tier 判定する恐れがあるため undefined のままにする。
    // L-7: `tiers[0].max` を参照する箇所は `Number.isFinite(tiers[0].max)` で防御。
    let inferredTier: number | undefined = undefined;
    const placeholderIsSingle = (bucket.template.match(/#/g) || []).length === 1;
    if (
      placeholderIsSingle &&
      tiers.length > 0 &&
      avgValues.length > 0 &&
      Number.isFinite(avgValues[0])
    ) {
      const av = avgValues[0];
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        if (av >= t.min && av <= t.max) {
          inferredTier = i + 1; // 1-based
          break;
        }
      }
      // 範囲外 (avg が tiers の最大 max を超えてる) は最高 tier
      // L-7: tiers[0].max が NaN/undefined 時に av > NaN = false で落ちるのを防ぐため
      // 明示的に finite チェック (壊れた tier データへの防御)。
      if (inferredTier === undefined) {
        const topMax = tiers[0].max;
        inferredTier =
          Number.isFinite(topMax) && av > topMax ? 1 : tiers.length;
      }
    }

    entries.push({
      text,
      affix,
      count: bucket.count,
      rawTemplate: bucket.template,
      values: flatValues,
      tiers,
      groupIds,
      inferredTier,
    });
  }
  // 人数降順
  entries.sort((a, b) => b.count - a.count);
  return entries;
}

function finalizeSlot(slot: SlotCounter): SlotMods {
  return {
    prefix: finalizeBuckets(slot.prefix, "P"),
    suffix: finalizeBuckets(slot.suffix, "S"),
  };
}

/**
 * ユニーク集計バケット群を UI 公開形式 (UniqueUsage[]) に変換する。
 * 人数降順、`sampleSize` で割って百分比を算出する。
 */
function finalizeUniques(
  buckets: Map<string, UniqueBucket>,
  sampleSize: number,
): UniqueUsage[] {
  const list: UniqueUsage[] = [];
  for (const b of buckets.values()) {
    list.push({
      name: jaCurrency(b.nameEn),
      nameEn: b.nameEn,
      count: b.count,
      percentage: sampleSize > 0 ? b.count / sampleSize : 0,
      icon: b.icon,
      representative: b.representative,
    });
  }
  list.sort((a, b) => b.count - a.count);
  return list;
}

function finalizeAscendancy(
  classEn: string,
  usagePercent: number,
  sampleSize: number,
  counter: AscendancyCounter,
  error?: string,
  fetchProgress?: { done: number; total: number },
): AggregatedAscendancy {
  // Phase μ: スロット別ユニーク使用率 (8 スロット分)
  const uniquesBySlot: { [K in SlotKey]: UniqueUsage[] } = {
    ring: finalizeUniques(counter.uniquesBySlot.ring, sampleSize),
    amulet: finalizeUniques(counter.uniquesBySlot.amulet, sampleSize),
    weapon: finalizeUniques(counter.uniquesBySlot.weapon, sampleSize),
    weapon2: finalizeUniques(counter.uniquesBySlot.weapon2, sampleSize),
    helm: finalizeUniques(counter.uniquesBySlot.helm, sampleSize),
    gloves: finalizeUniques(counter.uniquesBySlot.gloves, sampleSize),
    body: finalizeUniques(counter.uniquesBySlot.body, sampleSize),
    boots: finalizeUniques(counter.uniquesBySlot.boots, sampleSize),
  };

  return {
    id: classEn.toLowerCase().replace(/\s+/g, "-"),
    classEn,
    name: jaAscendancy(classEn),
    usagePercent,
    sampleSize,
    icon: ascendancyIcon(classEn),
    ring: finalizeSlot(counter.slots.ring),
    amulet: finalizeSlot(counter.slots.amulet),
    weapon: finalizeSlot(counter.slots.weapon),
    weapon2: finalizeSlot(counter.slots.weapon2),
    helm: finalizeSlot(counter.slots.helm),
    gloves: finalizeSlot(counter.slots.gloves),
    body: finalizeSlot(counter.slots.body),
    boots: finalizeSlot(counter.slots.boots),
    uniques: finalizeUniques(counter.uniques, sampleSize),
    uniquesBySlot,
    error,
    fetchProgress,
  };
}

// ============================================================================
// CraftV2Progress → AggregatedAscendancy 単体集計
// ============================================================================

/**
 * Rust から届いた 1 アセンダンシー分の progress payload を集計して返す。
 *
 * UI 側は受信ごとにこれを呼んで配列に push / merge する想定。
 */
export function aggregateFromProgress(
  payload: CraftV2Progress,
): AggregatedAscendancy {
  const counter = emptyAscendancyCounter();
  for (const ci of payload.items) {
    ingestCharacterItems(counter, ci);
  }
  return finalizeAscendancy(
    payload.ascendancy,
    payload.percentage,
    payload.characters_done,
    counter,
    undefined,
    // Phase θ: progress payload からそのまま fetch 進捗を持ち回す。
    // UI 側で「N/50 取得中」の小バー表示に使う。
    {
      done: payload.characters_done,
      total: payload.characters_total,
    },
  );
}

// ============================================================================
// Phase ζ: キャッシュ → AggregatedAscendancy 復元
// ============================================================================

/**
 * 縮小形式の `CachedCharacter` を、`ingestCharacterItems` が読める
 * `CharacterItems` (= 元の poe.ninja items[] wrapper 形式) に復元する。
 *
 * 復元時にスロット位置情報は失われている (Ring1/Ring2 区別不可) が、
 * UI 集計は inventoryId だけ見るので問題ない。
 */
function cachedCharacterToCharacterItems(c: CachedCharacter): CharacterItems {
  const items: unknown[] = [];
  for (const r of c.rare_items) {
    // Phase ν: extended.subcategories を復元 (weapon2 サブタブ分割で参照される)
    //
    // Data-L8 (2026-05-22): `frameType: 2` (= レア) を固定値で書き出す。
    // CachedRareItem は Rust 側の `CraftV2Cache.rare_items[]` 規約上「レアのみ」を
    // 格納するスキーマ (frameType フィールド自体を持たない、保存時にレア判定で振り分け済み)。
    // ユニークは別配列 `unique_items[]` に行くため、ここで他値を混ぜる余地はない。
    // 規約変更時 (e.g. マジック対応) は CachedRareItem スキーマ + Rust 保存ロジックを
    // 同時に拡張する必要がある。
    items.push({
      itemSlot: r.inventory_id,
      itemData: {
        frameType: 2,
        inventoryId: r.inventory_id,
        explicitMods: r.explicit_mods,
        extended: { subcategories: r.subcategories ?? [] },
      },
    });
  }
  for (const u of c.unique_items) {
    items.push({
      itemSlot: u.inventory_id,
      itemData: {
        frameType: 3,
        inventoryId: u.inventory_id,
        typeLine: u.type_line,
        baseType: u.base_type,
        name: u.name,
        icon: u.icon,
        implicitMods: u.implicit_mods,
        explicitMods: u.explicit_mods,
        flavourText: u.flavour_text as string | string[] | undefined,
        requirements: Array.isArray(u.requirements) ? u.requirements : undefined,
        properties: Array.isArray(u.properties) ? u.properties : undefined,
        ilvl: u.item_level,
        level: u.level,
        // Phase ν: ユニーク側も subcategories 復元
        extended: { subcategories: u.subcategories ?? [] },
      },
    });
  }
  return {
    account: c.account,
    name: c.name,
    items,
  };
}

/**
 * 1 アセンダンシー分の `CachedAscendancy` から `AggregatedAscendancy` を再構築する。
 * Rust 側 progress emit を回さずにキャッシュ即時表示するための関数 (Phase ζ)。
 *
 * 2026-05-22 修正 (UI-H2):
 *   進捗バーの「キャッシュ表示中なのに 100% 張り付き」問題を防ぐため、
 *   `fetchProgress = { done: 0, total: cached.characters.length }` を仮入れする。
 *   これで `overallProgressPercent` は「未到着 (0%)」相当として扱い、差分 progress
 *   が届いた時点で `aggregateFromProgress` 由来の正しい done/total に置換される。
 *   Phase ζ 本来期待 (キャッシュ表示=0% から進む) に合致。
 */
export function aggregateFromCachedAscendancy(
  cached: CachedAscendancy,
): AggregatedAscendancy {
  const counter = emptyAscendancyCounter();
  for (const c of cached.characters) {
    ingestCharacterItems(counter, cachedCharacterToCharacterItems(c));
  }
  // キャッシュサイズが 0 の異常ケースでは total=1 にフォールバックして
  // 0/0 が「完了 (acc+1)」扱いされるバグを避ける。
  const cachedCount = cached.characters.length;
  return finalizeAscendancy(
    cached.class,
    cached.percentage,
    cachedCount,
    counter,
    undefined,
    { done: 0, total: cachedCount > 0 ? cachedCount : 1 },
  );
}

/**
 * キャッシュ全体から `AggregatedAscendancy[]` を構築する。
 * 使用率降順で返す (Rust 側がそうしているのと UI 期待を揃える)。
 */
export function aggregateFromCache(cache: CraftV2Cache): AggregatedAscendancy[] {
  const out = cache.ascendancies.map((a) => aggregateFromCachedAscendancy(a));
  out.sort((a, b) => b.usagePercent - a.usagePercent);
  return out;
}

// ============================================================================
// Phase ζ: ディスクキャッシュ I/O ラッパ (Tauri command 経由)
// ============================================================================

/**
 * ディスクキャッシュを読込む。
 * - Tauri 環境外なら null
 * - ファイル無し / 壊れキャッシュなら null
 * - I/O エラーも null フォールバック (UI を止めない)
 */
export async function loadCraftV2Cache(): Promise<CraftV2Cache | null> {
  if (!isTauriRuntime()) return null;
  try {
    const cache = await invoke<CraftV2Cache | null>("craft_v2_cache_load");
    return cache ?? null;
  } catch (err) {
    console.warn("[craft-discovery-v2] loadCraftV2Cache failed:", err);
    return null;
  }
}

/**
 * ディスクキャッシュを保存。失敗時は console.warn のみ (UI は壊さない)。
 */
export async function saveCraftV2Cache(cache: CraftV2Cache): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke<void>("craft_v2_cache_save", { cache });
  } catch (err) {
    console.warn("[craft-discovery-v2] saveCraftV2Cache failed:", err);
  }
}

/**
 * ディスクキャッシュを削除 (UI の「キャッシュ削除 + 全取得」用)。
 */
export async function clearCraftV2Cache(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await invoke<void>("craft_v2_cache_clear");
  } catch (err) {
    console.warn("[craft-discovery-v2] clearCraftV2Cache failed:", err);
  }
}

// ============================================================================
// 公開 API: startCraftDiscoveryV2
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
   * Phase ζ: ディスクキャッシュからの即時 UI 反映フック (任意)。
   * - キャッシュあり + useCache=true の時、invoke 発火**前**に各アセンダンシーをこのコールバックで流す。
   *   UI は onProgress と同じ要領で受け取って即表示できる (n=0 → キャッシュ件数の状態)。
   * - キャッシュなしや useCache=false なら呼ばれない。
   */
  onCacheReady?: (data: AggregatedAscendancy[], cache: CraftV2Cache) => void;
  /**
   * Phase ζ: ディスクキャッシュを使うかどうか (default true)。
   * - true:  craft_v2_cache_load → 即時表示 + 差分モードで craft_v2_fetch_all
   * - false: キャッシュ無視で全取得 (旧挙動と同等、「キャッシュ削除 + 全取得」用)
   */
  useCache?: boolean;
  /**
   * Phase ξ: 取得対象リーグの url (例: "vaal" / "hcvaal" / "standard")。
   * - undefined: 従来通り economyLeagues[0] (= メイン通常リーグ)
   * - 指定あり : 該当リーグで取得。キャッシュ判定は Rust 側で league_url 一致時のみ流用
   *   (= リーグ違うとキャッシュ流用せず再取得、キャッシュは単一ファイルなので上書き)
   */
  leagueUrl?: string;
}

// Phase ξ: poe.ninja の economyLeagues 一覧 (動的取得)
export interface LeagueInfo {
  url: string;
  name: string;
  is_hardcore: boolean;
  is_ssf: boolean;
}

/**
 * Phase ξ: 起動時 / 設定 UI から呼ばれ、poe.ninja の現リーグ一覧を返す。
 * 通常リーグ + Hardcore + SSF + Standard 等が含まれる (POE2 では 6 種程度)。
 * 失敗時は空配列ではなく Error throw (UI 側でフォールバック)。
 */
export async function fetchEconomyLeagues(): Promise<LeagueInfo[]> {
  if (!isTauriRuntime()) return [];
  return await invoke<LeagueInfo[]>("fetch_economy_leagues");
}

/**
 * 取得を開始する。
 *
 * 戻り値:
 *   - unlisten 関数 (UI 側で onBeforeUnmount で呼ぶ)
 *   - Tauri 環境でない場合は null (= 何もしない安全フォールバック)
 *
 * 内部動作:
 *   1. `craft-v2-progress` / `craft-v2-error` / `craft-v2-done` を listen
 *   2. `invoke("craft_v2_fetch_all", { topNAscendancies, topNPerAscendancy })`
 *      を fire-and-forget で発火 (進捗は event 経由)
 *   3. progress 受信 → `aggregateFromProgress` で集計 → `onProgress` コールバック
 *   4. error 受信 → `onError` コールバック (継続)
 *   5. done 受信 → `onDone(snapshot)` コールバック
 *
 * 注意:
 *   - 同一画面で 2 回以上呼んだ場合、Rust 側は別タスクで動くため event が混ざる。
 *     UI 側で前回の unlisten を呼んでから再 start すること (V2B.vue 「更新」ボタン)。
 */
export async function startCraftDiscoveryV2(
  options: StartCraftDiscoveryV2Options,
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) {
    // ブラウザ dev 環境では Tauri command が動かないため早期 return
    options.onFatal?.(
      "Tauri ランタイム外では実行できません (ブラウザ dev mode)",
    );
    return null;
  }

  const {
    topNAscendancies = 10,
    topNPerAscendancy = 50,
    onProgress,
    onError,
    onDone,
    onFatal,
    onCacheReady,
    useCache = true,
    leagueUrl,
  } = options;

  // ---- Phase ζ: キャッシュロード + 即時 UI 反映 ----
  // listen 登録より前に load して、UI が即「とりあえず表示」できる状態を作る。
  // 差分モード判定は Rust 側に任せる (snapshot_version 比較)。
  let prevCache: CraftV2Cache | null = null;
  if (useCache) {
    prevCache = await loadCraftV2Cache();
    if (prevCache && onCacheReady) {
      try {
        const cachedAggs = aggregateFromCache(prevCache);
        onCacheReady(cachedAggs, prevCache);
      } catch (err) {
        // 復元失敗してもフェッチは続行
        console.warn(
          "[craft-discovery-v2] aggregateFromCache failed, ignoring cache:",
          err,
        );
        prevCache = null;
      }
    }
  }

  // listen は async なので 4 つ並列に await する (Phase θ で checkpoint 追加)
  const [unProgress, unError, unDone, unCheckpoint] = await Promise.all([
    listen<CraftV2Progress>("craft-v2-progress", (e) => {
      try {
        const agg = aggregateFromProgress(e.payload);
        onProgress(agg);
      } catch (err) {
        // 集計内部のバグで UI が止まらないようキャッチ
        onError(
          `集計エラー (${e.payload.ascendancy}): ${err instanceof Error ? err.message : String(err)}`,
          { ascendancy: e.payload.ascendancy, phase: "aggregate" },
        );
      }
    }),
    listen<CraftV2ErrorPayload>("craft-v2-error", (e) => {
      const p = e.payload ?? {};
      const msg = `[${p.phase ?? "?"}] ${p.ascendancy ?? "(unknown asc)"}: ${p.error ?? "unknown error"}`;
      onError(msg, p);
    }),
    // Phase ζ: done payload は CraftV2FetchResult ({ snapshot, cache }) に拡張済。
    // ここで cache を自動保存し、onDone には snapshot だけ流す。
    listen<CraftV2FetchResult>("craft-v2-done", (e) => {
      const payload = e.payload;
      // 保存は fire-and-forget (失敗しても UI は止めない)
      void saveCraftV2Cache(payload.cache);
      onDone(payload.snapshot);
    }),
    // Phase θ: アセンダンシー単位 cache checkpoint。
    // 5/10 で kill されてもここまで分のキャッシュが残るようにする (次回起動の差分モードに繋がる)。
    // payload は **累積** CraftV2Cache (= これまで完了したアセンダンシー分のみ)。
    // disk write は数百KB なので毎回上書きで OK (atomic rename はしない)。
    listen<CraftV2Cache>("craft-v2-checkpoint", (e) => {
      void saveCraftV2Cache(e.payload);
    }),
  ]);

  const unlistenAll: UnlistenFn = () => {
    try {
      unProgress();
    } catch {
      /* noop */
    }
    try {
      unError();
    } catch {
      /* noop */
    }
    try {
      unDone();
    } catch {
      /* noop */
    }
    try {
      unCheckpoint();
    } catch {
      /* noop */
    }
  };

  // invoke は await すると全完了まで止まるが、UI は progress 経由で先に埋まる。
  // ここでは catch だけ仕込んで fire-and-forget。
  // Phase ζ: prevCache を渡すと Rust 側で差分モードに入る (version 一致時のみ)。
  invoke<CraftV2FetchResult>("craft_v2_fetch_all", {
    topNAscendancies,
    topNPerAscendancy,
    prevCache,
    leagueUrl: leagueUrl ?? null,
  })
    .then(() => {
      // 完了は craft-v2-done event 側で受け取って save するので、ここでは何もしない。
      // (event listen と invoke return が前後する可能性があるため、UI は event 側を信頼)
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      // 致命的エラー (index-state / build-index-state 失敗等)
      onFatal?.(`craft_v2_fetch_all 失敗: ${msg}`);
    });

  return unlistenAll;
}

// ============================================================================
// trade2 同期検索 (旧 openClusterInTrade2 パターンを V2 に移植)
//
// オーナー指示 (2026-05-22):
//   「ここスタッツフィルターと同期させないといけないかもね。
//    前作った押したらトレード行く感じの挙動で」
//
// 旧 craft-discovery.ts の `openClusterInTrade2` を、発見 V2 の
// 「ユーザーが MOD チェック → 検索ボタン」フローに合わせて移植したもの。
// ============================================================================

interface Trade2SearchResponse {
  id?: string;
  total?: number;
  result?: string[];
}

/**
 * SlotKey → trade2 API の type_filters.category.option 値マッピング。
 *
 * 値は POE2 公式 trade2 で使われる category option (旧 craft-discovery.ts の
 * `categoryToOption()` および公式 trade2 UI の type_filters と整合)。
 *
 * メイン武器 / オフハンドは V2 集計が「Weapon / Weapon2」inventoryId をベース
 * 種別関係なく束ねるため、ここでも一律 "weapon" を返す。trade2 側で 1H/2H/弓
 * 等を絞りたい場合はユーザーが trade2 サイト上でさらにベース種別 filter を
 * 触ることになる (Phase 1 では category だけで十分とのオーナー判断)。
 */
function slotToTradeCategory(slot: SlotKey): string {
  switch (slot) {
    case "ring":
      return "accessory.ring";
    case "amulet":
      return "accessory.amulet";
    case "helm":
      return "armour.helmet";
    case "gloves":
      return "armour.gloves";
    case "body":
      return "armour.chest";
    case "boots":
      return "armour.boots";
    case "weapon":
    case "weapon2":
      return "weapon";
  }
}

/**
 * V2 の `snapshot_name` (kebab-case, 例: "fate-of-the-vaal") を
 * trade2 API が要求する正式リーグ名 (例: "Fate of the Vaal") へ変換する簡易版。
 *
 * 厳密には poe.ninja の `economyLeagues[].name` を参照すべきだが、
 * 現状 Rust 側 SnapshotMeta はそれを保持していない。安全策として:
 *   1. 既知マッピングを優先 (ハードコード: 現リーグ + HC/SSF バリアント)
 *   2. 未知のリーグは kebab → スペース + 単語頭文字大文字化で生成
 *      ("-hc"/"-ssfhc"/"-ssf" suffix は "Hardcore"/"SSF" prefix に変換)
 *      `of` `the` `and` 等 stopword は小文字維持 (POE 公式表記準拠)
 *
 * Data-H4 修正:
 *   - 旧 "fate-of-the-vaalhc" マッピングは poe.ninja URL 命名規約と不一致だった
 *     (実際は "-hc" を独立 suffix で持つ可能性が高い)。HC/SSF バリアントを
 *     "fate-of-the-vaal-hc" 系で整理。実 URL は実機で要検証 (TODO)。
 *   - fallback の `charAt(0).toUpperCase()` は "of"/"the"/"and" も大文字化して
 *     "Fate Of The Vaal" になり、trade2 API が 400 を返していた。stopword 小文字
 *     維持に変更。先頭単語は常に大文字 (タイトルケース慣習)。
 *
 * TODO (後日): poe.ninja の index-state から `economyLeagues[].name` も
 * 取得して SnapshotMeta に持たせ、ここを正規参照に置き換える。
 */
const TRADE_LEAGUE_STOPWORDS = new Set([
  "of",
  "the",
  "and",
  "or",
  "in",
  "a",
  "an",
  "to",
  "for",
]);

function titleCaseLeagueWords(words: string[]): string {
  return words
    .filter((w) => w.length > 0)
    .map((w, i) => {
      if (i > 0 && TRADE_LEAGUE_STOPWORDS.has(w.toLowerCase())) {
        return w.toLowerCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function snapshotNameToTradeLeague(snapshotName: string): string {
  if (!snapshotName) return "Fate of the Vaal";

  // 既知リーグの直接マッピング (将来追加分はここに足す)
  // ※ "-ssfhc" / "-ssf" / "-hc" の suffix 規約は poe.ninja URL を実機で要検証。
  //    分からない場合は fallback の suffix 検出に任せる方が安全。
  const KNOWN: Record<string, string> = {
    "standard": "Standard",
    "hardcore": "Hardcore",
    "fate-of-the-vaal": "Fate of the Vaal",
    "fate-of-the-vaal-hc": "Hardcore Fate of the Vaal",
    "fate-of-the-vaal-ssf": "SSF Fate of the Vaal",
    "fate-of-the-vaal-ssfhc": "Hardcore SSF Fate of the Vaal",
  };
  const known = KNOWN[snapshotName.toLowerCase()];
  if (known) return known;

  // フォールバック: kebab → "Word of the Word" (stopword 小文字維持) + suffix → prefix 変換
  // 順序: ssfhc → ssf → hc の順で剥がす (-ssfhc が -hc にもマッチしてしまうのを防ぐ)
  const lower = snapshotName.toLowerCase();
  let core = lower;
  let prefix = "";
  if (core.endsWith("-ssfhc")) {
    core = core.slice(0, -"-ssfhc".length);
    prefix = "Hardcore SSF ";
  } else if (core.endsWith("-ssf")) {
    core = core.slice(0, -"-ssf".length);
    prefix = "SSF ";
  } else if (core.endsWith("-hc")) {
    core = core.slice(0, -"-hc".length);
    prefix = "Hardcore ";
  }
  const words = core.split("-").filter((w) => w.length > 0);
  return prefix + titleCaseLeagueWords(words);
}

/**
 * 選択された MOD 群を stat ID に変換し、trade2 公式 API へ search POST、
 * 返ってきた search id 付きの trade2 サイト URL を OS 既定ブラウザで開く。
 *
 * 旧 craft-discovery.ts の `openClusterInTrade2` と同じ「押したらトレード行く」
 * 挙動を、発見 V2 の (ascendancy × slot × prefix/suffix) UI に合わせて再実装。
 *
 * stat ID の引き方:
 *   1. `mod.rawTemplate` (英語テンプレ `#` プレースホルダ) で getModStatIds()
 *   2. 取れなければ `mod.text` (日本語化済表示) で再試
 *   3. それでも取れなければ missingMods に積んでスキップ
 *
 * @param args.selectedMods 選択された ModEntry の配列
 * @param args.slot         現在のアクティブスロット (category filter に使う)
 * @param args.league       snapshot.snapshot_name (kebab-case OK、自動変換)
 * @returns 開いた URL、stat ID 引き失敗した MOD のテキスト、適用された stat 数
 *
 * @throws Tauri 環境外で呼ばれた場合 / trade2_search が id を返さなかった場合
 */
export async function openTrade2ForSelectedMods(args: {
  selectedMods: ModEntry[];
  slot: SlotKey;
  league: string;
  /**
   * Phase ι: 各 MOD ごとの「最低値」(= 選択ティアの min) を rawTemplate キーで指定。
   * - undefined / null / 値が無い MOD は min 指定なし (= "そのモッドが付いてれば良い")
   * - 値があればそれを trade2 query の対応 stat filter に `value: { min: n }` で詰める
   * - 1 mod で複数 trade2 stat ID にマップされる場合は全部に同じ min を適用 (簡易策)
   *
   * Data-L1 注意 (2026-05-22): trade2-stat-mapping.json には 33 件「同 GGG ID が複数の
   * trade2-ID にマップ」される副作用がある (例: 1 GGG ID → "explicit.stat_A" + "explicit.stat_B")。
   * tierMin を全 trade2 ID に同値で適用すると本来 stat_A 単独で十分なケースで
   * stat_B にも下限がかかり、検索ヒットが減るリスクがある。実用上は
   *   - `(bucket.template.match(/#/g) || []).length === 1` (= 単一プレースホルダ) かつ
   *   - 1 GGG stat ID マップ (= mapping JSON が単一 trade2 ID のみ返す)
   * の MOD でのみ tierMin を渡すよう UI 側で絞ることが推奨される。
   * (本関数自体の挙動は変えず、コメントで運用ガイドのみ明示。)
   */
  tierMinByMod?: Record<string, number>;
}): Promise<{ openedUrl: string; missingMods: string[]; statCount: number }> {
  const { selectedMods, slot, league, tierMinByMod } = args;

  if (!isTauriRuntime()) {
    throw new Error(
      "trade2 連携は Tauri ネイティブ環境でのみ動作します (ブラウザ dev では無効)",
    );
  }

  // 1. 各 MOD を stat ID に逆引き → 更に trade2 ID に変換
  //
  // getModStatIds() は mods-bundle.json の `stats[].id` (GGG 内部表記、例:
  // `maximum_mana_+%`、`base_maximum_mana`) を返す。
  // trade2 公式 API はこれを認識せず `explicit.stat_xxxxxx` 形式を要求するため、
  // `trade2-stat-mapping.json` (scripts/build-trade2-stat-mapping.mjs で事前生成)
  // を介して変換する。
  //
  // ID 解決失敗パターン:
  //   - getModStatIds が空: bundle に当該 mod が無い (text レベルの不一致)
  //   - mapping に無い: bundle にはあるが trade2 stat data に対応エントリ無し
  //                      (例: avoid_chill_%, axe_attack_speed_+% は trade2 API
  //                       の検索 stat に存在しない POE2 限定 stat)
  //   いずれも missingMods に積んで UI へフィードバック。
  //
  // Phase ι: tierMinByMod があれば、その MOD に紐づく trade2 stat ID 全てに
  //          `value: { min: n }` を適用する。
  /** trade2 filter 配列 (id 単位の重複は seen で抑止) */
  const statFilters: Array<{ id: string; disabled: boolean; value?: { min: number } }> = [];
  const seen = new Set<string>();
  const missingMods: string[] = [];

  for (const mod of selectedMods) {
    let internalIds: string[] = [];
    if (mod.rawTemplate) internalIds = getModStatIds(mod.rawTemplate);
    if (internalIds.length === 0 && mod.text) internalIds = getModStatIds(mod.text);
    if (internalIds.length === 0) {
      missingMods.push(mod.text || mod.rawTemplate || "(unknown mod)");
      continue;
    }
    // GGG 内部 ID -> trade2 ID 変換 (1 mod で複数 stat ある場合も対応)
    const tradeIds: string[] = [];
    for (const internalId of internalIds) {
      const tradeId = TRADE2_STAT_MAPPING[internalId];
      if (tradeId) tradeIds.push(tradeId);
    }
    if (tradeIds.length === 0) {
      // bundle hit したが trade2 mapping 無し (例: trade2 API 未対応の POE2 mod)
      missingMods.push(mod.text || mod.rawTemplate || "(unknown mod)");
      continue;
    }
    // Phase ι: この MOD のティア下限値 (任意)
    const tierMin = tierMinByMod && mod.rawTemplate
      ? tierMinByMod[mod.rawTemplate]
      : undefined;
    const hasTierMin =
      typeof tierMin === "number" && Number.isFinite(tierMin);

    for (const id of tradeIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const filter: { id: string; disabled: boolean; value?: { min: number } } = {
        id,
        disabled: false,
      };
      if (hasTierMin) {
        filter.value = { min: tierMin as number };
      }
      statFilters.push(filter);
    }
  }

  // 2. trade2 query を組立 (旧 buildClusterSearchQuery を簡略化したもの)
  //    - rarity: rare 固定 (V2 はレア装備集計が前提)
  //    - status: online (旧コードの "any" より新鮮な listing が出る)
  //    - category: slotToTradeCategory(slot)
  //    - stats: 選択 MOD の stat ID を「and」で連結、min は tierMinByMod 由来で
  //      MOD ごとに optional (Phase ι: 指定なしの MOD は「付いてれば良い」)
  // Data-M6 (2026-05-22): `status.option = "securable"` は POE2 trade2 公式 API の
  // 拡張オプションで「直近接続 + 短時間オフライン」を含む実購入可能 listing を意味する。
  // 公式 API リファレンス (https://www.pathofexile.com/developer/docs/reference#trade)
  // および POE2 trade2 サイト UI の ANY デフォルト挙動と整合 (旧コメントの "online より新鮮"
  // 表現は不正確だったため、SecurityStatus 定数経由で意図を明確化)。
  const query = {
    query: {
      status: { option: SecurityStatus.Securable },
      stats: [
        {
          type: "and",
          filters: statFilters,
        },
      ],
      filters: {
        type_filters: {
          filters: {
            rarity: { option: Rarity.Rare },
            category: { option: slotToTradeCategory(slot) },
          },
        },
        // 即時購入 (INSTANT BUYOUT) はデフォルト挙動 = sale_type フィールドを送らない。
        // POE2 trade2 公式 filters API で `option: null` = "Buyout or Fixed Price" だが
        // JSON で null を送ると Invalid と判定されるので、フィールド自体を省略する。
      },
    },
    sort: { price: "asc" },
  };

  // 3. trade2_search POST
  const tradeLeague = snapshotNameToTradeLeague(league);
  const search = await invoke<Trade2SearchResponse>("trade2_search", {
    req: { league: tradeLeague, query },
  });

  if (!search.id) {
    throw new Error("trade2_search にレスポンス id がありません");
  }

  // 4. URL 構築 → 外部ブラウザで開く
  const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(tradeLeague)}/${search.id}`;
  await openUrl(url);

  return {
    openedUrl: url,
    missingMods,
    statCount: statFilters.length,
  };
}

/**
 * ユニーク名で trade2 検索を開く (即時購入モード)。
 * V2B のユニーク使用率セクション行クリックから呼ばれる。
 *
 * - name フィールドにユニーク英語名を指定して絞り込み
 * - sale_type は null option = "Buyout or Fixed Price" (INSTANT BUYOUT 相当)
 */
export async function openTrade2ForUnique(args: {
  nameEn: string;
  league: string;
  /**
   * 2026-05-22 追加: name 検索失敗 (400 "Unknown item name") 時に
   * baseType + rarity=unique で fallback 検索するためのベース種別。
   * 渡されない場合は trade2 トップに飛ばす。
   */
  baseType?: string;
}): Promise<{ openedUrl: string }> {
  const tradeLeague = snapshotNameToTradeLeague(args.league);
  if (!isTauriRuntime()) {
    throw new Error(
      "trade2 連携は Tauri ネイティブ環境でのみ動作します (ブラウザ dev では無効)",
    );
  }

  // 1st try: name で絞り込み
  const primaryQuery = {
    query: {
      status: { option: SecurityStatus.Securable },
      name: { discriminator: null, option: args.nameEn },
      filters: {
        type_filters: {
          filters: {
            rarity: { option: Rarity.Unique },
          },
        },
      },
    },
    sort: { price: "asc" },
  };
  try {
    const search = await invoke<Trade2SearchResponse>("trade2_search", {
      req: { league: tradeLeague, query: primaryQuery },
    });
    if (search.id) {
      const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(tradeLeague)}/${search.id}`;
      await openUrl(url);
      return { openedUrl: url };
    }
    throw new Error("trade2_search にレスポンス id がありません");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // 2026-05-22: POE2 trade2 の name index に未登録の新ユニーク (例: Sacrificial Regalia)
    // で 400 "Unknown item name" が出るケースの fallback。
    const isUnknownName =
      msg.includes("Unknown item name") || msg.includes("400");
    if (!isUnknownName) throw err;

    // Fallback 1: baseType + rarity=unique で再検索 (ベース種別レベルで絞り込み、ユーザーが手動で絞れる)
    if (args.baseType) {
      const fallbackQuery = {
        query: {
          status: { option: SecurityStatus.Securable },
          type: { discriminator: null, option: args.baseType },
          filters: {
            type_filters: {
              filters: {
                rarity: { option: Rarity.Unique },
              },
            },
          },
        },
        sort: { price: "asc" },
      };
      try {
        const fallback = await invoke<Trade2SearchResponse>("trade2_search", {
          req: { league: tradeLeague, query: fallbackQuery },
        });
        if (fallback.id) {
          const url = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(tradeLeague)}/${fallback.id}`;
          await openUrl(url);
          // 成功扱いだが、name 未登録だった旨は警告として呼出側に伝えたい
          // (戻り値は openedUrl のみだが、ユーザーは ベース種別検索結果 を見ることになる)
          console.warn(
            `[openTrade2ForUnique] name "${args.nameEn}" が trade2 未登録 → baseType "${args.baseType}" で fallback 検索`,
          );
          return { openedUrl: url };
        }
      } catch (fallbackErr) {
        console.warn(
          "[openTrade2ForUnique] baseType fallback も失敗:",
          fallbackErr,
        );
      }
    }

    // Fallback 2: trade2 検索ホームに飛ばす (ユーザー手動検索)
    const homeUrl = `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(tradeLeague)}`;
    await openUrl(homeUrl);
    throw new Error(
      `trade2 で「${args.nameEn}」は未登録のユニーク名です。検索ホームを開きました → 手動で検索してください。`,
    );
  }
}

// ============================================================================
// テスト容易化のための export (UI からは使わない)
// ============================================================================

export const _internal = {
  normalizeModTemplate,
  extractNumbers,
  heuristicAffix,
  fillTemplate,
  modBundleIndex: _modBundleIndex,
  slotToTradeCategory,
  snapshotNameToTradeLeague,
};
