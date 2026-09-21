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


/** 丸める向き。費用は切り上げ / 収入は切り下げ */
export type RoundDir = "up" | "down";

/**
 * 表示用に整数へ丸めた額 (2026-09-20)。
 *
 * オーナー指示:「単価は小数点、全ての項目で切り上げで表示してくれ。3.7 神なら 4、
 * 3.1 神でも 4。収入は逆で、12.5 神で売れますとかなら切り下げの 12 神で」。
 * 狙いは**費用は多め・収入は少なめに見る**こと (収支を甘く見ないため)。
 *
 * 1 未満は 1 つ下の通貨に落としてから丸める (money() と同じ段の下げ方)。
 * 一番下の通貨 (高貴) でも 1 未満になる額は丸めない。0 高貴 と出しても意味が無く、
 * 切り上げれば 0.02 → 1 と 50 倍に化けるため。
 *
 * 戻り値の exalted は**丸めた後**の高貴建て。オーナー指示「丸めた単価で計算し直す」に
 * 合わせて、表示だけでなく費用と売上の計算にもこの値を使う。
 */
export function roundMoney(
  exalted: number | null | undefined,
  dir: RoundDir,
): { exalted: number; value: number; cur: DisplayCurrency; rounded: boolean } | null {
  if (exalted == null || !Number.isFinite(exalted)) return null;
  const { c, value } = pickUnit(exalted);
  // 一番下の通貨でも 1 未満 = これ以上落とせない。丸めずそのまま出す
  if (Math.abs(value) < 1) return { exalted, value, cur: c, rounded: false };
  // 丸め誤差の逃げ。取引所の値段は高貴建てで小数 2 桁に丸めて保存されるので、神に戻すと
  // 60 神が 59.99999 神になり、切り下げで丸ごと 1 神落ちていた
  // (オーナー報告 2026-09-20「完成品の値段がズレてる」: 売値は 60.0 神なのに収支は 59)。
  // 2 桁の丸めの誤差は最大 0.005 高貴 ÷ 約 490 ≈ 1e-5 なので、1e-4 だけ寄せてから丸める
  const v = dir === "up" ? Math.ceil(value - ROUND_EPS) : Math.floor(value + ROUND_EPS);
  return { exalted: v * rateOf(c), value: v, cur: c, rounded: true };
}
/** 丸める前に寄せる幅 (通貨換算の往復で生じる誤差より大きく、実際の値段の差より小さい) */
const ROUND_EPS = 1e-4;

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
  money(exalted: number | null | undefined, opts?: { signed?: boolean; unit?: boolean; fixed?: boolean; round?: RoundDir }): string {
    if (exalted == null || !Number.isFinite(exalted)) return "—";
    // 費用は切り上げ / 収入は切り下げ (オーナー指示 2026-09-20)
    if (opts?.round && !opts.fixed && opts.unit !== false) {
      const r = roundMoney(exalted, opts.round);
      if (r == null) return "—";
      const sign = opts.signed && r.value > 0 ? "+" : "";
      return `${sign}${r.rounded ? r.value : fmtNum(r.value)} ${LABEL[r.cur]}`;
    }
    // 選んだ通貨で固定して出す (段を下げない)。オーナー指示 2026-09-20:
    // 「素材の行は取引所の 神 / カオス で見るけど、最終の合計だけは指定カレンシーで」
    if (opts?.fixed) {
      const d = displayCurrency.toDisplay(exalted);
      if (d == null) return "—";
      return `${opts?.signed && d > 0 ? "+" : ""}${fmtNum(d)} ${LABEL[cur.value]}`;
    }
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
