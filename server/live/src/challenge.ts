/**
 * 今日のお題 (2026-10-13 オーナー「また来て色々やりたいなって思う作り」「ニックネームで最速何手」「時間だけの順位も」「最速手も見れるように」)。
 *
 * お題 (ベース・狙う MOD) と乱数の種は日付 (JST) から決まる (src/services/challenge/daily.ts)。全員同じ手を打てば同じ結果
 * (オーナー「乱数は一緒に、カオススパム沼ったら可哀想」)。お題は「挑戦する」まで画面が伏せる。
 * 1 回達成すると上位の手順を見られる (まねできる) ので、タイムの順位はその人のその日の最初の挑戦だけ。手数は何回でも (同じ手数なら先に達成した方が上)。
 * サーバーは時間を測り (始めた時刻を覚える)、1 日 1 人の一番の記録を 2 つ (手数・時間) 残し、上位を手順ごと配る。置き場は D1 (KV は使わない)。
 *   POST /challenge/start  { day, uid }                         → { run, seed, first }
 *   POST /challenge/finish { run, uid, nick, steps, cost, plan } → { ok, ms, best }
 *   GET  /challenge/board?day=&uid=                              → { steps: [...], time: [...], me } (手順は入れない。軽く)
 *   GET  /challenge/plan?day=&board=steps|time&rank=N            → { plan } (行を押した時に 1 人分)
 * 手順 (plan) は打ち直さない (Worker の CPU に収まらない)。種・手の数が合っているかだけ見る
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

const NICK_MAX = 12;
/** 制御文字・幅の無い文字・向きを変える文字 (書くと字がずれるので、文字の番号で組む) */
const BAD_CHARS = new RegExp(`[${[[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`, "g");
/** ニックネーム: 前後の空白・制御文字を外して 1〜12 字。URL っぽい物は通さない */
export function cleanNick(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(BAD_CHARS, "").trim().slice(0, NICK_MAX);
  if (!s || /https?:|www\.|\.(com|net|jp|gg|io|tv)\b|discord\.gg/i.test(s)) return null;
  return s;
}

const MAX_STEPS = 500;
const RUN_DAYS = 2;
const BOARD = 20;

interface Plan { seed?: unknown; steps?: unknown; base?: unknown }

export async function startRun(env: Env, body: unknown, now = Date.now()): Promise<{ run: string; seed: number; first: boolean } | { error: string }> {
  const b = body as { day?: unknown; uid?: unknown };
  const day = typeof b?.day === "string" ? b.day : "";
  if (!env.LOGS) return { error: "置き場が無い" };
  if (typeof b?.uid !== "string" || !UID_RE.test(b.uid)) return { error: "形が違う" };
  // 今日 (と日付が変わった直後の昨日) のお題だけ
  if (day !== jstDay(now) && day !== jstDay(now - 600e3)) return { error: "今日のお題ではない" };
  const run = crypto.randomUUID();
  const seed = daySeed(day);
  // その日に始めた挑戦・記録が無ければ最初の挑戦 (途中でやめて始め直したのも 2 回目)
  const before = await env.LOGS.prepare("SELECT (SELECT COUNT(*) FROM challenge_runs WHERE day = ?1 AND uid = ?2) + (SELECT COUNT(*) FROM challenge_scores WHERE day = ?1 AND uid = ?2) AS n").bind(day, b.uid).first<{ n: number }>();
  const first = (before?.n ?? 0) === 0;
  await env.LOGS.prepare("INSERT INTO challenge_runs (id, day, uid, started, seed, first) VALUES (?, ?, ?, ?, ?, ?)").bind(run, day, b.uid, now, seed, first ? 1 : 0).run();
  return { run, seed, first };
}

