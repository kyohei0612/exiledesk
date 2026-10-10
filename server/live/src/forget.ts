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
const MAX = 500;
export const UID_RE = /^[A-Za-z0-9_-]{6,40}$/;

/** 記録しない端末の uid (KV は 5 分まで手元に持つ。消した直後の数分は前の記録が残ることがある) */
export async function forgottenUids(env: Env): Promise<string[]> {
  try { return ((await env.LIVE.get(KEY, { type: "json", cacheTtl: 300 })) as string[] | null) ?? []; } catch { return []; }
}

/** uid を記録しない端末に入れて、D1 の今までの記録を消す。消した行の数を返す */
export async function forgetUid(env: Env, uid: string): Promise<number> {
  const cur = ((await env.LIVE.get(KEY, "json")) as string[] | null) ?? [];
  if (!cur.includes(uid)) await env.LIVE.put(KEY, JSON.stringify([...cur, uid].slice(-MAX)));
  if (!env.LOGS) return 0;
  const r = await env.LOGS.prepare("DELETE FROM logs WHERE json_extract(body, '$.uid') = ?").bind(uid).run();
  return r.meta?.changes ?? 0;
}

/** Analytics Engine の WHERE に足す「この uid は除く」(blob3 = uid)。無ければ空 */
export function notForgotten(uids: readonly string[]): string {
  const ok = uids.filter((u) => UID_RE.test(u));
  return ok.length ? ` AND blob3 NOT IN (${ok.map((u) => `'${u}'`).join(", ")})` : "";
}
