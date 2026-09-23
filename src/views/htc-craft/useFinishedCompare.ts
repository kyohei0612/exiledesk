/**
 * useFinishedCompare.ts — 完成品を買うのと、作るのと (2026-09-24)
 *
 * オーナー:「あとは完成品か。比較対象ないよね今」。09-22 の「作るのと買うの、どっちが安いか」([[buy-or-craft.ts]]) を
 * 診断カードに戻した (1 手ずつの一覧カードを外した時に一緒に消えていた)。
 *   - 完成品を買う … 同じ MOD 構成の最安。狙いは素の段の下限、固定済み (樹 MOD・貼り付けで固定済み) は `fractured.` で。
 *     コラプト無し・ユニーク以外・ilvl 以上。MOD 解析の時に 1 本。取引所に無ければ手で値段を入れる
 *     (貼り付けの画面の「完成品の売値」欄は外した。オーナー 2026-09-24:「ここいらんくね」)
 *   - 作る見込み   … 始め方の初動 + スパムの組み立て (自動) の平均。**あくまで目安** (1 手ずつは人が選ぶ)。
 *     自動の組み立てが組めない時 (品質 40% の順番が決まらない半影の指輪など) は、狙いを 1 つずつ付ける平均
 *     ([[step-odds.ts]] の一番安い打ち方、外れの消去込み) の合計で出す。付けた物が消える分は入らないので安めに出る
 */
import { computed, ref, shallowRef, watch } from "vue";
import { tradeCategoryOf, tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { buildSpecQuery } from "../../services/trade2/query";
import { autoPriceWait, tradeAuto } from "../../services/trade2/auto-price";
import { marketStore } from "../../state/market-store";
import { zeroStart } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

export function useFinishedCompare(
  c: ReturnType<typeof useHtcCraft>,
  /** 始め方で選ばれた物の初動 (高貴換算)。無ければ null */
  startCost: { readonly value: number | null },
) {
  const query = computed(() => {
    const d = c.data.value, cls = c.base.value;
    if (!d || !cls) return null;
    const fixed = new Set(c.fracturedTargets.value.map((t) => t.modId));
    const { filters, unmatched } = tradeFiltersFor(d, c.targets.value.filter((t) => !fixed.has(t.modId)));
    if (unmatched.length) return null;
    const baseType = c.item.value?.baseType ?? zeroStart.value.baseType;
    const category = tradeCategoryOf(cls);
    if (!baseType && !category) return null;
    return buildSpecQuery({
      ...(baseType ? { baseType } : {}),
      ...(category ? { category } : {}),
      rarity: "nonunique",
      ilvlMin: c.item.value?.itemLevel ?? zeroStart.value.itemLevel,
      stats: [
        ...filters.map((f) => ({ id: f.id, min: f.min })),
        // 固定済みの MOD (樹 MOD・貼り付けで固定済みだった MOD) は固定済みで ([[tree-buy.ts]] と同じ条件)
        ...(c.treePlan.value?.buys ?? []).flatMap((b) => b.filters).map((f) => ({ id: f.id, min: f.min ?? 0 })),
      ],
    });
  });

  const found = shallowRef<{ min: number | null; total: number; url: string | null } | null>(null);
  /** 取引所に無い時に手で入れた完成品の値段 (神) */
  const manual = ref<number | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  watch(query, () => { found.value = null; error.value = null; manual.value = null; });

  async function search(): Promise<void> {
    if (busy.value || !query.value) return;
    busy.value = true;
    error.value = null;
    try {
      const r = await autoPriceWait(marketStore.league.value?.Value ?? "Standard", query.value, marketStore.rates.value, 5);
      if (!r) error.value = tradeAuto.lastError.value ?? "取れませんでした (間隔待ちの時は少し待って押し直し)";
      else found.value = { min: r.minExalted ?? null, total: r.total, url: r.searchUrl || null };
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  /** 完成品の値段 (高貴換算)。取引所の最安、無ければ手で入れた値段 */
  const buyCost = computed(() => {
    const div = c.prices.value?.currency.divine ?? 1;
    return found.value?.min ?? (manual.value != null && manual.value > 0 ? manual.value * div : null);
  });
  /** 狙いを 1 つずつ付ける平均の合計 (自動の組み立てが組めない時の目安) */
  const sumOfSteps = computed(() => {
    const d = c.data.value, cls = c.base.value, p = c.prices.value;
    if (!d || !cls || !p) return null;
    const baseType = c.item.value?.baseType ?? zeroStart.value.baseType;
    const h = stepHelpers({
      data: d, cls, prices: p, itemLevel: c.item.value?.itemLevel ?? zeroStart.value.itemLevel, limits: sideLimits(d, baseType),
      catalystOk: (tag) => c.catalystChoice.value[tag] ?? (p.currency[catalystPriceKey(tag)] ?? Infinity) / (p.currency.divine ?? 1) < 0.2,
    });
    const fixed = new Set(c.fracturedTargets.value.map((t) => t.modId));
    let s: ItemState = { breach: false, slots: c.fracturedTargets.value.map((t) => ({ modId: t.modId, side: d.mods.get(t.modId)!.type as Side, fixed: true })) };
    let sum = 0;
    for (const t of c.targets.value.filter((x) => !fixed.has(x.modId))) {
      const best = h.methodsFor(s, t.modId, t.minTierIndex ?? 0)[0];
      if (!best) return null;
      sum += best.avg;
      s = { ...s, slots: [...s.slots, { modId: t.modId, side: d.mods.get(t.modId)!.type as Side, fixed: false }] };
    }
    return sum;
  });
  /** 作る見込み = 初動 + スパムの組み立ての平均 (組めなければ 1 つずつの合計) */
  const craftCost = computed(() => {
    const t = c.spam.value?.total?.expected ?? sumOfSteps.value;
    return t != null ? (startCost.value ?? 0) + t : null;
  });
  const craftBasis = computed(() => (c.spam.value?.total ? "自動の組み立ての平均" : "狙いを 1 つずつ付ける平均の合計 (付けた物が消える分は入らない)"));
  const verdict = computed(() => {
    const b = buyCost.value, k = craftCost.value;
    return b != null && k != null ? { buy: b <= k, diff: Math.abs(b - k) } : null;
  });

  return { query, found, manual, busy, error, search, buyCost, craftCost, craftBasis, verdict };
}
