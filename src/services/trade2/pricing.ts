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

/**
 * 擬似レート制限 (オーナー指示 2026-09-13「本番で制限に引っかかる前にこっちで疑似制限を」):
 * search の送信時刻を窓ごとに数え、サーバーの上限 (5/10s, 15/60s, 30/300s) より少し手前で自分から待つ。
 * 余裕を残すのは、同じ IP でオーナーがトレードサイトを手で検索した分をこちらが数えられないため。
 * 記録は localStorage に残す (アプリを立ち上げ直してもサーバー側の窓は続いている)。
 */
const SEARCH_BUDGET: ReadonlyArray<{ windowMs: number; max: number }> = [
  { windowMs: 10_000, max: 4 },
  { windowMs: 60_000, max: 12 },
  { windowMs: 300_000, max: 26 },
];
const SEARCH_LOG_KEY = "exiledesk.trade2.searchLog";
let searchLog: number[] = loadSearchLog();
function loadSearchLog(): number[] {
  try {
    const raw = localStorage.getItem(SEARCH_LOG_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    const cutoff = Date.now() - 300_000;
    return Array.isArray(arr) ? arr.filter((t): t is number => typeof t === "number" && t > cutoff) : [];
  } catch {
    return [];
  }
}
function recordSearch(at: number): void {
  searchLog = searchLog.filter((t) => t > at - 300_000);
  searchLog.push(at);
  try {
    localStorage.setItem(SEARCH_LOG_KEY, JSON.stringify(searchLog));
  } catch {
    /* 保存できなくても動く */
  }
}
/**
 * サーバーの実カウントに合わせた待ち (2026-09-14)。trade2 は毎回
 *   x-rate-limit-ip: "5:10:60,15:60:300,30:300:1800" (上限:窓秒:罰則秒)
 *   x-rate-limit-ip-state: "3:10:0,9:60:0,20:300:0" (現在数:窓秒:残りの罰則秒)
 * を返す。自前の記録は同じ IP の手動検索を数えられず 429 を踏んだ (2026-09-14) ので、
 * ヘッダの現在数が上限に近ければその窓の長さぶん待ち、罰則が残っていればその秒数待つ。
 */
type RateKind = "search" | "fetch";
const SERVER_BLOCK_KEY = "exiledesk.trade2.serverBlockedUntil";
const serverBlockedUntil: Record<RateKind, number> = loadServerBlock();
function loadServerBlock(): Record<RateKind, number> {
  try {
    const raw = localStorage.getItem(SERVER_BLOCK_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Record<RateKind, number>>) : {};
    return { search: Number(v.search) || 0, fetch: Number(v.fetch) || 0 };
  } catch {
    return { search: 0, fetch: 0 };
  }
}
export function syncRateLimit(kind: RateKind, headers: Record<string, string> | null | undefined): void {
  if (!headers) return;
  const now = Date.now();
  let until = serverBlockedUntil[kind];
  for (const [name, rules] of Object.entries(headers)) {
    const m = name.toLowerCase().match(/^x-rate-limit-(ip|account)$/);
    if (!m) continue;
    const state = headers[`${name}-state`] ?? headers[`x-rate-limit-${m[1]}-state`];
    if (!state) continue;
    const r = rules.split(",").map((x) => x.split(":").map(Number));
    const st = state.split(",").map((x) => x.split(":").map(Number));
    r.forEach(([max, period], i) => {
      const [cur, , restricted] = st[i] ?? [];
      if (!Number.isFinite(max) || !Number.isFinite(cur)) return;
      if (restricted > 0) until = Math.max(until, now + restricted * 1000);
      // 余裕: 上限 15 以上の窓は 2、それ未満は 1 残して止める
      const margin = max >= 15 ? 2 : 1;
      if (cur >= max - margin) until = Math.max(until, now + period * 1000);
    });
  }
  if (until !== serverBlockedUntil[kind]) {
    serverBlockedUntil[kind] = until;
    try {
      localStorage.setItem(SERVER_BLOCK_KEY, JSON.stringify(serverBlockedUntil));
    } catch {
      /* 保存できなくても動く */
    }
  }
}
/** 429 のエラー文字列 ("... ratelimit={...}: ...") からヘッダを取り出して同期する */
export function syncRateLimitFromError(kind: RateKind, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/ratelimit=(\{[^}]*\})/);
  if (!m) return;
  try {
    syncRateLimit(kind, JSON.parse(m[1]) as Record<string, string>);
  } catch {
    /* 形式が違えば無視 */
  }
}
function withSync<T>(kind: RateKind, p: Promise<T>): Promise<T> {
  return p.then(
    (res) => {
      const rl = (res as unknown as { _ratelimit?: Record<string, string> })?._ratelimit;
      syncRateLimit(kind, rl);
      return res;
    },
    (err) => {
      syncRateLimitFromError(kind, err);
      throw err;
    },
  );
}

