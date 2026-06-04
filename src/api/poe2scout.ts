/**
 * poe2scout API クライアント
 *
 * poe2scout は POE2 専用の経済データ集約サービス（MIT、OpenAPI 完備、無認証 GET）
 * Repo: https://github.com/poe2scout/poe2scout
 * OpenAPI: https://poe2scout.com/api/openapi.json
 *
 * 2026-05-19 hotfix: poe2scout が Access-Control-Allow-Origin を返さないため、
 * Tauri WebView の fetch だと CORS で弾かれる。本番ビルドでは
 * @tauri-apps/plugin-http の fetch (Rust 経由、CORS 不問) を使う。
 * dev では Vite proxy 経由で CORS 回避済なので native fetch を使う。
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

const BASE = import.meta.env.DEV
  ? "/api/poe2scout"
  : "https://poe2scout.com/api";

const httpFetch: typeof fetch = import.meta.env.DEV
  ? globalThis.fetch.bind(globalThis)
  : (tauriFetch as unknown as typeof fetch);

// =================== 型定義 ===================

/**
 * poe2scout の /Items 1 件。CurrentPrice が poe2scout 公式の確定価格(高貴=Exalted建て)。
 * 通貨交換アイテムは ApiId を持ち、装備/ユニーク(armour/weapon等)は ApiId=null で区別できる。
 */
export interface CurrencyItem {
  ItemId: number;
  CategoryApiId: string;
  Text: string;
  Name: string | null;
  Type: string | null;
  ApiId: string | null;
  CurrentPrice: number | null;
  IconUrl: string;
}

export interface League {
  Value: string;
  IsCurrent: boolean;
  DivinePrice: number;
  ChaosDivinePrice: number;
  BaseCurrencyApiId: string;
  BaseCurrencyText: string;
  BaseCurrencyIconUrl: string;
  ExaltedCurrencyText: string;
  ExaltedCurrencyIconUrl: string;
  DivineCurrencyText: string;
  DivineCurrencyIconUrl: string;
  ChaosCurrencyText: string;
  ChaosCurrencyIconUrl: string;
}

// =================== 取得関数 ===================

// 「更新」で必ず最新を取得するため、全 GET は no-store でキャッシュを使わない。
// poe2scout は cf-cache-status: DYNAMIC(CDN非キャッシュ)だが Cache-Control 無 + Last-Modified 有のため
// WebView のヒューリスティックキャッシュを確実に回避する。
const NO_STORE: RequestInit = { cache: "no-store" };

export async function fetchLeagues(): Promise<League[]> {
  const res = await httpFetch(`${BASE}/poe2/Leagues`, NO_STORE);
  if (!res.ok) throw new Error(`Leagues request failed: ${res.status}`);
  return res.json();
}

/**
 * 最新スナップショットの実時刻(Epoch秒)を返す。鮮度の可視化用。
 * poe2scout の SnapshotHistory は ~1時間刻み。取得失敗時は null。
 */
export async function fetchLatestSnapshotEpoch(
  leagueName: string,
): Promise<number | null> {
  try {
    const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotHistory?Limit=1`;
    const res = await httpFetch(url, NO_STORE);
    if (!res.ok) return null;
    const data = await res.json();
    const arr: unknown = Array.isArray(data)
      ? data
      : data && typeof data === "object"
        ? Object.values(data).find((v) => Array.isArray(v))
        : null;
    const first = Array.isArray(arr) ? arr[0] : null;
    const ep =
      first && typeof first === "object"
        ? (first as Record<string, unknown>).Epoch
        : null;
    return typeof ep === "number" ? ep : null;
  } catch {
    return null;
  }
}

export async function fetchItems(
  leagueName: string,
): Promise<CurrencyItem[]> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/Items`;
  const res = await httpFetch(url, NO_STORE);
  if (!res.ok) throw new Error(`Items request failed: ${res.status}`);
  return res.json();
}

// =================== 整形 ===================

/**
 * 1 アイテム = 1 行。素材を 基本通貨(高貴/カオス/神) で値付けした 3 換算を持つ。
 * 価格は poe2scout 公式の CurrentPrice(高貴=Exalted建て)を直接採用する。
 * （SnapshotPairs の RelativePrice はペア基準通貨建てで普遍価格ではないため使わない。
 *   オーナー指摘 2026-06-03「ExileDeskだけ値段が微妙に違う」の修正。）
 */
export interface RankedItem {
  apiId: string;
  /** poe2scout の数値 ItemId。PriceHistory との結合キー。 */
  itemId: number;
  text: string;
  icon: string;
  categoryApiId: string;
  /** 1 アイテム = ? 高貴(Exalted)。= CurrentPrice */
  exaltedPrice: number;
  /** 1 アイテム = ? 神(Divine) */
  divinePrice: number;
  /** 1 アイテム = ? カオス(Chaos) */
  chaosPrice: number;
}

/** 基本交換先通貨。これ自体は素材行に出さない(基準レート帯で表示)。 */
const BASIC_TARGETS = new Set(["divine", "exalted", "chaos"]);

/**
 * /Items を「通貨交換アイテムの 1 行 = 1 アイテム」に整形する。
 *  - 通貨交換アイテムのみ採用 = ApiId が非 null（装備/ユニークは ApiId=null で除外）
 *  - 基本通貨(高貴/カオス/神)自体は除外（基準レート帯で表示）
 *  - CurrentPrice(高貴建て) を正とし、神/カオス換算を導出
 *
 * @param items poe2scout /Items レスポンス
 * @param divinePrice 1 神 = ? 高貴 (リーグ data の DivinePrice)
 * @param chaosDivinePrice 1 神 = ? Chaos (= Chaos per Divine。通常 >1)
 */
export function buildRankedItems(
  items: CurrencyItem[],
  divinePrice: number,
  chaosDivinePrice: number,
): RankedItem[] {
  const safeDivinePrice = divinePrice > 0 ? divinePrice : 1;
  const safeChaosDivinePrice = chaosDivinePrice > 0 ? chaosDivinePrice : 1;
  // 1 カオス = divinePrice / chaosDivinePrice 高貴(Exalted) 建て
  const chaosExaltedPrice = safeDivinePrice / safeChaosDivinePrice;

  return items
    .filter(
      (x): x is CurrencyItem & { ApiId: string; CurrentPrice: number } =>
        !!x.ApiId &&
        !BASIC_TARGETS.has(x.ApiId) &&
        typeof x.CurrentPrice === "number" &&
        x.CurrentPrice > 0,
    )
    .map((x) => ({
      apiId: x.ApiId,
      itemId: x.ItemId,
      text: x.Text,
      icon: x.IconUrl,
      categoryApiId: x.CategoryApiId,
      exaltedPrice: x.CurrentPrice,
      divinePrice: x.CurrentPrice / safeDivinePrice,
      chaosPrice: x.CurrentPrice / chaosExaltedPrice,
    }))
    .sort((a, b) => b.exaltedPrice - a.exaltedPrice);
}

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
