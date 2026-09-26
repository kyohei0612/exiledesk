/**
 * 価格履歴 (7 日トレンド / 1 アイテムの点列)
 *
 * poe2scout.ts から切り出し (2026-09-26)。
 */
import { BASE, httpFetch, NO_STORE } from "./http";

// =================== 価格履歴（過去7日トレンド） ===================

interface PriceHistoryPoint {
  Price: string;
  Time: string;
  Quantity: number;
}
interface PriceHistoryResponse {
  ItemHistories: { ItemId: number; History: PriceHistoryPoint[] }[];
}

/** 1 アイテムの トレンド。spark は古→新の価格列、changePct は期間内変化率(%)。 */
export interface ItemTrend {
  spark: number[];
  changePct: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** 価格点列(古→新)から spark + changePct を作る (7日窓、無ければ全件)。 */
function pointsToTrend(points: { price: number; t: number }[]): ItemTrend | null {
  const valid = points
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
  if (valid.length < 2) return null;
  const cutoff = valid[valid.length - 1].t - SEVEN_DAYS_MS;
  const recent = valid.filter((p) => p.t >= cutoff);
  const series = recent.length >= 2 ? recent : valid;
  const first = series[0].price;
  const last = series[series.length - 1].price;
  return {
    spark: series.map((p) => p.price),
    changePct: first > 0 ? ((last - first) / first) * 100 : 0,
  };
}

/**
 * 1 アイテムの「本物の7日トレンド」を個別履歴から取得。
 * 一括 PriceHistory は直近~24時間しか返さないため、基準レート等の重要表示はこちらを使う。
 * LogCount=200 で約7日分(1時間刻み)をカバー。失敗時 null。
 */
export async function fetchItemTrend7d(
  leagueName: string,
  itemId: number,
  referenceCurrency?: string,
): Promise<ItemTrend | null> {
  try {
    const ref = referenceCurrency
      ? `&ReferenceCurrency=${encodeURIComponent(referenceCurrency)}`
      : "";
    const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/Items/${itemId}/History?LogCount=200${ref}`;
    const res = await httpFetch(url, NO_STORE);
    if (!res.ok) return null;
    const data = await res.json();
    const arr: unknown = Array.isArray(data)
      ? data
      : data && typeof data === "object"
        ? (data as Record<string, unknown>).PriceHistory
        : null;
    if (!Array.isArray(arr)) return null;
    const points = arr
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        price: parseFloat(String(p.Price ?? "0")),
        t: Date.parse(String(p.Time ?? "")),
      }));
    return pointsToTrend(points);
  } catch {
    return null;
  }
}

/**
 * リーグ全アイテムの価格履歴を一括取得し、ItemId → 直近7日トレンドのマップを返す。
 * poe.ninja のスパークライン相当（オーナー指示 2026-06-03）。
 * Price は base通貨(Exalted)建て RelativePrice なので変化率・形状はそのまま使える。
 * API は league だけで全件返すため 1 リクエストで済む。
 */
export async function fetchPriceTrends(
  leagueName: string,
): Promise<Map<number, ItemTrend>> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/Items/PriceHistory`;
  const res = await httpFetch(url, NO_STORE);
  if (!res.ok) throw new Error(`PriceHistory request failed: ${res.status}`);
  const data = (await res.json()) as PriceHistoryResponse;

  // 注意: この一括エンドポイントは直近~24時間しか返さない。広域(7日)の重要表示には
  // fetchItemTrend7d(個別) を使うこと。ここはテーブル列(直近)用。
  const trends = new Map<number, ItemTrend>();
  for (const h of data.ItemHistories ?? []) {
    const points = (h.History ?? []).map((p) => ({
      price: parseFloat(p.Price),
      t: Date.parse(p.Time),
    }));
    const trend = pointsToTrend(points);
    if (trend) trends.set(h.ItemId, trend);
  }
  return trends;
}

// =================== 1 アイテムの価格履歴 (点列そのまま) ===================

/** 履歴の 1 点。price は高貴 (Exalted) 建て、t は ms、qty は poe2scout の Quantity (出品の数) */
export interface HistoryPoint {
  t: number;
  price: number;
  qty: number;
}

/**
 * 1 アイテムの価格履歴を点列 (古→新) で返す (2026-09-26、ユニーク装備価格推移用)。
 *
 * オーナー指示「価格推移を知りたい。グラフで分かりやすくトレースして欲しい」。
 * fetchItemTrend7d と同じ `/Items/{id}/History` だが、グラフのホバーに日時と件数を出すため
 * 時刻と Quantity も捨てずに返す。ユニーク (ApiId 無し) も ItemId で同じように引ける。
 * 失敗時は null (画面は「—」のまま)。
 */
export async function fetchItemHistory(leagueName: string, itemId: number, logCount = 200): Promise<HistoryPoint[] | null> {
  try {
    const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/Items/${itemId}/History?LogCount=${logCount}`;
    const res = await httpFetch(url, NO_STORE);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const arr: unknown = Array.isArray(data)
      ? data
      : data && typeof data === "object"
        ? (data as Record<string, unknown>).PriceHistory
        : null;
    if (!Array.isArray(arr)) return null;
    return arr
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        t: Date.parse(String(p.Time ?? "")),
        price: parseFloat(String(p.Price ?? "0")),
        qty: typeof p.Quantity === "number" ? p.Quantity : 0,
      }))
      .filter((p) => Number.isFinite(p.price) && p.price > 0 && !Number.isNaN(p.t))
      .sort((a, b) => a.t - b.t);
  } catch {
    return null;
  }
}
