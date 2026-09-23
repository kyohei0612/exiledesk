/**
 * useFractureChoice.ts — ベースの始め方を、初動の安い順に (2026-09-24)
 *
 * オーナー:「フラクチャー品かフラクチャー無し品かみたいなところは？」「だったら選ばせたら。初動安い順で表示して」
 * 「フラクチャー無し品とかも選択肢じゃなかったっけ。4 種類くらい」。
 * 選択肢 (初動 = 固定済みの MOD が付いた状態になるまでの平均):
 *   - 固定済みを買う / 固定無し・厳しいを 1 個ずつ / 固定無し・ゆるいを 1 個ずつ / 両方まぜて
 *     … 09-23 の樹 MOD の判定 ([[tree-decide.ts]]、useHtcCraft の `searchTree`) をそのまま使う。
 *       貼り付けで固定済みだった普通の MOD もそこに乗せた ([[tree-buy.ts]] の `fracturedBuys`)
 *   - 無し品から作る … 固定済みだった MOD を空のベースに付ける平均 ([[step-odds.ts]]、外れの消去込み)。固定されない
 *
 * **ベース選びまでは自動、足りない情報は手で埋める** (オーナー 2026-09-24):
 *   - 値段の分かっている中で一番安い物を自動で選ぶ。人が選び直したらそちらを優先
 *   - 取引所で見つからない時は、固定済みの値段を手で入れれば選べる
 * 取引所は押した時だけ (3 本、検索 10 秒間隔)。
 */
import { computed, ref, watch } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { startOption, zeroStart, type StartOption } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

export function useFractureChoice(c: ReturnType<typeof useHtcCraft>) {
  const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
  const ilvl = computed(() => c.item.value?.itemLevel ?? zeroStart.value.itemLevel);

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

  /** 手で入れた固定済みの値段 (神)。取引所で見つからない時に埋める */
  const manual = ref<number | null>(null);
  /** 人が選び直したか (選び直すまでは一番安い物を自動で選ぶ) */
  const picked = ref<string | null>(null);
  watch(() => c.treePlan.value, () => { manual.value = null; picked.value = null; });

  interface Row { id: string; start: StartOption; label: string; cost: number | null; note: string }
  /** 選択肢を初動の安い順に (値段がまだ無い物は後ろ) */
  const options = computed<Row[]>(() => {
    const div = c.prices.value?.currency.divine ?? 1;
    const rows: Row[] = [];
    if (c.fracturedTargets.value.length) {
      rows.push({ id: "plain", start: "plain", label: "無し品から作る", cost: craftCost.value, note: "固定されないので後で消えうる" });
    }
    const r = c.treeResult.value;
    for (const route of r?.routes ?? []) {
      const s = route.summary;
      rows.push({ id: route.key, start: "frac", label: route.label, cost: s.expected * div,
        note: route.key === "fractured" ? "" : `平均 ${s.avgItems.toFixed(1)} 個買う${route.need85 != null ? ` / 85% に ${route.need85} 個` : ""}` });
    }
    // 固定済みが見つからなかった (道に無い) 時は手で入れる欄
    if (!r?.routes.some((x) => x.key === "fractured")) {
      rows.push({ id: "manual", start: "frac", label: "固定済みを買う (手で入れた値段)", cost: manual.value != null && manual.value > 0 ? manual.value * div : null, note: "" });
    }
    return rows.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  });
  const chosen = computed(() => {
    const rows = options.value;
    return rows.find((x) => x.id === picked.value && x.cost != null) ?? rows.find((x) => x.cost != null) ?? null;
  });
  // 選ばれた物が 1 手ずつの出発点
  watch(chosen, (x) => { if (x) startOption.value = x.start; }, { immediate: true });
  const choose = (id: string): void => { picked.value = id; };

  return { options, chosen, choose, manual, search: c.searchTree, busy: c.treeBusy, error: c.treeError, searched: computed(() => !!c.treeResult.value) };
}
