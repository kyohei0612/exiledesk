/**
 * partial-buy.ts — 途中まで出来ている指輪を買って始める (2026-09-23)
 *
 * オーナーと決めた改善案の 1 つ:「キャスピのスパムは平均 11 神でも、やり直し込みだと実質 90 神ほど。
 * 『樹 MOD (固定済み) + キャスピ』のような途中品が安ければスパムを飛ばせる」。
 *
 * スパムの狙いを含む**同じ側の組み合わせごと**に、
 *   「作れない MOD (樹 MOD、固定済み) + その組み合わせ (段の下限つき)」
 * の途中品を探し、`最安 + そこから完成までの平均` を「最初から作る」と並べる。
 *
 * 検索の決まり (樹 MOD の検索と同じ。オーナー 2026-09-23):
 *   - ilvl は貼り付け以上、ユニーク以外、コラプト無し
 *   - **外れの無い物だけ**: 同じ側の MOD の数 ≦ 組み合わせの数、反対側 ≦ 固定済みの数
 *     (外れがあると消去が要り、狙いが消える危険も付くので、残りの平均が合わなくなる)
 *   - 樹 MOD は固定済み (`fractured.`)、それ以外は `explicit.`
 */
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import { buildSpecQuery } from "../trade2/query";
import { tradeCategoryOf, tradeFiltersFor } from "./buy-or-craft";
import type { SpamPlan } from "./spam-plan";
import { STRICT_PREFIX, STRICT_SUFFIX, type TreeBuy } from "./tree-buy";

export interface PartialBuyPlan {
  /** 付いている狙い (スパムの狙いを含む、同じ側) */
  held: string[];
  /** そこから同じ側が揃うまでの平均 + 仕上げの平均 (高貴換算)。途中品の値段は含まない */
  remaining: number;
  query: ReturnType<typeof buildSpecQuery>;
  /** 取引所の条件にできなかった狙い (あれば検索しない) */
  unmatched: string[];
}

export interface PartialBuyInput {
  data: PatchData;
  cls: ItemBase;
  plan: SpamPlan;
  /** 狙い全部 (段の下限を持つ) */
  targets: readonly TierTarget[];
  /** 作れない MOD (樹 MOD) の固定済みの条件 ([[tree-buy.ts]] の treeBuys) */
  treeBuys: readonly TreeBuy[];
  /** 固定済み・樹 MOD で埋まっている枠 */
  used: { prefix: number; suffix: number };
  ilvlMin?: number;
  baseType?: string;
}

export function partialBuyPlans(inp: PartialBuyInput): PartialBuyPlan[] {
  const { plan } = inp;
  if (!plan.phase || !plan.spam || !plan.side) return [];
  const finish = plan.finish && !plan.finish.reason ? plan.finish.expected : 0;
  const category = tradeCategoryOf(inp.cls);
  if (!inp.baseType && !category) return [];
  const sameMax = (n: number): { id: string; max: number } =>
    ({ id: plan.side === "prefix" ? STRICT_PREFIX : STRICT_SUFFIX, max: n });
  const otherMax = { id: plan.side === "prefix" ? STRICT_SUFFIX : STRICT_PREFIX, max: plan.side === "prefix" ? inp.used.suffix : inp.used.prefix };
  const tree = inp.treeBuys.flatMap((b) => b.filters).map((f) => ({ id: f.id, min: f.min ?? 0 }));

  const out: PartialBuyPlan[] = [];
  for (const row of plan.phase.fromHeld) {
    const held = [plan.spam.modId, ...row.held];
    const targets = inp.targets.filter((t) => held.includes(t.modId));
    const { filters, unmatched } = tradeFiltersFor(inp.data, targets);
    const query = buildSpecQuery({
      ...(inp.baseType ? { baseType: inp.baseType } : {}),
      ...(category ? { category } : {}),
      rarity: "nonunique",
      ...(inp.ilvlMin != null ? { ilvlMin: inp.ilvlMin } : {}),
      stats: [...tree, ...filters.map((f) => ({ id: f.id, min: f.min })), sameMax(held.length), otherMax],
    });
    out.push({ held, remaining: row.expected + finish, query, unmatched });
  }
  // 付いている数が多い順 (完成に近い物から)
  return out.sort((a, b) => b.held.length - a.held.length);
}
