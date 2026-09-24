/**
 * craft-estimate.ts — 狙いを 1 つずつ付ける平均の合計 (作る見込みの目安) (2026-09-24)
 *
 * useFinishedCompare の「作る見込み」と、始め方の候補の比べ ([[useStartSearch.ts]]) で同じ物差しを使うため分けた。
 * 固定済みにする MOD (fixedIds) は付いている前提で数えない。[[step-odds.ts]] の一番安い打ち方 (外れの消去込み) の合計。
 * 付けた物が消える分は入らないので安めに出る。
 */
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { zeroStart } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

/** 高貴換算の合計。組めなければ null */
export function stepsEstimate(c: ReturnType<typeof useHtcCraft>, fixedIds: readonly string[]): number | null {
  const d = c.data.value, cls = c.base.value, p = c.prices.value;
  if (!d || !cls || !p) return null;
  const baseType = c.item.value?.baseType ?? zeroStart.value.baseType;
  const h = stepHelpers({
    data: d, cls, prices: p, itemLevel: c.item.value?.itemLevel ?? zeroStart.value.itemLevel, limits: sideLimits(d, baseType),
    catalystOk: (tag) => c.catalystChoice.value[tag] ?? (p.currency[catalystPriceKey(tag)] ?? Infinity) / (p.currency.divine ?? 1) < 0.2,
  });
  const fixed = new Set(fixedIds);
  const sideOf = (id: string): Side => d.mods.get(id)!.type as Side;
  let s: ItemState = { breach: false, slots: [...fixed].map((id) => ({ modId: id, side: sideOf(id), fixed: true })) };
  let sum = 0;
  for (const t of c.targets.value.filter((x) => !fixed.has(x.modId))) {
    const best = h.methodsFor(s, t.modId, t.minTierIndex ?? 0)[0];
    if (!best) return null;
    sum += best.avg;
    s = { ...s, slots: [...s.slots, { modId: t.modId, side: sideOf(t.modId), fixed: false }] };
  }
  return sum;
}
