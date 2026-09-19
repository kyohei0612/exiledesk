/**
 * prices.ts — 規格外の賭けの「相場を取る」ところ (trade2)
 *
 * ベース (マジック) / 当たりの段ごと / 外れ の 3 種類を、条件からクエリを組んで最安で取る。
 * 取った値はクエリ単位で共有するので、画面を開き直しても取り直さない。
 * **条件を変えただけでは叩かない** (オーナー指示 2026-09-16、レート制限対策)。取れていない
 * 種類の数だけ数えて取得ボタンに出す。
 *
 * 2026-09-19 に useRareCraft.ts (551 行) から切り出した。中身は変えていない。
 */
import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from "vue";
import { autoMinWithUrl, isRateLimited, tradeAuto } from "../../services/trade2/auto-price";
import { trade2QueryUrl } from "../../services/trade2/league";
import { buildSpecQuery } from "../../services/trade2/query";
import { marketStore } from "../../state/market-store";
import type { Metric } from "./sim";
import type { BucketDef, RecipeDef } from "./recipes";
import type { League } from "../../api/poe2scout";

export type Kind = "base" | "floor" | `b:${string}`;

export interface Fetched {
  price: number | null;
  url: string | null;
}

/** trade2 で取った相場 (クエリごと、画面をまたいで共有 = 開き直しで取り直さない) */
const FETCHED = ref<Record<string, Fetched>>({});

/** 条件 → trade2 の stat フィルタ */
export const METRIC_TRADE: Record<Metric, string | null> = {
  es: null,
  life: "pseudo.pseudo_total_life",
  res: "pseudo.pseudo_total_elemental_resistance",
  chaos: "pseudo.pseudo_total_chaos_resistance",
  ms: "pseudo.pseudo_increased_movement_speed",
};

export function useRarePrices(o: {
  recipe: ComputedRef<RecipeDef>;
  page: ComputedRef<{ defence: { esMin?: number; arMin?: number; evMin?: number } }>;
  sockets: ComputedRef<number>;
  ilvl: Ref<number>;
  currentTier: ComputedRef<{ min: number } | null>;
  floorConds: Ref<Partial<Record<Metric, number>>>;
  buckets: Ref<BucketDef[]>;
  tradeLeague: ComputedRef<string>;
  league: Ref<League | null>;
}) {
  const { recipe, page, sockets, ilvl, currentTier, floorConds, buckets, tradeLeague, league } = o;

  function condsToSpec(conds: Partial<Record<Metric, number>>): { esMin?: number; stats: { id: string; min: number }[] } {
    const stats: { id: string; min: number }[] = [];
    for (const k of Object.keys(conds) as Metric[]) {
      const v = conds[k];
      const id = METRIC_TRADE[k];
      if (v != null && id) stats.push({ id, min: v });
    }
    return { esMin: conds.es, stats };
  }
  const kinds = computed<Kind[]>(() => ["base", ...buckets.value.map((b): Kind => `b:${b.key}`), "floor"]);
  function queryFor(kind: Kind): ReturnType<typeof buildSpecQuery> {
    const r = recipe.value;
    const d = page.value.defence;
    const common = { category: r.category, socketsMin: sockets.value, arMin: d.arMin, evMin: d.evMin };
    if (kind === "base") {
      const t = currentTier.value;
      return buildSpecQuery({ ...common, rarity: "magic", ilvlMin: ilvl.value, esMin: d.esMin, stats: t ? [{ id: r.baseMod.tradeStat, min: t.min }] : [] });
    }
    const conds = kind === "floor" ? floorConds.value : (buckets.value.find((b) => `b:${b.key}` === kind)?.conds ?? {});
    const spec = condsToSpec(conds);
    return buildSpecQuery({ ...common, rarity: "nonunique", esMin: spec.esMin ?? d.esMin, stats: spec.stats });
  }
  const cacheKey = (kind: Kind): string => `${tradeLeague.value}|${JSON.stringify(queryFor(kind))}`;
  function get(kind: Kind): Fetched | null {
    return FETCHED.value[cacheKey(kind)] ?? null;
  }
  function tradeUrl(kind: Kind): string | null {
    return get(kind)?.url ?? trade2QueryUrl(tradeLeague.value, queryFor(kind));
  }
  const pricing = ref(false);
  const priceError = ref<string | null>(null);
  const remaining = ref(0);
  let fetchSeq = 0;
  let dirty = false;
  async function fetchPrices(force = false): Promise<void> {
    if (league.value == null) return;
    if (pricing.value) {
      dirty = true;
      return;
    }
    if (isRateLimited()) return;
    const seq = ++fetchSeq;
    pricing.value = true;
    priceError.value = null;
    const done = new Set<string>();
    try {
      for (;;) {
        const todo = kinds.value.filter((k) => (force ? !done.has(cacheKey(k)) : !get(k)));
        remaining.value = todo.length;
        const kind = todo[0];
        if (!kind) break;
        const key = cacheKey(kind);
        const { min, url } = await autoMinWithUrl(tradeLeague.value, queryFor(kind), marketStore.rates.value);
        if (seq !== fetchSeq) return;
        done.add(key);
        if (min == null && url == null) {
          priceError.value = tradeAuto.lastError.value;
          break;
        }
        FETCHED.value = { ...FETCHED.value, [key]: { price: min, url } };
      }
    } finally {
      if (seq === fetchSeq) {
        pricing.value = false;
        remaining.value = 0;
        if (dirty) {
          dirty = false;
          void fetchPrices();
        }
      }
    }
  }
  // 2026-09-16 オーナー指示: 条件を変えただけで trade2 を叩かない (レート制限対策)。
  // 取れていない種類の数だけ数えて、取得ボタンに出す
  const missingCount = computed(() => kinds.value.filter((k) => !get(k)).length);
  onScopeDispose(() => {
    fetchSeq++;
  });

  return { kinds, queryFor, get, tradeUrl, pricing, priceError, remaining, fetchPrices, missingCount };
}
