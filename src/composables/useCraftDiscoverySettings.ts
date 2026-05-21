// useCraftDiscoverySettings
// ----------------------------------------------------------------------------
// クラフト発見君 Phase 1 manual-controls.md 統合案準拠の設定 state composable。
//
// 担当範囲（オーナー方針 2026-05-21 + statement of work）:
//   1. 価格レンジ (divine 固定、min/max)
//   2. 取得件数 (300/500/800、1000 は警告モーダル付き)
//   3. ホット閾値 (件数 5-50 step5 + 時間窓 1h/3h/6h/12h)
//   4. カテゴリ拡張 hook (Phase 1 では ring/amulet のみ、Phase 2a で防具 5 種、2b で武器追加予定)
//   5. 汎用テスト設定 (minCountThreshold / topNDisplay / freshHot/Warm/Cold)
//
// localStorage に v1 キーで sync。マイグレーション余地のため key に v1 を含める。
// 将来 v2 へバージョン上げる場合は MIGRATION_TABLE に v1→v2 関数を足す想定。
//
// 設計のキモ:
//   - reactive な単一 ref<Settings> を提供（Vue 標準パターン、Pinia 不使用）
//   - settings 変更を watch で localStorage に write back（debounce なし、頻度低いので即書き）
//   - 読み込み失敗（破損 JSON / 未保存）はサイレント default 採用、ログ警告のみ
// ----------------------------------------------------------------------------

import { ref, watch, type Ref } from "vue";

// ━━ 公開型 ━━

/** カテゴリ enum（Phase 1 は ring/amulet のみ実装、Phase 2 hook） */
export type CraftDiscoveryCategory =
  | "ring"
  | "amulet"
  // Phase 2a (防具 5 種) - UI で disabled プレースホルダ表示
  | "belt"
  | "gloves"
  | "helmet"
  | "boots"
  | "body_armour"
  // Phase 2b (武器) - UI で disabled プレースホルダ表示
  | "weapon";

/** Phase 1 で実 fetch 可能なカテゴリ（craft-discovery.ts DiscoveryCategory と一致） */
export const PHASE1_CATEGORIES: ReadonlyArray<CraftDiscoveryCategory> = [
  "ring",
  "amulet",
];

/** Phase 2a/2b で追加予定のカテゴリ（UI に disabled で見せる、選択不可） */
export const FUTURE_CATEGORIES: ReadonlyArray<{
  value: CraftDiscoveryCategory;
  label: string;
  phase: "2a" | "2b";
}> = [
  { value: "belt", label: "ベルト", phase: "2a" },
  { value: "gloves", label: "グローブ", phase: "2a" },
  { value: "helmet", label: "ヘルム", phase: "2a" },
  { value: "boots", label: "ブーツ", phase: "2a" },
  { value: "body_armour", label: "ボディアーマー", phase: "2a" },
  { value: "weapon", label: "武器", phase: "2b" },
];

/** 価格レンジプリセット（manual-controls.md §1） */
export interface PriceRangePreset {
  label: string;
  min: number;
  max: number;
}
export const PRICE_RANGE_PRESETS: ReadonlyArray<PriceRangePreset> = [
  { label: "激安", min: 1, max: 10 },
  { label: "標準", min: 1, max: 100 },
  { label: "高級", min: 30, max: 500 },
  { label: "全帯", min: 1, max: 2000 },
];

/** 取得件数プリセット（manual-controls.md §2） */
export interface TargetCountPreset {
  value: number;
  label: string;
  /** true なら警告モーダル必須（1000 件 = 15 分・全損リスク） */
  warn: boolean;
}
export const TARGET_COUNT_PRESETS: ReadonlyArray<TargetCountPreset> = [
  { value: 300, label: "300（標準）", warn: false },
  { value: 500, label: "500（拡張）", warn: false },
  { value: 800, label: "800（重め）", warn: false },
  { value: 1000, label: "1000（実験）", warn: true },
];

/** ホット時間窓プリセット（manual-controls.md §3） */
export const HOT_WINDOW_HOURS: ReadonlyArray<1 | 3 | 6 | 12> = [1, 3, 6, 12];

export interface PriceRangeSettings {
  /** divine 建て下限（含む）。1 以上、max 未満 */
  min: number;
  /** divine 建て上限（含む）。min より大、2000 以下 */
  max: number;
  // currency は Phase 1 では divine 固定。Phase 2 で残課題 #1 として可変化検討。
}

