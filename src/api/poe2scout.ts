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
 *
 * 2026-09-26: 接続設定 / 型 / 整形 / 価格履歴は poe2scout/ 以下に分割 (ここから再 export)。
 */
import { BASE, httpFetch, NO_STORE } from "./poe2scout/http";
import type { CurrencyItem, League } from "./poe2scout/types";

export * from "./poe2scout/types";
export * from "./poe2scout/rank";
export * from "./poe2scout/history";

// =================== 取得関数 ===================

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
