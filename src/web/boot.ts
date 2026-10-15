/**
 * 開いた時に 1 回だけ読む物 (2026-10-10 問い合わせを減らす): サーバーの /boot.json = 配信の情報 + 相場。
 * 相場はサーバーが 1 時間おきに poe2scout から取って全員に同じ物を配る (server/live/src/market.ts)。
 * 前は開くたびに live.json と相場 2 本 (リーグ一覧・品目) の 3 回。ブラウザは 10 分覚える (開き直しはサーバーに来ない)。
 * (静的なファイルで配る案は GitHub に Cloudflare の鍵が要るのでやめた、2026-10-10)
 */
import { ref } from "vue";
import { WEB_API_BASE } from "./config";

/** visitors: 本日 (9:00 から、1 時間おきに数え直す) と昨日の訪問者 (server/live の updateVisitors) */
export interface Boot { live: unknown; market: { at: string; leagues: unknown[]; league: string | null; items: unknown[] } | null; visitors?: { today: number; at: string; yesterday: number | null } | null }
let inFlight: Promise<Boot | null> | null = null;
/** 今の相場をサーバーが取った時刻 (ISO)。電波が無い時に「◯時の値段」と出す (pwa.ts) */
export const marketAt = ref<string | null>(null);

/** 読む (同時に呼ばれても 1 回)。force なら読み直す (45 分放置で戻った時) */
export function loadBoot(force = false): Promise<Boot | null> {
  if (!inFlight || force) inFlight = load();
  return inFlight;
}

const get = <T,>(u: string): Promise<T | null> => fetch(u, { credentials: "omit" }).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
async function load(): Promise<Boot | null> {
  const b = await loadRaw();
  if (b?.market?.at) marketAt.value = b.market.at;
  return b;
}
async function loadRaw(): Promise<Boot | null> {
  const b = await get<Boot>(`${WEB_API_BASE}/boot.json`);
  if (b?.market?.items?.length) return b;
  // サーバーに繋がらない (無料枠を使い切った・落ちた) 時は、画面と一緒に置いた相場の控え (出した時点の値段、上限の無い置き場)。2026-10-10
  const fb = await get<Boot["market"]>("/market-fallback.json");
  return fb?.items?.length ? { live: b?.live ?? null, market: fb, visitors: b?.visitors ?? null } : b;
}
