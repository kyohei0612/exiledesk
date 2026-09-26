/**
 * 集計カウンタの型と空カウンタの生成
 *
 * ingest.ts から切り出し (2026-09-26)。
 */
import type { SlotKey, UniqueRepresentative } from "../types";

// ============================================================================
// カウンタ型
// ============================================================================

export interface AggregatedModBucket {
  template: string;
  /** このテンプレートを持っていた人数 (重複排除済) */
  count: number;
  /** 全 occurrence の数値配列 (avg / max / min 計算用) */
  values: number[][];
  /** 日本語テンプレート (bundle 由来、なければ null) */
  textJaTemplate: string | null;
}

/** ベース集計バケット (スロット単位)。key = 英語 baseType。 */
export interface BaseBucket {
  nameEn: string;
  count: number;
  /** 付与スキル別の内訳 (key = 英語スキル名)。スキルを付与しないベースは空。(2026-09-12) */
  skills: Map<string, SkillBucket>;
}

export interface SkillBucket {
  nameEn: string;
  count: number;
  levelMin: number | null;
  levelMax: number | null;
  /** 付与スキルの穴に入っていたジェム名 → 人数 */
  gems: Map<string, number>;
}

export interface SlotCounter {
  prefix: Map<string, AggregatedModBucket>;
  suffix: Map<string, AggregatedModBucket>;
  bases: Map<string, BaseBucket>;
}

/** ユニーク集計用のバケット。key = nameEn (typeLine) で名寄せ。 */
export interface UniqueBucket {
  nameEn: string;
  count: number;
  /** 代表 itemData (最初に見たものを保持) */
  representative: UniqueRepresentative;
  icon: string;
}

export type AscendancySlotCounters = { [K in SlotKey]: SlotCounter };

/** スキル集計バケット (key = 英語スキル名) */
export interface SkillBucket2 {
  nameEn: string;
  count: number;
  mainCount: number;
  supports: Map<string, number>;
  /** 2026-09-16: レベル 21 以上 / 品質 23% 以上 / 両方 で使っていた人数 (いずれも同キャラ 1 回) */
  lvl21: number;
  q23: number;
  both: number;
  maxLevel: number;
  maxQuality: number;
}

export interface AscendancyCounter {
  slots: AscendancySlotCounters;
  /** スキル使用率 (同キャラ重複除去済)。2026-09-12 */
  skills: Map<string, SkillBucket2>;
  /** 全スロット合算のユニーク集計 (互換維持)。同キャラ複数スロットでも 1。 */
  uniques: Map<string, UniqueBucket>;
  /** スロット別ユニーク集計。同キャラ × 同ユニーク × 同スロット は 1。 */
  uniquesBySlot: { [K in SlotKey]: Map<string, UniqueBucket> };
}

function emptySlotCounter(): SlotCounter {
  return {
    prefix: new Map<string, AggregatedModBucket>(),
    suffix: new Map<string, AggregatedModBucket>(),
    bases: new Map<string, BaseBucket>(),
  };
}

export function emptySlotSets(): Record<SlotKey, Set<string>> {
  return {
    ring: new Set<string>(),
    amulet: new Set<string>(),
    weapon: new Set<string>(),
    weapon2: new Set<string>(),
    helm: new Set<string>(),
    gloves: new Set<string>(),
    body: new Set<string>(),
    boots: new Set<string>(),
  };
}

export function emptyAscendancyCounter(): AscendancyCounter {
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
    skills: new Map<string, SkillBucket2>(),
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
