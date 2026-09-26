/**
 * ユニーク装備価格推移: 開いた 1 件の詳細 (長い履歴のグラフ) (2026-09-26)
 *
 * - 長い履歴: 行を開いた時だけ poe.ninja の日ごとの推移 (リーグ開始から) を取る。値段は神建てなので高貴に直す
 * - 取引所は開くだけ (最安は取らない。オーナー 2026-09-26「最安値をとるはいらない」)
 */
import { computed, ref, watch, type Ref } from "vue";
import type { HistoryPoint } from "../../api/poe2scout";
import { fetchNinjaHistory } from "../../api/ninja-economy";
import { marketStore } from "../../state/market-store";
import type { UniqueRow, UniqueTrend } from "./useUniqueTrend";

const DAY_MS = 24 * 60 * 60 * 1000;

export function useUniqueDetail(row: Ref<UniqueRow>, trend: Ref<UniqueTrend | undefined>) {
  const longPoints = ref<HistoryPoint[] | null>(null);
  const loadingLong = ref(false);

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
      const hist = await fetchNinjaHistory(lg, row.value.kind, id);
      // 神 → 高貴は一覧と同じ比 (一覧の値段 / 最新の点)。取れなければ相場ストアの比
      const latest = hist.find((h) => h.daysAgo === 0) ?? hist[hist.length - 1];
      const exPerDiv = latest && latest.value > 0 ? row.value.exalted / latest.value : marketStore.rates.value.divine || 1;
      const now = Date.now();
      const pts = hist
        .filter((h) => h.value > 0)
        .map((h) => ({ t: now - h.daysAgo * DAY_MS, price: h.value * exPerDiv, qty: h.count }))
        .sort((a, b) => a.t - b.t);
      if (row.value.itemId === id) longPoints.value = pts;
    } finally {
      loadingLong.value = false;
    }
  }

  // 別の行に切り替わったら作り直す
  watch(
    () => row.value.itemId,
    () => {
      longPoints.value = null;
      void loadLong();
    },
    { immediate: true },
  );

  return { points, stats, loadingLong };
}
