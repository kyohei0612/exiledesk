/**
 * 取引履歴 (マーチャント履歴) の連動 (2026-09-16) — Tauri ラッパと履歴の蓄積
 *
 * Rust (trade_history.rs) がアプリ内ログインの POESESSID で、サイトと同じ履歴 API を読む (非公式 API)。
 * API が返すのは直近の分だけなので、取れた物をこの PC (localStorage) に足していき、API から消えた古い分も残す。
 * 取得は 5 分に 1 回まで。429 (制限中) の時はサーバーの retry-after に従う (XileHUD は既定 15 分間隔)。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../utils/isTauriRuntime";

export type Game = "poe2" | "poe1";

/** 履歴 1 件 (表示に要る分だけに絞って保存する) */
export interface TradeEntry {
  key: string;
  /** 売れた時刻 (ms) */
  time: number;
  amount: number | null;
  currency: string | null;
  name: string;
  typeLine: string;
  icon: string | null;
  rarity: string;
  stack: number | null;
  ilvl: number | null;
}

interface Stored {
  entries: TradeEntry[];
  lastFetchAt: number;
  nextAllowedAt: number;
}

export interface FetchOutcome {
  ok: boolean;
  added: number;
  message: string;
}

/** 取得の最短間隔 */
export const MIN_INTERVAL_MS = 5 * 60 * 1000;

const keyOf = (game: Game, league: string): string => `exiledesk.trade-history.${game}.${league}`;

export function loadStored(game: Game, league: string): Stored {
  try {
    const raw = localStorage.getItem(keyOf(game, league));
    if (raw) {
      const s = JSON.parse(raw) as Partial<Stored>;
      return { entries: Array.isArray(s.entries) ? s.entries : [], lastFetchAt: s.lastFetchAt ?? 0, nextAllowedAt: s.nextAllowedAt ?? 0 };
    }
  } catch {
    /* 読めなくても動く */
  }
  return { entries: [], lastFetchAt: 0, nextAllowedAt: 0 };
}

function save(game: Game, league: string, s: Stored): void {
  try {
    localStorage.setItem(keyOf(game, league), JSON.stringify(s));
  } catch {
    /* 容量超過などで保存できなくても表示は続ける */
  }
}

export async function sessionLoggedIn(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const r = await invoke<{ logged_in: boolean }>("trade_history_session");
  return r.logged_in;
}

export async function openLogin(): Promise<void> {
  await invoke("trade_history_login");
}

export async function logout(): Promise<void> {
  await invoke("trade_history_logout");
}

export async function tradeLeagues(game: Game): Promise<string[]> {
  if (!isTauriRuntime()) return [];
  return invoke<string[]>("trade_history_leagues", { game });
}

/** ログイン用ウィンドウが閉じられた時 */
export function onLoginClosed(cb: () => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return Promise.resolve(() => {});
  return listen("trade-history-login-closed", cb);
}

const RARITY_BY_FRAME: Record<number, string> = { 0: "Normal", 1: "Magic", 2: "Rare", 3: "Unique", 4: "Gem", 5: "Currency" };

function toMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw < 2_000_000_000 ? raw * 1000 : raw;
  if (typeof raw === "string" && raw.trim()) {
    const p = Date.parse(raw);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

/** API の 1 件を表示用に絞る (形が変わっても落ちないよう、ありそうなキーを順に見る) */
export function parseEntry(raw: unknown): TradeEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, any>;
  const item = (r.item ?? r.data?.item ?? {}) as Record<string, any>;
  const time = toMs(r.time ?? r.listedAt ?? r.date);
  const price = (r.price ?? {}) as Record<string, any>;
  const amount = typeof price.amount === "number" ? price.amount : typeof r.amount === "number" ? r.amount : null;
  const currency = typeof price.currency === "string" ? price.currency : typeof r.currency === "string" ? r.currency : null;
  const name = typeof item.name === "string" ? item.name : "";
  const typeLine = typeof item.typeLine === "string" ? item.typeLine : typeof item.baseType === "string" ? item.baseType : "";
  if (!time && !name && !typeLine) return null;
  const rarity = typeof item.rarity === "string" ? item.rarity : (RARITY_BY_FRAME[item.frameType as number] ?? "");
  const id = typeof item.id === "string" ? item.id : typeof r.item_id === "string" ? r.item_id : "";
  return {
    key: id ? `${id}|${time}` : `${name}|${typeLine}|${time}|${amount ?? ""}${currency ?? ""}`,
    time,
    amount,
    currency,
    name,
    typeLine,
    icon: typeof item.icon === "string" ? item.icon : null,
    rarity,
    stack: typeof item.stackSize === "number" ? item.stackSize : null,
    ilvl: typeof item.ilvl === "number" ? item.ilvl : null,
  };
}

function listOf(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const b = body as Record<string, unknown> | null;
  if (Array.isArray(b?.result)) return b.result as unknown[];
  if (Array.isArray(b?.entries)) return b.entries as unknown[];
  return [];
}

interface FetchResponse {
  status: number;
  retry_after: number | null;
  ratelimit: Record<string, string>;
  body: unknown;
}

/** 履歴を取って蓄積に足す。間隔を空けずに呼ばれたら何もしない */
export async function fetchAndMerge(game: Game, league: string): Promise<FetchOutcome> {
  const s = loadStored(game, league);
  const now = Date.now();
  if (now < s.nextAllowedAt) {
    return { ok: false, added: 0, message: `取得は ${Math.ceil((s.nextAllowedAt - now) / 1000)} 秒後にできます` };
  }
  let res: FetchResponse;
  try {
    res = await invoke<FetchResponse>("trade_history_fetch", { req: { game, league } });
  } catch (e) {
    return { ok: false, added: 0, message: e instanceof Error ? e.message : String(e) };
  }
  // 成功でも失敗でも次の取得まで間隔を空ける (失敗時の連打でアカウントの制限を招かない)
  s.lastFetchAt = now;
  s.nextAllowedAt = now + Math.max(MIN_INTERVAL_MS, (res.retry_after ?? 0) * 1000);
  if (res.status === 200) {
    const have = new Set(s.entries.map((e) => e.key));
    let added = 0;
    for (const raw of listOf(res.body)) {
      const e = parseEntry(raw);
      if (e && !have.has(e.key)) {
        s.entries.push(e);
        have.add(e.key);
        added++;
      }
    }
    s.entries.sort((a, b) => b.time - a.time);
    save(game, league, s);
    return { ok: true, added, message: added > 0 ? `${added} 件を追加しました` : "新しい取引はありません" };
  }
  save(game, league, s);
  const apiMessage = (res.body as { error?: { message?: string } } | null)?.error?.message;
  if (res.status === 401 || res.status === 403) {
    return { ok: false, added: 0, message: "ログインが切れています。もう一度 pathofexile.com にログインしてください" };
  }
  if (res.status === 429) {
    return { ok: false, added: 0, message: `取得の制限中です。${res.retry_after ?? "しばらく"} 秒ほど待ってください` };
  }
  return { ok: false, added: 0, message: `サイト側で履歴を取れませんでした (HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : ""})。公式サイトでも失敗する時は GGG 側の不具合です` };
}
