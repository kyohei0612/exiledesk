/**
 * 開いた時に 1 回だけ読む物 (2026-10-10 問い合わせを減らす): サーバーの /boot.json = 配信の情報 + 相場。
 * 相場はサーバーが 1 時間おきに poe2scout から取って全員に同じ物を配る (server/live/src/market.ts)。
 * 前は開くたびに live.json と相場 2 本 (リーグ一覧・品目) の 3 回。ブラウザは 10 分覚える (開き直しはサーバーに来ない)。
 * 今は静的なファイル (exiledesk-data) を先に読むので、普段はサーバー (exiledesk-live) には来ない
 */
import { WEB_API_BASE } from "./config";

export interface Boot { live: unknown; market: { at: string; leagues: unknown[]; league: string | null; items: unknown[] } | null }
let inFlight: Promise<Boot | null> | null = null;

/** 読む (同時に呼ばれても 1 回)。force なら読み直す (45 分放置で戻った時) */
export function loadBoot(force = false): Promise<Boot | null> {
  if (!inFlight || force) inFlight = load();
  return inFlight;
}

/**
 * 静的なファイルの置き場 (exiledesk-data。GitHub Actions が 1 時間おきに作り直す)。ここへの問い合わせは数えられず無料・無限 (2026-10-10)。
 * 3 時間より古い (作り直しが止まっている) か読めなければ、サーバー (exiledesk-live) の /boot.json に戻る
 */
export const BOOT_STATIC_URL = "https://exiledesk-data.exiledesk.workers.dev/boot.json";
const STALE_MS = 3 * 3600_000;
const get = (u: string): Promise<Boot | null> => fetch(u, { credentials: "omit" }).then((r) => (r.ok ? (r.json() as Promise<Boot>) : null)).catch(() => null);
async function load(): Promise<Boot | null> {
  const st = await get(BOOT_STATIC_URL);
  const at = st?.market?.at ? Date.parse(st.market.at) : NaN;
  if (st?.market?.items?.length && Date.now() - at < STALE_MS) return st;
  return (await get(`${WEB_API_BASE}/boot.json`)) ?? st;
}
