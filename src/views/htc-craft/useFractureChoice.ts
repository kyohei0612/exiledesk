/**
 * useFractureChoice.ts — フラクチャー品から始めるか、無し品から作るか (2026-09-24)
 *
 * オーナー:「フラクチャー品かフラクチャー無し品かみたいなところは？」。ベース決めまでは自動、の続き。
 *   - フラクチャー品を買う: 狙いの MOD が固定済み (`fractured.`) で付いたベースの最安 (押した時だけ検索)
 *   - 無し品から作る: その MOD を空のベースに付ける平均 ([[step-odds.ts]] の一番安い打ち方、外れの消去込み)。
 *     固定されないので、後の消去・カオスで消えうる
 * 選んだ方が 1 手ずつの出発点になる ([[craft-settings.ts]] の `startFractured`)。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { tradeCategoryOf, tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { buildSpecQuery } from "../../services/trade2/query";
import { autoPrice, tradeAuto } from "../../services/trade2/auto-price";
import { marketStore } from "../../state/market-store";
import { startFractured, zeroStart } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

export function useFractureChoice(c: ReturnType<typeof useHtcCraft>) {
  const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
  const ilvl = computed(() => c.item.value?.itemLevel ?? zeroStart.value.itemLevel);

  /** 取引所の検索 (固定済みの MOD を `fractured.` で、コラプト無し・ユニーク以外・ilvl 以上) */
  const query = computed(() => {
    const d = c.data.value, cls = c.base.value;
    if (!d || !cls || !c.fracturedTargets.value.length) return null;
    const { filters, unmatched } = tradeFiltersFor(d, c.fracturedTargets.value);
    if (unmatched.length) return null;
    const category = tradeCategoryOf(cls);
    return buildSpecQuery({
      ...(baseType.value ? { baseType: baseType.value } : {}),
      ...(category ? { category } : {}),
      rarity: "nonunique",
      ilvlMin: ilvl.value,
      stats: filters.map((f) => ({ id: f.id.replace(/^explicit\./, "fractured."), min: f.min })),
    });
  });

  /** 無し品から、固定済みだった MOD を順に作る平均 (高貴換算) */
  const craftCost = computed(() => {
    const d = c.data.value, cls = c.base.value, p = c.prices.value;
    if (!d || !cls || !p || !c.fracturedTargets.value.length) return null;
    const h = stepHelpers({
      data: d, cls, prices: p, itemLevel: ilvl.value, limits: sideLimits(d, baseType.value),
      catalystOk: (tag) => c.catalystChoice.value[tag] ?? (p.currency[catalystPriceKey(tag)] ?? Infinity) / (p.currency.divine ?? 1) < 0.2,
    });
    let s: ItemState = { slots: [], breach: false };
    let sum = 0;
    for (const t of c.fracturedTargets.value) {
      const best = h.methodsFor(s, t.modId, t.minTierIndex ?? 0)[0];
      if (!best) return null;
      sum += best.avg;
      s = { ...s, slots: [...s.slots, { modId: t.modId, side: d.mods.get(t.modId)!.type as Side, fixed: false }] };
    }
    return sum;
  });

  const busy = ref(false);
  const error = ref<string | null>(null);
  const found = shallowRef<{ min: number | null; total: number; url: string | null } | null>(null);
  watch(query, () => { found.value = null; error.value = null; });

  async function search(): Promise<void> {
    if (busy.value || !query.value) return;
    busy.value = true;
    error.value = null;
    try {
      const r = await autoPrice(marketStore.league.value?.Value ?? "Standard", query.value, marketStore.rates.value, 5);
      if (!r) error.value = tradeAuto.lastError.value ?? "取れませんでした (間隔待ちの時は少し待って押し直し)";
      else found.value = { min: r.minExalted ?? null, total: r.total, url: r.searchUrl || null };
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  /** 安い方。買う方の値段が無ければ null */
  const cheaper = computed<"fractured" | "plain" | null>(() => {
    const m = found.value?.min, k = craftCost.value;
    if (m == null || k == null) return null;
    return m <= k ? "fractured" : "plain";
  });

  return { query, craftCost, busy, error, found, search, cheaper, startFractured };
}
