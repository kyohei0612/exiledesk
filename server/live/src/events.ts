/**
 * 操作の印 (2026-10-07 オーナー「どこでつまずいたか・離脱・どこから来たか・スマホか PC か、よく使われる指標を全部」)。
 * Web 版が POST /event で送る (cookie なし。uid は localStorage の乱数、sid はタブごとの乱数、個人の情報は無い)。
 * Workers Analytics Engine に 1 行ずつ書き (無料 10 万/日、3 か月残る)、日報で SQL API から集計する。
 *
 *   blob1 = 印の名前 (open / mode:sim / sim:base / … / error)   blob2 = sid   blob3 = uid
 *   blob4 = 端末 (pc / mobile)   blob5 = どこから (ホスト名 / direct)   blob6 = 国   blob7 = 新規なら "1"   blob8 = 補足 (error の文など)
 */
import type { Env, Fetch } from "./types";

export const DATASET = "exiledesk_events";
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const NAME_RE = /^[a-z0-9:_.-]{1,40}$/;
const MAX_EVENTS = 50;

export interface EventBatch { uid: string; sid: string; first?: boolean; dev?: string; ref?: string; ev: Array<{ n: string; x?: string }> }

/** 届いた物を確かめて整える (駄目なら null) */
export function parseBatch(body: unknown): EventBatch | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.uid !== "string" || !ID_RE.test(b.uid) || typeof b.sid !== "string" || !ID_RE.test(b.sid)) return null;
  if (!Array.isArray(b.ev) || !b.ev.length) return null;
  const ev: EventBatch["ev"] = [];
  for (const e of b.ev.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== "object") continue;
    const n = (e as { n?: unknown }).n, x = (e as { x?: unknown }).x;
    if (typeof n !== "string" || !NAME_RE.test(n)) continue;
    ev.push({ n, ...(typeof x === "string" && x ? { x: x.slice(0, 120) } : {}) });
  }
  if (!ev.length) return null;
  const dev = b.dev === "mobile" ? "mobile" : "pc";
  const ref = typeof b.ref === "string" ? b.ref.toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 60) || "direct" : "direct";
  return { uid: b.uid, sid: b.sid, first: b.first === true, dev, ref, ev };
}

/** Analytics Engine に書く (binding が無ければ何もしない) */
export function writeEvents(env: Env, batch: EventBatch, country: string): number {
  if (!env.EVENTS) return 0;
  for (const e of batch.ev) {
    env.EVENTS.writeDataPoint({ blobs: [e.n, batch.sid, batch.uid, batch.dev ?? "pc", batch.ref ?? "direct", country, batch.first ? "1" : "0", e.x ?? ""], doubles: [1], indexes: [batch.sid] });
  }
  return batch.ev.length;
}

