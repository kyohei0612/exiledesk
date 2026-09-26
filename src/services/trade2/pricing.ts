/**
 * trade2 で「この条件の装備の最安値」を調べる (クラフト収支用、2026-09-07)
 *
 *   search (条件 → listing ID 列 + total) → fetch (先頭 10 件の詳細) → 価格を高貴 (Exalted) 建てに正規化 → 最安
 *
 * レート制限: 本番 (Tauri) は Rust 側の門番 (trade2.rs gate_acquire) が上限ヘッダを見て待つので、
 * ここは直列化と「再取得まで N 秒」の表示用の記録だけ (2026-09-18 に二重待ちをやめた)。
 * 開発時 (vite のプロキシで直接叩く) だけ、ここで最小間隔と窓の予算を守る。
 *
 * 2026-09-26: 門番の写しと直列化 (pricing/gate.ts)、出品の取得と換算 (pricing/listings.ts) に分割 (ここから再 export)。
 */

import { fetchListings, searchOnce, FETCH_TOP_N, type ExaltedRates, type PriceResult } from "./pricing/listings";

export {
  retryAfterSeconds,
  isBudgetWait,
  noteGateState,
  gatePenaltyUntilMs,
  nextSearchAllowedAt,
  searchBudgetUsage,
  type GateState,
} from "./pricing/gate";
export { toExalted, type ExaltedRates, type PriceListing, type PriceResult } from "./pricing/listings";

/**
 * 任意の検索クエリ (buildGemQuery 等) の最安値。search 1 回 + fetch 1 回。
 * ジェムコラプト収支 (2026-09-12) 用。
 */
export async function priceMinForQuery(league: string, body: unknown, rates: ExaltedRates, topN = FETCH_TOP_N): Promise<PriceResult> {
  const search = await searchOnce(league, body);
  return fetchListings(league, search, rates, topN);
}
