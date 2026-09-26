/**
 * 忍者ビルドコピーの相場を取引所で順に取る (2026-09-27)
 *
 * オーナー:「その最安値を自動で計算に加えて」「読み込み時ユニークだけ検索かけてるけど順番にレアもそのまま取得しちゃっていいよ。
 * ただ今何の動きをしてるかわかりやすいように表示させてね」。
 *   対象: ジュエル以外のレア / 取引所で探すユニーク (種類違い・ソケットのある物。prices.ts の uniqueTradeQuery)
 *   行ごとの状態: 順番待ち → 取得中 (今の段階・取引所の間隔待ち) → 済み。今どの行か (current) は画面の進み具合に出す
 *   レアの値段は手入れの欄に入れる (上書きできる)。ユニークはその値段で poe.ninja の相場を置き換える
 */
import { computed, reactive, ref, type Ref, type ShallowRef } from "vue";
import { autoRarePrice, autoUniquePrice, type RareAutoResult } from "../../services/build-copy/rare-auto";
import { uniqueTradeQuery } from "../../services/build-copy/prices";
import { setManualOf, unitOf } from "./manual-prices";
import type { ParsedBuild, BuildItem } from "../../services/build-copy/pob";
import type { RareAnalysis } from "../../services/build-copy/rare-query";

const isUnique = (it: BuildItem) => it.rarity === "UNIQUE" || it.rarity === "RELIC";
/** 取引所で探すユニークか (種類違い・ソケットのある物) */
export const tradeSearchedUnique = (it: BuildItem) => isUnique(it) && uniqueTradeQuery(it) != null;

export function useAutoPrices(deps: {
  build: Ref<ParsedBuild | null>;
  analyses: ShallowRef<Map<number, RareAnalysis>>;
  picked: Map<number, Record<number, number>>;
  ratios: Map<number, number>;
}) {
  const results = reactive(new Map<number, RareAutoResult>());
  const steps = reactive(new Map<number, string>());
  const queued = reactive(new Set<number>());
  const busy = ref(false);
  /** 全部を取っている途中 (行ごとの取り直しでは合計を隠さない) */
  const all = ref(false);
  const done = ref(0);
  const total = ref(0);
  /** 今取っている行 */
  const current = ref<number | null>(null);
  let gen = 0;

  const targets = () =>
    (deps.build.value?.items ?? []).flatMap((it, i) => ((it.rarity === "RARE" && it.kind !== "jewel" && deps.analyses.value.has(i)) || tradeSearchedUnique(it) ? [i] : []));

  async function run(row?: number): Promise<void> {
    if (busy.value) return;
    const rows = row == null ? targets() : [row];
    const g = ++gen;
    busy.value = true;
    all.value = row == null;
    done.value = 0;
    total.value = rows.length;
    rows.forEach((i) => queued.add(i));
    try {
      for (const i of rows) {
        const it = deps.build.value?.items[i];
        if (!it || g !== gen) break;
        queued.delete(i);
        current.value = i;
        const opts = { aborted: () => g !== gen, onStep: (s: string) => steps.set(i, s) };
        const a = deps.analyses.value.get(i);
        const uq = isUnique(it) ? uniqueTradeQuery(it) : null;
        const r = uq ? await autoUniquePrice(uq, opts) : a ? await autoRarePrice(a, deps.picked.get(i) ?? {}, deps.ratios.get(i) ?? 100, opts) : null;
        steps.delete(i);
        if (!r) break;
        results.set(i, r);
        if (r.exalted != null && it.rarity === "RARE") setManualOf(it, ...unitOf(r.exalted));
        done.value++;
      }
    } finally {
      if (g === gen) finish();
    }
  }
  function finish(): void {
    busy.value = false;
    all.value = false;
    current.value = null;
    steps.clear();
    queued.clear();
  }
  function stop(): void {
    gen++;
    finish();
  }
  function reset(): void {
    stop();
    results.clear();
  }
  /** 今の行の段階 (画面の進み具合) */
  const currentStep = computed(() => (current.value == null ? null : (steps.get(current.value) ?? null)));
  return { results, steps, queued, busy, all, done, total, current, currentStep, run, stop, reset };
}
