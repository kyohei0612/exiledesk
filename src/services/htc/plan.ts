/**
 * plan.ts — 「まず手順をパッと出す」(2026-09-22)
 *
 * オーナー指示:「先に手順みてパッと分かるならいいね。そこからさらに期待値を出すように
 * 指示して開始が一番丸いかもな」。
 *
 * ## 2 段構え
 *   1. **ここ** … 一本道の手順と「1 回あたりの確率」を**即時**に出す (6 目標で 0.08 秒)
 *   2. あとから … 「期待値を出す」を押したら MDP を回す ([[budget.ts]]、5 目標 15 秒 / 6 目標 3 分)
 *
 * ## 一本道の費用は予算に使わない
 * ここが出す `cost` は「**外したら白から作り直す**」前提の期待費用です。6 MOD の craft だと
 * いい MOD を 5 個捨てて回すことになるので、天文学的になります (実測 1.0e13 ex)。
 * **手順と 1 回あたりの確率を見るための物**で、予算の判断には MDP の数字を使ってください。
 * 本家も同じ断りを出しています:「use costs to compare plans, not to budget precisely」。
 *
 * ## 本家と同じ答えが出ることを確認済み (2026-09-22)
 * poe2htc.com v1.1.0 に同じ条件 (琥珀のアミュレット / ilvl 82 / 6 MOD 全部 T1) を入れた結果と、
 * **1 回の確率 (1 in 5.7e9)・評価した手順の数 (335,664)・案の数 (3)・手順の中身**が一致しました。
 * こちらは日本語で、骨と片側のお告げまで出るぶん細かい。
 */
import { optimizePareto } from "../../vendor/poe2htc/optimizer/optimize";
import { withEssenceAlternatives } from "./essence-route";
import { labelOfStep } from "./labels";
import { displayCurrency } from "../../state/display-currency";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Prices, PricedStep } from "../../vendor/poe2htc/optimizer/cost";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";

/** 手順 1 段 */
export interface PlanLine {
  /** 何をするか。ゲーム公式の日本語 (「保存された鎖骨 + ブラックブラッドのお告げ」) */
  text: string;
  /** 何を狙うか (MOD の id)。狙いが無い段は null */
  modId: string | null;
  /** この段が当たる確率 (0-1)。分からなければ null */
  prob: number | null;
}

/** 1 つの案 */
export interface PlanOption {
  steps: PlanLine[];
  /** 1 回通した時に成功する確率 (0-1) */
  probability: number;
  /** 「1 in 5.7 億」の形 */
  oddsText: string;
  /** **1 回通すのにかかる額** (高貴建て)。本家の「WHAT ONE RUN COSTS」と同じ */
  perRunCost: number | null;
  /**
   * 作り直し前提の期待費用 (高貴建て)。**予算には使わないこと** (冒頭の説明を参照)。
   * 出せなければ null。
   */
  restartCost: number | null;
}

export interface PlanPreview {
  /** 当たりやすい順。先頭が一番確実 */
  options: PlanOption[];
  /** 数えた手順の数 (本家の「checked N plans」と同じ) */
  plansEvaluated: number;
  /** 時間切れで打ち切ったか */
  truncated: boolean;
  /** かかった時間 (ミリ秒) */
  ms: number;
}

/** 「1 in 5.7 億」。桁が大きい時は日本語の単位で丸める */
export function oddsText(p: number): string {
  if (!(p > 0)) return "作れない";
  const n = 1 / p;
  if (n < 1000) return `1 / ${n.toFixed(0)}`;
  const units: [number, string][] = [
    [1e12, "兆"],
    [1e8, "億"],
    [1e4, "万"],
  ];
  for (const [v, label] of units) if (n >= v) return `1 / ${(n / v).toFixed(1)} ${label}`;
  return `1 / ${Math.round(n).toLocaleString()}`;
}

/**
 * 手順を即時に出す。
 *
 * **エッセンスでも付く MOD は自動で候補に入れます** ([[essence-route.ts]])。同じ行が
 * エッセンスで確定させられるなら、ソルバが値段を見て安いほうを選びます。T1 狙いだと
 * エッセンスは届かないので候補は増えず、結果も時間も今までと同じになります。
 *
 * @param targets 狙う MOD とティア。`minTierIndex` 未指定なら「どのティアでも可」
 * @param level   アイテムレベル
 * @param opts.essences `false` でエッセンスの代替を入れない (検算で今までの数字と比べる時に使う)
 */
export function planPreview(
  data: PatchData,
  prices: Prices,
  cls: ItemBase,
  targets: readonly TierTarget[],
  opts: { level?: number; maxMillis?: number; essences?: boolean } = {},
): PlanPreview {
  const t0 = Date.now();
  const level = opts.level ?? 82;
  const wide = opts.essences === false ? targets : withEssenceAlternatives(data, cls, targets, level);
  const r = optimizePareto(data, prices, cls, wide, {
    level,
    ...(opts.maxMillis != null ? { maxMillis: opts.maxMillis } : {}),
  });
  // frontier は安い順。画面には**当たりやすい順**で出す (最初に見たいのはそこ)
  const options = [...r.frontier].reverse().map((p) => {
    const steps = (p.steps ?? []).map((st, i): PlanLine => ({
      text: labelOfStep(st as PricedStep, cls).text,
      modId: (st as { add?: string }).add ?? null,
      prob: p.result?.steps?.[i]?.prob ?? null,
    }));
    // `cost` は内訳 (`{ expected, perAttempt, expectedAttempts }`)。画面に出すのは 1 回ぶん
    const c = p.cost as unknown as { expected?: number; perAttempt?: number } | undefined;
    const num = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      steps,
      probability: p.probability,
      oddsText: oddsText(p.probability),
      perRunCost: num(c?.perAttempt),
      restartCost: num(c?.expected),
    };
  });
  return { options, plansEvaluated: r.plansEvaluated, truncated: !!r.truncated, ms: Date.now() - t0 };
}

/** 画面に出す 1 行 (「1 / 57.1 億 · 1 回 4 神」) */
export function planHeadline(o: PlanOption): string {
  const per = o.perRunCost != null ? displayCurrency.money(o.perRunCost, { round: "up" }) : null;
  return per ? `${o.oddsText} · 1 回 ${per}` : o.oddsText;
}
