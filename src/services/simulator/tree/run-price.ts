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
  return (k) => { let v = memo.get(k); if (v === undefined) { v = priceOf(k) / div; memo.set(k, v); } return v; };
}

/** 費用 (1 個あたり 神) を 0.1 神に丸める */
export const shownCost = (perItem: number): number => Math.round(perItem * 10) / 10;
/** 完成率 (%) を整数に。p = 完成した人 ÷ 回した人 × 100 */
export const shownRate = (p: number): number => Math.round(p);
/** 回した結果の見せる数 (費用 0.1 神・完成率 整数 %) */
export const runShown = (r: { perItem: number; finished: number; n: number }): { cost: number; rate: number } =>
  ({ cost: shownCost(r.perItem), rate: shownRate((r.finished / r.n) * 100) });
