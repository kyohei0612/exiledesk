/**
 * trade2 で「この条件の装備の最安値」を調べる (クラフト収支用、2026-09-07)
 *
 *   search (条件 → listing ID 列 + total) → fetch (先頭 10 件の詳細) → 価格を高貴 (Exalted) 建てに正規化 → 最安
 *
 * レート制限: trade2 は search / fetch とも短時間の連打で 429 を返す。Rust 側 (trade2.rs) は
 * proxy のみで throttle しないので、ここで直列化 + 最小間隔を守る (実測 2〜3 秒間隔なら安定)。
 */

import { invoke } from "@tauri-apps/api/core";
import { trade2Site, trade2SiteOrigin } from "./league";
import { localizeQueryForSite } from "./localize";
import type { Trade2SearchResponse } from "./query";

/**
 * 連続リクエストの最小間隔 (ms)。search と fetch は別ポリシーなので別々に数える。
 * 2026-09-08 実測 (X-Rate-Limit-Ip, policy trade-search-request-limit):
 *   search = 5:10:60, 15:60:300, 30:300:1800, 600:21600:3600
 *   → 5 分で 30 回を超えると 30 分ペナルティ。2.5 秒間隔だと 75 秒で 429 (Retry-After 600) を食らった。
 * 一括調査 (20 件超) を通すには search を 10 秒間隔にする必要がある (30 回 / 300 秒ちょうど)。
 */
const SEARCH_INTERVAL_MS = 10500;
const FETCH_INTERVAL_MS = 2500;

/** trade2.rs が返す 429 エラー文字列 ("... HTTP 429 retry-after=600: ...") から待ち秒数を取り出す。429 でなければ null */
export function retryAfterSeconds(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/HTTP 429 retry-after=(\d+)/);
  return m ? Number(m[1]) : null;
}
/** fetch で見る listing 数 (trade2 の上限 = 10) */
const FETCH_TOP_N = 10;

const lastRequestAt = { search: 0, fetch: 0 };
let chain: Promise<unknown> = Promise.resolve();

/** 直列化 + エンドポイント別の最小間隔ガード */
function throttled<T>(kind: "search" | "fetch", fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const interval = kind === "search" ? SEARCH_INTERVAL_MS : FETCH_INTERVAL_MS;
    const wait = lastRequestAt[kind] + interval - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt[kind] = Date.now();
    return fn();
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** 通貨 → 高貴 (Exalted) 換算レート。exalted=1、divine / chaos は poe2scout のリーグ情報、他は poe2scout の価格表 */
export interface ExaltedRates {
  /** 1 神 = ? 高貴 */
  divine: number;
  /** 1 カオス = ? 高貴 */
  chaos: number;
  /** その他通貨 (trade2 の currency id = poe2scout の ApiId) → 高貴 */
  others?: Record<string, number>;
}

function toExalted(amount: number, currency: string, rates: ExaltedRates): number | null {
  switch (currency) {
    case "exalted":
      return amount;
    case "divine":
      return amount * rates.divine;
    case "chaos":
      return amount * rates.chaos;
    default: {
      const r = rates.others?.[currency];
      return r ? amount * r : null;
    }
  }
}

export interface PriceListing {
  amountExalted: number;
  amount: number;
  currency: string;
  account: string;
  /** trade2 の item.name + typeLine */
  itemName: string;
  ilvl: number | null;
}

export interface PriceResult {
  total: number;
  /** 高貴建て最安 (換算不能な通貨のみだった場合 null) */
  minExalted: number | null;
  listings: PriceListing[];
  /** trade2 サイトで同じ検索を開く URL */
  searchUrl: string;
}

interface FetchResponse {
  result?: Array<{
    item?: { name?: string; typeLine?: string; ilvl?: number };
    listing?: { account?: { name?: string }; price?: { amount?: number; currency?: string } };
  }>;
}

/** 検索 1 回 (直列化 + 間隔ガード) */
/**
 * dev (vite) では Tauri が無いので、vite のプロキシ (/api/trade2-www, /api/trade2-jp) 経由で直接叩く。
 * 本番は Rust の trade2_search / trade2_fetch。429 は Rust 側と同じ "HTTP 429 retry-after=N" 形式で投げる。
 */
const DEV_TRADE = import.meta.env.DEV;
async function devJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (r.status === 429) throw new Error(`HTTP 429 retry-after=${r.headers.get("retry-after") ?? "60"}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

async function searchOnce(league: string, body: unknown): Promise<Trade2SearchResponse> {
  // JP サイト設定なら JP の API に日本語名で投げる (検索 ID を JP サイトで開けるようにする)
  const site = trade2Site();
  const query = localizeQueryForSite(body);
  if (DEV_TRADE) {
    return throttled("search", () =>
      devJson<Trade2SearchResponse>(`/api/trade2-${site}/search/poe2/${encodeURIComponent(league)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      }),
    );
  }
  return throttled("search", () => invoke<Trade2SearchResponse>("trade2_search", { req: { league, query, site } }));
}

/** search 結果の先頭 N 件を fetch して最安 (高貴建て) をまとめる */
async function fetchListings(league: string, search: Trade2SearchResponse, rates: ExaltedRates): Promise<PriceResult> {
  const searchUrl = search.id
    ? `${trade2SiteOrigin()}/trade2/search/poe2/${encodeURIComponent(league)}/${search.id}`
    : "";
  const ids = (search.result ?? []).slice(0, FETCH_TOP_N);
  if (ids.length === 0 || !search.id) {
    return { total: search.total ?? 0, minExalted: null, listings: [], searchUrl };
  }
  const site = trade2Site();
  const fetched = DEV_TRADE
    ? await throttled("fetch", () => devJson<FetchResponse>(`/api/trade2-${site}/fetch/${ids.join(",")}?query=${encodeURIComponent(search.id!)}`))
    : await throttled("fetch", () => invoke<FetchResponse>("trade2_fetch", { req: { ids, queryId: search.id, site } }));
  const listings: PriceListing[] = [];
  for (const r of fetched.result ?? []) {
    const amount = r.listing?.price?.amount;
    const currency = r.listing?.price?.currency;
    if (typeof amount !== "number" || !currency) continue;
    const ex = toExalted(amount, currency, rates);
    listings.push({
      amountExalted: ex ?? Number.POSITIVE_INFINITY,
      amount,
      currency,
      account: r.listing?.account?.name ?? "",
      itemName: [r.item?.name, r.item?.typeLine].filter(Boolean).join(" "),
      ilvl: r.item?.ilvl ?? null,
    });
  }
  const finite = listings.filter((l) => Number.isFinite(l.amountExalted)).map((l) => l.amountExalted);
  return {
    total: search.total ?? 0,
    minExalted: finite.length ? Math.min(...finite) : null,
    listings: listings.sort((a, b) => a.amountExalted - b.amountExalted),
    searchUrl,
  };
}

/**
 * 任意の検索クエリ (buildGemQuery 等) の最安値。search 1 回 + fetch 1 回。
 * ジェムコラプト収支 (2026-09-12) 用。
 */
export async function priceMinForQuery(league: string, body: unknown, rates: ExaltedRates): Promise<PriceResult> {
  const search = await searchOnce(league, body);
  return fetchListings(league, search, rates);
}
