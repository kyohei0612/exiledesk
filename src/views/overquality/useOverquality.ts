/**
 * アドニアの賭け — 状態 / 相場 (2026-09-12)
 *
 *   アドニア専用 (オーナー指示 2026-09-12): 吸収のワンド → 秘術師の彫刻針 → ヴァールアルカニストのインフューザー → 可能性のお告げ + 可能性のオーブ
 *   素材価格:   poe2scout。売値の初期値は poe2scout のユニーク価格 (品質を問わない値なので目安)
 *   期待値:     overquality/model.ts
 */
import { computed, ref, watch } from "vue";
import { marketStore } from "../../state/market-store";
import { buildBaseTypeQuery, buildUniqueQualityQuery } from "../../services/trade2/query";
import { trade2QueryUrl } from "../../services/trade2/league";
import { autoMinWithUrl, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import itemsJaClient from "../../i18n/items-ja-client.json";
import itemsJa from "../../i18n/items-ja.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";

/** 日本語 / 英語どちらで入れても英名に寄せる (辞書は EN → JA なので逆引き表を作る) */
function reverseMap(...dicts: Record<string, string>[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of dicts) for (const [en, ja] of Object.entries(d)) m.set(ja, en);
  return m;
}
const BASE_JA_TO_EN = reverseMap(itemsJa as Record<string, string>, itemsJaClient as Record<string, string>);
const UNIQUE_JA_TO_EN = reverseMap(uniqueNamesJa as Record<string, string>);
export function resolveBaseEn(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if ((itemsJaClient as Record<string, string>)[t] || (itemsJa as Record<string, string>)[t]) return t;
  return BASE_JA_TO_EN.get(t) ?? null;
}
export function resolveUniqueEn(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  if ((uniqueNamesJa as Record<string, string>)[t]) return t;
  return UNIQUE_JA_TO_EN.get(t) ?? null;
}
import { DEFAULT_OVERQUALITY_PARAMS, evaluateOverquality, type OverqualityInputs, type OverqualityParams } from "./model";

export interface Preset {
  id: string;
  label: string;
  /** ベース (日本語表示用)。固定プリセットは英名も持つ */
  baseJa: string;
  baseEn: string | null;
  /** 目標ユニーク (poe2scout の Text 先頭一致で売値の初期値を引く) */
  uniqueJa: string;
  uniqueEn: string | null;
  qualityCurrencyJa: string;
  qualityCurrencyApiId: string;
  infuserJa: string;
  infuserApiId: string;
}

export const PRESETS: readonly Preset[] = [
  {
    id: "adonia",
    label: "アドニアのエゴ (吸収のワンド)",
    baseJa: "吸収のワンド",
    baseEn: "Siphoning Wand",
    uniqueJa: "アドニアのエゴ",
    uniqueEn: "Adonia's Ego",
    qualityCurrencyJa: "秘術師の彫刻針",
    qualityCurrencyApiId: "etcher",
    infuserJa: "ヴァールアルカニストのインフューザー",
    infuserApiId: "vaal-arcanists-infuser",
  },
];

/** 材料のワンドの条件: ノーマル・未コラプト・ルーンソケット 2 (オーナー指示 2026-09-12) */
const BASE_RUNE_SOCKETS = 2;

/**
 * 固定の前提 (オーナー指示 2026-09-13「入力は全て自動でいい」→ 手入力欄と poeindex 固定値モードは撤去):
 *   目標品質 30% (完成品の検索条件と同じ) / 彫刻針は 1 本 +1% なので 0 → 20% に 20 本 (オーナー実測)。
 *   インフューザーとお告げの値段は取引所の実売 (カレンシーランキング) のみ。
 */
export const TARGET_QUALITY = 30;
export const ETCHER_COUNT = 20;

export function useOverquality() {
  const presetId = ref<string>("adonia");
  const preset = computed<Preset>(() => PRESETS.find((p) => p.id === presetId.value) ?? PRESETS[0]);

  // ---- 相場 (アプリ共通の相場ストア) ----
  const league = marketStore.league;
  const marketError = marketStore.error;
  const marketLabel = marketStore.fetchedLabel;
  async function loadMarket(): Promise<void> {
    await marketStore.ensureMarket();
    applyMarketDefaults();
    void fetchPrices();
  }
  const priceOf = marketStore.priceOf;
  const uniquePriceOf = marketStore.uniquePriceOf;
  const divineRate = computed(() => league.value?.DivinePrice || 1);

  // ---- 前提 (固定) ----
  const targetQuality = computed(() => TARGET_QUALITY);
  /** 汎用プリセット用: ベース / ユニークの名前 (日本語でも英語でも可)。固定プリセットでは preset の値 */
  const baseInput = ref("");
  const uniqueInput = ref("");
  const baseEn = computed<string | null>(() => preset.value.baseEn ?? resolveBaseEn(baseInput.value));
  const uniqueEn = computed<string | null>(() => preset.value.uniqueEn ?? resolveUniqueEn(uniqueInput.value));
  /**
   * trade2 から取った値 (自動)。オーナー指示 (2026-09-12): 取得する物に手入力の上書きは付けない
   * (手で直したくなる = 取得先がおかしい、なので取得側を直す)。
   */
  const autoBasePrice = ref<number | null>(null);
  const autoSalePrice = ref<number | null>(null);
  const basePrice = computed<number | null>(() => autoBasePrice.value);
  const salePrice = computed<number | null>(() => autoSalePrice.value ?? uniquePriceOf(uniqueEn.value));
  const qualityCurrencyCount = computed(() => ETCHER_COUNT);
  const pricing = ref(false);
  function applyMarketDefaults(): void {
    /* 売値は salePrice の computed で poe2scout のユニーク相場に落ちる */
  }
  const tradeLeague = computed(() => league.value?.Value ?? "Standard");
  const baseSearchUrl = ref<string | null>(null);
  const saleSearchUrl = ref<string | null>(null);
  const baseTradeUrl = computed(() =>
    baseSearchUrl.value ?? (baseEn.value ? trade2QueryUrl(tradeLeague.value, buildBaseTypeQuery(baseEn.value, "normal", BASE_RUNE_SOCKETS)) : null),
  );
  const saleTradeUrl = computed(
    () =>
      saleSearchUrl.value ??
      (uniqueEn.value ? trade2QueryUrl(tradeLeague.value, buildUniqueQualityQuery(uniqueEn.value, targetQuality.value, BASE_RUNE_SOCKETS)) : null),
  );
  let fetchSeq = 0;
  /** 素のベース (ノーマル・未コラプト) と 目標品質以上のユニーク を trade2 で取る */
  async function fetchPrices(): Promise<void> {
    if (pricing.value || isRateLimited()) return;
    const seq = ++fetchSeq;
    pricing.value = true;
    try {
      if (baseEn.value) {
        const { min: v, url } = await autoMinWithUrl(tradeLeague.value, buildBaseTypeQuery(baseEn.value, "normal", BASE_RUNE_SOCKETS), marketStore.rates.value);
        if (seq !== fetchSeq) return;
        if (v != null) autoBasePrice.value = v;
        if (url) baseSearchUrl.value = url;
      }
      if (uniqueEn.value) {
        const { min: v, url } = await autoMinWithUrl(tradeLeague.value, buildUniqueQualityQuery(uniqueEn.value, targetQuality.value, BASE_RUNE_SOCKETS), marketStore.rates.value);
        if (seq !== fetchSeq) return;
        if (v != null) autoSalePrice.value = v;
        if (url) saleSearchUrl.value = url;
      }
    } finally {
      if (seq === fetchSeq) pricing.value = false;
    }
  }
  // 名前 / 目標品質 / プリセットが変わったら取り直す (相場が来てから)
  let debounce: ReturnType<typeof setTimeout> | null = null;
  watch([baseEn, uniqueEn, targetQuality, () => league.value?.Value], () => {
    autoBasePrice.value = null;
    autoSalePrice.value = null;
    baseSearchUrl.value = null;
    saleSearchUrl.value = null;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void fetchPrices(), 400);
  });

  /** 取引所の実売 (高貴、カレンシーランキングの相場) */
  const auto = computed(() => ({
    qualityCurrency: priceOf(preset.value.qualityCurrencyApiId),
    infuser: priceOf(preset.value.infuserApiId),
    omen: priceOf("omen-of-chance"),
    chance: priceOf("chance"),
    uniqueRef: uniquePriceOf(uniqueEn.value),
  }));
  const inputs = computed<OverqualityInputs>(() => ({
    targetQuality: targetQuality.value,
    basePrice: basePrice.value != null && Number.isFinite(basePrice.value) ? basePrice.value : null,
    qualityCurrencyPrice: auto.value.qualityCurrency,
    qualityCurrencyCount: qualityCurrencyCount.value,
    infuserPrice: auto.value.infuser,
    omenPrice: auto.value.omen,
    chancePrice: auto.value.chance,
    salePrice: salePrice.value != null && Number.isFinite(salePrice.value) ? salePrice.value : null,
  }));

  const params = ref<OverqualityParams>({ ...DEFAULT_OVERQUALITY_PARAMS });
  function resetParams(): void {
    params.value = { ...DEFAULT_OVERQUALITY_PARAMS };
  }
  const result = computed(() => evaluateOverquality(inputs.value, params.value));

  return {
    presetId,
    preset,
    league,
    marketError,
    marketLabel,
    loadMarket,
    divineRate,
    targetQuality,
    baseInput,
    uniqueInput,
    baseEn,
    uniqueEn,
    autoBasePrice,
    autoSalePrice,
    basePrice,
    salePrice,
    qualityCurrencyCount,
    pricing,
    fetchPrices,
    baseTradeUrl,
    saleTradeUrl,
    tradeAuto,
    auto,
    inputs,
    params,
    resetParams,
    result,
  };
}
