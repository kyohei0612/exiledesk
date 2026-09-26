/**
 * ジェムコラプト収支 — 状態 / 相場 / 経路評価 (2026-09-12)
 *
 *   ジェム一覧: i18n/gems-client.json (GGG クライアント SkillGems + BaseItemTypes + GemTags)
 *   素材価格:   poe2scout (ヴァール / プリズム / 宝飾職人 (完全) / コラプトの結晶 / 原石 Lv20)
 *   売値:       手入力、または trade2 で最安を 3 回検索 (レベル 21 / 品質 23% / 完成品)。
 *               「鑑定 ↗」は API を叩かず ?q= でトレードサイトを開く (レート制限に当たらない)。
 *   期待値:     gem-corrupt/model.ts (純粋関数)
 *
 * 2026-09-26: ジェム一覧は gem-list.ts、素材は use-gem-materials.ts、売値は use-gem-sale.ts へ分けた。
 * 呼ぶ側は今まで通りここから取れる (返す物の形も同じ)。
 */
import { computed, ref } from "vue";
import { marketStore } from "../../state/market-store";
import { setBaseSource as saveBaseSource, type BaseSource } from "../../state/gem-base-source";
import { bestRoute, DEFAULT_PARAMS, evaluateRoutes, vaalProbabilities, type CorruptParams, type RouteResult } from "./model";
import { searchGems } from "./search";
import type { GemInfo } from "./gem-list";
import { useGemMaterials } from "./use-gem-materials";
import { useGemSale } from "./use-gem-sale";

export { GEMS, SALE_ROWS, type GemInfo, type SaleKey, type SaleRow } from "./gem-list";

export function useGemCorrupt() {
  // ---- ジェム選択 ----
  const query = ref("");
  const selected = ref<GemInfo | null>(null);
  // 自動ジェム監視と同じ検索 (正規表現も使える。2026-09-18 に共通化)
  const matches = computed<GemInfo[]>(() => searchGems(query.value).hits);
  function nextTickLoadExchange(): void {
    queueMicrotask(() => loadExchangeCache());
  }
  function select(g: GemInfo): void {
    // 2026-09-14: 別のジェムの取得中に選び直したら、その取得は捨てて新しいジェムで取り直す
    // (以前は取得中フラグで新しい取得が始まらず、前のジェムの売値が新しいジェムに書き込まれていた)
    if (selected.value?.en !== g.en) {
      abandonFetch();
    }
    selected.value = g;
    query.value = g.ja;
    // 取ってあった取引所レート (30 分以内) はそのまま使う
    void nextTickLoadExchange();
    sale.value = { level21: null, quality23: null, finished: null };
    saleInfo.value = { level21: null, quality23: null, finished: null };
    saleRecordedAt.value = { level21: null, quality23: null, finished: null };
    priceError.value = null;
    // 取得が通らなくても計算できるように、まず記録の最安値を入れる
    applyRecordedSale(g.en, true);
    refreshFlow();
  }

  // ---- 相場 (poe2scout、アプリ共通の相場ストア。カレンシーランキングが取った物を流用) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const loadMarket = (): Promise<void> => marketStore.ensureMarket();
  const rates = marketStore.rates;
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");

  // ---- 素材 (原石 / 現物 / 取引所の比較) は use-gem-materials.ts ----
  const {
    spiritBump,
    isSpirit,
    spiritMeasured,
    baseBump,
    baseSource,
    baseGemSource,
    baseBuyTotalFor,
    baseBuyInfo,
    baseGemLabel,
    materials,
    materialApiIds,
    exchangeLoading,
    exchangeError,
    exchangeDone,
    loadExchangeCache,
    fetchExchange,
    bestBuy,
    uncutLabel,
  } = useGemMaterials(selected, tradeLeague);

  // ---- 売値 (手入力 or trade2) は use-gem-sale.ts ----
  const {
    sale,
    saleInfo,
    saleRecordedAt,
    pricing,
    priceError,
    retryWhenFree,
    refreshFlow,
    applyRecordedSale,
    baseTradeUrl,
    tradeUrl,
    abandonFetch,
    measureOriginal,
    fetchSalePrices,
  } = useGemSale({ selected, tradeLeague, spiritBump, baseBump, fetchExchange });

  /** 素材表の切替 (カルグール系は既定で「現物を買う」。手で変えたら覚える) */
  function setBaseSource(v: BaseSource): void {
    const en = selected.value?.en;
    if (!en) return;
    saveBaseSource(en, v);
    baseBump.value++;
    // 現物を買うに切り替えて、まだ値段が無ければ取りに行く (売値と同じ門を通る)
    if (v === "buy" && !pricing.value) void measureOriginal(selected.value!, true);
  }

  // ---- 前提 (確率) ----
  const params = ref<CorruptParams>({ ...DEFAULT_PARAMS });
  function resetParams(): void {
    params.value = { ...DEFAULT_PARAMS };
  }
  const vaalP = computed(() => vaalProbabilities(params.value));

  // ---- 評価 ----
  const routes = computed<RouteResult[]>(() => evaluateRoutes(materials.value, sale.value, params.value));
  const best = computed<RouteResult | null>(() => bestRoute(routes.value));
  const divineRate = computed(() => rates.value.divine);

  return {
    query,
    selected,
    matches,
    select,
    league,
    marketError,
    marketLabel,
    loadMarket,
    baseGemSource,
    baseGemLabel,
    baseSource,
    setBaseSource,
    baseBuyInfo,
    baseBuyTotalFor,
    baseTradeUrl,
    materialApiIds,
    exchangeLoading,
    exchangeError,
    exchangeDone,
    fetchExchange,
    bestBuy,
    materials,
    uncutLabel,
    isSpirit,
    spiritMeasured,
    sale,
    saleInfo,
    saleRecordedAt,
    pricing,
    priceError,
    retryWhenFree,
    tradeUrl,
    fetchSalePrices,
    params,
    resetParams,
    vaalP,
    routes,
    best,
    divineRate,
  };
}
