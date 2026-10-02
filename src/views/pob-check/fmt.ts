/**
 * fmt.ts — 火力チェックの画面の数字の書き方と色 (2026-10-02)
 */
/** 大きい数は「万」で (49.6万 / 1,234 / 12.3) */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e8) return `${(v / 1e8).toFixed(2)}億`;
  if (a >= 1e4) return `${(v / 1e4).toFixed(a >= 1e6 ? 0 : 1)}万`;
  if (a >= 100) return Math.round(v).toLocaleString("ja-JP");
  return v.toFixed(1);
}
/** 差の割合 (+12.3% / −4.0%)。元が 0 なら null */
export function diffPct(now: number, before: number | undefined | null): number | null {
  if (before == null || before === 0 || !Number.isFinite(before)) return null;
  return ((now - before) / before) * 100;
}
/** ダメージの種類の色と日本語 */
export const TYPE_STYLE: Record<string, { ja: string; color: string }> = {
  Physical: { ja: "物理", color: "#c9b8a0" },
  Lightning: { ja: "雷", color: "#f5d04a" },
  Cold: { ja: "冷気", color: "#6fc3ff" },
  Fire: { ja: "火", color: "#ff7a45" },
  Chaos: { ja: "混沌", color: "#c77dff" },
};
