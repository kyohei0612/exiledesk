// server/live の今日のお題 (challenge.ts) を、本物の SQLite (node:sqlite) を D1 の代わりにして確かめる (2026-10-16)。外には繋がない
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import worker from "../server/live/src/index";
import { cleanNick, daySeed as serverSeed, jstDay, parseFinish } from "../server/live/src/challenge";
import { daySeed as clientSeed, jstDay as clientDay } from "../src/services/challenge/daily";
import type { Env } from "../server/live/src/types";

/** D1 の代わり (prepare → bind → first / all / run だけ)。表は migrations を番号順に全部 */
function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("server/live/migrations").filter((x) => x.endsWith(".sql")).sort()) db.exec(readFileSync(`server/live/migrations/${f}`, "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async <T,>() => (db.prepare(sql).get(...(args as never[])) ?? null) as T | null,
    all: async <T,>() => ({ results: db.prepare(sql).all(...(args as never[])) as T[] }),
    run: async () => { const r = db.prepare(sql).run(...(args as never[])); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}
const kv = { get: async () => null, put: async () => {}, list: async () => ({ keys: [] }) } as unknown as KVNamespace;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function setup() {
  const env: Env = { LIVE: kv, LOGS: fakeD1(), REFRESH_KEY: "secret" };
  const call = async (path: string, body?: unknown) => {
    const headers = { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4" };
    const r = await worker.fetch(new Request(`https://x${path}`, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) }), env, ctx);
    return { status: r.status, j: (await r.json()) as Record<string, any> };
  };
  const day = jstDay();
  /** 始めて、手を n 手打った事にして送る */
  const play = async (uid: string, nick: string, o: { steps: number; cost: number; swamp?: Record<string, number> }) => {
    const s = await call("/challenge/start", { day, uid });
    expect(s.status).toBe(200);
    const plan = { base: "Gold Ring", seed: s.j.seed, start: { mods: [{ mod: "x", tier: "T2", fractured: true }] }, steps: Array.from({ length: o.steps }, () => ({ currency: "chaos" })) };
    return call("/challenge/finish", { run: s.j.run, uid, nick, steps: o.steps, cost: o.cost, plan, swamp: o.swamp });
  };
  return { env, call, play, day };
}

describe("お題の種", () => {
  it("日付で決まり、画面とサーバーで同じ", () => {
    for (const d of ["2026-10-16", "2026-10-17", "2027-01-01"]) expect(clientSeed(d)).toBe(serverSeed(d));
    expect(serverSeed("2026-10-16")).toBe(serverSeed("2026-10-16"));
    expect(serverSeed("2026-10-16")).not.toBe(serverSeed("2026-10-17"));
  });
  it("日付は JST の 0 時で変わる", () => {
    const t = Date.UTC(2026, 9, 16, 14, 59, 59); // JST 23:59:59
    expect(jstDay(t)).toBe("2026-10-16");
    expect(jstDay(t + 1000)).toBe("2026-10-17");
    expect(clientDay(t + 1000)).toBe("2026-10-17");
  });
  it("始めると全員に同じ種", async () => {
    const { call, day } = setup();
    const a = await call("/challenge/start", { day, uid: "aaaaaa111111" });
    const b = await call("/challenge/start", { day, uid: "bbbbbb222222" });
    expect(a.j.seed).toBe(serverSeed(day));
    expect(b.j.seed).toBe(a.j.seed);
    expect(a.j.first).toBe(true);
    expect((await call("/challenge/start", { day, uid: "aaaaaa111111" })).j.first).toBe(false);
    expect((await call("/challenge/start", { day: "2020-01-01", uid: "aaaaaa111111" })).status).toBe(400);
  });
});

describe("順位", () => {
  it("費用 → 手数 → 時間の順。1 人 1 行で一番の記録", async () => {
    const { call, play } = setup();
    await play("aaaaaa111111", "A", { steps: 3, cost: 10 });
    await play("bbbbbb222222", "B", { steps: 9, cost: 5 });
    await play("cccccc333333", "C", { steps: 2, cost: 5 });
    // A がもう一度、より安く
    const again = await play("aaaaaa111111", "A2", { steps: 20, cost: 4 });
    expect(again.j.best).toBe(true);
    expect(again.j.rank).toBe(1);
    // A の悪い記録は一番を変えない
    expect((await play("aaaaaa111111", "A", { steps: 1, cost: 50 })).j.best).toBe(false);
    const { j } = await call("/challenge/board?uid=cccccc333333");
    expect(j.rows.map((r: any) => [r.pos, r.nick, r.cost, r.steps])).toEqual([[1, "A2", 4, 20], [2, "C", 5, 2], [3, "B", 5, 9]]);
    expect(j.me).toMatchObject({ pos: 2, nick: "C", me: true });
    expect(j.players).toBe(3);
    // 端末の番号は返さない
    expect(JSON.stringify(j)).not.toContain("aaaaaa111111");
  });
  it("沼ランキングは一番沼った達成の合計 (振り出しも数える)", async () => {
    const { call, play } = setup();
    await play("aaaaaa111111", "A", { steps: 30, cost: 10, swamp: { chaos: 20, resets: 1 } });
    await play("bbbbbb222222", "B", { steps: 30, cost: 10, swamp: { chaos: 5, whittle: 3, annul: 2 } });
    await play("cccccc333333", "C", { steps: 3, cost: 1 });
    const { j } = await call("/challenge/board");
    expect(j.swamp.map((r: any) => r.nick)).toEqual(["A", "B"]);
    expect(j.swamp[0].swamp).toEqual({ chaos: 20, whittle: 0, annul: 0, resets: 1 });
  });
});

describe("送る値の検証", () => {
  it("同じ挑戦は 1 回だけ・他人の挑戦は送れない", async () => {
    const { call, day } = setup();
    const s = await call("/challenge/start", { day, uid: "aaaaaa111111" });
    const body = { run: s.j.run, uid: "aaaaaa111111", nick: "A", steps: 1, cost: 1, plan: { seed: s.j.seed, steps: [{ currency: "chaos" }] } };
    expect((await call("/challenge/finish", { ...body, uid: "bbbbbb222222" })).status).toBe(400);
    expect((await call("/challenge/finish", body)).status).toBe(200);
    expect((await call("/challenge/finish", body)).j.error).toBe("もう送ってある");
  });
  it("種が違う手順は通さない", async () => {
    const { call, day } = setup();
    const s = await call("/challenge/start", { day, uid: "aaaaaa111111" });
    const r = await call("/challenge/finish", { run: s.j.run, uid: "aaaaaa111111", nick: "A", steps: 1, cost: 1, plan: { seed: s.j.seed + 1, steps: [{ currency: "chaos" }] } });
    expect(r.j.error).toBe("手順が合わない");
  });
  it("形の確かめ (手数・費用・指名・始めの状態・沼の数・ニックネーム)", () => {
    const ok = { run: "12345678-1234-1234-1234-123456789abc", uid: "aaaaaa111111", nick: "A", steps: 2, cost: 3, plan: { seed: 1, steps: [{ currency: "chaos" }, { currency: "exalt" }] } };
    expect("error" in parseFinish(ok)).toBe(false);
    expect(parseFinish({ ...ok, steps: 3 })).toEqual({ error: "手順が合わない" });
    expect(parseFinish({ ...ok, steps: 0 })).toEqual({ error: "手数が変" });
    expect(parseFinish({ ...ok, cost: -1 })).toEqual({ error: "費用が変" });
    expect(parseFinish({ ...ok, cost: Number.NaN })).toEqual({ error: "費用が変" });
    expect(parseFinish({ ...ok, plan: { seed: 1, steps: [{ currency: "chaos" }, { currency: "force:Life" }] } })).toEqual({ error: "使えない手が入っている" });
    expect(parseFinish({ ...ok, plan: { ...ok.plan, start: { mods: [{ mod: "a" }] } } })).toEqual({ error: "始めの状態が違う" });
    expect(parseFinish({ ...ok, plan: { ...ok.plan, start: { mods: [{ mod: "a", fractured: true }, { mod: "b", fractured: true }] } } })).toEqual({ error: "始めの状態が違う" });
    expect(parseFinish({ ...ok, swamp: { chaos: 3 } })).toEqual({ error: "沼の数が変" });
    expect(parseFinish({ ...ok, swamp: { resets: 4 } })).toEqual({ error: "沼の数が変" });
    expect(parseFinish({ ...ok, nick: "" })).toEqual({ error: "ニックネームが使えない" });
    expect(cleanNick("  たろう  ")).toBe("たろう");
    expect(cleanNick("1234567890123")).toBeNull();
    expect(cleanNick("見てexample.com")).toBeNull();
    expect(cleanNick("a‮b")).toBe("ab");
  });
  it("今日の手順は自分が達成してから。昨日の分は誰でも", async () => {
    const { call, play, env, day } = setup();
    const r = await play("aaaaaa111111", "A", { steps: 2, cost: 1 });
    const id = r.j.id as string;
    expect((await call(`/challenge/plan?day=${day}&id=${id}&uid=bbbbbb222222`)).status).toBe(404);
    await play("bbbbbb222222", "B", { steps: 5, cost: 9 });
    const seen = await call(`/challenge/plan?day=${day}&id=${id}&uid=bbbbbb222222`);
    expect(seen.status).toBe(200);
    expect(seen.j.plan.steps).toHaveLength(2);
    // 昨日の分 (行を昨日に書き換えて確かめる)
    await env.LOGS!.prepare("UPDATE challenge_results SET day = '2020-01-01'").run();
    expect((await call(`/challenge/plan?day=2020-01-01&id=${id}`)).status).toBe(200);
  });
});
