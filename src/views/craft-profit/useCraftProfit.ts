/**
 * クラフト収支の状態: 貼り付け → 解析 → エッセンス候補 → 相場 (trade2) → 収支
 *
 * 価格は全て高貴 (Exalted) 建て。レートと素材価格は poe2scout。
 */
import { computed, ref } from "vue";
import { fetchItems, fetchLeagues, type CurrencyItem, type League } from "../../api/poe2scout";
import { priceMinListing, priceQueryUrl, retryAfterSeconds, type ExaltedRates, type PriceQueryInput, type PriceResult } from "../../services/trade2/pricing";
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
  /** お告げ 1 個の価格 (高貴)。お告げ無し = 0、poe2scout に無ければ null */
  omenPrice: number | null;
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
  /** trade2 に 429 を返された時刻 + Retry-After (epoch ms)。この時刻までは一括調査を止める */
  const rateLimitedUntil = ref<number | null>(null);

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

  /** poe2scout の名前一致で価格 (高貴)。エッセンス / 合金 / お告げ共通 (カテゴリはまちまちなので名前だけで引く) */
  function marketPriceOf(nameEn: string): number | null {
    const hit = marketItems.value.find((it) => it.Text === nameEn);
    return hit && typeof hit.CurrentPrice === "number" ? hit.CurrentPrice : null;
  }
  const essencePriceOf = marketPriceOf;

  /** 同じ mod 構成 (= 同じ trade2 filter) は 1 回しか検索しない (お告げ違いの行が同じ結果を共有する) */
  const priceCache = new Map<string, PriceResult>();

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
    priceCache.clear();
    rows.value = planEssences(parsed).map((plan) => ({
      plan,
      essencePrice: essencePriceOf(plan.essence.nameEn),
      prices: plan.outcomes.map((outcome) => ({
        outcome,
        status: "idle",
        result: null,
        missing: [],
        error: null,
        omenPrice: outcome.omen ? marketPriceOf(outcome.omen.nameEn) : 0,
      })),
    }));
  }

  function queryInputOf(op: OutcomePrice): PriceQueryInput | null {
    const it = item.value;
    if (!it || !league.value) return null;
    const { filters } = statFiltersForOutcome(op.outcome.mods);
    return {
      league: league.value.Value,
      baseTypeEn: it.baseEn,
      category: it.itemClass ? tradeCategoryOfClass(it.itemClass) : null,
      rarity: op.outcome.rarity,
      stats: filters,
    };
  }

  /** 「鑑定」: この結果の条件でトレードサイトを開く URL (API 不使用、レート制限なし) */
  function queryUrlOf(op: OutcomePrice): string | null {
    const input = queryInputOf(op);
    return input ? priceQueryUrl(input) : null;
  }

  async function priceOne(row: PlanRow, op: OutcomePrice): Promise<void> {
    const it = item.value;
    if (!it || !league.value) return;
    const { filters, missing } = statFiltersForOutcome(op.outcome.mods);
    op.missing = missing;
    const cacheKey = `${op.outcome.rarity}|${JSON.stringify(filters)}`;
    const cached = priceCache.get(cacheKey);
    if (cached) {
      op.result = cached;
      op.status = "done";
      op.error = null;
      return;
    }
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
      priceCache.set(cacheKey, op.result);
      op.status = "done";
      rateLimitedUntil.value = null;
    } catch (e) {
      op.status = "error";
      const wait = retryAfterSeconds(e);
      if (wait != null) {
        rateLimitedUntil.value = Date.now() + wait * 1000;
        op.error = `trade2 のレート制限 (${wait} 秒後に再試行できます)`;
      } else {
        op.error = e instanceof Error ? e.message : String(e);
      }
    }
    void row;
  }

  /**
   * 使えるエッセンス全部の相場を直列で調べる (trade2 のレート制限を守るため)。
   * 429 を返されたら残りは打ち切る (続けても全部 429 になり、ペナルティが延びるだけ)。
   */
  async function priceAll(): Promise<void> {
    if (pricing.value) return;
    if (rateLimitedUntil.value && rateLimitedUntil.value > Date.now()) return;
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
        if (rateLimitedUntil.value) break;
      }
    } finally {
      pricing.value = false;
    }
  }

  /** 素材の合計 (エッセンス + お告げ)。どちらか価格不明なら null */
  function materialCost(row: PlanRow, op: OutcomePrice): number | null {
    if (row.essencePrice == null || op.omenPrice == null) return null;
    return row.essencePrice + op.omenPrice;
  }

  /** 収支 = 完成品の最安 − (ベース + エッセンス + お告げ)。Perfect は外れる mod ごとの行 (確率は chance) */
  function profitOf(row: PlanRow, op: OutcomePrice): number | null {
    const mat = materialCost(row, op);
    if (op.result?.minExalted == null || mat == null) return null;
    return op.result.minExalted - (baseCost.value + mat);
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
    rateLimitedUntil,
    rates,
    loadMarket,
    analyze,
    priceOne,
    priceAll,
    queryUrlOf,
    materialCost,
    profitOf,
  };
}
