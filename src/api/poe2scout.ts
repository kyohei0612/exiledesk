/**
 * poe2scout API クライアント
 *
 * poe2scout は POE2 専用の経済データ集約サービス（MIT、OpenAPI 完備、無認証 GET）
 * Repo: https://github.com/poe2scout/poe2scout
 * OpenAPI: https://api.poe2scout.com/openapi/v1.json
 *
 * 2026-09-11: API が poe2scout.com/api から api.poe2scout.com に移転 (旧 URL はフロントの HTML を返す)。
 * パス構造 (/poe2/Leagues 等) は同じなのでホストだけ差し替え。
 *
 * 2026-05-19 hotfix: poe2scout が Access-Control-Allow-Origin を返さないため、
 * Tauri WebView の fetch だと CORS で弾かれる。本番ビルドでは
 * @tauri-apps/plugin-http の fetch (Rust 経由、CORS 不問) を使う。
 * dev では Vite proxy 経由で CORS 回避済なので native fetch を使う。
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { exchangeGroupIdOf, exchangeSubJaOf } from "../i18n/currency-exchange";

const BASE = import.meta.env.DEV
  ? "/api/poe2scout"
  : "https://api.poe2scout.com";

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
 * そのリーグで一番古いスナップショットの実時刻(Epoch秒) = リーグ開始 (2026-09-16、取引履歴のグラフ用)。
 * SnapshotHistory は 1 時間刻みで、リーグ 1 本分 (数百件) が 1 リクエストで全部返る。取得失敗時は null。
 */
