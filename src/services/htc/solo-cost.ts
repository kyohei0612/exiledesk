/**
 * solo-cost.ts — 「その MOD 1 個を自分で出すといくらか」(2026-09-22)
 *
 * オーナー指摘:「重みが低い MOD が 15 神とかならカオススパムの期待値とどっちが良いか決めたり、
 * そもそも最初のベースを時間かけて考えてからするのがいい」「スペルレベル 3 とかは 12 神、
 * スパムなら 1200 回」。
 *
 * ## なぜ 1 個ずつ解くのか
 * **6 個まとめて解く必要がありません。**まとめた解は高くつきます (実測 818 秒)。ところが
 * 「買うか自分で出すか」の判断は **1 個ずつで足ります**。1 目標なら 0.0〜0.1 秒です。
 *
 * 実測 2026-09-22 (イージスクォータースタッフ / ilvl 83 / 6 個とも T1 狙い):
 *   近接スキルレベル +5   62.7 神      火ダメ T1  38.1 神     雷ダメ T1  27.4 神
 *   撃破時ライフ T1        7.3 神      アタック元素 5.1 神     猛攻       0.0 神
 *   **6 個の合計 140.6 神。ところが 6 個そろえると 8,057 神。57 倍。**
 *
 * この 57 倍が**「同じ 1 本に全部乗せる」ことの値段**です。MOD 自体は安く、高いのは乗っている
 * いい MOD を壊さずに次を足す所。だから買うべきなのは MOD ではなく**既に同居している状態**で、
 * 2〜3 MOD のベースを買うのが効くのはそのためです ([[partial-start.ts]])。
 *
 * ## 他の枠は何でもいい
 * ここは `spare` を枠いっぱいに開けて解きます。「その MOD さえ付けばいい」という、
 * 買う候補を市場で探す時の状況とちょうど同じだからです。
 *
 * ## 重い物は頼まれてから — 「少しずつ決める」ための分け方
 * オーナー方針 2026-09-23:「徐々に進める系がいい。条件とかを選択肢の中で決めていく系で、
 * 少し考えながら進めた方が良い」。
 *
 * **期待費用は厳密解で一瞬**です (MDP がそのまま返す)。重いのは**厳しめの目安 (p75)** のほうで、
 * こちらは方策を何千本も回すので、1 本の道中が長い craft だと秒単位かかります。
 * 実測 2026-09-23 (指輪 5 目標): p75 込み 5.3 秒 → **p75 なし 0.7 秒**。
 *
 * だから `soloCosts` は**既定で p75 を出しません**。見たい行だけ `soloP75` を呼んでください。
 *
 * ## 出した数字の使い方
 * 「この MOD が付いた物が、この値段より安く買えるなら買う」。猛攻のようにエッセンスで確定する
 * 物は 0 に近く出るので、**買ってはいけない**とすぐ分かります。
 */
import { markovFromItem } from "../../vendor/poe2htc/optimizer/markovFromItem";
import { simulateBudget } from "./budget";
import { limitsOf } from "../../vendor/poe2htc/engine/item";
import { whiteItem } from "../../vendor/poe2htc/engine/item";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import { withCatalysing } from "./catalysing";

/** 1 個ぶんの見積もり */
export interface SoloCost {
  modId: string;
  /** その MOD 1 個を自分で出す期待費用 (高貴建て)。出せなければ Infinity */
  expectedCost: number;
  /**
   * 厳しめの目安 (p75、高貴建て)。回せない時と、**回した結果が信用できない時**は null。
   *
   * 重い craft では 1 本の道中が 1 万手を超え、打ち切りに当たった本が分布を下に引きます。
   * 2026-09-23 の実測 (指輪のキャストスピード): 上限 2 万手だと 67.8% が打ち切りに当たり、
   * p50 = p75 = p90 が全部同じ (壁の値) になって、真値の 32% しか出ていませんでした。
   * **そういう時は出しません。**嘘の「厳しめ」を出すより、無いほうがましです。
   */
  p75: number | null;
  /** 一番かかる出費の行 (「カオスオーブ 1,708 回」)。出せなければ null */
  mainSpend: string | null;
  ms: number;
}

