/**
 * 開いた時に 1 回だけ読む物 (2026-10-10 問い合わせを減らす): サーバーの /boot.json = 配信の情報 + 相場。
 * 相場はサーバーが 1 時間おきに poe2scout から取って全員に同じ物を配る (server/live/src/market.ts)。
 * 前は開くたびに live.json と相場 2 本 (リーグ一覧・品目) の 3 回。ブラウザは 10 分覚える (開き直しはサーバーに来ない)。
 * (静的なファイルで配る案は GitHub に Cloudflare の鍵が要るのでやめた、2026-10-10)
 */
import { WEB_API_BASE } from "./config";

export interface Boot { live: unknown; market: { at: string; leagues: unknown[]; league: string | null; items: unknown[] } | null }
let inFlight: Promise<Boot | null> | null = null;

/** 読む (同時に呼ばれても 1 回)。force なら読み直す (45 分放置で戻った時) */
export function loadBoot(force = false): Promise<Boot | null> {
  if (!inFlight || force) inFlight = load();
  return inFlight;
}

const get = <T,>(u: string): Promise<T | null> => fetch(u, { credentials: "omit" }).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
async function load(): Promise<Boot | null> {
  const b = await get<Boot>(`${WEB_API_BASE}/boot.json`);
  if (b?.market?.items?.length) return b;
  // サーバーに繋がらない (無料枠を使い切った・落ちた) 時は、画面と一緒に置いた相場の控え (出した時点の値段、上限の無い置き場)。2026-10-10
  const fb = await get<Boot["market"]>("/market-fallback.json");
  return fb?.items?.length ? { live: b?.live ?? null, market: fb } : b;
}
