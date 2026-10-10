/**
 * forget.ts — 記録しない端末 (2026-10-10 オーナー「使った挙動にまだ自分のやつが出る、完全に消したい、情報としていらん (9:00 の報告)」)。
 *
 * 端末で「記録しない」をオンにすると POST /forget { uid } が来る。その uid を KV "nolog:uids" に入れ、
 *   - D1 の今までの記録 (logs) を消す
 *   - 以後その uid の /log・/event は捨てる (置かない)
 *   - 日報の集計 (Analytics Engine) からも外す (AE は消せないので集計の WHERE で除く)
 * uid は端末の乱数で、自分の端末の物しか知らないので、他人の記録は消せない
 */
import type { Env } from "./types";

const KEY = "nolog:uids";
/** 端末ごとのキー (2026-10-10: 1 つのリストを読んで足して書き戻すと、近い時間の 2 台が取り合って片方が消えた) */
const PREFIX = "nolog:uid:";
const MAX = 500;
export const UID_RE = /^[A-Za-z0-9_-]{6,40}$/;

/** 記録しない端末の uid (前の 1 つのリストの分も読む) */
let memo: { at: number; uids: string[] } | null = null;
/**
 * 記録が届くたびに KV の一覧を引くと無料枠 (一覧 1 日 1,000 回) を使い切るので、サーバーの中で 30 分覚える
 * (2026-10-10 5 分 → 30 分。人が増えてサーバーの数が増えても 1 日 1,000 回に届かないように。記録しない端末はほぼオーナーだけ)
 */
const MEMO_MS = 1_800_000;
export async function forgottenUids(env: Env, now = Date.now()): Promise<string[]> {
  if (memo && now - memo.at < MEMO_MS) return memo.uids;
  try {
    const [old, l] = await Promise.all([env.LIVE.get(KEY, { type: "json", cacheTtl: 300 }) as Promise<string[] | null>, env.LIVE.list({ prefix: PREFIX, limit: MAX })]);
    memo = { at: now, uids: [...new Set([...(old ?? []), ...l.keys.map((k) => k.name.slice(PREFIX.length))])] };
    return memo.uids;
  } catch { return memo?.uids ?? []; }
}

/** uid を記録しない端末に入れて、D1 の今までの記録を消す。消した行の数を返す */
export async function forgetUid(env: Env, uid: string): Promise<number> {
  await env.LIVE.put(PREFIX + uid, "1");
  if (memo && !memo.uids.includes(uid)) memo.uids = [...memo.uids, uid];
  if (!env.LOGS) return 0;
  const r = await env.LOGS.prepare("DELETE FROM logs WHERE json_extract(body, '$.uid') = ?").bind(uid).run();
  return r.meta?.changes ?? 0;
}

/** Analytics Engine の WHERE に足す「この uid は除く」(blob3 = uid)。無ければ空 */
export function notForgotten(uids: readonly string[]): string {
  const ok = uids.filter((u) => UID_RE.test(u));
  return ok.length ? ` AND blob3 NOT IN (${ok.map((u) => `'${u}'`).join(", ")})` : "";
}
