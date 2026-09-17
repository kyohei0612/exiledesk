/**
 * ヴァールの天秤 共通の表示通貨 (2026-09-12)
 *
 * オーナー指示: 「高貴 / カオオス / 神 のどれか 1 つをプルダウンで選び、売値も買値もその通貨で統一」。
 * 内部の金額は全て高貴 (Exalted) 建てのまま、表示と入力だけをここで換算する。
 * 換算レートは相場ストア (poe2scout のリーグ情報) から。選択は localStorage に残す (無くても高貴で動く)。
 */
import { computed, ref } from "vue";
import { marketStore } from "./market-store";

export type DisplayCurrency = "exalted" | "chaos" | "divine";
const KEY = "exiledesk.vaal.currency";
const LABEL: Record<DisplayCurrency, string> = { exalted: "高貴", chaos: "カオス", divine: "神" };

function load(): DisplayCurrency {
  try {
    const v = localStorage.getItem(KEY);
    return v === "chaos" || v === "divine" ? v : "exalted";
  } catch {
    return "exalted";
  }
}
const cur = ref<DisplayCurrency>(load());

/** 1 表示通貨 = ? 高貴 */
const rate = computed<number>(() => {
  const r = marketStore.rates.value;
  if (cur.value === "chaos") return r.chaos > 0 ? r.chaos : 1;
  if (cur.value === "divine") return r.divine > 0 ? r.divine : 1;
  return 1;
});

export function setDisplayCurrency(c: DisplayCurrency): void {
  cur.value = c;
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* 保存できなくても動く */
  }
}

/** 数値の丸め (表示用)。大きい額は整数、小さい額は小数 */
export function fmtNum(n: number | null | undefined, digits?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (digits != null) return n.toFixed(digits);
  const abs = Math.abs(n);
  return abs >= 100 ? n.toFixed(0) : abs >= 10 ? n.toFixed(1) : abs >= 1 ? n.toFixed(2) : n.toFixed(3);
}

export const displayCurrency = {
  cur,
  rate,
  label: computed(() => LABEL[cur.value]),
  options: (Object.keys(LABEL) as DisplayCurrency[]).map((k) => ({ value: k, label: LABEL[k] })),
  /** 高貴建て → 表示通貨の数値 */
  toDisplay(exalted: number | null | undefined): number | null {
    if (exalted == null || !Number.isFinite(exalted)) return null;
    return exalted / rate.value;
  },
  /** 表示通貨の数値 → 高貴建て */
  fromDisplay(v: number | null | undefined): number | null {
    if (v == null || !Number.isFinite(v)) return null;
    return v * rate.value;
  },
  /** "123 神" 形式。signed で + を付ける */
  money(exalted: number | null | undefined, opts?: { signed?: boolean; unit?: boolean }): string {
    const d = displayCurrency.toDisplay(exalted);
    if (d == null) return "—";
    const sign = opts?.signed && d > 0 ? "+" : "";
    return `${sign}${fmtNum(d)}${opts?.unit === false ? "" : ` ${LABEL[cur.value]}`}`;
  },
};

/**
 * 出品時の通貨がバラバラな値段を、表示通貨に換算して平均する (2026-09-17)。
 * オーナー指示:「早い / 普通 / 遅い の横に平均売り単価を、表示通貨の単位で」。
 *
 * @returns 表示通貨での平均。1 件も無い / 相場が取れていない時は null
 */
export function averageInDisplay(prices: { amount: number; currency: string }[]): number | null {
  if (prices.length === 0) return null;
  const r = marketStore.rates.value;
  const toExalted = (p: { amount: number; currency: string }): number | null => {
    if (p.currency === "exalted") return p.amount;
    if (p.currency === "divine") return r.divine > 0 ? p.amount * r.divine : null;
    if (p.currency === "chaos") return r.chaos > 0 ? p.amount * r.chaos : null;
    return null;
  };
  const ex = prices.map(toExalted).filter((v): v is number => v != null);
  if (ex.length === 0) return null;
  return displayCurrency.toDisplay(ex.reduce((a, b) => a + b, 0) / ex.length);
}
