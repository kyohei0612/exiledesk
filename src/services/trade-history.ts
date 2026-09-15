/**
 * 取引履歴 (マーチャント履歴) の連動 (2026-09-16) — Tauri ラッパと履歴の蓄積
 *
 * Rust (trade_history.rs) がアプリ内ログインの POESESSID で、サイトと同じ履歴 API を読む (非公式 API)。
 * API が返すのは直近の分だけなので、取れた物をこの PC (localStorage) に足していき、API から消えた古い分も残す。
 * 取得は 15 分に 1 回まで。さらに応答の x-rate-limit-account / -ip を見て、上限の 8 割に近い窓があればその窓が明けるまで、
 * 締め出し中ならその秒数だけ待つ (2026-09-16)。履歴の制限はアカウント単位で公式サイトの更新ボタンと共通
 * (XileHUD が観測した値: 1 分 5 回 / 10 分 10 回 / 3 時間 15 回、超えると最長 1 時間締め出し)。
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

/** 取得の最短間隔 (3 時間 15 回の窓に 15 分間隔なら 12 回で収まる) */
export const MIN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * レート制限ヘッダから、次に取ってよいまでの待ち時間 (ms)。
 * rules "5:60:60,10:600:120,15:10800:3600" = 最大回数:窓 (秒):超えた時の締め出し (秒)
 * state "4:60:0,..." = 使った回数:窓 (秒):締め出しの残り (秒)
 */
export function waitFromRateLimit(rl: Record<string, string> | null | undefined): number {
  if (!rl) return 0;
  let wait = 0;
  for (const scope of ["account", "ip"]) {
    const rules = rl[`x-rate-limit-${scope}`]?.split(",") ?? [];
    const states = rl[`x-rate-limit-${scope}-state`]?.split(",") ?? [];
    rules.forEach((rule, i) => {
      const [max, period] = rule.split(":").map(Number);
      const [hits, , restricted] = (states[i] ?? "").split(":").map(Number);
      // 締め出し中は、締め出しの残りだけでなく窓 (最長 3 時間) が明けるまで待つ。
      // 2026-09-16 実測: 1 時間の締め出しが解けた直後に 1 回取っただけで、3 時間の窓がまだ埋まっていて再び 3600 秒締め出された
      if (restricted > 0) wait = Math.max(wait, Math.max(restricted, period) * 1000);
      else if (max > 0 && period > 0 && hits >= Math.floor(max * 0.8)) wait = Math.max(wait, period * 1000);
    });
  }
  return wait;
}

const PERIOD_LABEL: Record<number, string> = { 60: "1 分", 600: "10 分", 3600: "1 時間", 10800: "3 時間" };

/** 制限の状態を人が読める形に (例: "1 分 1/5 · 10 分 3/10 · 3 時間 15/15 (締め出し 3600 秒)") */
export function describeRateLimit(rl: Record<string, string> | null | undefined): string {
  if (!rl) return "";
  for (const scope of ["account", "ip"]) {
    const rules = rl[`x-rate-limit-${scope}`]?.split(",") ?? [];
    const states = rl[`x-rate-limit-${scope}-state`]?.split(",") ?? [];
    if (rules.length === 0) continue;
    return rules
      .map((rule, i) => {
        const [max, period] = rule.split(":").map(Number);
        const [hits, , restricted] = (states[i] ?? "").split(":").map(Number);
        const label = PERIOD_LABEL[period] ?? `${period} 秒`;
        return `${label} ${Number.isFinite(hits) ? hits : "?"}/${max}${restricted > 0 ? ` (締め出し ${restricted} 秒)` : ""}`;
      })
      .join(" · ");
  }
  return "";
}

const clock = (ms: number): string => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

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
  s.nextAllowedAt = now + Math.max(MIN_INTERVAL_MS, (res.retry_after ?? 0) * 1000, waitFromRateLimit(res.ratelimit));
  const limitText = describeRateLimit(res.ratelimit);
  const limitSuffix = limitText ? ` [制限: ${limitText}]` : "";
  if (res.status === 200) {
    const have = new Set(s.entries.map((e) => e.key));
    const list = listOf(res.body);
    let added = 0;
    let parsed = 0;
    for (const raw of list) {
      const e = parseEntry(raw);
      if (!e) continue;
      parsed++;
      if (!have.has(e.key)) {
        s.entries.push(e);
        have.add(e.key);
        added++;
      }
    }
    s.entries.sort((a, b) => b.time - a.time);
    save(game, league, s);
    if (added > 0) return { ok: true, added, message: `${added} 件を追加しました${limitSuffix}` };
    // 0 件の時は応答の形を出す (読み取りの形式違いと、本当に履歴が無いのを見分けるため)
    const keysOf = (v: unknown): string => (v && typeof v === "object" ? Object.keys(v as object).slice(0, 8).join(", ") : typeof v);
    if (list.length > 0 && parsed === 0) {
      return { ok: false, added: 0, message: `応答の ${list.length} 件を読めませんでした (1 件目の項目: ${keysOf(list[0])})${limitSuffix}` };
    }
    if (list.length === 0) {
      return { ok: true, added: 0, message: `サイトの履歴は 0 件でした (応答の項目: ${keysOf(res.body)})。リーグが合っているか確認してください${limitSuffix}` };
    }
    return { ok: true, added: 0, message: `新しい取引はありません (${parsed} 件は取り込み済み)${limitSuffix}` };
  }
  save(game, league, s);
  const apiMessage = (res.body as { error?: { message?: string } } | null)?.error?.message;
  if (res.status === 401 || res.status === 403) {
    return { ok: false, added: 0, message: "ログインが切れています。もう一度 pathofexile.com にログインしてください" };
  }
  if (res.status === 429) {
    return {
      ok: false,
      added: 0,
      message: `取得の制限中です${limitSuffix}。締め出しが解けても枠が埋まっているとすぐまた締め出されるので、${clock(s.nextAllowedAt)} ごろまで公式サイトの更新も含めて待ってください`,
    };
  }
  return { ok: false, added: 0, message: `サイト側で履歴を取れませんでした (HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : ""})。公式サイトでも失敗する時は GGG 側の不具合です` };
}
