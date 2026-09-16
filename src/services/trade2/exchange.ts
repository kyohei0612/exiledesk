/**
 * カレンシー取引所 (exchange) の実レート (2026-09-16)
 *
 * オーナー指示「たまにカオスで買った方が安いとかあるからね」: 素材ごとに 高貴 / カオス / 神 のどれで買うのが
 * 一番安いかを、公式の取引所の出品から取る。poe2scout の相場は高貴建て 1 本 (基準通貨を変えても中身は同じ) なので、
 * 通貨ごとの差はそこからは出せない。
 *
 * 制限: 検索 (search) とは別枠。実測の IP 制限は 15 秒 5 回 / 90 秒 10 回 / 5 分 30 回なので、
 * 1 回ずつ余裕を残して自分から待つ。結果は 30 分そのまま使う (localStorage)。
 */
import { invoke } from "@tauri-apps/api/core";
import { trade2Site } from "./league";

export const PAY_CURRENCIES = ["exalted", "chaos", "divine"] as const;
export type PayCurrency = (typeof PAY_CURRENCIES)[number];

export interface ExchangeRate {
  currency: PayCurrency;
  /** 1 個買うのに払う量 (その通貨建て) */
  perUnit: number;
  /** その出品の在庫 */
  stock: number;
}
export interface ExchangeBest {
  apiId: string;
  /** 通貨ごとの一番安い出品 */
  rates: ExchangeRate[];
  fetchedAt: number;
}

/** 在庫がこれ以上ある出品を優先する (在庫 1 の極端な出品に引っ張られないように) */
const MIN_STOCK = 10;
const CACHE_KEY = "exiledesk.trade2.exchangeRates";
const LOG_KEY = "exiledesk.trade2.exchangeLog";
const FRESH_MS = 30 * 60 * 1000;
/** 自分に課す窓 (回数, 窓の長さ)。サーバーは 5:15 / 10:90 / 30:300 */
const WINDOWS: Array<[number, number]> = [
  [4, 15_000],
  [9, 90_000],
  [26, 300_000],
];

type Cache = Record<string, ExchangeBest>;

function loadCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Cache;
  } catch {
    return {};
  }
}
function saveCache(c: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* 保存できなくても動く */
  }
}
function loadLog(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as number[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveLog(log: number[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch {
    /* 保存できなくても動く */
  }
}

let blockedUntil = 0;

/** 次に取引所を叩ける時刻 (ms) */
export function nextExchangeAllowedAt(): number {
  const now = Date.now();
  const log = loadLog().filter((t) => t > now - 300_000);
  let at = Math.max(now, blockedUntil);
  for (const [max, windowMs] of WINDOWS) {
    const inWindow = log.filter((t) => t > now - windowMs);
    if (inWindow.length >= max) at = Math.max(at, inWindow[inWindow.length - max] + windowMs + 500);
  }
  return at;
}

function recordCall(): void {
  const now = Date.now();
  saveLog([...loadLog().filter((t) => t > now - 300_000), now]);
}

/** 応答の x-rate-limit-* から締め出し中なら待つ */
function syncBlock(rl: Record<string, string> | undefined): void {
  if (!rl) return;
  const now = Date.now();
  for (const scope of ["ip", "account"]) {
    const rules = rl[`x-rate-limit-${scope}`]?.split(",") ?? [];
    const states = rl[`x-rate-limit-${scope}-state`]?.split(",") ?? [];
    rules.forEach((rule, i) => {
      const [, period] = rule.split(":").map(Number);
      const [, , restricted] = (states[i] ?? "").split(":").map(Number);
      if (restricted > 0) blockedUntil = Math.max(blockedUntil, now + Math.max(restricted, period || 0) * 1000);
    });
  }
}

interface ExchangeResponse {
  result?: Record<
    string,
    { listing?: { offers?: Array<{ exchange?: { currency?: string; amount?: number }; item?: { currency?: string; amount?: number; stock?: number } }> } }
  >;
  _ratelimit?: Record<string, string>;
}

const DEV = import.meta.env.DEV;

async function post(league: string, apiId: string): Promise<ExchangeResponse> {
  const query = {
    query: { status: { option: "online" }, have: [...PAY_CURRENCIES], want: [apiId] },
    sort: { have: "asc" },
    engine: "new",
  };
  const site = trade2Site();
  if (DEV) {
    const r = await fetch(`/api/trade2-${site}/exchange/${encodeURIComponent(league)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    const rl: Record<string, string> = {};
    r.headers.forEach((v, k) => {
      if (k.toLowerCase().startsWith("x-rate-limit-")) rl[k.toLowerCase()] = v;
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = (await r.json()) as ExchangeResponse;
    body._ratelimit = rl;
    return body;
  }
  return invoke<ExchangeResponse>("trade2_exchange", { req: { league, site, query } });
}

/** 出品から通貨ごとの一番安い単価を出す */
export function parseBest(apiId: string, body: ExchangeResponse): ExchangeRate[] {
  const best = new Map<PayCurrency, ExchangeRate>();
  const fallback = new Map<PayCurrency, ExchangeRate>();
  for (const v of Object.values(body.result ?? {})) {
    for (const off of v.listing?.offers ?? []) {
      const pay = off.exchange;
      const get = off.item;
      if (!pay?.currency || !pay.amount || !get?.amount || get.currency !== apiId) continue;
      const cur = pay.currency as PayCurrency;
      if (!PAY_CURRENCIES.includes(cur)) continue;
      const perUnit = pay.amount / get.amount;
      if (!Number.isFinite(perUnit) || perUnit <= 0) continue;
      const stock = get.stock ?? 0;
      const rate: ExchangeRate = { currency: cur, perUnit, stock };
      const table = stock >= MIN_STOCK ? best : fallback;
      const cur0 = table.get(cur);
      if (!cur0 || perUnit < cur0.perUnit) table.set(cur, rate);
    }
  }
  // 在庫がある出品を優先し、無ければ在庫が少ない出品で埋める
  for (const [cur, rate] of fallback) if (!best.has(cur)) best.set(cur, rate);
  return [...best.values()].sort((a, b) => a.perUnit - b.perUnit);
}

/** キャッシュにある分だけ返す (取りに行かない) */
export function cachedBest(apiId: string): ExchangeBest | null {
  const c = loadCache()[apiId];
  return c && Date.now() - c.fetchedAt < FRESH_MS ? c : null;
}

/** 1 素材ぶん取る (キャッシュが新しければ何もしない)。窓が空くまで待つ */
export async function fetchBest(league: string, apiId: string): Promise<ExchangeBest | null> {
  const hit = cachedBest(apiId);
  if (hit) return hit;
  for (;;) {
    const wait = nextExchangeAllowedAt() - Date.now();
    if (wait <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5_000)));
  }
  recordCall();
  const body = await post(league, apiId);
  syncBlock(body._ratelimit);
  const rates = parseBest(apiId, body);
  const entry: ExchangeBest = { apiId, rates, fetchedAt: Date.now() };
  const cache = loadCache();
  cache[apiId] = entry;
  saveCache(cache);
  return entry;
}
