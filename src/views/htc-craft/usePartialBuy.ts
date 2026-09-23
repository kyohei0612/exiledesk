/**
 * usePartialBuy.ts — 途中品を買って始める検索 (2026-09-23)
 *
 * useHtcCraft.ts が 500 行に近いので分けた (オーナーの決まり: 1 ファイル 500 行まで)。
 * 計算は [[partial-buy.ts]]、ここは取引所に順に投げて最安を並べるだけ。
 * **押された時だけ**取る (組み合わせ 4 本で約 40 秒。検索 10 秒間隔 / 5 分 30 回を守る autoPrice 経由)。
 */
import { computed, ref, shallowRef } from "vue";
import { partialBuyPlans, type PartialBuyPlan } from "../../services/htc/partial-buy";
import type { SpamPlan } from "../../services/htc/spam-plan";
import type { TreeBuy } from "../../services/htc/tree-buy";
import { autoPrice, tradeAuto } from "../../services/trade2/auto-price";
import { marketStore } from "../../state/market-store";
import type { ItemBase, PatchData } from "../../vendor/poe2htc/engine/types";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";

export interface PartialBuyRow {
  held: string[];
  remaining: number;
  /** 最安 (高貴換算)。見つからなければ null */
  cheapest: number | null;
  total: number;
  url: string | null;
  /** 最安 + 残り。見つからなければ null */
  sum: number | null;
  unmatched: string[];
}

/** 読むだけの参照 (ref / computed のどちらでも) */
type Src<T> = { readonly value: T };

export function usePartialBuy(deps: {
  data: Src<PatchData | null>;
  base: Src<ItemBase | null>;
  prices: Src<Prices | null>;
  targets: Src<TierTarget[]>;
  spam: Src<SpamPlan | null>;
  treeBuys: Src<readonly TreeBuy[]>;
  used: Src<{ prefix: number; suffix: number }>;
  ilvlMin: Src<number | undefined>;
  baseType: Src<string | undefined>;
}) {
  const busy = ref(false);
  const error = ref<string | null>(null);
  const rows = shallowRef<PartialBuyRow[] | null>(null);

  const plans = computed<PartialBuyPlan[]>(() => {
    const d = deps.data.value, cls = deps.base.value, sp = deps.spam.value;
    if (!d || !cls || !sp) return [];
    return partialBuyPlans({
      data: d, cls, plan: sp, targets: deps.targets.value, treeBuys: deps.treeBuys.value, used: deps.used.value,
      ...(deps.ilvlMin.value != null ? { ilvlMin: deps.ilvlMin.value } : {}),
      ...(deps.baseType.value ? { baseType: deps.baseType.value } : {}),
    });
  });

  async function search(): Promise<void> {
    if (busy.value || !plans.value.length) return;
    busy.value = true;
    error.value = null;
    rows.value = null;
    try {
      const league = marketStore.league.value?.Value ?? "Standard";
      const rates = marketStore.rates.value;
      const out: PartialBuyRow[] = [];
      for (const p of plans.value) {
        if (p.unmatched.length) {
          out.push({ held: p.held, remaining: p.remaining, cheapest: null, total: 0, url: null, sum: null, unmatched: p.unmatched });
          continue;
        }
        const r = await autoPrice(league, p.query, rates, 5);
        if (!r) {
          if (tradeAuto.lastError.value) error.value = tradeAuto.lastError.value;
          out.push({ held: p.held, remaining: p.remaining, cheapest: null, total: 0, url: null, sum: null, unmatched: [] });
          continue;
        }
        // 出品が無くても件数と検索のリンクは残す (手で開いて条件を確かめられるように)
        const cheapest = r.minExalted ?? null;
        out.push({
          held: p.held, remaining: p.remaining, cheapest, total: r.total, url: r.searchUrl || null,
          sum: cheapest == null ? null : cheapest + p.remaining, unmatched: [],
        });
        rows.value = [...out];
      }
      rows.value = out;
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  return { plans, rows, busy, error, search };
}