export async function fetchLeagueStartEpoch(leagueName: string): Promise<number | null> {
  try {
    const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotHistory?Limit=5000`;
    const res = await httpFetch(url, NO_STORE);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const arr: unknown = Array.isArray(data)
      ? data
      : data && typeof data === "object"
        ? Object.values(data).find((v) => Array.isArray(v))
        : null;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    let oldest = Number.POSITIVE_INFINITY;
    for (const row of arr) {
      const ep = row && typeof row === "object" ? (row as Record<string, unknown>).Epoch : null;
      if (typeof ep === "number" && ep > 0) oldest = Math.min(oldest, ep);
    }
    return Number.isFinite(oldest) ? oldest : null;
  } catch {
    return null;
  }
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

/**
 * カレンシー取引所のペア 1 組の最新レート (2026-09-16)。
 *
 * オーナー指摘「取引所だとレートあるんじゃない？」のとおり、ペアごとに実レートが入っている。
 * `RelativePrice` はリーグの基準通貨 (高貴) 換算の値で、同じ素材でも「何で買うか」で変わる
 * (実測: ヴァールは カオス経由 4.32 / 高貴経由 4.47)。`HighestStock` は板の厚み。
 */
export interface PairRate {
  /** 素材 1 個の高貴換算 (このペアでの値) */
  onePrice: number;
  /** 支払い通貨 1 個の高貴換算 (このペアでの値) */
  twoPrice: number;
  /** 板の厚み。薄いペアは値が壊れるので呼び側で弾く (実測: 原石 lv17 × 高貴 は高貴側 在庫 25 で値が 3 倍ずれた) */
  oneStock: number;
  twoStock: number;
  oneVolume: number;
  twoVolume: number;
}

export async function fetchPairRate(
  leagueName: string,
  oneItemId: number,
  twoItemId: number,
): Promise<PairRate | null> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/Currencies/Pairs/${oneItemId}/${twoItemId}/History?limit=1`;
  const res = await httpFetch(url, NO_STORE);
  if (!res.ok) return null;
  type Side = { RelativePrice?: number; HighestStock?: number; VolumeTraded?: number };
  const body = (await res.json()) as { History?: Array<{ Data?: { CurrencyOneData?: Side; CurrencyTwoData?: Side } }> };
  const d = body.History?.[0]?.Data;
  const one = d?.CurrencyOneData;
  const two = d?.CurrencyTwoData;
  const onePrice = one?.RelativePrice;
  const twoPrice = two?.RelativePrice;
  if (typeof onePrice !== "number" || typeof twoPrice !== "number" || onePrice <= 0 || twoPrice <= 0) return null;
  return {
    onePrice,
    twoPrice,
    oneStock: one?.HighestStock ?? 0,
    twoStock: two?.HighestStock ?? 0,
    oneVolume: one?.VolumeTraded ?? 0,
    twoVolume: two?.VolumeTraded ?? 0,
  };
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
  /** 表示上のグループ: ゲーム内取引所の分類 (`x:Currency` 等)。取引所に無ければ categoryApiId (2026-09-09) */
  groupId: string;
  /** 取引所のサブカテゴリ (例 "グレータールーン")。無ければ null */
  subJa: string | null;
  /** 1 アイテム = ? 高貴(Exalted)。= CurrentPrice */
  exaltedPrice: number;
  /** 1 アイテム = ? 神(Divine) */
  divinePrice: number;
  /** 1 アイテム = ? カオス(Chaos) */
  chaosPrice: number;
  /**
   * 一番安く交換できる通貨 (カオスと神のペアで安い方)。取引所のペアが薄い / 無い時は null (2026-09-26)。
   * オーナー:「カオスと神でどっちが安いか。神で交換よりカオスで交換した方が良いならそっちの通貨で」
   */
  bestPay?: BestPay | null;
}

export interface BestPay {
  currency: "chaos" | "divine";
  /** 1 個 = ? その通貨 */
  perUnit: number;
  /** 1 個 = ? 高貴 (このペアでの値) */
  exalted: number;
}

/** SnapshotPairs の片側 */
interface SnapshotSide {
  RelativePrice: number | string;
  HighestStock: number | string;
  VolumeTraded: number | string;
}
interface SnapshotPairRow {
  CurrencyOne: { ApiId: string | null };
  CurrencyTwo: { ApiId: string | null };
  CurrencyOneData: SnapshotSide;
  CurrencyTwoData: SnapshotSide;
}

/** 最新スナップショットの全ペア (1 回で全部。2026-09-26 カレンシーランキングの「一番安く交換できる通貨」用) */
export async function fetchSnapshotPairs(leagueName: string): Promise<SnapshotPairRow[]> {
  const url = `${BASE}/poe2/Leagues/${encodeURIComponent(leagueName)}/SnapshotPairs`;
  const res = await httpFetch(url, NO_STORE);
  if (!res.ok) throw new Error(`SnapshotPairs request failed: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body) ? (body as SnapshotPairRow[]) : [];
}

/**
 * 板が薄いペアは値が壊れるので使わない (services/trade2/exchange.ts と同じ線)。
 * 相場の半分を下回る値も壊れた板とみなす
 */
const PAIR_MIN_STOCK = 10;
const PAIR_MIN_VOLUME = 5;
const PAIR_SANE_FLOOR = 0.5;

/**
 * 全ペアから、アイテムごとに「カオスと神のどちらで買うと安いか」を決める。
 * ペア内の値 (RelativePrice) は高貴建て。支払う量は画面共通の換算レートで出す (exchange.ts と同じ)。
 * @param exaltedPer 1 カオス / 1 神 = ? 高貴
 */
export function bestPayByApiId(
  pairs: SnapshotPairRow[],
  market: Map<string, number>,
  exaltedPer: { chaos: number; divine: number },
): Map<string, BestPay> {
  const num = (v: number | string | undefined) => (typeof v === "number" ? v : Number(v ?? NaN));
  const out = new Map<string, BestPay>();
  for (const p of pairs) {
    const a = p.CurrencyOne?.ApiId, b = p.CurrencyTwo?.ApiId;
    if (!a || !b) continue;
    const payIsTwo = b === "chaos" || b === "divine";
    const payIsOne = a === "chaos" || a === "divine";
    if (payIsOne === payIsTwo) continue; // 素材同士 / 基本通貨同士は見ない
    const item = payIsTwo ? a : b;
    const currency = (payIsTwo ? b : a) as BestPay["currency"];
    const itemSide = payIsTwo ? p.CurrencyOneData : p.CurrencyTwoData;
    const paySide = payIsTwo ? p.CurrencyTwoData : p.CurrencyOneData;
    const price = num(itemSide?.RelativePrice);
    if (!(price > 0)) continue;
    if (num(itemSide.HighestStock) < PAIR_MIN_STOCK || num(paySide?.HighestStock) < PAIR_MIN_STOCK) continue;
    if (num(itemSide.VolumeTraded) < PAIR_MIN_VOLUME || num(paySide?.VolumeTraded) < PAIR_MIN_VOLUME) continue;
    const m = market.get(item);
    if (m != null && m > 0 && price < m * PAIR_SANE_FLOOR) continue;
    const rate = exaltedPer[currency];
    if (!(rate > 0)) continue;
    const cand: BestPay = { currency, perUnit: price / rate, exalted: price };
    const cur = out.get(item);
    if (!cur || cand.exalted < cur.exalted) out.set(item, cand);
  }
  return out;
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
      groupId: exchangeGroupIdOf(x.Text) ?? x.CategoryApiId,
      subJa: exchangeSubJaOf(x.Text),
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
