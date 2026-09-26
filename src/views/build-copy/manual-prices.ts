/**
 * 忍者ビルドコピーのレアの値段 (手入れ / 自動で取った値段) の置き場 (2026-09-26)
 *
 * オーナー 2026-09-26「レア装備どうしようか」→ 取引所で見た値段を打って合計に入れる。
 * 同じビルドを読み直しても残るよう、部位・固有名・ベースで覚える (localStorage)
 */
import { reactive } from "vue";
import { rateOf, type DisplayCurrency } from "../../state/display-currency";
import type { BuildItem } from "../../services/build-copy/pob";

export interface ManualPrice {
  amount: number;
  currency: DisplayCurrency;
}
const KEY = "exiledesk.buildCopy.manualPrices";
function load(): Record<string, ManualPrice> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, ManualPrice>) : {};
  } catch {
    return {};
  }
}
const manual = reactive(load());
const keyOf = (it: BuildItem) => `${it.slot}|${it.name}|${it.base}`;

export function manualOf(it: BuildItem): ManualPrice | null {
  return manual[keyOf(it)] ?? null;
}
/** 高貴建て (値段が無ければ null) */
export function manualExalted(m: ManualPrice | null): number | null {
  return m && m.amount > 0 ? m.amount * rateOf(m.currency) : null;
}
/** 値段を打つ (amount が空・0 なら値段は消し、選んだ通貨だけ覚える) */
export function setManualOf(it: BuildItem, amount: number | null, currency: DisplayCurrency): void {
  const k = keyOf(it);
  if ((amount == null || !(amount > 0)) && currency === "divine") delete manual[k];
  else manual[k] = { amount: amount != null && amount > 0 ? amount : 0, currency };
  try {
    localStorage.setItem(KEY, JSON.stringify(manual));
  } catch {
    /* 保存できなくても画面では効く */
  }
}
/** 高貴建て → 欄の数と通貨 (1 以上になる一番大きい通貨、小数 2 桁) */
export function unitOf(exalted: number): [number, DisplayCurrency] {
  for (const c of ["divine", "chaos"] as const) {
    const v = exalted / rateOf(c);
    if (v >= 1) return [Math.round(v * 100) / 100, c];
  }
  return [Math.round(exalted * 100) / 100, "exalted"];
}
