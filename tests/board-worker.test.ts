// server/live の掲示板 (board.ts) を、本物の SQLite (node:sqlite) を D1 の代わりにして確かめる (2026-10-16)。外には繋がない
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import worker from "../server/live/src/index";
import { ngReason, parseHit, parsePost, REPORT_HIDE } from "../server/live/src/board";
import type { Env } from "../server/live/src/types";

/** D1 の代わり (prepare → bind → first / all / run だけ) */
function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_logs.sql", "0002_nolog.sql", "0003_feedback_images.sql", "0004_board.sql", "0006_board_replies.sql"]) db.exec(readFileSync(`server/live/migrations/${f}`, "utf8"));
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
const UID = "abcdef123456";

function setup(extra: Partial<Env> = {}) {
  const env: Env = { LIVE: kv, LOGS: fakeD1(), REFRESH_KEY: "secret", ...extra };
  const call = async (path: string, body?: unknown, o: { ip?: string; key?: string } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json", "cf-connecting-ip": o.ip ?? "1.2.3.4" };
    if (o.key) headers["x-exiledesk-key"] = o.key;
    const r = await worker.fetch(new Request(`https://x${path}`, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) }), env, ctx);
    return { status: r.status, j: (await r.json()) as Record<string, unknown> & { items?: Array<Record<string, unknown>> } };
  };
  return { env, call };
}
const post = (o: Partial<{ uid: string; name: string; tag: string; text: string; website: string; parent: string; att: unknown }> = {}) => ({ uid: UID, name: "", tag: "advice", text: "手袋の作り方を教えて", ...o });
const hit = (o: Record<string, unknown> = {}) => ({ uid: UID, base: "Gold Ring", ilvl: 82, cur: "chaos", n: 12, modId: "Rings/AddedColdDamage", ti: 8, v: [10, 20], p: 0.0012, ...o });

describe("掲示板の書き込み", () => {
  it("書いて新しい順に読める。時刻・端末の番号は返さない", async () => {
    const { call } = setup();
    expect((await call("/board/post", post({ text: "1 つ目" }))).status).toBe(200);
    expect((await call("/board/post", post({ uid: "zzzzzz999999", text: "2 つ目", tag: "show", name: "テスト" }), { ip: "5.6.7.8" })).status).toBe(200);
    const { j } = await call("/board.json");
    expect(j.items!.map((x) => x.text)).toEqual(["2 つ目", "1 つ目"]);
    expect(j.items![0]).toEqual({ id: expect.any(String), kind: "post", name: "テスト", tag: "show", text: "2 つ目", likes: 0 });
    expect(JSON.stringify(j)).not.toContain(UID);
  });
  it("タグで絞れる (札はタグを持たないので出ない)", async () => {
    const { call } = setup();
    await call("/board/post", post({ tag: "advice", text: "相談" }));
    await call("/board/post", post({ uid: "zzzzzz999999", tag: "show", text: "自慢" }), { ip: "9.9.9.9" });
    await call("/board/hit", hit({ uid: "yyyyyy888888" }), { ip: "8.8.8.8" });
    expect((await call("/board.json?tag=show")).j.items!.map((x) => x.text)).toEqual(["自慢"]);
    expect((await call("/board.json")).j.items!.map((x) => x.kind)).toEqual(["hit", "post", "post"]);
    expect((await call("/board.json?tag=nope")).status).toBe(400);
  });
  it("1 端末 1 分 1 件 (同じ IP も)。1 時間 10 件", async () => {
    const { call } = setup();
    expect((await call("/board/post", post())).status).toBe(200);
    expect((await call("/board/post", post())).status).toBe(429);
    expect((await call("/board/post", post({ uid: "otherotherr1" }))).status).toBe(429);
    expect((await call("/board/post", post({ uid: "otherotherr1" }), { ip: "4.4.4.4" })).status).toBe(200);
  });
  it("タグは無くてもよい (2026-10-16 オーナー)。知らないタグ・空・長すぎ・bot よけは弾く", () => {
    expect(parsePost(post({ tag: "" }))).toMatchObject({ ok: true, tag: "" });
    expect(parsePost(post({ tag: undefined }))).toMatchObject({ ok: true, tag: "" });
    expect(parsePost(post({ tag: "spam" }))).toMatchObject({ ok: false });
    expect(parsePost(post({ text: "   " }))).toMatchObject({ ok: false, why: "本文が空" });
    expect(parsePost(post({ text: "あ".repeat(1001) }))).toMatchObject({ ok: false });
    expect(parsePost(post({ name: "あ".repeat(21) }))).toMatchObject({ ok: false });
    expect(parsePost(post({ website: "x" }))).toMatchObject({ ok: false, why: "bot" });
    expect(parsePost({ ...post(), uid: "x" })).toMatchObject({ ok: false });
  });
  it("禁止の言葉・外のリンク・メール・電話番号は弾く。普通のクラフトの話は通る", () => {
    expect(ngReason("死 ね")).toBeTruthy();
    expect(ngReason("ｋｉｌｌ ｙｏｕｒｓｅｌｆ")).toBeTruthy();
    expect(ngReason("https://example.com/x を見て")).toBe("外のリンクは貼れません");
    expect(ngReason("discord.gg/abc")).toBe("外のリンクは貼れません");
    expect(ngReason("a@b.jp")).toBeTruthy();
    expect(ngReason("090-1234-5678")).toBeTruthy();
    expect(ngReason("https://exiledesk.com/?stage-plan=x の手順")).toBeNull();
    expect(ngReason("カオス 100000000 回で T1 0.08%、楽しねー warmth")).toBeNull();
  });
});

