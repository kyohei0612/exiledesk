/**
 * useFractureChoice.ts — ベースの始め方 (フラクチャー品を買うか、無し品から作るか) (2026-09-24)
 *
 * オーナー:「フラクチャー品かフラクチャー無し品かみたいなところは？」「だったら選ばせたら。初動安い順で表示して」。
 * 選択肢 (初動 = 始めるまでにかかる額):
 *   - 無し品から作る      … 固定済みだった MOD を空のベースに付ける平均 ([[step-odds.ts]]、外れの消去込み)。固定されない
 *   - フラクチャー品 (他の MOD 無し)       … 取引所の最安。プレ / サフィの MOD の数を固定済みの数まで
 *   - フラクチャー品 (他の MOD 各側 1 つまで) … 同じく各側 +1 まで。外れが付いている前提で始める (各側 1 つ)
 * 「他の MOD 指定なし」は何が付いているか分からず出発点にできないので出さない。
 * 取引所は押した時だけ (2 本、検索 10 秒間隔)。選んだ物が 1 手ずつの出発点 ([[craft-settings.ts]] の `startOption`)。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { tradeCategoryOf, tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { STRICT_PREFIX, STRICT_SUFFIX } from "../../services/htc/tree-buy";
import { buildSpecQuery } from "../../services/trade2/query";
import { autoPrice, tradeAuto } from "../../services/trade2/auto-price";
import { marketStore } from "../../state/market-store";
import { startOption, zeroStart, type StartOption } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

type Found = { min: number | null; total: number; url: string | null };

export function useFractureChoice(c: ReturnType<typeof useHtcCraft>) {
  const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
  const ilvl = computed(() => c.item.value?.itemLevel ?? zeroStart.value.itemLevel);
  /** 固定済みの MOD が使っている枠 (側ごと) */
  const fixedCount = computed(() => {
    const d = c.data.value;
    const sides = c.fracturedTargets.value.map((t) => d?.mods.get(t.modId)?.type);
    return { prefix: sides.filter((x) => x === "prefix").length, suffix: sides.filter((x) => x === "suffix").length };
  });

  /** 取引所の検索 (固定済みの MOD を `fractured.`、他の MOD の数は側ごとに固定済み + extra まで) */
  const queryFor = (extra: number) => {
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
      stats: [
        ...filters.map((f) => ({ id: f.id.replace(/^explicit\./, "fractured."), min: f.min })),
        { id: STRICT_PREFIX, max: fixedCount.value.prefix + extra },
        { id: STRICT_SUFFIX, max: fixedCount.value.suffix + extra },
      ],
    });
  };
  const queries = computed(() => ({ frac0: queryFor(0), frac1: queryFor(1) }));

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
  const found = shallowRef<Partial<Record<"frac0" | "frac1", Found>>>({});
  watch(queries, () => { found.value = {}; error.value = null; });

  /** 2 本を順に (門番が 10 秒間隔にそろえる) */
  async function search(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    error.value = null;
    try {
      for (const key of ["frac0", "frac1"] as const) {
        const q = queries.value[key];
        if (!q) continue;
        const r = await autoPrice(marketStore.league.value?.Value ?? "Standard", q, marketStore.rates.value, 5);
        if (!r) { error.value = tradeAuto.lastError.value ?? "取れませんでした (間隔待ちの時は少し待って押し直し)"; break; }
        found.value = { ...found.value, [key]: { min: r.minExalted ?? null, total: r.total, url: r.searchUrl || null } };
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  /** 選択肢を初動の安い順に (値段がまだ無い物は後ろ) */
  const options = computed(() => {
    const rows: Array<{ key: StartOption; label: string; cost: number | null; found?: Found; note: string }> = [
      { key: "plain", label: "無し品から作る", cost: craftCost.value, note: "固定されないので後で消えうる" },
    ];
    if (queries.value.frac0) {
      rows.push({ key: "frac0", label: "フラクチャー品 (他の MOD 無し)", cost: found.value.frac0?.min ?? null,
        ...(found.value.frac0 ? { found: found.value.frac0 } : {}), note: "" });
    }
    if (queries.value.frac1) {
      rows.push({ key: "frac1", label: "フラクチャー品 (他の MOD 各側 1 つまで)", cost: found.value.frac1?.min ?? null,
        ...(found.value.frac1 ? { found: found.value.frac1 } : {}), note: "外れが各側 1 つ付いている前提で始める" });
    }
    return rows.sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity));
  });

  return { options, busy, error, search, startOption, searched: computed(() => Object.keys(found.value).length > 0) };
}
