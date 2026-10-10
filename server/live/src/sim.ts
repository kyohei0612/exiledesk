/**
 * 新しい送り方の再現の確かめ (2026-10-10 オーナー「開発版で仮想 Web ページで今回のデータをもとに同じ結果が取れるように、新システムで」)。
 *
 * 前の送り方 (15 秒おきに /event) で届いた本物の印を、訪問ごとに「画面を離れた時に 1 回だけ /log に __ev で乗せる」新しい形で
 * 送り直し (scripts/sim-telemetry.mjs)、別の置き場 (exiledesk_events_sim) に書いて、日報の集計 (summarize) が同じ数字になるかを比べる。
 * wrangler.sim.jsonc (SIM = "1") で `wrangler dev --remote` した時だけ開く。本番には出さない
 */
import { DATASET, sql, summarize, type Summary } from "./events";
import { forgottenUids, notForgotten } from "./forget";
import type { Env } from "./types";

const iso = (s: string | null, d: string): string => (s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s) ? s : d);
const ts = (v: string): string => `toDateTime('${v.slice(0, 19).replace("T", " ")}')`;

/** 本物の印を訪問ごとに (記録しない端末は除く) */
export async function exportSessions(env: Env, since: string, until: string): Promise<unknown[]> {
  const skip = notForgotten(await forgottenUids(env));
  const rows = await sql<{ sid: string; uid: string; dev: string; ref: string; first: string; n: string; x: string; t: number | string; k: number | string }>(env,
    `SELECT blob2 AS sid, blob3 AS uid, blob4 AS dev, blob5 AS ref, blob7 AS first, blob1 AS n, blob8 AS x, toUnixTimestamp(timestamp) AS t, _sample_interval AS k FROM ${DATASET} WHERE timestamp >= ${ts(since)} AND timestamp < ${ts(until)}${skip} ORDER BY t LIMIT 50000`);
  const by = new Map<string, { uid: string; sid: string; dev: string; ref: string; first: boolean; t0: number; ev: Array<{ n: string; x?: string; s: number }> }>();
  for (const r of rows) {
    const t = Number(r.t);
    let s = by.get(r.sid);
    if (!s) { s = { uid: r.uid, sid: r.sid, dev: r.dev, ref: r.ref, first: false, t0: t, ev: [] }; by.set(r.sid, s); }
    if (r.first === "1") s.first = true;
    // 間引き (_sample_interval) があれば、その数だけ並べ直す (少ない日は 1)
    for (let i = 0; i < Math.max(1, Number(r.k) || 1); i++) s.ev.push({ n: r.n, ...(r.x ? { x: r.x } : {}), s: Math.max(0, t - s.t0) });
  }
  return [...by.values()];
}

const pick = (m: Summary) => ({
  訪問: m.sessions, 人: m.users, 新規: m.newSessions, 開いただけ: m.bounce == null ? null : Math.round(m.bounce * 1000) / 10, 滞在の中央値_分: m.medianMinutes == null ? null : Math.round(m.medianMinutes * 10) / 10,
  どこから: Object.fromEntries(m.refs), 端末: Object.fromEntries(m.devices), 使われ方: Object.fromEntries([...m.byEvent].map(([k, v]) => [k, v.sessions]).sort()),
  エラー_直す物: m.errors, 外のエラー: m.extErrors, 取れなかった: m.warnings,
});

/** 本物 (since〜until) と再現 (simSince〜simUntil、exiledesk_events_sim) の集計を並べる */
export async function compare(env: Env, u: URL): Promise<unknown> {
  const now = new Date().toISOString();
  const since = iso(u.searchParams.get("since"), "2026-10-10T00:00:00Z"), until = iso(u.searchParams.get("until"), now);
  const simSince = iso(u.searchParams.get("simSince"), since), simUntil = iso(u.searchParams.get("simUntil"), now);
  const real = await summarize(env, since, until, since);
  const sim = await summarize({ ...env, EVENTS_DATASET: "exiledesk_events_sim" }, simSince, simUntil, simSince);
  const a = pick(real), b = pick(sim);
  const diff = Object.keys(a).filter((k) => JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify((b as Record<string, unknown>)[k]));
  const rows = await sql<{ c: number; k: number; s: number; mx: number }>(env, `SELECT count() AS c, SUM(_sample_interval) AS k, count(DISTINCT blob2) AS s, max(_sample_interval) AS mx FROM exiledesk_events_sim WHERE timestamp >= ${ts(simSince)} AND timestamp < ${ts(simUntil)}`).catch((e) => [{ c: String(e) }]);
  return { 本物: a, 再現: b, 違う所: diff, 再現の行: rows[0] };
}
