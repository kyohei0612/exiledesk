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
import type { PriceResult } from "../../services/trade2/pricing";
import { autoPrice, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import { bestRoute, DEFAULT_PARAMS, evaluateRoutes, vaalProbabilities, type CorruptParams, type MaterialPrices, type RouteResult, type SalePrices } from "./model";

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
  { key: "quality23", label: "品質 23% (レベル 20)", condition: "レベル 20 以下 · 品質 23% · コラプト済 · 2 重コラプトなし" },
  { key: "finished", label: "完成品 (21 · 23%)", condition: "レベル 21 · 品質 23% · コラプト済" },
];

/** poe2scout の ApiId。原石はスキル / スピリットで分かれる */
const MATERIAL_API = {
  gcp: "gcp",
  perfectJeweller: "perfect-jewellers-orb",
  vaal: "vaal",
  crystal: "crystallised-corruption",
  uncutSkill20: "uncut-skill-gem-20",
  uncutSpirit20: "uncut-spirit-gem-20",
} as const;

export function useGemCorrupt() {
  // ---- ジェム選択 ----
  const query = ref("");
  const selected = ref<GemInfo | null>(null);
  const matches = computed<GemInfo[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return [];
    const hit = GEMS.filter((g) => g.ja.toLowerCase().includes(q) || g.en.toLowerCase().includes(q));
    hit.sort((a, b) => {
      const as = a.ja.toLowerCase().startsWith(q) || a.en.toLowerCase().startsWith(q) ? 0 : 1;
      const bs = b.ja.toLowerCase().startsWith(q) || b.en.toLowerCase().startsWith(q) ? 0 : 1;
      return as - bs || a.ja.localeCompare(b.ja, "ja");
    });
    return hit.slice(0, 12);
  });
  function select(g: GemInfo): void {
    selected.value = g;
    query.value = g.ja;
    sale.value = { level21: null, quality23: null, finished: null };
    saleInfo.value = { level21: null, quality23: null, finished: null };
    priceError.value = null;
  }

  // ---- 相場 (poe2scout、アプリ共通の相場ストア。カレンシーランキングが取った物を流用) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  const loadMarket = (): Promise<void> => marketStore.ensureMarket();
  const rates = marketStore.rates;
  const priceOf = marketStore.priceOf;

  /** 低レベルジェム本体の値段 (高貴)。相場が無いので手入力、既定 1 */
  const baseGemPrice = ref<number>(1);
  const materials = computed<MaterialPrices>(() => ({
    baseGem: Number.isFinite(baseGemPrice.value) && baseGemPrice.value >= 0 ? baseGemPrice.value : null,
    gcp: priceOf(MATERIAL_API.gcp),
    perfectJeweller: priceOf(MATERIAL_API.perfectJeweller),
    vaal: priceOf(MATERIAL_API.vaal),
    crystal: priceOf(MATERIAL_API.crystal),
    uncut20: priceOf(selected.value?.spirit ? MATERIAL_API.uncutSpirit20 : MATERIAL_API.uncutSkill20),
  }));
  const uncutLabel = computed(() => (selected.value?.spirit ? "スピリットジェムの原石 (レベル 20)" : "スキルジェムの原石 (レベル 20)"));

  // ---- 売値 (手入力 or trade2) ----
  const sale = ref<SalePrices>({ level21: null, quality23: null, finished: null });
  const saleInfo = ref<Record<SaleKey, PriceResult | null>>({ level21: null, quality23: null, finished: null });
  const requireSockets = ref(true);
  const pricing = ref(false);
  const priceError = ref<string | null>(null);

  function queryOptions(key: SaleKey): GemQueryOptions {
    const category = selected.value?.kind === "meta" ? "gem.metagem" : "gem.activegem";
    const socketsMin = requireSockets.value ? 5 : undefined;
    const common = { category, corrupted: true, socketsMin } as const;
    switch (key) {
      // レベル 21 / 品質 23% はヴァールオーブ 1 回の産物なので 2 重コラプト品 (結晶を通した物) を除く
      // (オーナー指摘 2026-09-13: 含めると 2 重コラプト品の相場が混ざる)
      case "level21":
        return { ...common, levelMin: 21, qualityMin: 20, qualityMax: 20, twiceCorrupted: false };
      case "quality23":
        return { ...common, levelMax: 20, qualityMin: 23, twiceCorrupted: false };
      // 完成品 (21 · 23%) は結晶を通した 2 重コラプト品そのもの (JP 実測: 未 2 重で絞ると 0 件)
      case "finished":
        return { ...common, levelMin: 21, qualityMin: 23 };
    }
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
        if (r.minExalted != null) sale.value = { ...sale.value, [row.key]: Math.round(r.minExalted * 100) / 100 };
      }
      priceError.value = tradeAuto.lastError.value;
    } finally {
      if (seq === fetchSeq) pricing.value = false;
    }
  }
  // オーナー指示 (2026-09-12): ジェムを選んだら自動で取る。ソケット条件を変えた時も取り直す
  watch([selected, requireSockets], () => {
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
    baseGemPrice,
    materials,
    uncutLabel,
    sale,
    saleInfo,
    requireSockets,
    pricing,
    priceError,
    tradeAuto,
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
