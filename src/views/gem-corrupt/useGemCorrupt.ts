/**
 * ジェムコラプト収支 — 状態 / 相場 / 経路評価 (2026-09-12)
 *
 *   ジェム一覧: i18n/gems-client.json (GGG クライアント SkillGems + BaseItemTypes + GemTags)
 *   素材価格:   poe2scout (ヴァール / プリズム / 宝飾職人 (完全) / コラプトの結晶 / 原石 Lv20)
 *   売値:       手入力、または trade2 で最安を 3 回検索 (レベル 21 / 品質 23% / 完成品)。
 *               「鑑定 ↗」は API を叩かず ?q= でトレードサイトを開く (レート制限に当たらない)。
 *   期待値:     gem-corrupt/model.ts (純粋関数)
 */
import { computed, ref, watch } from "vue";
import gemsRaw from "../../i18n/gems-client.json";
import { marketStore } from "../../state/market-store";
import { buildGemQuery, type GemQueryOptions } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { type PriceResult } from "../../services/trade2/pricing";
import { loadFlow, recordFlow, type FlowStore } from "../../services/market-flow";
import { autoPrice, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import { rowQueryOptions, SALE_KEY_LABEL, watchKey } from "./row-query";
import { cachedBuy, fetchBuy, payable, type BestBuy, type PayCurrency } from "../../services/trade2/exchange";
import { bestRoute, DEFAULT_PARAMS, evaluateRoutes, vaalProbabilities, type CorruptParams, type MaterialPrices, type RouteResult, type SalePrices } from "./model";
import { baseGemSourceFor, materialPricesFor, MATERIAL_API, uncut20ApiId, type BaseGemSource } from "./materials";
import { searchGems } from "./search";

export interface GemInfo {
  en: string;
  ja: string;
  kind: "skill" | "meta";
  spirit: boolean;
  minLevel: number;
}

export const GEMS: readonly GemInfo[] = gemsRaw as GemInfo[];

export type SaleKey = keyof SalePrices;

export interface SaleRow {
  key: SaleKey;
  label: string;
  /** 検索条件の説明 */
  condition: string;
}

export const SALE_ROWS: readonly SaleRow[] = [
  { key: "level21", label: "レベル 21 (品質 20%)", condition: "レベル 21 · 品質 20% · コラプト済 · 2 重コラプトなし" },
  { key: "quality23", label: "品質 23%", condition: "品質 23% · コラプト済 · 2 重コラプトなし (レベル不問)" },
  { key: "finished", label: "完成品 (21 · 23%)", condition: "レベル 21 · 品質 23% · コラプト済" },
];

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
      fetchSeq++;
      pricing.value = false;
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

  /**
   * 低レベルのジェム本体 = 原石のうち一番安い物 (2026-09-16 オーナー指示「スキルジェムとスピリットジェムの 15 以上を対象に一番安いのを表示」)。
   * 以前は「相場が無いので手入力」で既定 1 高貴のままだったため、ジェムが高い今は自作の収支が良く出すぎていた。
   * 決め方は materials.ts (自動ジェム監視の期待値と共通)
   */
  const baseGemSource = computed<BaseGemSource>(() => {
    const gem = selected.value;
    if (!gem) return { apiId: null, level: null, price: null };
    void marketStore.items.value; // 相場が入ったら取り直す
    return baseGemSourceFor(gem.spirit);
  });
  /** 素材表に出す名前 (どのレベルの原石を使うか) */
  const baseGemLabel = computed(() => {
    const lv = baseGemSource.value.level;
    const kind = selected.value?.spirit ? "スピリットジェムの原石" : "スキルジェムの原石";
    return lv == null ? "低レベルのジェム本体" : `低レベルのジェム本体 (${kind} レベル ${lv})`;
  });
  /** 素材の単価 = 相場と取引所 (繰り上げ後) の安い方。自動ジェム監視の期待値と同じ決め方 */
  const materials = computed<MaterialPrices>(() => {
    void marketStore.items.value;
    void exchange.value;
    return materialPricesFor(!!selected.value?.spirit, (apiId) => bestBuy(apiId)?.exalted ?? null, baseGemSource.value);
  });
  /**
   * 取引所 (exchange) で素材を通貨ごとに比べる (2026-09-16 オーナー指示「たまにカオスで買った方が安い」)。
   * poe2scout の相場は高貴建て 1 本なので通貨差が出ない。実レートは公式取引所から取る (ボタンで手動、30 分キャッシュ)。
   */
  const materialApiIds = computed<{ key: string; apiId: string }[]>(() => [
    ...(baseGemSource.value.apiId ? [{ key: "baseGem", apiId: baseGemSource.value.apiId }] : []),
    { key: "gcp", apiId: MATERIAL_API.gcp },
    { key: "perfectJeweller", apiId: MATERIAL_API.perfectJeweller },
    { key: "vaal", apiId: MATERIAL_API.vaal },
    { key: "crystal", apiId: MATERIAL_API.crystal },
    { key: "uncut20", apiId: uncut20ApiId(!!selected.value?.spirit) },
  ]);
  const exchange = ref<Record<string, BestBuy>>({});
  const exchangeLoading = ref(false);
  const exchangeError = ref<string | null>(null);
  const exchangeDone = computed(() => materialApiIds.value.filter((m) => exchange.value[m.apiId]).length);
  function loadExchangeCache(): void {
    const next = { ...exchange.value };
    for (const m of materialApiIds.value) {
      const c = cachedBuy(m.apiId);
      if (c) next[m.apiId] = c;
    }
    exchange.value = next;
  }
  async function fetchExchange(): Promise<void> {
    if (exchangeLoading.value) return;
    exchangeLoading.value = true;
    exchangeError.value = null;
    try {
      for (const m of materialApiIds.value) {
        try {
          const b = await fetchBuy(tradeLeague.value, m.apiId);
          if (b) exchange.value = { ...exchange.value, [m.apiId]: b };
        } catch (e) {
          exchangeError.value = e instanceof Error ? e.message : String(e);
          break;
        }
      }
    } finally {
      exchangeLoading.value = false;
    }
  }
  /** その素材を一番安く買える通貨 (高貴換算つき)。取っていなければ null */
  function bestBuy(apiId: string | null | undefined): { currency: PayCurrency; perUnit: number; rawPerUnit: number; exalted: number } | null {
    if (!apiId) return null;
    const e = exchange.value[apiId];
    const b = e?.best;
    if (!b) return null;
    // 単価は「実際に払う額」に繰り上げる (rawPerUnit は繰り上げ前の取引所レート)
    const p = payable(b);
    return { currency: b.currency, perUnit: p.payPerUnit, rawPerUnit: b.perUnit, exalted: p.payExalted };
  }
  const uncutLabel = computed(() => (selected.value?.spirit ? "スピリットジェムの原石 (レベル 20)" : "スキルジェムの原石 (レベル 20)"));

  // ---- 売値 (手入力 or trade2) ----
  const sale = ref<SalePrices>({ level21: null, quality23: null, finished: null });
  const saleInfo = ref<Record<SaleKey, PriceResult | null>>({ level21: null, quality23: null, finished: null });
  const pricing = ref(false);
  const priceError = ref<string | null>(null);

  /**
   * 一括取得 (自動巡回) が最後に見た最安値を売値の初期値にする
   * (オーナー指示 2026-09-17:「レート制限中でも一括で取った最終の値で計算してくれ。
   * ジェムコラの検索・計算はどのページから遷移しても」)。
   *
   * レート制限中は trade2 を叩けないので、以前は売値が空のまま何も計算できなかった。
   * 記録はこの PC のファイルなので読むのに通信は要らない。取得が通れば上書きされる。
   */
  const flow = ref<FlowStore | null>(null);
  /** その売値が記録由来の時、その記録を取った時刻 (unix 秒)。取得し直すと null に戻る */
  const saleRecordedAt = ref<Record<SaleKey, number | null>>({ level21: null, quality23: null, finished: null });
  function refreshFlow(): void {
    void loadFlow().then((f) => {
      flow.value = f;
      // 読み込みが間に合わずに空だった分をここで埋める
      if (selected.value) applyRecordedSale(selected.value.en, false);
    });
  }
  /** 記録の最安値を高貴建てに直す */
  function recordedExalted(key: SaleKey, en: string): { exalted: number; at: number } | null {
    const st = flow.value?.states?.[watchKey(en, key)];
    const amount = st?.cheapest_amount;
    if (st == null || amount == null || !(amount > 0)) return null;
    const r = rates.value;
    const cur = st.cheapest_currency ?? "exalted";
    const exalted =
      cur === "exalted" ? amount : cur === "divine" ? (r.divine > 0 ? amount * r.divine : null) : cur === "chaos" ? (r.chaos > 0 ? amount * r.chaos : null) : null;
    return exalted == null ? null : { exalted: Math.round(exalted * 100) / 100, at: st.sampled_at };
  }
  /** 記録の値を売値に入れる (overwrite = false なら空いている欄だけ) */
  function applyRecordedSale(en: string, overwrite: boolean): void {
    const next = { ...sale.value };
    const at = { ...saleRecordedAt.value };
    for (const row of SALE_ROWS) {
      if (!overwrite && next[row.key] != null) continue;
      const rec = recordedExalted(row.key, en);
      if (!rec) continue;
      next[row.key] = rec.exalted;
      at[row.key] = rec.at;
    }
    sale.value = next;
    saleRecordedAt.value = at;
  }

  function queryOptions(key: SaleKey): GemQueryOptions {
    // 5 ソケットは常に必須 (コラプト済みはソケットを足せないため)
    return rowQueryOptions(key, selected.value?.kind === "meta");
  }
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");
  function tradeUrl(key: SaleKey): string | null {
    if (!selected.value) return null;
    // 自動取得済みなら検索 ID 付き URL (サイト側で ?q= を解釈させなくて済む)
    const done = saleInfo.value[key]?.searchUrl;
    if (done) return done;
    return trade2QueryUrl(tradeLeague.value, buildGemQuery(selected.value.en, queryOptions(key)));
  }

  /** 選んだジェムの 3 状態を trade2 で取る (自動 / 再取得)。制限中は何もしない */
  let fetchSeq = 0;
  /**
   * 手動の「再取得」を捌き速度の記録に回す。
   *
   * 2026-09-17 以降は売値も巡回も同じ条件 (securable = 即時購入のみ) なので、
   * 手動で取った結果も自動巡回とまったく同じルールで判定できる
   * (消えた判定まで含む。オーナー指示「同じルールで手動でもやればいい」)。
   */
  async function recordRowSample(gemEn: string, key: SaleKey, r: PriceResult): Promise<void> {
    const gem = GEMS.find((g) => g.en === gemEn);
    await recordFlow({
      key: watchKey(gemEn, key),
      label: `${gem?.ja ?? gemEn} (${SALE_KEY_LABEL[key]})`,
      total: r.total,
      ids: r.allIds ?? r.listingIds ?? [],
      entries: r.listings.map((l) => ({
        id: l.id,
        amount: l.amount,
        currency: l.currency,
        account: l.account || null,
        listed_at: l.indexed ? Math.floor(Date.parse(l.indexed) / 1000) || null : null,
      })),
    });
  }

  async function fetchSalePrices(): Promise<void> {
    if (!selected.value || pricing.value || isRateLimited()) return;
    const gem = selected.value;
    const seq = ++fetchSeq;
    pricing.value = true;
    priceError.value = null;
    try {
      for (const row of SALE_ROWS) {
        const body = buildGemQuery(gem.en, queryOptions(row.key));
        const r = await autoPrice(tradeLeague.value, body, rates.value);
        if (seq !== fetchSeq) return; // 別のジェムに切り替わった
        if (!r) continue;
        saleInfo.value = { ...saleInfo.value, [row.key]: r };
        if (r.minExalted != null) {
          sale.value = { ...sale.value, [row.key]: Math.round(r.minExalted * 100) / 100 };
          saleRecordedAt.value = { ...saleRecordedAt.value, [row.key]: null };
        }
        // 3 条件 (レベル 21 / 品質 23% / 完成品) とも記録する。自動巡回と同じルール
        void recordRowSample(gem.en, row.key, r);
      }
      priceError.value = tradeAuto.lastError.value;
    } finally {
      if (seq === fetchSeq) pricing.value = false;
    }
  }
  // オーナー指示 (2026-09-12): ジェムを選んだら自動で取る。ソケット条件を変えた時も取り直す
  watch(selected, () => {
    if (selected.value) void fetchSalePrices();
  });

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
    materialApiIds,
    exchangeLoading,
    exchangeError,
    exchangeDone,
    fetchExchange,
    bestBuy,
    materials,
    uncutLabel,
    sale,
    saleInfo,
    saleRecordedAt,
    pricing,
    priceError,
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
