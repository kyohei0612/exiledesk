/**
 * 品質超過の賭け — 状態 / 相場 (2026-09-12)
 *
 *   プリセット: アドニアのエゴ (吸収のワンド → 秘術師の彫刻針 → ヴァールアルカニストのインフューザー → 可能性のお告げ + 可能性のオーブ)
 *               防具 / マーシャル武器 (端材 / 砥石 + 対応するヴァールインフューザー)
 *   素材価格:   poe2scout。売値の初期値は poe2scout のユニーク価格 (品質を問わない値なので目安)
 *   期待値:     overquality/model.ts
 */
import { computed, ref, watch } from "vue";
import { fetchItems, fetchLeagues, type CurrencyItem, type League } from "../../api/poe2scout";
import { DEFAULT_OVERQUALITY_PARAMS, evaluateOverquality, type OverqualityInputs, type OverqualityParams } from "./model";

export interface Preset {
  id: string;
  label: string;
  /** ベース (日本語表示用) */
  baseJa: string;
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
    uniqueJa: "アドニアのエゴ",
    uniqueEn: "Adonia's Ego",
    qualityCurrencyJa: "秘術師の彫刻針",
    qualityCurrencyApiId: "etcher",
    infuserJa: "ヴァールアルカニストのインフューザー",
    infuserApiId: "vaal-arcanists-infuser",
  },
  {
    id: "caster",
    label: "その他のワンド / スタッフ / セプター",
    baseJa: "ベース (キャスター武器)",
    uniqueJa: "目標ユニーク",
    uniqueEn: null,
    qualityCurrencyJa: "秘術師の彫刻針",
    qualityCurrencyApiId: "etcher",
    infuserJa: "ヴァールアルカニストのインフューザー",
    infuserApiId: "vaal-arcanists-infuser",
  },
  {
    id: "martial",
    label: "マーシャル武器",
    baseJa: "ベース (マーシャル武器)",
    uniqueJa: "目標ユニーク",
    uniqueEn: null,
    qualityCurrencyJa: "鍛冶屋の砥石",
    qualityCurrencyApiId: "whetstone",
    infuserJa: "ヴァール鍛冶屋のインフューザー",
    infuserApiId: "vaal-blacksmiths-infuser",
  },
  {
    id: "armour",
    label: "防具",
    baseJa: "ベース (防具)",
    uniqueJa: "目標ユニーク",
    uniqueEn: null,
    qualityCurrencyJa: "鎧鍛冶の端材",
    qualityCurrencyApiId: "scrap",
    infuserJa: "ヴァール鎧鍛冶のインフューザー",
    infuserApiId: "vaal-armourers-infuser",
  },
];

export function useOverquality() {
  const presetId = ref<string>("adonia");
  const preset = computed<Preset>(() => PRESETS.find((p) => p.id === presetId.value) ?? PRESETS[0]);

  // ---- 相場 (poe2scout) ----
  const league = ref<League | null>(null);
  const marketItems = ref<CurrencyItem[]>([]);
  const marketError = ref<string | null>(null);
  async function loadMarket(): Promise<void> {
    try {
      const leagues = await fetchLeagues();
      league.value = leagues.find((l) => l.IsCurrent && !l.Value.startsWith("HC")) ?? leagues[0] ?? null;
      if (league.value) marketItems.value = await fetchItems(league.value.Value);
      marketError.value = null;
      applyMarketDefaults();
    } catch (e) {
      marketError.value = e instanceof Error ? e.message : String(e);
    }
  }
  const priceOf = (apiId: string): number | null => {
    const hit = marketItems.value.find((it) => it.ApiId === apiId);
    return hit && typeof hit.CurrentPrice === "number" && hit.CurrentPrice > 0 ? hit.CurrentPrice : null;
  };
  const uniquePriceOf = (nameEn: string | null): number | null => {
    if (!nameEn) return null;
    const hit = marketItems.value.find((it) => !it.ApiId && it.Text.startsWith(nameEn));
    return hit && typeof hit.CurrentPrice === "number" && hit.CurrentPrice > 0 ? hit.CurrentPrice : null;
  };
  const divineRate = computed(() => league.value?.DivinePrice || 1);

  // ---- 入力 ----
  const targetQuality = ref(30);
  const basePrice = ref<number | null>(1);
  const qualityCurrencyCount = ref(4);
  const salePrice = ref<number | null>(null);
  /** 自動価格の上書き (null = poe2scout の値を使う) */
  const overrides = ref<{ qualityCurrency: number | null; infuser: number | null; omen: number | null; chance: number | null }>({
    qualityCurrency: null,
    infuser: null,
    omen: null,
    chance: null,
  });
  function applyMarketDefaults(): void {
    if (salePrice.value == null) salePrice.value = uniquePriceOf(preset.value.uniqueEn);
  }
  watch(presetId, () => {
    salePrice.value = uniquePriceOf(preset.value.uniqueEn);
  });

  const auto = computed(() => ({
    qualityCurrency: priceOf(preset.value.qualityCurrencyApiId),
    infuser: priceOf(preset.value.infuserApiId),
    omen: priceOf("omen-of-chance"),
    chance: priceOf("chance"),
    uniqueRef: uniquePriceOf(preset.value.uniqueEn),
  }));
  const inputs = computed<OverqualityInputs>(() => ({
    targetQuality: targetQuality.value,
    basePrice: basePrice.value != null && Number.isFinite(basePrice.value) ? basePrice.value : null,
    qualityCurrencyPrice: overrides.value.qualityCurrency ?? auto.value.qualityCurrency,
    qualityCurrencyCount: qualityCurrencyCount.value,
    infuserPrice: overrides.value.infuser ?? auto.value.infuser,
    omenPrice: overrides.value.omen ?? auto.value.omen,
    chancePrice: overrides.value.chance ?? auto.value.chance,
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
    loadMarket,
    divineRate,
    targetQuality,
    basePrice,
    qualityCurrencyCount,
    salePrice,
    overrides,
    auto,
    inputs,
    params,
    resetParams,
    result,
  };
}