export interface HotConfig {
  /** ホット判定の時間窓（hours）。listing.indexed がこれ以内なら recent 扱い */
  windowHours: 1 | 3 | 6 | 12;
  /** ホット判定の最小 listing 数。recentCount >= minCount でホット印 */
  minCount: number;
}

export interface CraftDiscoverySettings {
  /** 設定スキーマバージョン（マイグレーション用） */
  version: 1;
  priceRange: PriceRangeSettings;
  /** 1 サイクルで取得する listing 件数。300/500/800/1000 のいずれかを推奨 */
  targetCount: number;
  hotConfig: HotConfig;
  /** 選択中カテゴリ（Phase 1 では ring/amulet のみ） */
  selectedCategory: CraftDiscoveryCategory;
  /** 表示の最低件数（既存「⚙ テスト設定」項目を維持） */
  minCountThreshold: number;
  /** 上位 N 件表示（既存項目） */
  topNDisplay: number;
  /** 新鮮率「ホット」閾値（%）既存項目 */
  freshHotPct: number;
  /** 新鮮率「ぬるい」閾値（%）既存項目 */
  freshWarmPct: number;
  /** 新鮮率「冷たい」閾値（%）既存項目 */
  freshColdPct: number;
}

// ━━ デフォルト ━━

export const DEFAULT_SETTINGS: CraftDiscoverySettings = {
  version: 1,
  priceRange: { min: 1, max: 2000 },
  targetCount: 300,
  // 既存維持（破壊的変更回避、オーナー指示 2026-05-21 残課題 #5）
  // 旧定数 RECENT_WINDOW_HOURS=12 + 旧 ホット件数 20 を踏襲。
  // manual-controls.md は 6h / 20 件推奨だが、Phase 1 は「破壊しない」を優先。
  hotConfig: { windowHours: 12, minCount: 20 },
  selectedCategory: "ring",
  minCountThreshold: 2,
  topNDisplay: 30,
  freshHotPct: 80,
  freshWarmPct: 40,
  freshColdPct: 20,
};

// ━━ localStorage 永続化 ━━

/**
 * localStorage キー。v1 を含めることで将来 v2 切替時に旧データを保持できる。
 *   v1 = Phase 1 (2026-05-21)、Phase 2 で必要なら v2 を新規キーで導入。
 */
export const STORAGE_KEY = "exile.craft-discovery.settings.v1";

/** localStorage が使えるか（dev-server / SSR / Tauri 全環境で safe） */
function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
  } catch {
    return false;
  }
}

/** 読み込み。失敗時は DEFAULT_SETTINGS を返す（warning ログのみ） */
function loadSettings(): CraftDiscoverySettings {
  if (!hasLocalStorage()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CraftDiscoverySettings>;
    // バージョン不一致は default 採用（将来 MIGRATION で対応）
    if (parsed.version !== 1) {
      console.warn(
        `[useCraftDiscoverySettings] version mismatch (got ${String(parsed.version)}, expected 1), using defaults`,
      );
      return { ...DEFAULT_SETTINGS };
    }
    // 部分書き込み（古いバージョンで保存後 schema 拡張した場合）に備え、key を merge
    return mergeWithDefaults(parsed);
  } catch (e) {
    console.warn("[useCraftDiscoverySettings] load failed, using defaults:", e);
    return { ...DEFAULT_SETTINGS };
  }
}

/** 部分的に欠けた設定を DEFAULT で埋める（schema 拡張の互換確保） */
function mergeWithDefaults(partial: Partial<CraftDiscoverySettings>): CraftDiscoverySettings {
  return {
    version: 1,
    priceRange: {
      min: partial.priceRange?.min ?? DEFAULT_SETTINGS.priceRange.min,
      max: partial.priceRange?.max ?? DEFAULT_SETTINGS.priceRange.max,
    },
    targetCount: partial.targetCount ?? DEFAULT_SETTINGS.targetCount,
    hotConfig: {
      windowHours:
        partial.hotConfig?.windowHours ?? DEFAULT_SETTINGS.hotConfig.windowHours,
      minCount: partial.hotConfig?.minCount ?? DEFAULT_SETTINGS.hotConfig.minCount,
    },
    selectedCategory: partial.selectedCategory ?? DEFAULT_SETTINGS.selectedCategory,
    minCountThreshold:
      partial.minCountThreshold ?? DEFAULT_SETTINGS.minCountThreshold,
    topNDisplay: partial.topNDisplay ?? DEFAULT_SETTINGS.topNDisplay,
    freshHotPct: partial.freshHotPct ?? DEFAULT_SETTINGS.freshHotPct,
    freshWarmPct: partial.freshWarmPct ?? DEFAULT_SETTINGS.freshWarmPct,
    freshColdPct: partial.freshColdPct ?? DEFAULT_SETTINGS.freshColdPct,
  };
}

