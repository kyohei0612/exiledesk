/**
 * forget.ts — 記録しない端末 (2026-10-10 オーナー「使った挙動にまだ自分のやつが出る、完全に消したい、情報としていらん (9:00 の報告)」)。
 *
 * 端末で「記録しない」をオンにすると POST /forget { uid } が来る。その uid を D1 の nolog に入れ (2026-10-11 まで KV)、
 *   - D1 の今までの記録 (logs) を消す
 *   - 以後その uid の /log・/event は捨てる (置かない)
 *   - 日報の集計 (Analytics Engine) からも外す (AE は消せないので集計の WHERE で除く)
 * uid は端末の乱数で、自分の端末の物しか知らないので、他人の記録は消せない
 */
import type { Env } from "./types";

const KEY = "nolog:uids";
const MAX = 500;
export const UID_RE = /^[A-Za-z0-9_-]{6,40}$/;

/** 記録しない端末の uid (D1 の nolog と、前の KV の 1 つのリスト "nolog:uids") */
let memo: { at: number; uids: string[] } | null = null;
/**
 * 記録が届くたびに引くと重いので、サーバーの中で 30 分覚える。置き場は D1 (2026-10-11: KV の端末ごとのキーを一覧で読んでいて、
 * サーバーの数だけ一覧を使い、無料枠 1 日 1,000 回の 9 割まで行った)。KV は前のリストを 1 回読むだけ (一覧は使わない)
 */
const MEMO_MS = 1_800_000;
export async function forgottenUids(env: Env, now = Date.now()): Promise<string[]> {
  if (memo && now - memo.at < MEMO_MS) return memo.uids;
  try {
    const [old, rows] = await Promise.all([
      env.LIVE.get(KEY, { type: "json", cacheTtl: 3600 }) as Promise<string[] | null>,
      env.LOGS ? env.LOGS.prepare("SELECT uid FROM nolog LIMIT ?").bind(MAX).all<{ uid: string }>().then((r) => r.results ?? []).catch(() => []) : Promise.resolve([] as Array<{ uid: string }>),
    ]);
    memo = { at: now, uids: [...new Set([...(old ?? []), ...rows.map((r) => r.uid)])] };
    return memo.uids;
  } catch { return memo?.uids ?? []; }
}

/** uid を記録しない端末に入れて、D1 の今までの記録を消す。消した行の数を返す */
export async function forgetUid(env: Env, uid: string): Promise<number> {
  if (memo && !memo.uids.includes(uid)) memo.uids = [...memo.uids, uid];
  if (!env.LOGS) return 0;
  await env.LOGS.prepare("INSERT OR IGNORE INTO nolog (uid, at) VALUES (?, ?)").bind(uid, new Date().toISOString()).run();
  const r = await env.LOGS.prepare("DELETE FROM logs WHERE json_extract(body, '$.uid') = ?").bind(uid).run();
  return r.meta?.changes ?? 0;
}

/** Analytics Engine の WHERE に足す「この uid は除く」(blob3 = uid)。無ければ空 */
export function notForgotten(uids: readonly string[]): string {
  const ok = uids.filter((u) => UID_RE.test(u));
  return ok.length ? ` AND blob3 NOT IN (${ok.map((u) => `'${u}'`).join(", ")})` : "";
}
