/** 損益の色は共通 (utils/ev-class) から (2026-09-21) */
export { evClass } from "../../utils/ev-class";
/**
 * ui.ts — 規格外の賭けの画面で使う小物 (2026-09-19 に RareCraft.vue 749 行から切り出し)
 */
import { displayCurrency } from "../../state/display-currency";

export const money = (n: number | null | undefined, signed = false): string => displayCurrency.money(n, { signed });
export const unit = displayCurrency.label;

/** 確率を % で */
export function pct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const v = p * 100;
  return `${v.toFixed(v >= 10 ? 1 : 2)}%`;
}


/** 「N 回やった場合」の N (5 刻み) */
export const ATTEMPT_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
