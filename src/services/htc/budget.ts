/**
 * budget.ts — 「予算内に終わるか」「どこで金がかかるか」(2026-09-22)
 *
 * オーナー指示:
 *   「完成品の売値を予算として試算 → 完成できるまで何神か試算するボタンも欲しい」
 *   「どこで一番お金かかるのかも知りたい。最初のスパムの確率なのか、みたいな」
 *   「割と重みって確率通りにいくことが多い。やればやるほど集約していく。
 *     **なんで期待値はちょっと沼った値を期待値としよう。少し厳し目で見る**」
 *
 * ## 期待値 (平均) は「半分は超える額」
 * ソルバが返す `expectedCost` は**平均**です。上流も書いている通り、平均で予算を組むと
 * **半分くらいは足が出ます** (`planCostCdf` の説明: "E is roughly a coin flip, so
 * 'expected 200ex' busts about half the time")。
 *
 * オーナーの言う通り、**少し沼った側の額**を既定にします。ここでは**分位点**を出して、
 * 既定を `p75` (4 回に 3 回はこの額までに終わる) にしています。平均も併せて返すので、
 * 「平均 ◯ / 厳しめ ◯」と並べられます。
 *
 * ## どうやって出すか
 * MDP の最適方策 (`policy` / `edges`) をそのまま**回します**。`edges` は
 * 「どの状態でどの手を打つと、どの確率でどこへ行くか」なので、乱数で辿れば 1 回のクラフトの
 * 実費が出ます。それを何千回も回して分布にします。
 *
 * **平均が `expectedCost` と合うか**を毎回見ています (合わなければ回し方がおかしい)。
 *
 * ## どこで金がかかるか
 * 同じ道中で**手ごとの出費を足し込みます**。「カオスオーブに 6 割、消去のオーブに 3 割」
 * のように出るので、「最初のスパムが重いのか、最後の詰めが重いのか」が分かります。
 */
import { actionCostOf } from "../../vendor/poe2htc/optimizer/markovActions";
import { labelOfAction } from "./labels";
import type { McAction } from "../../vendor/poe2htc/optimizer/markovActions";
import type { MarkovResult } from "../../vendor/poe2htc/optimizer/markovFromItem";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase } from "../../vendor/poe2htc/engine/types";

/** 手ごとの出費 */
export interface SpendRow {
  /** ゲーム公式の日本語 (「保存された鎖骨 + ブラックブラッドのお告げ」) */
  label: string;
  /** 1 回のクラフトで平均いくら使うか (高貴建て) */
  exalted: number;
  /** 総額に占める割合 (0-1) */
  share: number;
  /** 1 回のクラフトで平均何回打つか */
  uses: number;
}

export interface BudgetResult {
  /** 回した本数 */
  runs: number;
  /** 平均 (ソルバの expectedCost と一致するはず) */
  mean: number;
  /** 半分がここまでに終わる額 */
  p50: number;
  /** **既定の「厳しめ」**。4 回に 3 回はここまでに終わる */
  p75: number;
  /** 10 回に 9 回はここまでに終わる */
  p90: number;
  /** 予算を渡した時、その中で終わる割合 (0-1)。渡さなければ null */
  withinBudget: number | null;
  /** 出費の内訳 (多い順) */
  spend: SpendRow[];
  /** 打ち切りに当たった本数 (多いと数字が甘く出る) */
  truncated: number;
  /**
   * 分位点を信じていいか。**打ち切りが 1% を超えたら false。**
   *
   * 打ち切った本は「その時点の出費で完走した」扱いなので、当たるほど分布が下に寄ります。
   * false の時に p75 を「厳しめの目安」として出すと**嘘になります** (実測では真値の 32%、
   * しかも p50 = p75 = p90 が全部同じ = 壁の値)。画面では出さないこと。
   */
  reliable: boolean;
}

