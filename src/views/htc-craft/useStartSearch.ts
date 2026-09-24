/**
 * useStartSearch.ts — 始め方: どの MOD を固定済みにして始めるか選んで、押した時だけ探す (2026-09-24)
 *
 * オーナー:「ベースの所で複数選択で開始フラクチャー選びたいな。その時点で検索かけたいから、やっぱ取得は手動がいい。
 * 真ん中は結果表示にしよう。取得後に表示する形で徐々にやってく感じでいい」。
 *   - 候補 = 樹 MOD がある時は「樹 MOD を固定」だけ (スパムで消えるので必ず固定)。無い時は作る MOD のうち普通に付く物 1 つずつ
 *   - チェックは 3 つまで (取引所の上限。1 つ 3 本 = 検索 + 取得で 6 回、3 つで 18 回 + 完成品 2 回 = 5 分 20 回に収まる)
 *   - 「探す」で上から 1 つずつ取り、取れた物から真ん中に出す (30 分は覚えておく)。最後に完成品を 1 本
 *   - 真ん中で選んだ物が始め方 (固定済みの MOD を差し替え、ツリーの開始の指輪もそれになる)
 * 自動では取りに行かない (前は MOD 解析の時点で取っていた)。
 */
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { startRows, type StartRow } from "./start-rows";
import type { TreeResult } from "./useTreeSearch";
import type { useHtcCraft } from "./useHtcCraft";

/** 同時に探せるのは 3 つまで (オーナー 2026-09-24) */
export const MAX_STARTS = 3;
/** 樹 MOD だけを固定済みにする候補の鍵 */
const TREE_ONLY = "__tree__";

export interface StartCandidate {
  key: string;
  /** 固定済みにする普通の MOD (樹 MOD だけなら空) */
  modIds: string[];
  name: string;
}

export function useStartSearch(c: ReturnType<typeof useHtcCraft>, afterAll: () => Promise<void>) {
  const candidates = computed<StartCandidate[]>(() => {
    // 樹 MOD がある時は樹 MOD を固定する 1 択 (オーナー 2026-09-24:「木 MOD があると必ず木 MOD 固定にしないとダメ。
    // スパムで消えるから。木 MOD の場合は他の選択肢選ばせないように」)。固定できるのは 1 つだけなので、他の MOD と
    // 両方固定済みの候補 (前の「樹 MOD + キャスピ」) は取引所に無く、意味も無かった
    if (c.dropOnly.value.length) return [{ key: TREE_ONLY, modIds: [], name: "樹 MOD を固定" }];
    return c.targets.value
      .filter((t) => c.data.value?.mods.get(t.modId)?.source === "normal")
      .map((t) => ({ key: t.modId, modIds: [t.modId], name: `${c.stepTarget([t.modId])} を固定` }));
  });
  const checked = ref<string[]>([]);
  const results = shallowRef<Record<string, TreeResult | "error">>({});
  const pending = ref<string[]>([]);
  const busy = ref(false);
  /** 始め方に選んだ候補 (人が選ぶまでは一番安い物) */
  const picked = ref<string | null>(null);

  // 解析し直したら、チェックを戻す (樹 MOD があれば樹 MOD、無ければ貼り付けで固定済みだった MOD)
  watch(() => [c.item.value, c.base.value], () => {
    const fr = c.fracturedTargets.value.map((t) => t.modId);
    const init = c.dropOnly.value.length ? [TREE_ONLY] : fr;
    checked.value = init.filter((k) => candidates.value.some((x) => x.key === k)).slice(0, MAX_STARTS);
    results.value = {};
    picked.value = null;
  }, { immediate: true });

  async function searchAll(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    const keys = candidates.value.filter((x) => checked.value.includes(x.key));
    pending.value = keys.map((x) => x.key);
    try {
      for (const cand of keys) {
        const r = await c.searchFor(cand.modIds).catch(() => null);
        results.value = { ...results.value, [cand.key]: r ?? "error" };
        pending.value = pending.value.filter((k) => k !== cand.key);
      }
      await afterAll();
    } finally {
      busy.value = false;
      pending.value = [];
    }
  }

  const div = computed(() => c.prices.value?.currency.divine ?? 1);
  /** 探した候補ごとの 3 行と一番安い初動。安い順 (取れていない物は後ろ) */
  const rows = computed(() => candidates.value
    .filter((x) => checked.value.includes(x.key) || results.value[x.key])
    .map((x) => {
      const res = results.value[x.key];
      const sub: StartRow[] = res && res !== "error" ? startRows(res, div.value, { busy: false, manualDivine: null }) : [];
      return { ...x, res, sub, best: sub.find((y) => y.cost != null) ?? null, waiting: pending.value.includes(x.key) };
    })
    .sort((a, b) => (a.best?.cost ?? Infinity) - (b.best?.cost ?? Infinity)));
  const chosen = computed(() => rows.value.find((x) => x.key === picked.value && x.best) ?? rows.value.find((x) => x.best) ?? null);

  // 選んだ候補の固定済みにして、ツリーの開始の指輪と確認用の表 (treeResult) をそれに合わせる
  watch(chosen, async (x) => {
    if (!x || x.res === "error" || !x.res) return;
    const same = x.modIds.length === c.fracturedTargets.value.length && x.modIds.every((id) => c.fracturedTargets.value.some((t) => t.modId === id));
    if (!same) c.setFractured(x.modIds);
    await nextTick();
    c.treeResult.value = x.res;
  });

  return {
    candidates, checked, results, busy, searchAll, rows, chosen,
    choose: (key: string) => { picked.value = key; },
    locked: (key: string) => !checked.value.includes(key) && checked.value.length >= MAX_STARTS,
  };
}
