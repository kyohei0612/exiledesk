/**
 * クラフト収支: 上位プレイヤー基準の状態 (発見 V2 キャッシュ読込 / アセンダンシー選択 / 典型構成の相場)
 */
import { computed, ref, watch, type Ref } from "vue";
import { loadCraftV2Cache } from "../../services/craft-v2/cache";
import type { CraftV2Cache } from "../../services/craft-v2/types";
import { priceMinListing, retryAfterSeconds, type ExaltedRates, type PriceResult } from "../../services/trade2/pricing";
import { tradeCategoryOfClass } from "../../services/trade2/category";
import { jaAscendancy } from "../../i18n/ascendancies-ja";
import type { ParsedItem } from "./parse";
import { buildTopProfile, countItemsByAscendancy, diagnoseItem, targetMods, type TopProfile } from "./top-profile";

export interface AscendancyOption {
  classEn: string | null;
  label: string;
  count: number;
}

export function useTopProfile(item: Ref<ParsedItem | null>, league: Ref<string | null>, rates: Ref<ExaltedRates>) {
  const cache = ref<CraftV2Cache | null>(null);
  const cacheError = ref<string | null>(null);
  const selectedClass = ref<string | null>(null);
  const targetPrice = ref<PriceResult | null>(null);
  const targetMissing = ref<string[]>([]);
  const targetStatus = ref<"idle" | "loading" | "done" | "error">("idle");
  const targetError = ref<string | null>(null);

  async function loadCache(): Promise<void> {
    cache.value = await loadCraftV2Cache();
    cacheError.value = cache.value ? null : "発見 V2 のキャッシュがありません (先に「クラフト発見 V2」で上位データを取得してください)";
  }

  const options = computed<AscendancyOption[]>(() => {
    const c = cache.value;
    const cls = item.value?.itemClass;
    if (!c || !cls) return [];
    const per = countItemsByAscendancy(c, cls);
    const total = per.reduce((a, b) => a + b.count, 0);
    return [
      { classEn: null, label: `全アセンダンシー (${total})`, count: total },
      ...per.map((p) => ({ classEn: p.classEn, label: `${jaAscendancy(p.classEn)} (${p.count})`, count: p.count })),
    ];
  });

  // 装備種別が変わったら、その種別を一番多く使うアセンダンシーを既定にする
  watch(
    () => [item.value?.itemClass, cache.value] as const,
    () => {
      const best = options.value.find((o) => o.classEn !== null);
      selectedClass.value = best ? best.classEn : null;
      targetPrice.value = null;
      targetStatus.value = "idle";
    },
  );

  const profile = computed<TopProfile | null>(() => {
    const c = cache.value;
    const cls = item.value?.itemClass;
    if (!c || !cls) return null;
    const p = buildTopProfile(c, cls, selectedClass.value);
    return p.sampleItems > 0 ? p : null;
  });

  const diagnosis = computed(() => (profile.value && item.value ? diagnoseItem(profile.value, item.value) : null));
  const target = computed(() => (profile.value ? targetMods(profile.value) : null));

  /** 典型構成 (上位の主流 prefix 3 + suffix 3、最頻ティア下限) の最安を 1 回だけ検索する */
  async function priceTarget(): Promise<void> {
    const p = profile.value;
    const t = target.value;
    const it = item.value;
    if (!p || !t || !it || !league.value || t.filters.length === 0) return;
    targetMissing.value = t.missing;
    targetStatus.value = "loading";
    targetError.value = null;
    try {
      targetPrice.value = await priceMinListing(
        { league: league.value, baseTypeEn: null, category: tradeCategoryOfClass(p.itemClass), rarity: "rare", stats: t.filters },
        rates.value,
      );
      targetStatus.value = "done";
    } catch (e) {
      targetStatus.value = "error";
      const wait = retryAfterSeconds(e);
      targetError.value = wait != null ? `trade2 のレート制限 (${wait} 秒後に再試行できます)` : e instanceof Error ? e.message : String(e);
    }
  }

  return { cache, cacheError, loadCache, options, selectedClass, profile, diagnosis, target, targetPrice, targetMissing, targetStatus, targetError, priceTarget };
}
