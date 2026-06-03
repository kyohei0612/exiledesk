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

export interface CurrencyDetail {
  CurrencyItemId: number;
  ItemId: number;
  CurrencyCategoryId: number;
  ApiId: string;
  Text: string;
  IconUrl: string;
  CategoryApiId: string;
  ItemMetadata: unknown;
}

export interface CurrencyData {
  ValueTraded: string;
  RelativePrice: string;
  StockValue: string;
  VolumeTraded: number;
  HighestStock: number;
}

export interface SnapshotPair {
  CurrencyExchangeSnapshotPairId: number;
  CurrencyExchangeSnapshotId: number;
  Volume: string;
  BaseCurrencyApiId: string;
  BaseCurrencyText: string;
  CurrencyOne: CurrencyDetail;
  CurrencyTwo: CurrencyDetail;
  CurrencyOneData: CurrencyData;
  CurrencyTwoData: CurrencyData;
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

export async function fetchLeagues(): Promise<League[]> {
  const res = await httpFetch(`${BASE}/poe2/Leagues`);
  if (!res.ok) throw new Error(`Leagues request failed: ${res.status}`);
  return res.json();
}

export async function fetchSnapshotPairs(
  leagueName: string,
  perPage = 500,
): Promise<SnapshotPair[]> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotPairs?perPage=${perPage}`;
  const res = await httpFetch(url);
  if (!res.ok) throw new Error(`SnapshotPairs request failed: ${res.status}`);
  return res.json();
}

// =================== 集約・整形 ===================

/**
 * 集約後の 1 アイテム = 1 行。素材を 基本通貨(高貴/カオス/神) で値付けした 3 換算を持つ。
 * オーナー指示 (2026-06-03): 「素材 → 神/高貴/カオス の表示だけでOK」。
 * 同一アイテムが複数の基本通貨ペアに出る "倍表示" を防ぐためペアではなくアイテム単位で集約する。
 */
export interface RankedItem {
  apiId: string;
  /** poe2scout の数値 ItemId。PriceHistory との結合キー。 */
  itemId: number;
  text: string;
  icon: string;
  categoryApiId: string;
  /** 全ペア(対 高貴/カオス/神)の取引量合計 = 取引フロー量 */
  volume: number;
  /** 1 アイテム = ? 高貴(Exalted)。RelativePrice そのもの */
  exaltedPrice: number;
  /** 1 アイテム = ? 神(Divine) */
  divinePrice: number;
  /** 1 アイテム = ? カオス(Chaos) */
  chaosPrice: number;
}

/**
 * 基本交換先通貨。POE2 の値付けは事実上この 3 通貨建て (オーナー指示 2026-06-03)。
 * これと交換するペアだけ拾い、素材同士 (どちらも非基本通貨) は全ビューから除外する。
 */
const BASIC_TARGETS = new Set(["divine", "exalted", "chaos"]);

/**
 * SnapshotPairs を「アイテム単位」に集約する。
 *  - 両側とも基本通貨 (高貴↔神 等のクロスレート) → ヘッダの基準レート帯で表示、表からは除外
 *  - 両側とも非基本通貨 (素材↔素材) → オーナー指示で全除外
 *  - ちょうど片側が基本通貨 → 非基本側がアイテム
 * RelativePrice は base通貨(Exalted)建てなので 1 つの値から 3 通貨換算を導ける。
 * 同一アイテムが複数ペアに出るので、代表価格は最大volumeペアの RelativePrice、
 * volume は全ペア合算（倍表示の解消）。
 *
 * @param pairs poe2scout SnapshotPairs レスポンス
 * @param divinePrice 1 神 = ? base通貨 (リーグ data の DivinePrice)
 * @param chaosDivinePrice 1 神 = ? Chaos (= Chaos per Divine。通常 >1)
 */
export function aggregateItems(
  pairs: SnapshotPair[],
  divinePrice: number,
  chaosDivinePrice: number,
): RankedItem[] {
  const safeDivinePrice = divinePrice > 0 ? divinePrice : 1;
  const safeChaosDivinePrice = chaosDivinePrice > 0 ? chaosDivinePrice : 1;
  // 1 カオス = divinePrice / chaosDivinePrice 高貴(Exalted) 建て
  const chaosExaltedPrice = safeDivinePrice / safeChaosDivinePrice;

  const agg = new Map<
    string,
    { item: CurrencyDetail; rel: number; bestPairVol: number; volume: number }
  >();

  for (const p of pairs) {
    const oneBasic = BASIC_TARGETS.has(p.CurrencyOne.ApiId);
    const twoBasic = BASIC_TARGETS.has(p.CurrencyTwo.ApiId);
    // 両方 basic (クロスレート) or 両方 非basic (素材同士) → 除外
    if (oneBasic === twoBasic) continue;

    const item = oneBasic ? p.CurrencyTwo : p.CurrencyOne;
    const itemData = oneBasic ? p.CurrencyTwoData : p.CurrencyOneData;
    const rel = parseFloat(itemData?.RelativePrice ?? "0");
    if (!(rel > 0)) continue;

    // volume は取引個数ベース (両通貨の VolumeTraded 合算)。
    // Exalted 建て総額だと Mirror 等の単価異常が上位に来るため使わない。
    const pairVol =
      (p.CurrencyOneData?.VolumeTraded ?? 0) +
      (p.CurrencyTwoData?.VolumeTraded ?? 0);
    if (!(pairVol > 0) || !Number.isFinite(pairVol)) continue;

    const prev = agg.get(item.ApiId);
    if (!prev) {
      agg.set(item.ApiId, { item, rel, bestPairVol: pairVol, volume: pairVol });
    } else {
      prev.volume += pairVol;
      if (pairVol > prev.bestPairVol) {
        prev.bestPairVol = pairVol;
        prev.rel = rel; // 取引が最も厚いペアの価格を代表値に
      }
    }
  }

  return Array.from(agg.values())
    .map((e) => ({
      apiId: e.item.ApiId,
      itemId: e.item.ItemId,
      text: e.item.Text,
      icon: e.item.IconUrl,
      categoryApiId: e.item.CategoryApiId,
      volume: e.volume,
      exaltedPrice: e.rel,
      divinePrice: e.rel / safeDivinePrice,
      chaosPrice: e.rel / chaosExaltedPrice,
    }))
    .sort((a, b) => b.volume - a.volume);
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

/** 1 アイテムの 7 日トレンド。spark は古→新の価格列、changePct は期間内変化率(%)。 */
export interface ItemTrend {
  spark: number[];
  changePct: number;
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
  const res = await httpFetch(url);
  if (!res.ok) throw new Error(`PriceHistory request failed: ${res.status}`);
  const data = (await res.json()) as PriceHistoryResponse;

  const trends = new Map<number, ItemTrend>();
  // 「過去7日」の下限時刻。最新点を基準に 7 日遡る（新リーグで7日未満なら全件）。
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  for (const h of data.ItemHistories ?? []) {
    const points = (h.History ?? [])
      .map((p) => ({ price: parseFloat(p.Price), t: Date.parse(p.Time) }))
      .filter((p) => Number.isFinite(p.price) && p.price > 0 && !Number.isNaN(p.t))
      // API は新→古。古→新に並べ替える。
      .sort((a, b) => a.t - b.t);
    if (points.length < 2) continue;

    const newestT = points[points.length - 1].t;
    const cutoff = newestT - SEVEN_DAYS_MS;
    const recent = points.filter((p) => p.t >= cutoff);
    const series = recent.length >= 2 ? recent : points;

    const first = series[0].price;
    const last = series[series.length - 1].price;
    const changePct = first > 0 ? ((last - first) / first) * 100 : 0;
    trends.set(h.ItemId, {
      spark: series.map((p) => p.price),
      changePct,
    });
  }
  return trends;
}
