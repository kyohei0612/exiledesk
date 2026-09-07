/**
 * クラフト収支の状態: 貼り付け → 解析 → エッセンス候補 → 相場 (trade2) → 収支
 *
 * 価格は全て高貴 (Exalted) 建て。レートと素材価格は poe2scout。
 */
import { computed, ref } from "vue";
import { fetchItems, fetchLeagues, type CurrencyItem, type League } from "../../api/poe2scout";
import { priceMinListing, type ExaltedRates, type PriceResult } from "../../services/trade2/pricing";
import { tradeCategoryOfClass } from "../../services/trade2/category";
import { parseItemText, type ParsedItem } from "./parse";
import { planEssences, statFiltersForOutcome, type EssencePlan, type Outcome } from "./essence-plan";

export interface OutcomePrice {
  outcome: Outcome;
  status: "idle" | "loading" | "done" | "error";
  result: PriceResult | null;
  /** trade2 に投げられなかった mod (stat 未マッピング) */
  missing: string[];
  error: string | null;
}

export interface PlanRow {
  plan: EssencePlan;
  /** エッセンス 1 個の価格 (高貴)。poe2scout に無ければ null */
  essencePrice: number | null;
  prices: OutcomePrice[];
}

export function useCraftProfit() {
  const text = ref("");
  const item = ref<ParsedItem | null>(null);
  const parseError = ref<string | null>(null);
  /** ベース (貼り付けた装備) の購入価格。自前なら 0 */
  const baseCost = ref(0);

  const league = ref<League | null>(null);
  const marketItems = ref<CurrencyItem[]>([]);
  const marketError = ref<string | null>(null);
  const rows = ref<PlanRow[]>([]);
  const pricing = ref(false);
  const progress = ref({ done: 0, total: 0 });

  const rates = computed<ExaltedRates>(() => {
    const l = league.value;
    const divine = l?.DivinePrice || 1;
    const chaos = l && l.ChaosDivinePrice ? divine / l.ChaosDivinePrice : 1;
    const others: Record<string, number> = {};
    for (const it of marketItems.value) {
      if (it.ApiId && typeof it.CurrentPrice === "number") others[it.ApiId] = it.CurrentPrice;
    }
    return { divine, chaos, others };
  });

  async function loadMarket(): Promise<void> {
    try {
      const leagues = await fetchLeagues();
      league.value = leagues.find((l) => l.IsCurrent && !l.Value.startsWith("HC")) ?? leagues[0] ?? null;
      if (league.value) marketItems.value = await fetchItems(league.value.Value);
      marketError.value = null;
    } catch (e) {
      marketError.value = e instanceof Error ? e.message : String(e);
    }
  }

  function essencePriceOf(nameEn: string): number | null {
    // エッセンスは "essences"、0.3 の合金 (Alloy) は別カテゴリのことがあるので名前だけで引く
    const hit = marketItems.value.find((it) => it.Text === nameEn);
    return hit && typeof hit.CurrentPrice === "number" ? hit.CurrentPrice : null;
  }

  function analyze(): void {
    parseError.value = null;
    rows.value = [];
    const parsed = parseItemText(text.value);
    if (!parsed) {
      item.value = null;
      parseError.value = "装備テキストを読み取れませんでした";
      return;
    }
    item.value = parsed;
    if (!parsed.itemClass) {
      parseError.value = "ベース名から装備種別を特定できませんでした (ベース行が英語 / 日本語の正式名か確認)";
      return;
    }
    rows.value = planEssences(parsed).map((plan) => ({
      plan,
      essencePrice: essencePriceOf(plan.essence.nameEn),
      prices: plan.outcomes.map((outcome) => ({ outcome, status: "idle", result: null, missing: [], error: null })),
    }));
  }

  async function priceOne(row: PlanRow, op: OutcomePrice): Promise<void> {
    const it = item.value;
    if (!it || !league.value) return;
    const { filters, missing } = statFiltersForOutcome(op.outcome.mods);
    op.missing = missing;
    op.status = "loading";
    op.error = null;
    try {
      op.result = await priceMinListing(
        {
          league: league.value.Value,
          baseTypeEn: it.baseEn,
          category: it.itemClass ? tradeCategoryOfClass(it.itemClass) : null,
          rarity: op.outcome.rarity,
          stats: filters,
        },
        rates.value,
      );
      op.status = "done";
    } catch (e) {
      op.status = "error";
      op.error = e instanceof Error ? e.message : String(e);
    }
    void row;
  }

  /** 使えるエッセンス全部の相場を直列で調べる (trade2 のレート制限を守るため) */
  async function priceAll(): Promise<void> {
    if (pricing.value) return;
    const targets: Array<[PlanRow, OutcomePrice]> = [];
    for (const row of rows.value) {
      if (row.plan.blocked) continue;
      for (const op of row.prices) if (op.status !== "done") targets.push([row, op]);
    }
    progress.value = { done: 0, total: targets.length };
    pricing.value = true;
    try {
      for (const [row, op] of targets) {
        await priceOne(row, op);
        progress.value = { ...progress.value, done: progress.value.done + 1 };
      }
    } finally {
      pricing.value = false;
    }
  }

  /** 収支 = 完成品の最安 − (ベース + エッセンス)。Perfect は結果ごとに出すので平均も返す */
  function profitOf(row: PlanRow, op: OutcomePrice): number | null {
    if (op.result?.minExalted == null || row.essencePrice == null) return null;
    return op.result.minExalted - (baseCost.value + row.essencePrice);
  }

  return {
    text,
    item,
    parseError,
    baseCost,
    league,
    marketError,
    rows,
    pricing,
    progress,
    rates,
    loadMarket,
    analyze,
    priceOne,
    priceAll,
    profitOf,
  };
}