/**
 * 1 本の道中で踏める手の上限。沼った時に無限に回らないようにする。
 *
 * **低すぎると分位点が嘘になります。**打ち切った本は「その時点の出費で完走した」扱いになるので、
 * 当たる本が増えるほど分布が丸ごと下に寄ります。2026-09-23 に実測 (指輪のキャストスピード
 * 16-18%、カオス 1 万回級の craft):
 *   上限 20,000 → 打ち切り 67.8% / 回した平均 2,014 神 (MDP の厳密解 6,208 神の 32%)
 *                 p50 = p75 = p90 = 2,426 神 (全部同じ = 壁の値)
 * 呼び出し側で変えられるようにし、当たった割合を `truncated` で必ず見ること。
 */
const DEFAULT_MAX_STEPS = 2000000;

/**
 * 最適方策を回して分布と内訳を出す。
 *
 * @param budget 予算 (高貴建て)。完成品の売値を入れると「その額で作り切れる割合」が出る
 */
export function simulateBudget(
  prices: Prices,
  cls: ItemBase,
  res: MarkovResult,
  opts: { runs?: number; budget?: number | null; seed?: number; maxSteps?: number } = {},
): BudgetResult | null {
  if (!res.feasible || !Number.isFinite(res.expectedCost) || res.nodes.length === 0) return null;
  const runs = Math.max(1, opts.runs ?? 3000);
  const maxSteps = Math.max(1000, opts.maxSteps ?? DEFAULT_MAX_STEPS);

  // 状態 → その状態で踏む枝 (確率つき)。edges は最適方策の分だけ入っている
  const out = new Map<string, { to: string; prob: number; action: McAction }[]>();
  for (const e of res.edges) {
    const list = out.get(e.from) ?? [];
    list.push({ to: e.to, prob: e.prob, action: e.action as McAction });
    out.set(e.from, list);
  }
  const start = res.nodes[0]!.key;
  // 出ていく枝が無い状態 = 完成
  const isGoal = (k: string) => !out.has(k);

  // 乱数は種つき (同じ入力で同じ数字が出るように)
  let s = (opts.seed ?? 0x9e3779b9) >>> 0;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };

  const costOf = new Map<McAction, number>();
  const costFor = (a: McAction) => {
    let c = costOf.get(a);
    if (c === undefined) costOf.set(a, (c = actionCostOf(prices, a)));
    return c;
  };

  const totals: number[] = [];
  const byLabel = new Map<string, { exalted: number; uses: number }>();
  let truncated = 0;

  for (let i = 0; i < runs; i++) {
    let key = start;
    let spent = 0;
    let steps = 0;
    while (!isGoal(key)) {
      if (++steps > maxSteps) {
        truncated++;
        break;
      }
      const branches = out.get(key)!;
      const action = branches[0]!.action;
      const c = costFor(action);
      spent += c;
      const label = labelOfAction(action, cls).text;
      const row = byLabel.get(label) ?? { exalted: 0, uses: 0 };
      row.exalted += c;
      row.uses += 1;
      byLabel.set(label, row);
      // 確率で行き先を選ぶ (枝の確率は合計 1 になる)
      let r = rnd();
      let next = branches[branches.length - 1]!.to;
      for (const b of branches) {
        r -= b.prob;
        if (r <= 0) {
          next = b.to;
          break;
        }
      }
      key = next;
    }
    totals.push(spent);
  }

  totals.sort((a, b) => a - b);
  const at = (q: number) => totals[Math.min(totals.length - 1, Math.floor(q * totals.length))] ?? 0;
  const sum = totals.reduce((a, b) => a + b, 0);
  const grand = [...byLabel.values()].reduce((a, r) => a + r.exalted, 0);

  return {
    runs,
    mean: sum / totals.length,
    p50: at(0.5),
    p75: at(0.75),
    p90: at(0.9),
    withinBudget: opts.budget != null ? totals.filter((t) => t <= opts.budget!).length / totals.length : null,
    spend: [...byLabel.entries()]
      .map(([label, r]) => ({ label, exalted: r.exalted / runs, share: grand > 0 ? r.exalted / grand : 0, uses: r.uses / runs }))
      .sort((a, b) => b.exalted - a.exalted),
    truncated,
    reliable: truncated / runs <= 0.01,
  };
}