describe("当たりの速報", () => {
  it("形を確かめる (好きな文字は載らない)", () => {
    expect(parseHit(hit())).toMatchObject({ ok: true });
    expect(parseHit(hit({ base: "<script>" }))).toMatchObject({ ok: false });
    expect(parseHit(hit({ cur: "divine" }))).toMatchObject({ ok: false });
    expect(parseHit(hit({ p: 0.5 }))).toMatchObject({ ok: false });
    expect(parseHit(hit({ modId: "a b" }))).toMatchObject({ ok: false });
  });
  it("1 端末 1 時間に 1 件まで (2026-10-16 オーナー「1 ID 1 時間に 1 回」)", async () => {
    const { call } = setup();
    expect((await call("/board/hit", hit())).j.ok).toBe(true);
    expect((await call("/board/hit", hit({ n: 99 }))).j).toMatchObject({ ok: false, why: "多すぎ" });
    expect((await call("/board/hit", hit({ modId: "Rings/AddedFireDamage" }))).j).toMatchObject({ ok: false, why: "多すぎ" });
    // 同じ IP からは端末を変えても同じ数 (連投よけ)
    expect((await call("/board/hit", hit({ uid: "zzzzzzzzzzzz", modId: "Rings/AddedFireDamage" }))).j).toMatchObject({ ok: false, why: "多すぎ" });
  });
  it("BOARD_HITS = 0 で止まる", async () => {
    const { call } = setup({ BOARD_HITS: "0" });
    expect((await call("/board/hit", hit())).j.ok).toBe(false);
    expect((await call("/board.json")).j.items).toEqual([]);
  });
});