/** バリデーション（保存前に呼ぶ）。不正値は近傍 default に丸める */
function clampSettings(s: CraftDiscoverySettings): CraftDiscoverySettings {
  const clamped: CraftDiscoverySettings = mergeWithDefaults(s);
  // 価格レンジ: min<max、min>=1、max<=2000 強制
  clamped.priceRange.min = Math.max(1, Math.floor(clamped.priceRange.min || 1));
  clamped.priceRange.max = Math.min(
    2000,
    Math.floor(clamped.priceRange.max || 2000),
  );
  if (clamped.priceRange.max <= clamped.priceRange.min) {
    clamped.priceRange.max = clamped.priceRange.min + 1;
  }
  // targetCount: 10-1000
  clamped.targetCount = Math.max(10, Math.min(1000, Math.floor(clamped.targetCount)));
  // hotConfig.minCount: 5-50
  clamped.hotConfig.minCount = Math.max(
    5,
    Math.min(50, Math.floor(clamped.hotConfig.minCount)),
  );
  // hotConfig.windowHours: HOT_WINDOW_HOURS のいずれか
  if (!HOT_WINDOW_HOURS.includes(clamped.hotConfig.windowHours)) {
    clamped.hotConfig.windowHours = DEFAULT_SETTINGS.hotConfig.windowHours;
  }
  // Phase 1 制約: selectedCategory が Phase 2 のものなら ring に戻す
  if (!PHASE1_CATEGORIES.includes(clamped.selectedCategory)) {
    clamped.selectedCategory = "ring";
  }
  return clamped;
}

/** localStorage に sync 書き込み（失敗時は warning のみ、UI は止めない） */
function saveSettings(s: CraftDiscoverySettings): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn("[useCraftDiscoverySettings] save failed:", e);
  }
}

// ━━ composable 本体 ━━

export interface UseCraftDiscoverySettingsReturn {
  /** 単一の reactive な設定オブジェクト。直接書き換え可（watch で localStorage sync） */
  settings: Ref<CraftDiscoverySettings>;
  /** 全項目をデフォルトに戻す（localStorage も上書き） */
  resetAll: () => void;
  /** 特定セクションのみリセット（UI の per-section リセット用、Phase 2 で必要なら使用） */
  resetPriceRange: () => void;
  resetTargetCount: () => void;
  resetHotConfig: () => void;
  /** 価格レンジ変更時の「累積データ破棄」確認に使う識別キー（前回ロード値の hash） */
  priceRangeKey: () => string;
}

/**
 * クラフト発見君の設定 state を提供する composable。
 *
 * 使い方:
 *   ```ts
 *   const { settings, resetAll } = useCraftDiscoverySettings();
 *   // 読み取り
 *   settings.value.priceRange.min
 *   // 書き換え (Vue reactive 経由で localStorage に自動 sync)
 *   settings.value.targetCount = 500
 *   ```
 *
 * 注: 複数コンポーネントで使う場合はそれぞれ独立 ref になる（module-singleton にしてない）。
 * Phase 1 では EconDashboard.vue のみで使う想定のため OK。
 * Phase 2 で複数画面共有が必要なら provide/inject か Pinia 化を検討。
 */
export function useCraftDiscoverySettings(): UseCraftDiscoverySettingsReturn {
  const settings = ref<CraftDiscoverySettings>(loadSettings());

  // deep watch で sub property 変更も拾う
  watch(
    settings,
    (newVal) => {
      const validated = clampSettings(newVal);
      saveSettings(validated);
    },
    { deep: true },
  );

  function resetAll(): void {
    settings.value = { ...DEFAULT_SETTINGS, priceRange: { ...DEFAULT_SETTINGS.priceRange }, hotConfig: { ...DEFAULT_SETTINGS.hotConfig } };
  }

  function resetPriceRange(): void {
    settings.value.priceRange = { ...DEFAULT_SETTINGS.priceRange };
  }

  function resetTargetCount(): void {
    settings.value.targetCount = DEFAULT_SETTINGS.targetCount;
  }

  function resetHotConfig(): void {
    settings.value.hotConfig = { ...DEFAULT_SETTINGS.hotConfig };
  }

  function priceRangeKey(): string {
    return `${settings.value.priceRange.min}-${settings.value.priceRange.max}`;
  }

  return {
    settings,
    resetAll,
    resetPriceRange,
    resetTargetCount,
    resetHotConfig,
    priceRangeKey,
  };
}
