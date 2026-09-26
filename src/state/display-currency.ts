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
/**
 * 選べる物。「適正」は 1 種類に決めず額に合わせる (神 → 1 未満はカオス → 1 カオス未満は高貴)。
 * カレンシーランキングも同じ。一番安く交換できる通貨は横の「取引の推奨」に出す。
 * オーナー指示 2026-09-26:「表示通貨は神じゃないし、その合わせて表示は適正って名前で」
 */
export type DisplayChoice = DisplayCurrency | "fair";
const KEY = "exiledesk.vaal.currency";
/** 2026-09-26 から。旧 KEY の "divine" は今の「適正」と同じ動き (神から段を下げる) だったので読み替える */
const KEY2 = "exiledesk.displayCurrency.v2";
const LABEL: Record<DisplayCurrency, string> = { exalted: "高貴", chaos: "カオス", divine: "神" };
/** trade2 の通貨 id → 日本語 (画面共通。知らない通貨は id のまま) */
export function currencyJa(c: string | null | undefined): string {
  return c ? (LABEL[c as DisplayCurrency] ?? c) : "";
}

/**
 * 何も選んでいなければ適正。
 * オーナー指示 2026-09-26:「カレンシーは 1 種類に統一。要は神に合わせろ。表示カレンシーは選べるように、デフォでその設定」
 */
function load(): DisplayChoice {
  try {
    const v2 = localStorage.getItem(KEY2);
    if (v2 === "fair" || v2 === "divine" || v2 === "chaos" || v2 === "exalted") return v2;
    const v = localStorage.getItem(KEY);
    return v === "chaos" || v === "exalted" ? v : "fair";
  } catch {
    return "fair";
  }
}
const choice = ref<DisplayChoice>(load());
/** 入力欄・合計など 1 種類の通貨が要る所で使う通貨 (適正の時は神) */
const cur = computed<DisplayCurrency>(() => (choice.value === "fair" ? "divine" : choice.value));

/** 1 表示通貨 = ? 高貴 */
const rate = computed<number>(() => rateOf(cur.value));

/** 1 枚が高貴何枚か (相場が無ければ 1) */
export function rateOf(c: DisplayCurrency): number {
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
function pickUnit(exalted: number, from?: DisplayCurrency): { c: DisplayCurrency; value: number } {
  // 通貨を 1 つ選んでいる時は段を下げない (ladder: "top" を渡された所だけ下げる)
  if (from == null && choice.value !== "fair") return { c: choice.value, value: exalted / rateOf(choice.value) };
  const start = Math.max(0, LADDER.indexOf(from ?? "divine"));
  for (let i = start; i < LADDER.length; i++) {
    const c = LADDER[i];
    const v = exalted / rateOf(c);
    if (Math.abs(v) >= 1 || i === LADDER.length - 1) return { c, value: v };
  }
  const c = LADDER[LADDER.length - 1];
  return { c, value: exalted / rateOf(c) };
}

export function setDisplayCurrency(c: DisplayChoice): void {
  choice.value = c;
  try {
    localStorage.setItem(KEY2, c);
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
  from?: DisplayCurrency,
): { exalted: number; value: number; cur: DisplayCurrency; rounded: boolean } | null {
  if (exalted == null || !Number.isFinite(exalted)) return null;
  const { c, value } = pickUnit(exalted, from);
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
  /** 選んでいる物 (適正 / 神 / カオス / 高貴)。プルダウンはこれ */
  choice,
  /** 1 種類の通貨が要る所の通貨 (適正の時は神) */
  cur,
  rate,
  label: computed(() => LABEL[cur.value]),
  options: [
    { value: "fair" as DisplayChoice, label: "適正" },
    ...(Object.keys(LABEL) as DisplayCurrency[]).map((k) => ({ value: k as DisplayChoice, label: LABEL[k] })),
  ],
  /** 選んでいる通貨から段を下げた 1 種類の通貨と数値 (アイコンを付けて出す所用) */
  unit(exalted: number): { cur: DisplayCurrency; value: number; label: string } {
    const { c, value } = pickUnit(exalted);
    return { cur: c, value, label: LABEL[c] };
  },
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
   *
   * `ladder: "top"` を渡すと**選んでいる通貨を無視して神から始めます** (神 → 1 未満ならカオス →
   * 1 未満なら高貴)。オーナー指示 2026-09-22:「全部高貴じゃんややこしい。神優先で 1 以下なら
   * カオス、1 カオス以下でやっと高貴でやってくれ」。クラフトの費用のように桁が大きく振れる所で使う
   * (高貴を選んでいると 88,406 高貴 のように読めない数字になるため)。
   * 単位を出さない (unit: false) 時は、桁だけ見せる場所なので選んでいる通貨のまま
   * (単位なしで通貨が変わると何の数字か分からなくなるため)。
   */
  money(exalted: number | null | undefined, opts?: { signed?: boolean; unit?: boolean; fixed?: boolean; round?: RoundDir; ladder?: "selected" | "top" }): string {
    if (exalted == null || !Number.isFinite(exalted)) return "—";
    // 費用は切り上げ / 収入は切り下げ (オーナー指示 2026-09-20)
    if (opts?.round && !opts.fixed && opts.unit !== false) {
      const r = roundMoney(exalted, opts.round, opts.ladder === "top" ? LADDER[0] : undefined);
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
    const { c, value } = pickUnit(exalted, opts?.ladder === "top" ? LADDER[0] : undefined);
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
  const ex = toExaltedList(prices);
  if (ex.length === 0) return null;
  return ex.reduce((a, b) => a + b, 0) / ex.length;
}

/** 通貨がバラバラな値段を高貴建ての数字の列にする (相場が取れていない通貨の分は落とす) */
function toExaltedList(prices: { amount: number; currency: string }[]): number[] {
  if (prices.length === 0) return [];
  const r = marketStore.rates.value;
  const toExalted = (p: { amount: number; currency: string }): number | null => {
    if (p.currency === "exalted") return p.amount;
    if (p.currency === "divine") return r.divine > 0 ? p.amount * r.divine : null;
    if (p.currency === "chaos") return r.chaos > 0 ? p.amount * r.chaos : null;
    return null;
  };
  return prices.map(toExalted).filter((v): v is number => v != null);
}

/** 中央値を「確か」と言える最低の件数 */
export const MEDIAN_MIN_SALES = 3;

/**
 * 実売の値段の**中央値** (高貴建て) と件数 (2026-09-26 監査)。
 *
 * 期待値の売値は平均だと 1 件の高値売れ (まぐれ) に引っ張られるので中央値にする。
 * 3 件未満 (1〜2 件) でも使うが、thin = true を返して画面で「根拠が薄い」と出す。
 * 1 件も無い / 相場が取れていない時は null。
 */
export function medianExalted(prices: { amount: number; currency: string }[]): { value: number; n: number; thin: boolean } | null {
  const ex = toExaltedList(prices).sort((a, b) => a - b);
  const n = ex.length;
  if (n === 0) return null;
  const value = n % 2 === 1 ? ex[(n - 1) / 2] : (ex[n / 2 - 1] + ex[n / 2]) / 2;
  return { value, n, thin: n < MEDIAN_MIN_SALES };
}
