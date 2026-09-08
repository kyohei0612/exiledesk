/**
 * trade2 で「この条件の装備の最安値」を調べる (クラフト収支用、2026-09-07)
 *
 *   search (条件 → listing ID 列 + total) → fetch (先頭 10 件の詳細) → 価格を高貴 (Exalted) 建てに正規化 → 最安
 *
 * レート制限: trade2 は search / fetch とも短時間の連打で 429 を返す。Rust 側 (trade2.rs) は
 * proxy のみで throttle しないので、ここで直列化 + 最小間隔を守る (実測 2〜3 秒間隔なら安定)。
 */

import { invoke } from "@tauri-apps/api/core";
import { Rarity, SecurityStatus } from "../../constants/trade2";
import { trade2QueryUrl } from "./league";
import type { Trade2SearchResponse, Trade2StatFilter } from "./query";

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

export interface PriceQueryInput {
  /** trade2 のリーグ名 (例 "Forbidden Rites") */
  league: string;
  /** 完全一致させるベース名 (英語)。null なら category のみ */
  baseTypeEn: string | null;
  /** type_filters.category.option (baseTypeEn が無いとき / 0 件時のフォールバック) */
  category: string | null;
  rarity: "rare" | "magic";
  stats: Trade2StatFilter[];
}

/**
 * 同じ条件でトレードサイトを開く URL (API を叩かない)。ベース名があればベース完全一致、無ければカテゴリ。
 * 「鑑定」ボタン用: レート制限を消費せずに出品一覧を目で見る。
 */
export function priceQueryUrl(input: PriceQueryInput): string {
  const useBase = !!input.baseTypeEn;
  return trade2QueryUrl(input.league, buildQuery(input, useBase));
}

function buildQuery(input: PriceQueryInput, useBase: boolean) {
  const typeFilters: Record<string, unknown> = {
    rarity: { option: input.rarity === "rare" ? Rarity.Rare : Rarity.Magic },
  };
  if (!useBase && input.category) typeFilters.category = { option: input.category };
  const query: Record<string, unknown> = {
    status: { option: SecurityStatus.Securable },
    stats: [{ type: "and", filters: input.stats }],
    filters: { type_filters: { filters: typeFilters } },
  };
  if (useBase && input.baseTypeEn) query.type = { discriminator: null, option: input.baseTypeEn };
  return { query, sort: { price: "asc" } };
}

interface FetchResponse {
  result?: Array<{
    item?: { name?: string; typeLine?: string; ilvl?: number };
    listing?: { account?: { name?: string }; price?: { amount?: number; currency?: string } };
  }>;
}

/**
 * 最安値を調べる。ベース完全一致で 0 件ならカテゴリで再検索する。
 * 各 search / fetch は throttled で直列化される (同時に複数呼んでも安全)。
 */
export async function priceMinListing(input: PriceQueryInput, rates: ExaltedRates): Promise<PriceResult> {
  const attempts: boolean[] = [];
  if (input.baseTypeEn) attempts.push(true);
  if (input.category) attempts.push(false);
  if (attempts.length === 0) throw new Error("ベース名もカテゴリも無いので検索できません");

  let search: Trade2SearchResponse = {};
  let usedBase = true;
  for (const useBase of attempts) {
    usedBase = useBase;
    const body = buildQuery(input, useBase);
    search = await throttled("search", () => invoke<Trade2SearchResponse>("trade2_search", { req: { league: input.league, query: body } }));
    if ((search.total ?? 0) > 0) break;
  }
  const searchUrl = search.id
    ? `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(input.league)}/${search.id}`
    : "";
  const ids = (search.result ?? []).slice(0, FETCH_TOP_N);
  if (ids.length === 0 || !search.id) {
    return { total: search.total ?? 0, minExalted: null, listings: [], searchUrl };
  }
  const fetched = await throttled("fetch", () => invoke<FetchResponse>("trade2_fetch", { req: { ids, queryId: search.id } }));
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
  void usedBase;
  return {
    total: search.total ?? 0,
    minExalted: finite.length ? Math.min(...finite) : null,
    listings: listings.sort((a, b) => a.amountExalted - b.amountExalted),
    searchUrl,
  };
}
