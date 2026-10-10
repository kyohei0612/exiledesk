/**
 * 開いた時に 1 回だけ読む物 (2026-10-10 問い合わせを減らす): サーバーの /boot.json = 配信の情報 + 相場。
 * 相場はサーバーが 1 時間おきに poe2scout から取って全員に同じ物を配る (server/live/src/market.ts)。
 * 前は開くたびに live.json と相場 2 本 (リーグ一覧・品目) の 3 回。ブラウザは 10 分覚える (開き直しはサーバーに来ない)
 */
import { WEB_API_BASE } from "./config";

export interface Boot { live: unknown; market: { at: string; leagues: unknown[]; league: string | null; items: unknown[] } | null }
let inFlight: Promise<Boot | null> | null = null;

/** 読む (同時に呼ばれても 1 回)。force なら読み直す (45 分放置で戻った時) */
export function loadBoot(force = false): Promise<Boot | null> {
  if (!inFlight || force) {
    inFlight = fetch(`${WEB_API_BASE}/boot.json`, { credentials: "omit" })
      .then((r) => (r.ok ? (r.json() as Promise<Boot>) : null))
      .catch(() => null);
  }
  return inFlight;
}