export async function finishRun(env: Env, body: unknown, now = Date.now()): Promise<{ ok: true; ms: number; first: boolean; bestSteps: boolean; bestTime: boolean } | { error: string }> {
  const b = body as { run?: unknown; uid?: unknown; nick?: unknown; steps?: unknown; cost?: unknown; plan?: Plan };
  if (!env.LOGS) return { error: "置き場が無い" };
  if (typeof b?.run !== "string" || typeof b.uid !== "string" || !UID_RE.test(b.uid)) return { error: "形が違う" };
  const nick = cleanNick(b.nick);
  if (!nick) return { error: "ニックネームが使えない" };
  const steps = Number(b.steps);
  const cost = Number(b.cost);
  if (!Number.isInteger(steps) || steps < 1 || steps > MAX_STEPS || !Number.isFinite(cost) || cost < 0) return { error: "手数・費用が変" };
  const row = await env.LOGS.prepare("SELECT day, uid, started, seed, first FROM challenge_runs WHERE id = ?").bind(b.run).first<{ day: string; uid: string; started: number; seed: number; first: number }>();
  if (!row || row.uid !== b.uid) return { error: "挑戦が見つからない (始め直してください)" };
  // 手順: その挑戦の種で、手の数が手数と同じ
  const plan = b.plan;
  const planSteps = Array.isArray(plan?.steps) ? plan!.steps.length : -1;
  if (plan?.seed !== row.seed || planSteps !== steps) return { error: "手順が合わない" };
  const planJson = JSON.stringify(plan);
  if (planJson.length > 60_000) return { error: "手順が長すぎる" };
  const ms = now - row.started;
  // 1 回の挑戦で 1 回だけ (同じ時間で何度も載せない)
  await env.LOGS.prepare("DELETE FROM challenge_runs WHERE id = ?").bind(b.run).run();
  const cur = await env.LOGS.prepare("SELECT steps, cost, ms FROM challenge_scores WHERE day = ? AND uid = ?").bind(row.day, b.uid).first<{ steps: number | null; cost: number | null; ms: number | null }>();
  const bestSteps = !cur || cur.steps == null || steps < cur.steps || (steps === cur.steps && cost < (cur.cost ?? Infinity));
  // タイムは最初の挑戦だけ
  const bestTime = row.first === 1 && (!cur || cur.ms == null || ms < cur.ms);
  if (!cur) {
    await env.LOGS.prepare("INSERT INTO challenge_scores (day, uid, nick, steps, cost, steps_at, steps_plan, ms, ms_at, ms_plan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(row.day, b.uid, nick, steps, cost, now, planJson, bestTime ? ms : null, bestTime ? now : null, bestTime ? planJson : null).run();
  } else {
    await env.LOGS.prepare(`UPDATE challenge_scores SET nick = ?${bestSteps ? ", steps = ?, cost = ?, steps_at = ?, steps_plan = ?" : ""}${bestTime ? ", ms = ?, ms_at = ?, ms_plan = ?" : ""} WHERE day = ? AND uid = ?`)
      .bind(nick, ...(bestSteps ? [steps, cost, now, planJson] : []), ...(bestTime ? [ms, now, planJson] : []), row.day, b.uid).run();
  }
  return { ok: true, ms, first: row.first === 1, bestSteps, bestTime };
}

interface BoardRow { nick: string; steps: number; cost: number; ms: number; me?: boolean }
export async function board(env: Env, day: string, uid: string | null): Promise<{ steps: BoardRow[]; time: BoardRow[]; me: { stepsRank: number | null; timeRank: number | null; steps: number | null; ms: number | null } | null }> {
  if (!env.LOGS || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { steps: [], time: [], me: null };
  type R = { uid: string; nick: string; steps: number; cost: number; ms: number };
  const top = async (b: "steps" | "time"): Promise<BoardRow[]> => {
    const r = await env.LOGS!.prepare(`SELECT uid, nick, steps, cost, ms FROM challenge_scores WHERE day = ? AND ${ORDER[b].col} IS NOT NULL ORDER BY ${ORDER[b].by} LIMIT ${BOARD}`).bind(day).all<R>();
    return (r.results ?? []).map((x) => ({ nick: x.nick, steps: x.steps, cost: x.cost, ms: x.ms, ...(uid && x.uid === uid ? { me: true } : {}) }));
  };
  const [steps, time] = await Promise.all([top("steps"), top("time")]);
  let me = null;
  if (uid && UID_RE.test(uid)) {
    const m = await env.LOGS.prepare("SELECT steps, cost, steps_at, ms, ms_at FROM challenge_scores WHERE day = ? AND uid = ?").bind(day, uid).first<{ steps: number; cost: number; steps_at: number; ms: number; ms_at: number }>();
    if (m) {
      const a = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM challenge_scores WHERE day = ? AND (steps < ? OR (steps = ? AND (cost < ? OR (cost = ? AND steps_at < ?))))").bind(day, m.steps, m.steps, m.cost, m.cost, m.steps_at).first<{ n: number }>();
      const t = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM challenge_scores WHERE day = ? AND (ms < ? OR (ms = ? AND ms_at < ?))").bind(day, m.ms, m.ms, m.ms_at).first<{ n: number }>();
      me = { stepsRank: (a?.n ?? 0) + 1, timeRank: (t?.n ?? 0) + 1, steps: m.steps, ms: m.ms };
    }
  }
  return { steps, time, me };
}

const safeJson = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };
const ORDER = { steps: { col: "steps", by: "steps, cost, steps_at", plan: "steps_plan" }, time: { col: "ms", by: "ms, ms_at", plan: "ms_plan" } } as const;

/** 順位の N 番目 (1 から) の手順 (行を押した時に見る) */
export async function planAt(env: Env, day: string, b: string, rank: number): Promise<{ plan: unknown } | { error: string }> {
  if (!env.LOGS || !/^\d{4}-\d{2}-\d{2}$/.test(day) || (b !== "steps" && b !== "time") || !Number.isInteger(rank) || rank < 1 || rank > BOARD) return { error: "形が違う" };
  const o = ORDER[b];
  const r = await env.LOGS.prepare(`SELECT ${o.plan} AS plan FROM challenge_scores WHERE day = ? AND ${o.col} IS NOT NULL ORDER BY ${o.by} LIMIT 1 OFFSET ?`).bind(day, rank - 1).first<{ plan: string }>();
  return r ? { plan: safeJson(r.plan) } : { error: "無い" };
}

/** 古い挑戦 (始めたまま終わらなかった物) を消す (毎朝の cron) */
export async function sweepRuns(env: Env, now = Date.now()): Promise<void> {
  await env.LOGS?.prepare("DELETE FROM challenge_runs WHERE started < ?").bind(now - RUN_DAYS * 86400e3).run();
}
