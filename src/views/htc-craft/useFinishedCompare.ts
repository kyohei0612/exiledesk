/**
 * useFinishedCompare.ts — 完成品を買うのと、作るのと (2026-09-24)
 *
 * オーナー:「あとは完成品か。比較対象ないよね今」。09-22 の「作るのと買うの、どっちが安いか」([[buy-or-craft.ts]]) を
 * 診断カードに戻した (1 手ずつの一覧カードを外した時に一緒に消えていた)。
 *   - 完成品を買う … 同じ MOD 構成の最安。狙いは素の段の下限、普通 / 固定済み / 冒涜のどれでもいい (build の説明)。
 *     コラプト無し・ユニーク以外・ilvl 以上。始め方の「探す」の最後に 1 本 (手動)。取引所に無ければ手で値段を入れる
 *     (貼り付けの画面の「完成品の売値」欄は外した。オーナー 2026-09-24:「ここいらんくね」)
 *   - 作る見込み   … 始め方の初動 + スパムの組み立て (自動) の平均。**あくまで目安** (1 手ずつは人が選ぶ)。
 *     自動の組み立てが組めない時 (品質 40% の順番が決まらない半影の指輪など) は、狙いを 1 つずつ付ける平均
 *     ([[step-odds.ts]] の一番安い打ち方、外れの消去込み) の合計で出す。付けた物が消える分は入らないので安めに出る
 */
import { computed, ref, shallowRef, watch } from "vue";
import { tradeCategoryOf, tradeFiltersFor } from "../../services/htc/buy-or-craft";
import { buildSpecQuery } from "../../services/trade2/query";
import { tradeAuto } from "../../services/trade2/auto-price";
import { autoPriceCached } from "../../services/trade2/query-cache";
import { marketStore } from "../../state/market-store";
import { zeroStart } from "./craft-settings";
import { stepsEstimate } from "./craft-estimate";
import type { useHtcCraft } from "./useHtcCraft";

export function useFinishedCompare(
  c: ReturnType<typeof useHtcCraft>,
  /** 始め方で選ばれた物の初動 (高貴換算)。無ければ null */
  startCost: { readonly value: number | null },
) {
  /**
   * 完成品の検索。**一番ゆるく** (オーナー 2026-09-24:「完成品はフラクチャー指定なしやったら MOD だけ見てくれるでしょ。
   * 完成品こそ一番ゆるくしたい」)。取引所は同じ MOD を 普通 (explicit.) / 固定済み (fractured.) / 冒涜 (desecrated.) で
   * 別に持つ (冒涜で付いた普通の MOD は冒涜の方に入る。trade2-stats の Desecrated に最大マナ・耐性なども並ぶ) ので、
   *   full  … どの MOD も 3 つのどれでもいい (樹 MOD は普通 / 固定済み)
   *   light … 2 択は樹 MOD だけ、他は普通だけ
   * full は条件が多く、ログインしていないと「検索条件が複雑過ぎます」(HTTP 400) で断られる (2026-09-24 実機、エラー文に
   * 「ログインすればこの上限が増えます」)。断られたら light で投げ直す
   */
  function build(level: "full" | "light") {
    const d = c.data.value, cls = c.base.value;
    if (!d || !cls) return null;
    const { filters, unmatched } = tradeFiltersFor(d, c.targets.value);
    if (unmatched.length) return null;
    const bareOf = (id: string): string => id.replace(/^(explicit|fractured)\./, "");
    const plain: { id: string; min?: number }[] = [];
    const anyOf: { filters: { id: string; min?: number }[] }[] = [];
    // 樹 MOD は treePlan の買う物にだけ居る (貼り付けで固定済みだった普通の MOD は targets と重なるので 1 度だけ)
    const tree = (c.treePlan.value?.buys ?? []).flatMap((b) => b.filters);
    const own = new Set(filters.map((x) => bareOf(x.id)));
    const treeKeys = new Set(tree.map((x) => bareOf(x.id)).filter((k) => !own.has(k)));
    const seen = new Set<string>();
    for (const f of [...filters.map((x) => ({ id: x.id, min: x.min })), ...tree.map((x) => ({ id: x.id, min: x.min ?? 0 }))]) {
      const key = bareOf(f.id);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!/^(explicit|fractured)\./.test(f.id)) { plain.push(f); continue; }
      const kinds = treeKeys.has(key) ? ["explicit", "fractured"] : level === "full" ? ["explicit", "fractured", "desecrated"] : null;
      if (kinds) anyOf.push({ filters: kinds.map((k) => ({ id: `${k}.${key}`, min: f.min })) });
      else plain.push(f);
    }
    const baseType = c.item.value?.baseType ?? zeroStart.value.baseType;
    const category = tradeCategoryOf(cls);
    if (!baseType && !category) return null;
    return buildSpecQuery({
      ...(baseType ? { baseType } : {}),
      ...(category ? { category } : {}),
      rarity: "nonunique",
      ilvlMin: c.item.value?.itemLevel ?? zeroStart.value.itemLevel,
      stats: plain,
      anyOf,
    });
  }
  const query = computed(() => build("full"));
  /** 組めない理由 (取引所の条件にできない MOD がある) */
  const unbuildable = computed(() => {
    const d = c.data.value;
    if (!d || !c.base.value || query.value) return null;
    const { unmatched } = tradeFiltersFor(d, c.targets.value);
    return unmatched.length ? `取引所の条件にできない MOD があるので探せません: ${unmatched.join(" / ")}` : "このベースは取引所で探せません";
  });
  /** ゆるい条件を断られて、軽い条件で探した時の注記 */
  const lightNote = ref<string | null>(null);

  const found = shallowRef<{ min: number | null; total: number; url: string | null } | null>(null);
  /** 取引所に無い時に手で入れた完成品の値段 (神) */
  const manual = ref<number | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  watch(query, () => { found.value = null; error.value = null; manual.value = null; lightNote.value = null; });

  async function search(): Promise<void> {
    if (busy.value || !query.value) return;
    busy.value = true;
    error.value = null;
    try {
      const league = marketStore.league.value?.Value ?? "Standard";
      lightNote.value = null;
      let r = await autoPriceCached(league, query.value, marketStore.rates.value, 5);
      const light = build("light");
      if (!r && (tradeAuto.lastError.value ?? "").includes("複雑") && light) {
        r = await autoPriceCached(league, light, marketStore.rates.value, 5);
        if (r) lightNote.value = "条件が複雑過ぎると断られたので、冒涜で付いた MOD は拾わない条件で探しました (ログインすると、もっとゆるい条件で探せます)";
      }
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
  /** 狙いを 1 つずつ付ける平均の合計 (自動の組み立てが組めない時の目安、[[craft-estimate.ts]]) */
  const sumOfSteps = computed(() => stepsEstimate(c, c.fracturedTargets.value.map((t) => t.modId)));
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

  return { query, unbuildable, lightNote, found, manual, busy, error, search, buyCost, craftCost, craftBasis, verdict };
}
