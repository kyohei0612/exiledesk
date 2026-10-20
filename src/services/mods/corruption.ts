/**
 * corruption.ts — ヴァールのオーブのコラプトで付く MOD の表 (2026-10-20 オーナー「コラプトの MOD 一覧はエンジン部が持つ」)。
 *
 * 表は poe2db の部位のページの写し (scripts/build-corruption-mods.mjs → corruption-mods.json)。部位はエンジンのクラスの id
 * (Rings・Crossbows・Wands_fire …) を poe2db のページの名前に直して引く (audit-poe2db-tags.mjs の pageOf と同じ)。
 *   enchant = ヴァールのオーブで付くエンチャント (poe2db の corrupted)
 *   upgrade = 強まったコラプトの行 (poe2db の corruption_upgrade、CorruptionUpgrade…)
 * 表に無い物は推し量らない (呼ぶ側で「不明」にする)。
 */
import table from "./corruption-mods.json";

export interface CorruptionRow {
  kind: "enchant" | "upgrade";
  /** poe2db の名前 (CorruptionUpgradeAllDamage1) */
  id: string;
  family: string[];
  /** poe2db の日本語の文 (値は (a—b)) */
  ja: string;
  /** 貼り付けと同じ型の表で当てた英語の型 (当たらない物は null、その時は日本語の文で照らす) */
  template: string | null;
  /** 値の幅 (型の # の並び) */
  ranges: Array<[number, number]>;
}

const PAGES = (table as unknown as { pages: Record<string, CorruptionRow[]> }).pages;

/** エンジンのクラスの id → poe2db のページの名前 */
const pageOf = (cls: string): string => cls.replace(/^(Wands|Staves|Crossbows)_.*$/, "$1").replace(/^OneHand_/, "One_Hand_").replace(/^TwoHand_/, "Two_Hand_");

/** そのクラスでコラプトで付く行 (poe2db にページが無いクラスは空) */
export function corruptionRowsFor(cls: string): readonly CorruptionRow[] {
  return PAGES[pageOf(cls)] ?? [];
}

/** 数字と記号を除いた文 (型が無い行を日本語の文で照らす時) */
const bare = (t: string): string => t.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/[0-9.()+\-%—\s]+/g, "");

/**
 * 貼り付けの 1 行をそのクラスのコラプトの表と照らす。template と values は貼り付けの型の表 (matchModLine) で当てた物。
 * 同じ型の行が複数ある (エンチャントと強まった物) 時は、値が幅に入る方を採る。どれにも入らなければ最初の物で fits = false
 */
export function matchCorruption(cls: string, text: string, template: string | null, values: readonly number[]): { row: CorruptionRow; fits: boolean } | null {
  const rows = corruptionRowsFor(cls).filter((r) => (r.template && template ? r.template === template : bare(r.ja) === bare(text)));
  if (!rows.length) return null;
  const inRange = (r: CorruptionRow): boolean => r.ranges.length === values.length && r.ranges.every(([a, b], k) => values[k]! >= a && values[k]! <= b);
  const hit = rows.find(inRange);
  return hit ? { row: hit, fits: true } : { row: rows[0]!, fits: false };
}