describe("通報とオーナーが消す", () => {
  it(`通報 ${REPORT_HIDE} 件 (別の端末) で隠す。同じ端末の 2 回目は数えない`, async () => {
    const { call } = setup();
    const id = (await call("/board/post", post())).j.item as { id: string };
    for (const u of ["r1r1r1r1r1r1", "r1r1r1r1r1r1", "r2r2r2r2r2r2"]) await call("/board/report", { uid: u, id: id.id });
    expect((await call("/board.json")).j.items!.length).toBe(1);
    await call("/board/report", { uid: "r3r3r3r3r3r3", id: id.id });
    expect((await call("/board.json")).j.items!.length).toBe(0);
  });
  it("鍵が無いと消せない。ban で書いた端末と同じ IP は書けなくなる", async () => {
    const { call } = setup();
    const { id } = (await call("/board/post", post())).j.item as { id: string };
    expect((await call("/board/delete", { id })).status).toBe(403);
    expect((await call("/board/delete", { id, ban: true }, { key: "secret" })).j.ok).toBe(true);
    expect((await call("/board.json")).j.items).toEqual([]);
    expect((await call("/board/post", post({ uid: "newuidnewuid" }))).j.error).toBe("この端末からは書き込めません");
    const all = await call("/board/all.json", undefined, { key: "secret" });
    expect(all.j).toMatchObject([{ id, hidden: 2, uid: UID.slice(0, 6) }]);
  });
  it("30 件ずつ。before で続きを読む", async () => {
    const { env, call } = setup();
    for (let i = 0; i < 35; i++) await env.LOGS!.prepare("INSERT INTO board_posts (id, at, kind, uid, iph, name, tag, body) VALUES (?, ?, 'post', 'u', 'i', '', 'advice', ?)").bind(`${String(i).padStart(10, "0")}`, 1000 + i, `#${i}`).run();
    const a = (await call("/board.json")).j;
    expect(a.items!.length).toBe(30);
    expect(a.more).toBe(true);
    const b = (await call(`/board.json?before=${a.items![29]!.id}`)).j;
    expect(b.items!.map((x) => x.text)).toEqual(["#4", "#3", "#2", "#1", "#0"]);
    expect(b.more).toBe(false);
  });
});

describe("返信・いいね・貼ったアイテム (2 段目)", () => {
  const att = { b: "Gold Ring", i: 82, r: "rare", m: [["Rings/FireResistance", 7, [42], "s", ""], ["Rings/IncreasedLife", 5, [80], "p", "f"]] };
  it("返信は書き込みの中に古い順。返信が付いた書き込みは上に上がる。返信に返信はできない", async () => {
    const { call } = setup();
    const a = (await call("/board/post", post({ text: "A" }))).j.item as { id: string };
    const b = (await call("/board/post", post({ uid: "bbbbbbbbbbbb", text: "B" }, ), { ip: "5.5.5.5" })).j.item as { id: string };
    const r1 = await call("/board/post", post({ uid: "cccccccccccc", text: "A への返信", parent: a.id }), { ip: "6.6.6.6" });
    expect(r1.j.ok).toBe(true);
    const items = (await call("/board.json")).j.items!;
    expect(items.map((x) => x.id)).toEqual([a.id, b.id]);
    expect((items[0]!.replies as Array<{ text: string }>).map((x) => x.text)).toEqual(["A への返信"]);
    const rid = (r1.j.item as { id: string }).id;
    expect((await call("/board/post", post({ uid: "dddddddddddd", text: "x", parent: rid }), { ip: "7.7.7.7" })).j.error).toBe("返信には返信できません");
    expect((await call("/board/post", post({ uid: "eeeeeeeeeeee", text: "x", parent: "0123456789" }), { ip: "8.8.8.8" })).j.error).toBe("返信先がありません");
  });
  it("いいねはもう一度押すと外れる・同じ端末は 1 回", async () => {
    const { call } = setup();
    const a = (await call("/board/post", post())).j.item as { id: string };
    expect((await call("/board/like", { uid: "llllllllllll", id: a.id })).j).toMatchObject({ ok: true, likes: 1, liked: true });
    expect((await call("/board/like", { uid: "mmmmmmmmmmmm", id: a.id })).j).toMatchObject({ ok: true, likes: 2, liked: true });
    expect((await call("/board/like", { uid: "llllllllllll", id: a.id })).j).toMatchObject({ ok: true, likes: 1, liked: false });
    expect((await call("/board.json")).j.items![0]!.likes).toBe(1);
  });
  it("貼ったアイテムは形を確かめて残す。変な物は弾く", async () => {
    const { call } = setup();
    expect((await call("/board/post", post({ att }))).j.ok).toBe(true);
    expect((await call("/board.json")).j.items![0]!.att).toEqual(att);
    expect(parsePost(post({ att: { ...att, b: "<script>" } }))).toMatchObject({ ok: false });
    expect(parsePost(post({ att: { ...att, m: [["x", 1, [1], "q", ""]] } }))).toMatchObject({ ok: false });
    expect(parsePost(post({ att: { ...att, m: Array(13).fill(att.m[0]) } }))).toMatchObject({ ok: false });
  });
});
