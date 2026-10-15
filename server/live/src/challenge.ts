/**
 * 今日のお題 (2026-10-13 オーナー「また来て色々やりたいなって思う作り」、2026-10-16 docs/craft-challenge.md の形に直した)。
 *
 * お題 (ベース・狙う MOD) と乱数の種は日付 (JST) から決まる (src/services/challenge/daily.ts)。全員同じ手を打てば同じ結果
 * (オーナー「乱数は一緒に、カオススパム沼ったら可哀想」)。お題は「挑戦する」まで画面が伏せる。
 * 順位は 費用 → 手数 → 時間 (→ 先に出した方) の 1 本 (md の案)。1 人 1 行 = その人のその日の一番の記録。
 * 何回でも順位に入るか / 最初の挑戦だけかは決まっていない (md の論点 2) → 仮に何回でも (RANK_FIRST_ONLY で切り替え)。
 * 達成ごとに 1 行残すので、決まりが変わっても数え直せる。置き場は D1 (KV は使わない)。
 *   POST /challenge/start  { day, uid }                                  → { run, seed, first }
 *   POST /challenge/finish { run, uid, nick, steps, cost, plan, swamp }   → { ok, id, ms, first, best, rank }
 *   GET  /challenge/board?day=&uid=                                      → { players, rows, swamp, me } (手順は入れない。軽く)
 *   GET  /challenge/plan?day=&id=&uid=                                   → { plan } (行を押した時に 1 人分。今日の分は自分が 1 回達成してから)
 * 手順 (plan) は打ち直さない (Worker の CPU に収まらない)。種・手の数・使えない手 (指名) が無いかだけ見る
 */
import type { Env } from "./types";
import { UID_RE } from "./forget";

