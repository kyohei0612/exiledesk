/**
 * run-price.ts — 木を回す時の値段と、回した結果の見せる数 (費用・完成率の丸め) を 1 か所に (G-1 V-3 J-25、11-07)。
 * 画面の木の帯 (use-tree-run)・レシピのカード絵 (recipe-card) が呼ぶ。デイリーの検算 (daily-cost) も同じ数え方なので、ここを呼べば写しが要らない。
 * 画面の状態を読まない純粋な関数 (サーバーの 16:00 の検算からも読める)
 */

/** 回す時の値段 (相場は高貴建て → 神に直す。tree-base-cost と同じ。そのまま渡すと 2000 神の打ち止めに当たって完成 8% になった、10-22 開発版で見た) */
export function runPrice(priceOf: (key: string) => number): (key: string) => number {
  const div = priceOf("divine") || 1;
  // 回す間は相場が変わらないので、同じ物の値段は 1 回だけ引く (1 手ごとに相場の表を引くのが重く、飛ばしても 100 人に 18 秒かかった、10-23 モンキー 7)
  const memo = new Map<string, number>();
  const f = (k: string): number => { let v = memo.get(k); if (v === undefined) { v = priceOf(k) / div; memo.set(k, v); } return v; };
  MARKET.add(f);
  return f;
}
/** runPrice が返した (相場から引く) 値段。台本の「1 手 1 神」などの値段では鏡の相場が意味を持たないので見分ける */
const MARKET = new WeakSet<(key: string) => number>();

/** 相場が取れない時の 1 人の打ち止め (神、S-71。11-11 までの固定の値) */
export const CAP_DIV_FALLBACK = 2000;
/**
 * 1 人の打ち止め (神) = カランドラの鏡 2 個分 (S-71、11-11 オーナー「2ミラー分の試行回数してもいいと思うけど、現在の価値で毎回直して」)。
 * price は神建て (runPrice の返り)。回すたびに今の相場で数え直す。鏡の相場が無い (0・数でない) 時は CAP_DIV_FALLBACK
 */
export function capDivOf(price: (key: string) => number): number {
  const m = price("mirror");
  return Number.isFinite(m) && m > 0 ? 2 * m : CAP_DIV_FALLBACK;
}
/** 回し口 (runTree) の打ち止めの既定: 相場の値段 (runPrice の返り) なら鏡 2 個分、ほか (台本の固定の値段) は CAP_DIV_FALLBACK。画面の木・デイリーの検算・挑戦が同じここを通る */
export const defaultCapDiv = (price: (key: string) => number): number => (MARKET.has(price) ? capDivOf(price) : CAP_DIV_FALLBACK);

/** 費用 (1 個あたり 神) を 0.1 神に丸める */
export const shownCost = (perItem: number): number => Math.round(perItem * 10) / 10;
/** 完成率 (%) を整数に。p = 完成した人 ÷ 回した人 × 100 */
export const shownRate = (p: number): number => Math.round(p);
/** 回した結果の見せる数 (費用 0.1 神・完成率 整数 %) */
export const runShown = (r: { perItem: number; finished: number; n: number }): { cost: number; rate: number } =>
  ({ cost: shownCost(r.perItem), rate: shownRate((r.finished / r.n) * 100) });
