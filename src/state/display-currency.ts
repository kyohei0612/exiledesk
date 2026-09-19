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
/** trade2 の通貨 id → 日本語 (画面共通。知らない通貨は id のまま) */
export function currencyJa(c: string | null | undefined): string {
  return c ? (LABEL[c as DisplayCurrency] ?? c) : "";
}

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
const rate = computed<number>(() => rateOf(cur.value));

function rateOf(c: DisplayCurrency): number {
  const r = marketStore.rates.value;
  if (c === "chaos") return r.chaos > 0 ? r.chaos : 1;
  if (c === "divine") return r.divine > 0 ? r.divine : 1;
  return 1;
}

/**
 * 価値の高い順。1 未満になったら 1 つ下に落として表示する
 * (オーナー指示 2026-09-19:「1 神以下ならカオスで表現してくれ。基本 1 以下なら 1 つ下のカレンシーで」)。
 * PoE2 では 神 > カオス > 高貴 の順 (カオスは高貴より高い)。
 */
const LADDER: readonly DisplayCurrency[] = ["divine", "chaos", "exalted"] as const;

/**
 * その額を出すのに一番読みやすい通貨を選ぶ。
 * 選んでいる通貨から始めて、1 未満なら 1 つ下へ (一番下まで来たらそのまま)。
 * 0 と符号は元のまま扱う (絶対値で判断)。
 */
function pickUnit(exalted: number): { c: DisplayCurrency; value: number } {
  const start = Math.max(0, LADDER.indexOf(cur.value));
  for (let i = start; i < LADDER.length; i++) {
    const c = LADDER[i];
    const v = exalted / rateOf(c);
    if (Math.abs(v) >= 1 || i === LADDER.length - 1) return { c, value: v };
  }
  const c = LADDER[LADDER.length - 1];
  return { c, value: exalted / rateOf(c) };
}

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
  /**
   * "123 神" 形式。signed で + を付ける。
   *
   * 選んでいる通貨で 1 未満になる額は 1 つ下の通貨で出す (0.02 神 → 8.5 カオス)。
   * 単位を出さない (unit: false) 時は、桁だけ見せる場所なので選んでいる通貨のまま
   * (単位なしで通貨が変わると何の数字か分からなくなるため)。
   */
  money(exalted: number | null | undefined, opts?: { signed?: boolean; unit?: boolean }): string {
    if (exalted == null || !Number.isFinite(exalted)) return "—";
    if (opts?.unit === false) {
      const d = displayCurrency.toDisplay(exalted);
      if (d == null) return "—";
      return `${opts?.signed && d > 0 ? "+" : ""}${fmtNum(d)}`;
    }
    const { c, value } = pickUnit(exalted);
    const sign = opts?.signed && value > 0 ? "+" : "";
    return `${sign}${fmtNum(value)} ${LABEL[c]}`;
  },
};

/**
 * 出品時の通貨がバラバラな値段を、**高貴建て**に揃えて平均する (2026-09-17)。
 *
 * オーナー指示:「早い / 普通 / 遅い の横に平均売り単価を、表示通貨の単位で」。
 * 戻り値は高貴建てなので、画面では displayCurrency.money() に通して表示すること
 * (ここで表示通貨に換算してしまうと money() で二重に割られる。2026-09-17 に踏んだ)。
 *
 * @returns 高貴建ての平均。1 件も無い / 相場が取れていない時は null
 */
export function averageExalted(prices: { amount: number; currency: string }[]): number | null {
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
  return ex.reduce((a, b) => a + b, 0) / ex.length;
}
