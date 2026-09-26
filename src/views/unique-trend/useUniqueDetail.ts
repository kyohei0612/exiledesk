/**
 * ユニーク装備価格推移: 開いた 1 件の詳細 (長い履歴 + 取引所の即時購入の最安) (2026-09-26)
 *
 * - 長い履歴: 行を開いた時だけ poe2scout から多めに取り直す。取れなければ 7 日分のままグラフにする
 * - 取引所: オーナー指示「インスタントバイアウトで」。ボタンを押した時だけ 1 回検索する (自動では投げない)。
 *   検索は status = securable (即時購入だけ) の既存クエリで、門番 (レート制限) を通る autoPriceCached に乗せる
 */
import { computed, ref, watch, type Ref } from "vue";
import { fetchItemHistory, type HistoryPoint } from "../../api/poe2scout";
import { marketStore } from "../../state/market-store";
import { autoPriceCached } from "../../services/trade2/query-cache";
import { refetchState, tradeAuto } from "../../services/trade2/auto-price";
import { buildUniqueNameQuery } from "../../services/trade2/query";
import type { UniqueRow, UniqueTrend } from "./useUniqueTrend";

/** 詳細で取る履歴の点数 (1 時間刻みなら 40 日強) */
const LONG_LOG_COUNT = 1000;

export interface InstantResult {
  minExalted: number | null;
  total: number;
  url: string | null;
  at: number;
}

export function useUniqueDetail(row: Ref<UniqueRow>, trend: Ref<UniqueTrend | undefined>) {
  const longPoints = ref<HistoryPoint[] | null>(null);
  const loadingLong = ref(false);
  const busy = ref(false);
  const waitSecs = ref(0);
  const result = ref<InstantResult | null>(null);
  const error = ref<string | null>(null);

  /** グラフに出す点列: 長い方が取れていればそちら */
  const points = computed<HistoryPoint[]>(() => {
    const long = longPoints.value;
    const short = trend.value?.points ?? [];
    return long && long.length > short.length ? long : short;
  });

  const stats = computed(() => {
    const p = points.value;
    if (!p.length) return null;
    let min = p[0];
    let max = p[0];
    for (const x of p) {
      if (x.price < min.price) min = x;
      if (x.price > max.price) max = x;
    }
    return { min, max, first: p[0], last: p[p.length - 1] };
  });

  async function loadLong(): Promise<void> {
    const lg = marketStore.league.value?.Value;
    if (!lg) return;
    const id = row.value.itemId;
    loadingLong.value = true;
    try {
      const pts = await fetchItemHistory(lg, id, LONG_LOG_COUNT);
      if (row.value.itemId === id) longPoints.value = pts;
    } finally {
      loadingLong.value = false;
    }
  }

  /** 取引所で即時購入の最安を 1 回だけ取る (押した時だけ) */
  async function fetchInstant(): Promise<void> {
    const lg = marketStore.league.value?.Value;
    if (!lg || busy.value) return;
    const id = row.value.itemId;
    busy.value = true;
    error.value = null;
    waitSecs.value = 0;
    try {
      const r = await autoPriceCached(lg, buildUniqueNameQuery(row.value.nameEn, { noCorrupted: true }), marketStore.rates.value, undefined, {
        onWait: (s) => (waitSecs.value = s),
      });
      if (row.value.itemId !== id) return;
      if (r) result.value = { minExalted: r.minExalted, total: r.total, url: r.searchUrl || null, at: Date.now() };
      else error.value = tradeAuto.lastError.value ?? "取引所から取れませんでした";
    } finally {
      busy.value = false;
      waitSecs.value = 0;
    }
  }

  const button = computed(() => {
    if (busy.value && waitSecs.value > 0) return { label: `上限のため ${waitSecs.value} 秒待ち…`, disabled: true };
    return refetchState(busy.value, "取引所で即時購入の最安を取る");
  });

  // 別の行に切り替わったら作り直す
  watch(
    () => row.value.itemId,
    () => {
      longPoints.value = null;
      result.value = null;
      error.value = null;
      void loadLong();
    },
    { immediate: true },
  );

  return { points, stats, loadingLong, result, error, button, fetchInstant };
}
