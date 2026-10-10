/**
 * 相場をサーバーで 1 時間に 1 回だけ取って、全員に同じ物を配る (2026-10-10)。
 *
 * オーナー「相場の取得も 1 時間に 1 回で再取得ならええんやない、固定値で決める。開くたびにやなくて、今だと 1 人毎回取得するやろ」。
 * 前は Web 版を開くたびに /api/poe2scout でリーグ一覧と品目を 2 回取っていた (サーバーへの問い合わせの 3 割)。
 * 今は 1 時間おきの cron が poe2scout から取って KV "market" に置き、開いた時は /boot.json (配信の情報と一緒) を 1 回読むだけ
 */
import type { Env, Fetch } from "./types";

export const MARKET_KEY = "market";
const SCOUT = "https://api.poe2scout.com";
const UA = { accept: "application/json", "user-agent": "ExileDesk-web/0.1 (https://github.com/kyohei0612/exiledesk)" };

interface League { Value: string; IsCurrent?: boolean }
export interface MarketRow { at: string; leagues: League[]; league: string | null; items: unknown[] }

/** 今のリーグ (IsCurrent かつ HC でない)。画面側の market-store と同じ選び方 */
export const pickCurrent = (list: League[]): League | null => list.find((l) => l.IsCurrent && !l.Value.startsWith("HC")) ?? list[0] ?? null;

/** poe2scout から取り直して KV に置く。失敗したら投げる (前の値は残る) */
export async function refreshMarket(env: Env, fetchFn: Fetch = fetch, now = new Date()): Promise<MarketRow> {
  const lr = await fetchFn(`${SCOUT}/poe2/Leagues`, { headers: UA });
  if (!lr.ok) throw new Error(`Leagues ${lr.status}`);
  const leagues = (await lr.json()) as League[];
  const cur = pickCurrent(leagues);
  let items: unknown[] = [];
  if (cur) {
    const ir = await fetchFn(`${SCOUT}/poe2/Leagues/${encodeURIComponent(cur.Value)}/Items`, { headers: UA });
    if (!ir.ok) throw new Error(`Items ${ir.status}`);
    items = (await ir.json()) as unknown[];
  }
  const row: MarketRow = { at: now.toISOString(), leagues, league: cur?.Value ?? null, items };
  await env.LIVE.put(MARKET_KEY, JSON.stringify(row));
  return row;
}
