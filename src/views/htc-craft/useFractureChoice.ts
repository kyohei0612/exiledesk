/**
 * useFractureChoice.ts — ベースの始め方を、初動の安い順に (2026-09-24)
 *
 * オーナー:「フラクチャー品かフラクチャー無し品かみたいなところは？」「だったら選ばせたら。初動安い順で表示して」。
 * **自作フラクチャーは無し。ベースは買う物** (オーナー 2026-09-24:「自作フラクチャーはないね絶対。
 * お金めっちゃかかるし運ゲーになるから現実的じゃない」)。なので選択肢は 2 つ:
 *   - 固定済みを買う … 固定済みの MOD (樹 MOD・貼り付けで固定済みだった MOD) が付いたベースの最安。
 *     取引所は押した時だけ 1 本 (useHtcCraft の `treePlan.query`)。見つからなければ手で値段を入れる
 *   - 無し品から作る … 固定済みだった MOD を空のベースに付ける平均 ([[step-odds.ts]]、外れの消去込み)。
 *     固定されないので後で消えうる。樹 MOD は作れないので、樹 MOD がある時は出さない
 *
 * **ベース選びまでは自動、足りない情報は手で埋める**: 値段の分かっている一番安い物を自動で選び、人が選び直したらそちら。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { sideLimits } from "../../services/htc/bridge";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { stepHelpers, type ItemState, type Side } from "../../services/htc/step-odds";
import { autoPrice, tradeAuto } from "../../services/trade2/auto-price";
import { marketStore } from "../../state/market-store";
import { startOption, zeroStart, type StartOption } from "./craft-settings";
import type { useHtcCraft } from "./useHtcCraft";

export function useFractureChoice(c: ReturnType<typeof useHtcCraft>) {
  const baseType = computed(() => c.item.value?.baseType ?? zeroStart.value.baseType);
  const ilvl = computed(() => c.item.value?.itemLevel ?? zeroStart.value.itemLevel);

  /** 無し品から、固定済みだった MOD を順に作る平均 (高貴換算)。樹 MOD がある時は作れないので null */
  const craftCost = computed(() => {
    const d = c.data.value, cls = c.base.value, p = c.prices.value;
    if (!d || !cls || !p || !c.fracturedTargets.value.length || c.dropOnly.value.length) return null;
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

  /** 固定済みの最安 (押した時だけ 1 本) */
  const found = shallowRef<{ min: number | null; total: number; url: string | null } | null>(null);
  const busy = ref(false);
  const error = ref<string | null>(null);
  /** 手で入れた固定済みの値段 (神)。取引所で見つからない時に埋める */
  const manual = ref<number | null>(null);
  /** 人が選び直したか (選び直すまでは一番安い物を自動で選ぶ) */
  const picked = ref<string | null>(null);
  watch(() => c.treePlan.value?.query, () => { found.value = null; error.value = null; manual.value = null; picked.value = null; });

  async function search(): Promise<void> {
    const q = c.treePlan.value?.query;
    if (busy.value || !q) return;
    busy.value = true;
    error.value = null;
    try {
      const r = await autoPrice(marketStore.league.value?.Value ?? "Standard", q, marketStore.rates.value, 5);
      if (!r) error.value = tradeAuto.lastError.value ?? "取れませんでした (間隔待ちの時は少し待って押し直し)";
      else found.value = { min: r.minExalted ?? null, total: r.total, url: r.searchUrl || null };
    } catch (e) {
      error.value = String(e);
    } finally {
      busy.value = false;
    }
  }

  interface Row { id: string; start: StartOption; label: string; cost: number | null; note: string; link: { text: string; url: string } | null; manual: boolean }
  /** 選択肢を初動の安い順に (値段がまだ無い物は後ろ) */
  const options = computed<Row[]>(() => {
    const div = c.prices.value?.currency.divine ?? 1;
    const rows: Row[] = [];
    if (c.treePlan.value) {
      const f = found.value;
      const m = manual.value != null && manual.value > 0 ? manual.value * div : null;
      rows.push({ id: "fractured", start: "frac", label: "固定済みを買う", cost: f?.min ?? m, note: "",
        link: f?.url ? { text: `${f.total} 件`, url: f.url } : null, manual: f?.min == null });
    }
    if (craftCost.value != null) {
      rows.push({ id: "plain", start: "plain", label: "無し品から作る", cost: craftCost.value, note: "固定されないので後で消えうる", link: null, manual: false });
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

  return { options, chosen, choose, manual, search, busy, error, searched: computed(() => !!found.value) };
}