/** SQL API (読み。1 日 1 万回まで無料)。失敗は投げる */
export async function sql<T = Record<string, unknown>>(env: Env, query: string, fetchFn: Fetch = fetch): Promise<T[]> {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) throw new Error("CF_ANALYTICS_TOKEN が無い");
  const r = await fetchFn(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, { method: "POST", headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }, body: query });
  if (!r.ok) throw new Error(`sql ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const j = (await r.json()) as { data?: T[] };
  return j.data ?? [];
}

const ts = (iso: string): string => `toDateTime('${iso.slice(0, 19).replace("T", " ")}')`;
const range = (since: string, until: string): string => `timestamp >= ${ts(since)} AND timestamp < ${ts(until)}`;

/** 段階 (到達した人の数で見る)。シミュレーション側と手で打つ側 */
export const FUNNEL_SIM = ["open", "mode:sim", "sim:base", "sim:targets", "sim:order", "sim:pattern", "sim:run", "sim:done", "trade:open"] as const;
export const FUNNEL_HAND = ["open", "mode:hand", "hand:use", "trade:open"] as const;
export const STEP_JA: Record<string, string> = {
  "open": "開いた", "mode:sim": "シミュレーション", "mode:hand": "手で打つ", "sim:base": "ベース", "sim:targets": "狙い", "sim:order": "順番", "sim:pattern": "手順",
  "sim:run": "回した", "sim:done": "完成", "trade:open": "取引所", "hand:use": "打った", "recipe:save": "レシピ保存", "feedback:open": "要望を開いた", "feedback:sent": "要望を送った", "error": "JS エラー", "ping": "滞在",
};

export interface Summary {
  sessions: number; users: number; newSessions: number; bounce: number | null; medianMinutes: number | null;
  byEvent: Map<string, { sessions: number; users: number; count: number }>;
  refs: Array<[string, number]>; devices: Array<[string, number]>; countries: Array<[string, number]>;
  errors: Array<[string, number]>;
  wau: number | null;
  /** 集計で失敗した問い合わせ (0 が「無い」のか「取れなかった」のかを日報で分かるように) */
  warnings: string[];
}

/** 昨日のまとめ (SQL を数本。1 本ずつ失敗しても他は続ける) */
export async function summarize(env: Env, since: string, until: string, weekSince: string, fetchFn: Fetch = fetch): Promise<Summary> {
  const out: Summary = { sessions: 0, users: 0, newSessions: 0, bounce: null, medianMinutes: null, byEvent: new Map(), refs: [], devices: [], countries: [], errors: [], wau: null, warnings: [] };
  const q = async <T,>(query: string): Promise<T[]> => { try { return await sql<T>(env, query, fetchFn); } catch (e) { const w = String(e).slice(0, 160); console.warn("summarize:", w); if (out.warnings.length < 3) out.warnings.push(w); return []; } };
  const w = range(since, until);
  for (const r of await q<{ n: string; s: number; u: number; c: number }>(`SELECT blob1 AS n, count(DISTINCT blob2) AS s, count(DISTINCT blob3) AS u, SUM(_sample_interval) AS c FROM ${DATASET} WHERE ${w} GROUP BY n`)) {
    out.byEvent.set(r.n, { sessions: Number(r.s), users: Number(r.u), count: Number(r.c) });
  }
  const open = out.byEvent.get("open");
  out.sessions = open?.sessions ?? 0; out.users = open?.users ?? 0;
  for (const r of await q<{ f: string; s: number }>(`SELECT blob7 AS f, count(DISTINCT blob2) AS s FROM ${DATASET} WHERE ${w} AND blob1 = 'open' GROUP BY f`)) if (r.f === "1") out.newSessions = Number(r.s);
  const engaged = await q<{ s: number }>(`SELECT count(DISTINCT blob2) AS s FROM ${DATASET} WHERE ${w} AND blob1 NOT IN ('open', 'ping', 'error')`);
  if (out.sessions && engaged[0]) out.bounce = Math.max(0, 1 - Number(engaged[0].s) / out.sessions);
  const dur = await q<{ m: number }>(`SELECT quantiles(0.5)(d) AS m FROM (SELECT blob2, (toUnixTimestamp(max(timestamp)) - toUnixTimestamp(min(timestamp))) / 60 AS d FROM ${DATASET} WHERE ${w} GROUP BY blob2)`);
  if (dur[0]?.m != null) { const v = Array.isArray(dur[0].m) ? (dur[0].m as unknown as number[])[0] : dur[0].m; if (v != null) out.medianMinutes = Number(v); }
  const top = async (col: string): Promise<Array<[string, number]>> => (await q<{ k: string; s: number }>(`SELECT ${col} AS k, count(DISTINCT blob2) AS s FROM ${DATASET} WHERE ${w} AND blob1 = 'open' GROUP BY k ORDER BY s DESC LIMIT 6`)).map((r) => [r.k || "—", Number(r.s)]);
  out.refs = await top("blob5"); out.devices = await top("blob4"); out.countries = await top("blob6");
  out.errors = (await q<{ k: string; s: number }>(`SELECT blob8 AS k, count(DISTINCT blob2) AS s FROM ${DATASET} WHERE ${w} AND blob1 = 'error' GROUP BY k ORDER BY s DESC LIMIT 3`)).map((r) => [r.k, Number(r.s)]);
  const wau = await q<{ u: number }>(`SELECT count(DISTINCT blob3) AS u FROM ${DATASET} WHERE ${range(weekSince, until)} AND blob1 = 'open'`);
  if (wau[0]) out.wau = Number(wau[0].u);
  return out;
}

/** 段階の文: 開いた 50 → ベース 30 → … と、一番減った所 */
export function funnelText(sum: Summary, steps: readonly string[]): string {
  const n = steps.map((s) => sum.byEvent.get(s)?.sessions ?? 0);
  if (!n[0]) return "—";
  const parts = steps.map((s, i) => `${STEP_JA[s] ?? s} ${n[i]}`);
  let worst = -1, worstDrop = 0;
  for (let i = 1; i < n.length; i++) { const prev = n[i - 1]!; if (prev >= 5) { const drop = 1 - n[i]! / prev; if (drop > worstDrop) { worstDrop = drop; worst = i; } } }
  const note = worst > 0 && worstDrop >= 0.3 ? ` ← 一番減った所: ${STEP_JA[steps[worst - 1]!]}→${STEP_JA[steps[worst]!]} (-${Math.round(worstDrop * 100)}%)` : "";
  return parts.join(" → ") + note;
}
