/**
 * recipe-store-util.ts — レシピの保存 (工程のレシピ sim-recipes・sim-recipe-store と木のレシピ tree-recipes) で同じ小物 (2026-10-22 code-audit 2 節)
 */
/** 深い写し (保存する物は JSON にできる物だけ) */
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** レシピの id (時刻 + 乱数 4 文字) */
export const newId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
/** localStorage の文字 → 配列 (無い・読めない・配列でない時は null) */
export function parseList(raw: string | null): unknown[] | null {
  if (raw == null) return null;
  try { const v = JSON.parse(raw) as unknown; return Array.isArray(v) ? v : null; } catch { return null; }
}
