/**
 * 取引履歴 (マーチャント履歴) の連動 (2026-09-16) — Tauri ラッパと履歴の蓄積
 *
 * Rust (trade_history.rs) がアプリ内ログインの POESESSID で、サイトと同じ履歴 API を読む (非公式 API)。
 * API が返すのは直近の分だけなので、取れた物をこの PC (localStorage) に足していき、API から消えた古い分も残す。
 *
 * 取得の間隔 (2026-09-16 オーナー指示「公式と同じ API なんだからトレードと一緒の感覚でいい」):
 * 固定の間隔ではなく、trade2 検索と同じくサーバーの制限に合わせる。
 *   - 応答の `x-rate-limit-account` (例 "5:60:60,10:600:120,15:10800:3600" = 上限:窓秒:締め出し秒) を覚え、
 *     自分の取得時刻を窓ごとに数えて、上限の 1 回手前で止める (公式サイトや PoE Overlay II が使う分の余白)
 *   - 応答の state が上限に近ければその窓ぶん、締め出し中ならその窓ぶん待つ (窓が埋まったまま解除直後に押すとまた締め出されるため)
 *
 * 2026-09-26: 保存と窓の計算 / 1 件の読み取り / 制限ヘッダの読み取りは trade-history/ 以下に分割 (ここから再 export)。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../utils/isTauriRuntime";
import { historyBudget, loadStored, save, type Game } from "./trade-history/store";
import { listOf, parseEntry } from "./trade-history/parse";
import { clock, describeRateLimit, rulesOf, waitFromRateLimit } from "./trade-history/rate-limit";

export {
  MIN_INTERVAL_MS,
  loadStored,
  historyBudget,
  type Game,
  type TradeEntry,
  type BudgetWindow,
  type HistoryBudget,
} from "./trade-history/store";
export { parseEntry } from "./trade-history/parse";
export { describeRateLimit, waitFromRateLimit } from "./trade-history/rate-limit";

export interface FetchOutcome {
  ok: boolean;
  added: number;
  message: string;
  /** サイトがログインを受け付けなかった (401 / 403)。cookie は残っていても切れている */
  expired?: boolean;
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

interface FetchResponse {
  status: number;
  retry_after: number | null;
  ratelimit: Record<string, string>;
  body: unknown;
}

/** 履歴を取って蓄積に足す。制限の窓が空くまでは何もしない */
export async function fetchAndMerge(game: Game, league: string): Promise<FetchOutcome> {
  const s = loadStored(game, league);
  const now = Date.now();
  const allowedAt = historyBudget(game, league).allowedAt;
  if (now < allowedAt) {
    return { ok: false, added: 0, message: `次に取れるのは ${clock(allowedAt)} ごろです (残り ${Math.ceil((allowedAt - now) / 1000)} 秒)` };
  }
  let res: FetchResponse;
  try {
    res = await invoke<FetchResponse>("trade_history_fetch", { req: { game, league } });
  } catch (e) {
    return { ok: false, added: 0, message: e instanceof Error ? e.message : String(e) };
  }
  s.lastFetchAt = now;
  s.hits = [...s.hits.filter((t) => t > now - 3 * 3600_000), now];
  s.rules = rulesOf(res.ratelimit) ?? s.rules;
  s.nextAllowedAt = now + Math.max((res.retry_after ?? 0) * 1000, waitFromRateLimit(res.ratelimit));
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
    return { ok: false, added: 0, expired: true, message: "ログインが切れています。もう一度 pathofexile.com にログインしてください" };
  }
  if (res.status === 429) {
    return {
      ok: false,
      added: 0,
      message: `取得の制限中です${limitSuffix}。締め出しが解けても枠が埋まっているとすぐまた締め出されるので、${clock(s.nextAllowedAt)} ごろまで公式サイトや他のツールでの更新も含めて待ってください`,
    };
  }
  return { ok: false, added: 0, message: `サイト側で履歴を取れませんでした (HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : ""})。公式サイトでも失敗する時は GGG 側の不具合です${limitSuffix}` };
}