/**
 * 目標 1 個ずつの「自分で出す費用」を、**高い順**に返す。
 *
 * 高い物ほど「買ったほうがいい」候補です。`runs` を 0 にすると p75 を出しません (その分速い)。
 */
export function soloCosts(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { level?: number; runs?: number; seed?: number } = {},
): SoloCost[] {
  const level = opts.level ?? 82;
  // 既定を 4,000 → 1,000 に下げた。重い craft は 1 本が 1 万手を超えるので、本数がそのまま
  // 時間になる (実測: 6 目標で 15.2 秒 → 5.3 秒。p75 の差は 5% ほど)
  // **既定は 0 = 回さない。**期待費用は厳密解なので回さなくても出る。重いのは p75 だけ
  const runs = opts.runs ?? 0;
  const lim = limitsOf(cls);
  // 「その MOD さえ付けばいい」= 他の枠は全部自由
  const spare = { prefixes: lim.prefixes, suffixes: lim.suffixes };

  const out: SoloCost[] = [];
  for (const t of targets) {
    const t0 = Date.now();
    const r = markovFromItem(data, prices, whiteItem(cls, level), [t], { spare, ...withCatalysing(data, cls, [t]) });
    const b = runs > 0 && r.feasible && Number.isFinite(r.expectedCost)
      ? simulateBudget(prices, cls, r, { runs, budget: r.expectedCost, seed: opts.seed ?? 11 })
      : null;
    const top = b?.spend?.[0];
    out.push({
      modId: t.modId,
      expectedCost: r.expectedCost,
      // 打ち切りに当たった本が多い時は出さない ([[budget.ts]] の `reliable`)
      p75: b && b.reliable ? b.p75 : null,
      mainSpend: top ? `${top.label} ${Math.round(top.uses).toLocaleString()} 回` : null,
      ms: Date.now() - t0,
    });
  }
  out.sort((a, b2) => b2.expectedCost - a.expectedCost);
  return out;
}

/** 買うか自分で出すかの判定 */
export type BuyOrRollVerdict = "buy" | "roll" | "unknown";

/**
 * その MOD について「買う」か「自分で出す」か。
 *
 * どちらも**高貴建て**。`listingPrice` は「その MOD が付いた物」の最安です
 * (ここは取引所を叩きません。呼び出し側が入れてください)。
 */
export function buyOrRoll(solo: SoloCost, listingPrice: number | null): {
  verdict: BuyOrRollVerdict;
  /** 自作費 ÷ 買値。1 より大きければ買うほうが安い */
  ratio: number | null;
} {
  if (listingPrice == null || !(listingPrice > 0)) return { verdict: "unknown", ratio: null };
  if (!Number.isFinite(solo.expectedCost)) return { verdict: "buy", ratio: null };
  const ratio = solo.expectedCost / listingPrice;
  return { verdict: ratio > 1 ? "buy" : "roll", ratio };
}


/**
 * **その 1 個だけ**「厳しめの目安 (p75)」を出す。押された時に呼ぶ用。
 *
 * 回した分布が信用できない (打ち切りに当たった本が多い) 時は null を返します ──
 * 嘘の「厳しめ」を出すより、無いほうがましです ([[budget.ts]] の `reliable`)。
 */
export function soloP75(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  target: TierTarget,
  opts: { level?: number; runs?: number; seed?: number } = {},
): { p75: number | null; mainSpend: string | null; ms: number } {
  const t0 = Date.now();
  const lim = limitsOf(cls);
  const r = markovFromItem(data, prices, whiteItem(cls, opts.level ?? 82), [target], {
    spare: { prefixes: lim.prefixes, suffixes: lim.suffixes },
    ...withCatalysing(data, cls, [target]),
  });
  if (!r.feasible || !Number.isFinite(r.expectedCost)) return { p75: null, mainSpend: null, ms: Date.now() - t0 };
  const b = simulateBudget(prices, cls, r, {
    runs: opts.runs ?? 1000,
    budget: r.expectedCost,
    seed: opts.seed ?? 11,
  });
  const top = b?.spend?.[0];
  return {
    p75: b && b.reliable ? b.p75 : null,
    mainSpend: top ? `${top.label} ${Math.round(top.uses).toLocaleString()} 回` : null,
    ms: Date.now() - t0,
  };
}