/** JST の日付 (YYYY-MM-DD) */
export const jstDay = (now = Date.now()): string => new Date(now + 9 * 3600e3).toISOString().slice(0, 10);
/** その日の乱数の種 (画面の daily.ts と同じ式。tests/challenge.test.ts で突き合わせる) */
export function daySeed(day: string): number {
  let h = 0x811c9dc5;
  for (const c of `exiledesk-challenge:${day}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return (h % 2_147_483_646) + 1;
}

/** 仮 (md の論点 2): true にすると順位に入るのはその日の最初の挑戦だけ */
export const RANK_FIRST_ONLY = false;
export const NICK_MAX = 12;
export const MAX_STEPS = 500;
export const MAX_RESETS = 3;
const MAX_COST = 1e7;
const RUN_DAYS = 2;
export const BOARD = 20;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 制御文字・幅の無い文字・向きを変える文字 (書くと字がずれるので、文字の番号で組む) */
const BAD_CHARS = new RegExp(`[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`, "g");
/** ニックネーム: 前後の空白・制御文字を外して 1〜12 字 (長い物は通さない)。URL っぽい物は通さない */
export function cleanNick(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(BAD_CHARS, "").trim();
  if (!s || [...s].length > NICK_MAX || /https?:|www\.|\.(com|net|org|jp|gg|io|tv|me|xyz)\b|discord\.gg/i.test(s)) return null;
  return s;
}

export interface Swamp { chaos: number; whittle: number; annul: number; resets: number }
export interface FinishIn { run: string; uid: string; nick: string; steps: number; cost: number; plan: { seed: number; steps: unknown[] }; planJson: string; swamp: Swamp }

/** 送られた達成の形を確かめる (挑戦の行との突き合わせは finishRun)。通らなければ理由 */
export function parseFinish(body: unknown): FinishIn | { error: string } {
  if (!body || typeof body !== "object") return { error: "形が違う" };
  const b = body as Record<string, unknown>;
  if (typeof b.run !== "string" || !/^[0-9a-f-]{36}$/.test(b.run) || typeof b.uid !== "string" || !UID_RE.test(b.uid)) return { error: "形が違う" };
  const nick = cleanNick(b.nick);
  if (!nick) return { error: "ニックネームが使えない" };
  const steps = b.steps, cost = b.cost;
  if (typeof steps !== "number" || !Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS) return { error: "手数が変" };
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > MAX_COST) return { error: "費用が変" };
  const plan = b.plan as { seed?: unknown; steps?: unknown; start?: { mods?: unknown } } | undefined;
  if (!plan || typeof plan !== "object" || typeof plan.seed !== "number" || !Array.isArray(plan.steps)) return { error: "手順が無い" };
  if (plan.steps.length !== steps) return { error: "手順が合わない" };
  // MOD を指名して付ける・外す / 暗黙の数値を決める手は使えない
  if (plan.steps.some((s) => !s || typeof s !== "object" || typeof (s as { currency?: unknown }).currency !== "string" || /^(force|iset):/.test((s as { currency: string }).currency))) return { error: "使えない手が入っている" };
  // 始めの状態は初手のフラクチャー 1 つだけ
  const mods = plan.start?.mods;
  if (mods !== undefined && (!Array.isArray(mods) || mods.length > 1 || mods.some((m) => !m || (m as { fractured?: unknown }).fractured !== true))) return { error: "始めの状態が違う" };
  const planJson = JSON.stringify(plan);
  if (planJson.length > 60_000) return { error: "手順が長すぎる" };
  const sw = (b.swamp ?? {}) as Record<string, unknown>;
  const cnt = (x: unknown, hi: number): number | null => (x === undefined ? 0 : typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= hi ? x : null);
  const swamp = { chaos: cnt(sw.chaos, steps), whittle: cnt(sw.whittle, steps), annul: cnt(sw.annul, steps), resets: cnt(sw.resets, MAX_RESETS) };
  if (Object.values(swamp).some((v) => v == null) || swamp.chaos! + swamp.whittle! > steps) return { error: "沼の数が変" };
  return { run: b.run, uid: b.uid, nick, steps, cost, plan: { seed: plan.seed, steps: plan.steps }, planJson, swamp: swamp as Swamp };
}
export const swampTotal = (s: Swamp): number => s.chaos + s.whittle + s.annul + s.resets;

export async function startRun(env: Env, body: unknown, now = Date.now()): Promise<{ run: string; seed: number; first: boolean } | { error: string }> {
  const b = body as { day?: unknown; uid?: unknown };
  const day = typeof b?.day === "string" ? b.day : "";
  if (!env.LOGS) return { error: "置き場が無い" };
  if (typeof b?.uid !== "string" || !UID_RE.test(b.uid)) return { error: "形が違う" };
  // 今日 (と日付が変わった直後の昨日) のお題だけ
  if (day !== jstDay(now) && day !== jstDay(now - 600e3)) return { error: "今日のお題ではない" };
  const run = crypto.randomUUID();
  const seed = daySeed(day);
  // その日に始めた挑戦が無ければ最初の挑戦 (途中でやめて始め直したのも 2 回目)
  const before = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM challenge_runs WHERE day = ? AND uid = ?").bind(day, b.uid).first<{ n: number }>();
  const first = (before?.n ?? 0) === 0;
  await env.LOGS.prepare("INSERT INTO challenge_runs (id, day, uid, started, seed, first) VALUES (?, ?, ?, ?, ?, ?)").bind(run, day, b.uid, now, seed, first ? 1 : 0).run();
  return { run, seed, first };
}

/** 一番の記録を 1 人 1 行に (費用 → 手数 → 時間 → 先に出した方)。仮の決まりで最初の挑戦だけにもできる */
const BEST = `SELECT * FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY uid ORDER BY cost, steps, ms, at) AS rn FROM challenge_results r WHERE day = ?1${RANK_FIRST_ONLY ? " AND first = 1" : ""}) WHERE rn = 1`;
const RANKED = `SELECT b.*, ROW_NUMBER() OVER (ORDER BY cost, steps, ms, at) AS pos FROM (${BEST}) b`;

export async function finishRun(env: Env, body: unknown, now = Date.now()): Promise<{ ok: true; id: string; ms: number; first: boolean; best: boolean; rank: number | null } | { error: string }> {
  if (!env.LOGS) return { error: "置き場が無い" };
  const f = parseFinish(body);
  if ("error" in f) return f;
  const row = await env.LOGS.prepare("SELECT day, uid, started, seed, first, done FROM challenge_runs WHERE id = ?").bind(f.run).first<{ day: string; uid: string; started: number; seed: number; first: number; done: number }>();
  if (!row || row.uid !== f.uid) return { error: "挑戦が見つからない (始め直してください)" };
  if (f.plan.seed !== row.seed) return { error: "手順が合わない" };
  // 1 回の挑戦で 1 回だけ (同じ時間で何度も載せない)
  const upd = await env.LOGS.prepare("UPDATE challenge_runs SET done = 1 WHERE id = ? AND done = 0").bind(f.run).run();
  if (!upd.meta?.changes) return { error: "もう送ってある" };
  const ms = now - row.started;
  const prev = await env.LOGS.prepare(`SELECT cost, steps, ms FROM (${BEST}) WHERE uid = ?2`).bind(row.day, f.uid).first<{ cost: number; steps: number; ms: number }>();
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  await env.LOGS.prepare("INSERT INTO challenge_results (id, day, uid, nick, first, cost, steps, ms, at, chaos, whittle, annul, resets, swamp, plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, row.day, f.uid, f.nick, row.first, f.cost, f.steps, ms, now, f.swamp.chaos, f.swamp.whittle, f.swamp.annul, f.swamp.resets, swampTotal(f.swamp), f.planJson).run();
  const best = !prev || f.cost < prev.cost || (f.cost === prev.cost && (f.steps < prev.steps || (f.steps === prev.steps && ms < prev.ms)));
  const me = await env.LOGS.prepare(`SELECT pos FROM (${RANKED}) WHERE uid = ?2`).bind(row.day, f.uid).first<{ pos: number }>();
  return { ok: true, id, ms, first: row.first === 1, best, rank: me?.pos ?? null };
}

export interface BoardRow { id: string; pos: number; nick: string; cost: number; steps: number; ms: number; swamp: Swamp; me?: true }
type R = { id: string; uid: string; nick: string; cost: number; steps: number; ms: number; chaos: number; whittle: number; annul: number; resets: number; pos: number };
const rowOf = (x: R, uid: string | null): BoardRow => ({ id: x.id, pos: x.pos, nick: x.nick, cost: x.cost, steps: x.steps, ms: x.ms, swamp: { chaos: x.chaos, whittle: x.whittle, annul: x.annul, resets: x.resets }, ...(uid && x.uid === uid ? { me: true as const } : {}) });

/** 今日 (day) の順位: 上位 20 人・沼ランキング 5 人 (その人の一番沼った達成)・挑戦した人数・自分の行 */
export async function board(env: Env, day: string, uid: string | null): Promise<{ players: number; rows: BoardRow[]; swamp: BoardRow[]; me: BoardRow | null }> {
  if (!env.LOGS || !DAY_RE.test(day)) return { players: 0, rows: [], swamp: [], me: null };
  const u = uid && UID_RE.test(uid) ? uid : null;
  const [p, top, sw, me] = await Promise.all([
    env.LOGS.prepare("SELECT COUNT(DISTINCT uid) AS n FROM challenge_runs WHERE day = ?").bind(day).first<{ n: number }>(),
    env.LOGS.prepare(`${RANKED} ORDER BY pos LIMIT ${BOARD}`).bind(day).all<R>(),
    env.LOGS.prepare(`SELECT *, ROW_NUMBER() OVER (ORDER BY swamp DESC, at) AS pos FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY uid ORDER BY swamp DESC, at) AS rn FROM challenge_results r WHERE day = ?1) WHERE rn = 1 AND swamp > 0 ORDER BY pos LIMIT 5`).bind(day).all<R>(),
    u ? env.LOGS.prepare(`SELECT * FROM (${RANKED}) WHERE uid = ?2`).bind(day, u).first<R>() : Promise.resolve(null),
  ]);
  return { players: p?.n ?? 0, rows: (top.results ?? []).map((x) => rowOf(x, u)), swamp: (sw.results ?? []).map((x) => rowOf(x, u)), me: me ? rowOf(me, u) : null };
}

const safeJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };

/** 1 人分の手順 (行を押した時に見る)。今日の分は、見る人が今日 1 回達成してから (お題と答えが分かるので) */
export async function planOf(env: Env, day: string, id: string, uid: string | null, now = Date.now()): Promise<{ plan: unknown } | { error: string }> {
  if (!env.LOGS || !DAY_RE.test(day) || !/^[0-9a-f]{16}$/.test(id)) return { error: "形が違う" };
  if (day >= jstDay(now)) {
    if (!uid || !UID_RE.test(uid)) return { error: "今日の手順は達成してから" };
    const mine = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM challenge_results WHERE day = ? AND uid = ?").bind(day, uid).first<{ n: number }>();
    if (!mine?.n) return { error: "今日の手順は達成してから" };
  }
  const r = await env.LOGS.prepare("SELECT plan FROM challenge_results WHERE day = ? AND id = ?").bind(day, id).first<{ plan: string }>();
  return r ? { plan: safeJson(r.plan) } : { error: "無い" };
}

/** 古い挑戦 (始めた印) を消す (毎朝の cron)。達成の記録は残す */
export async function sweepRuns(env: Env, now = Date.now()): Promise<void> {
  await env.LOGS?.prepare("DELETE FROM challenge_runs WHERE started < ?").bind(now - RUN_DAYS * 86400e3).run();
}