/** 窓の予算から見て、次の search を送れる最も早い時刻 (ms) */
function budgetAllowedAt(now: number): number {
  let at = now;
  for (const b of SEARCH_BUDGET) {
    const inWindow = searchLog.filter((t) => t > now - b.windowMs);
    if (inWindow.length >= b.max) {
      // 一番古い物が窓から出た瞬間に 1 枠空く
      const oldest = inWindow[inWindow.length - b.max];
      at = Math.max(at, oldest + b.windowMs + 200);
    }
  }
  return at;
}

/** 次に search を送れる時刻 (ms) = 最小間隔と窓の予算の遅い方。画面の「再取得まで N 秒」表示用 */
export function nextSearchAllowedAt(): number {
  const now = Date.now();
  const last = searchLog.length ? searchLog[searchLog.length - 1] : lastRequestAt.search;
  return Math.max(last + SEARCH_INTERVAL_MS, budgetAllowedAt(now), serverBlockedUntil.search);
}
/** 直近 5 分の search 回数と上限 (画面表示用) */
export function searchBudgetUsage(): { used: number; max: number } {
  const now = Date.now();
  return { used: searchLog.filter((t) => t > now - 300_000).length, max: SEARCH_BUDGET[SEARCH_BUDGET.length - 1].max };
}

/** 直列化 + エンドポイント別の最小間隔ガード (+ search は窓の予算) */
function throttled<T>(kind: "search" | "fetch", fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (kind === "search") {
      // 予算が空くまで待つ (待ち中に他の search は直列なので増えない)
      for (;;) {
        const wait = nextSearchAllowedAt() - Date.now();
        if (wait <= 0) break;
        await new Promise((r) => setTimeout(r, Math.min(wait, 5_000)));
      }
      const at = Date.now();
      lastRequestAt.search = at;
      recordSearch(at);
      return fn();
    }
    const wait = Math.max(lastRequestAt.fetch + FETCH_INTERVAL_MS, serverBlockedUntil.fetch) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt.fetch = Date.now();
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
  const rl: Record<string, string> = {};
  r.headers.forEach((v, k) => {
    if (k.toLowerCase().startsWith("x-rate-limit-")) rl[k.toLowerCase()] = v;
  });
  if (r.status === 429) throw new Error(`HTTP 429 retry-after=${r.headers.get("retry-after") ?? "60"} ratelimit=${JSON.stringify(rl)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const body = (await r.json()) as T;
  if (body && typeof body === "object") (body as unknown as { _ratelimit?: Record<string, string> })._ratelimit = rl;
  return body;
}

async function searchOnce(league: string, body: unknown): Promise<Trade2SearchResponse> {
  // JP サイト設定なら JP の API に日本語名で投げる (検索 ID を JP サイトで開けるようにする)
  const site = trade2Site();
  const query = localizeQueryForSite(body);
  if (DEV_TRADE) {
    return withSync(
      "search",
      throttled("search", () =>
        devJson<Trade2SearchResponse>(`/api/trade2-${site}/search/poe2/${encodeURIComponent(league)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(query),
        }),
      ),
    );
  }
  return withSync("search", throttled("search", () => invoke<Trade2SearchResponse>("trade2_search", { req: { league, query, site } })));
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
    ? await withSync("fetch", throttled("fetch", () => devJson<FetchResponse>(`/api/trade2-${site}/fetch/${ids.join(",")}?query=${encodeURIComponent(search.id!)}`)))
    : await withSync("fetch", throttled("fetch", () => invoke<FetchResponse>("trade2_fetch", { req: { ids, queryId: search.id, site } })));
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
