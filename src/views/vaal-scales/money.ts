/**
 * ヴァールの天秤 共通: 金額表示 (高貴 / カオス / 神 の 3 通貨併記) 2026-09-12
 * オーナー指示: 「素材は高貴・カオス・神の 3 種類で表示させたい」。内部は高貴建てのまま、表示だけ換算する。
 */
import type { ExaltedRates } from "../../services/trade2/pricing";

export function fmtNum(n: number | null | undefined, digits?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (digits != null) return n.toFixed(digits);
  const abs = Math.abs(n);
  return abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : abs >= 1 ? n.toFixed(2) : n.toFixed(3);
}

export interface TriMoney {
  exalted: string;
  chaos: string;
  divine: string;
}

/** 高貴建ての金額を 3 通貨に換算した表示文字列。レートが無い通貨は "—" */
export function triMoney(exalted: number | null | undefined, rates: ExaltedRates): TriMoney {
  if (exalted == null || !Number.isFinite(exalted)) return { exalted: "—", chaos: "—", divine: "—" };
  return {
    exalted: fmtNum(exalted),
    chaos: rates.chaos > 0 ? fmtNum(exalted / rates.chaos) : "—",
    divine: rates.divine > 0 ? fmtNum(exalted / rates.divine) : "—",
  };
}

/** 1 行表示: "123 高貴 · 12.3 カオス · 0.26 神" */
export function triLine(exalted: number | null | undefined, rates: ExaltedRates): string {
  const t = triMoney(exalted, rates);
  if (t.exalted === "—") return "—";
  return `${t.exalted} 高貴 · ${t.chaos} カオス · ${t.divine} 神`;
}
