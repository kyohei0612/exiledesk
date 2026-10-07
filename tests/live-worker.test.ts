// server/live (ライブ中のチャンネルを配る Worker) の、外に繋がずに確かめられる所 (2026-10-07)
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseFeedVideoIds, parseLivePageVideoId, pickLive, readUntil, type VideoItem } from "../server/live/src/youtube";
import { pickStreams, thumbOf, getAppToken } from "../server/live/src/twitch";
import { buildState } from "../server/live/src/state";
import worker, { proxyScout, refresh } from "../server/live/src/index";
import type { ChannelDef, Env } from "../server/live/src/types";

const CH: ChannelDef[] = [
  { id: "me", name: "自分", platform: "youtube", youtubeChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa", url: "https://www.youtube.com/@me" },
  { id: "spon", name: "協賛", platform: "twitch", twitchLogin: "Spon_Login", url: "https://www.twitch.tv/spon_login", pr: true },
];

/** 手元の KV の代わり */
function fakeKv(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    store,
    async get(key: string, type?: string) { const v = store.get(key) ?? null; return v != null && type === "json" ? JSON.parse(v) : v; },
    async put(key: string, value: string) { store.set(key, value); },
    async list(o: { prefix?: string; limit?: number }) { return { keys: [...store.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).sort().slice(0, o.limit ?? 1000).map((name) => ({ name })) }; },
  };
  return kv as unknown as KVNamespace & { store: Map<string, string> };
}

describe("YouTube の読み取り", () => {
  it("RSS から動画 ID を新しい順に拾う", () => {
    const xml = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId></entry><entry><yt:videoId>LMNOPQRSTU_</yt:videoId></entry></feed>`;
    expect(parseFeedVideoIds(xml)).toEqual(["abcdefghijk", "LMNOPQRSTU_"]);
  });
  it("/live ページの canonical が watch なら動画 ID、チャンネルなら null", () => {
    expect(parseLivePageVideoId(`<html><link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk"></html>`)).toBe("abcdefghijk");
    expect(parseLivePageVideoId(`<html><link rel="canonical" href="https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa/streams"></html>`)).toBeNull();
  });
  it("readUntil は正規表現に当たった所で読むのをやめる", async () => {
    // 本物のように少しずつ届く本文 (new Response(文字列) は一度に全部届くので、分けて流す)
    const head = `<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=abcdefghijk">`;
    const body = head + "x".repeat(2_000_000);
    const enc = new TextEncoder();
    let at = 0;
    const res = new Response(new ReadableStream<Uint8Array>({ pull(c) { if (at >= body.length) { c.close(); return; } c.enqueue(enc.encode(body.slice(at, at + 16_384))); at += 16_384; } }));
    const got = await readUntil(res, /<link rel="canonical"/);
    expect(got.length).toBeLessThan(1_000_000);
    expect(parseLivePageVideoId(got)).toBe("abcdefghijk");
  });
  it("videos.list からチャンネルごとに 1 本 (ライブ中 > 近い予定)、別チャンネルや none は無視", () => {
    const items: VideoItem[] = [
      { id: "oldvideo001", snippet: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "古い", liveBroadcastContent: "none" } },
      { id: "upcoming002", snippet: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "来週", liveBroadcastContent: "upcoming" }, liveStreamingDetails: { scheduledStartTime: "2026-10-14T10:00:00Z" } },
      { id: "upcoming001", snippet: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "明日", liveBroadcastContent: "upcoming" }, liveStreamingDetails: { scheduledStartTime: "2026-10-08T10:00:00Z" } },
      { id: "othersLive1", snippet: { channelId: "UCzzzzzzzzzzzzzzzzzzzzzz", title: "他人", liveBroadcastContent: "live" } },
    ];
    const m = pickLive(items, CH);
    expect([...m.keys()]).toEqual(["me"]);
    expect(m.get("me")).toMatchObject({ status: "upcoming", title: "明日", watchUrl: "https://www.youtube.com/watch?v=upcoming001", thumb: "https://i.ytimg.com/vi/upcoming001/mqdefault.jpg" });
    const live = pickLive([...items, { id: "livevideo01", snippet: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "今", liveBroadcastContent: "live", thumbnails: { medium: { url: "https://t/m.jpg" } } }, liveStreamingDetails: { actualStartTime: "2026-10-07T09:00:00Z", concurrentViewers: "12" } }], CH);
    expect(live.get("me")).toMatchObject({ status: "live", title: "今", viewers: 12, thumb: "https://t/m.jpg", startedAt: "2026-10-07T09:00:00Z" });
  });
});

describe("Twitch の読み取り", () => {
  it("サムネの型を埋め、ログイン名は大文字小文字を見ない、live 以外は無視", () => {
    expect(thumbOf("https://x/{width}x{height}.jpg")).toBe("https://x/320x180.jpg");
    const m = pickStreams([
      { user_login: "spon_login", user_name: "Spon", title: "配信中", viewer_count: 5, started_at: "2026-10-07T08:00:00Z", thumbnail_url: "https://x/{width}x{height}.jpg", type: "live" },
      { user_login: "someone", user_name: "S", title: "他人", viewer_count: 1, started_at: "", thumbnail_url: "", type: "live" },
    ], CH);
    expect([...m.keys()]).toEqual(["spon"]);
    expect(m.get("spon")).toMatchObject({ pr: true, viewers: 5, thumb: "https://x/320x180.jpg", watchUrl: "https://www.twitch.tv/spon_login" });
  });
  it("アプリのトークンは KV に覚えて、残り 1 日以上あれば取り直さない", async () => {
    const kv = fakeKv();
    let calls = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify({ access_token: "tok", expires_in: 5_000_000 })); }) as unknown as typeof fetch;
    expect(await getAppToken(kv, "id", "sec", f, 1_000)).toBe("tok");
    expect(await getAppToken(kv, "id", "sec", f, 2_000)).toBe("tok");
    expect(calls).toBe(1);
    expect(await getAppToken(kv, "id", "sec", f, 5_000_000_000)).toBe("tok");
    expect(calls).toBe(2);
  });
});

describe("まとめと 1 回分", () => {
  it("ライブ中は自分のチャンネルが先、全チャンネルは channels.json の並びで status 付き", () => {
    const st = buildState(CH, new Map([
      ["spon", { id: "spon", name: "協賛", platform: "twitch", url: "", pr: true, status: "live", title: "", thumb: null, watchUrl: "", startedAt: null, scheduledAt: null, viewers: 100 }],
      ["me", { id: "me", name: "自分", platform: "youtube", url: "", pr: false, status: "live", title: "", thumb: null, watchUrl: "", startedAt: null, scheduledAt: null, viewers: 3 }],
    ]), new Map([["me", "https://a/me.jpg"]]), [], new Date("2026-10-07T09:00:00Z"));
    expect(st.live.map((x) => x.id)).toEqual(["me", "spon"]);
    expect(st.channels.map((c) => `${c.id}:${c.status}:${c.avatar ?? "-"}`)).toEqual(["me:live:https://a/me.jpg", "spon:live:-"]);
    expect(st.updatedAt).toBe("2026-10-07T09:00:00.000Z");
  });

  it("refresh: 外への問い合わせを差し替えて 1 回分を通し、KV に state が書かれる。落ちた所は errors に入って他は続く", async () => {
    const kv = fakeKv();
    const env: Env = { LIVE: kv, YOUTUBE_API_KEY: "yt", TWITCH_CLIENT_ID: "tid", TWITCH_CLIENT_SECRET: "tsec" };
    const seen: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const u = String(input);
      seen.push(u);
      if (u.includes("feeds/videos.xml")) return new Response(`<feed><entry><yt:videoId>feedvideo01</yt:videoId></entry></feed>`);
      if (u.endsWith("/live")) return new Response(`<html><link rel="canonical" href="https://www.youtube.com/watch?v=livevideo01">`);
      if (u.includes("/youtube/v3/videos")) {
        expect(new URL(u).searchParams.get("id")!.split(",").sort()).toEqual(["feedvideo01", "livevideo01"]);
        return new Response(JSON.stringify({ items: [{ id: "livevideo01", snippet: { channelId: "UCaaaaaaaaaaaaaaaaaaaaaa", title: "今", liveBroadcastContent: "live" } }] }));
      }
      if (u.includes("/youtube/v3/channels")) return new Response(JSON.stringify({ items: [{ id: "UCaaaaaaaaaaaaaaaaaaaaaa", snippet: { thumbnails: { medium: { url: "https://a/me.jpg" } } } }] }));
      if (u.includes("id.twitch.tv/oauth2/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 5_000_000 }));
      if (u.includes("helix/streams")) return new Response("boom", { status: 500 });
      if (u.includes("helix/users")) return new Response(JSON.stringify({ data: [{ login: "spon_login", profile_image_url: "https://a/spon.png" }] }));
      throw new Error("unexpected " + u);
    }) as unknown as typeof fetch;
    const st = await refresh(env, CH, f, new Date("2026-10-07T09:00:00Z"));
    expect(st.live.map((x) => x.id)).toEqual(["me"]);
    expect(st.channels.map((c) => `${c.id}:${c.status}:${c.avatar}`)).toEqual(["me:live:https://a/me.jpg", "spon:off:https://a/spon.png"]);
    expect(st.errors.join(" ")).toMatch(/twitch: .*streams 500/);
    expect(JSON.parse(kv.store.get("state")!)).toEqual(st);
    // videos.list は 1 回 (1 点) だけ
    expect(seen.filter((u) => u.includes("/youtube/v3/videos"))).toHaveLength(1);
    // 2 回目はアイコンを取り直さない (1 日 1 回)
    const n = seen.length;
    await refresh(env, CH, f, new Date("2026-10-07T09:05:00Z"));
    expect(seen.slice(n).some((u) => u.includes("/youtube/v3/channels") || u.includes("helix/users"))).toBe(false);
  });
});

describe("相場の中継 (/api/poe2scout)", () => {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  it("path と query をそのまま poe2scout に渡し、CORS と 10 分のキャッシュを付けて返す", async () => {
    let seen = "";
    const f = (async (input: RequestInfo | URL) => { seen = String(input); return new Response('{"a":1}', { headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
    const r = await proxyScout(new URL("https://x.workers.dev/api/poe2scout/poe2/items/currency/currency?league=Rise%20of%20the%20Abyssal&page=1"), ctx, f);
    expect(seen).toBe("https://api.poe2scout.com/poe2/items/currency/currency?league=Rise%20of%20the%20Abyssal&page=1");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toBe("public, max-age=600");
    expect(await r.json()).toEqual({ a: 1 });
  });
  it("fetch の入口から届く (GET /api/poe2scout/…)、上流の 404 はそのまま", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    try {
      const env: Env = { LIVE: fakeKv() };
      const r = await worker.fetch(new Request("https://x.workers.dev/api/poe2scout/poe2/Leagues"), env, ctx);
      expect(r.status).toBe(404);
      expect(r.headers.get("access-control-allow-origin")).toBe("*");
    } finally { globalThis.fetch = orig; }
  });
});

describe("要望・バグ (/feedback)", () => {
  const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
  const post = (body: unknown, ip = "1.2.3.4") => new Request("https://x.workers.dev/feedback", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": ip }, body: JSON.stringify(body) });
  afterEach(() => { vi.useRealTimers(); });
  it("保存して新しい順に一覧、bot よけと空の本文は捨てる、同じ IP は 1 時間 10 件まで", async () => {
    // 1 分に 1 件の決まりがあるので、時計を進めながら送る
    vi.useFakeTimers({ toFake: ["Date"] });
    let t = Date.UTC(2026, 9, 7, 1, 0, 0);
    const tick = (): void => { t += 61_000; vi.setSystemTime(t); };
    vi.setSystemTime(t);
    const env: Env = { LIVE: fakeKv(), REFRESH_KEY: "k" };
    const r1 = await worker.fetch(post({ kind: "bug", text: "偉大で 2 つ付かない", contact: "@me", context: { base: "Polished Bracers" } }), env, ctx);
    expect(r1.status).toBe(200);
    tick();
    const r2 = await worker.fetch(post({ kind: "request", text: "レシピの共有" }), env, ctx);
    expect(r2.status).toBe(200);
    expect((await worker.fetch(post({ kind: "bug", text: "x", website: "http://spam" }), env, ctx)).status).toBe(200); // bot には成功したふり
    expect((await worker.fetch(post({ kind: "bug", text: "   " }), env, ctx)).status).toBe(400);
    expect((await worker.fetch(post({ kind: "nope", text: "x" }), env, ctx)).status).toBe(400);
    const list = await (await worker.fetch(new Request("https://x.workers.dev/feedback.json?key=k"), env, ctx)).json() as Array<{ text: string; kind: string; contact: string; context: unknown }>;
    expect(list.map((x) => x.kind)).toEqual(["request", "bug"]);
    expect(list[1]).toMatchObject({ contact: "@me", context: { base: "Polished Bracers" } });
    expect((await worker.fetch(new Request("https://x.workers.dev/feedback.json?key=wrong"), env, ctx)).status).toBe(403);
    for (let i = 0; i < 8; i++) { tick(); await worker.fetch(post({ kind: "request", text: `n${i}` }), env, ctx); }
    tick();
    expect((await worker.fetch(post({ kind: "request", text: "11 件目" }), env, ctx)).status).toBe(429);
    expect((await worker.fetch(post({ kind: "request", text: "別の人" }, "5.6.7.8"), env, ctx)).status).toBe(200);
  });
  it("Discord のウェブフックがあれば流す (本文と添付の頭)", async () => {
    const { notifyDiscord } = await import("../server/live/src/feedback");
    let sent: { content: string } | null = null;
    let file: { name: string; text: string } | null = null;
    const f = (async (_u: RequestInfo | URL, init?: RequestInit) => {
      const form = init?.body as FormData;
      sent = JSON.parse(String(form.get("payload_json")));
      const blob = form.get("files[0]") as File | null;
      if (blob) file = { name: blob.name, text: await blob.text() };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    const ctx = { version: "0.1.385", mode: "sim", base: "Polished Bracers", itemLevel: 82, sim: { targets: [1, 2, 3], patterns: [1] }, errors: [{ msg: "TypeError: x is undefined" }], trail: [{ n: "open", ago: 9 }] };
    const ok = await notifyDiscord("https://discord/hook", { id: "a1b2", at: "2026-10-07T12:00:00.000Z", kind: "bug", text: "壊れた", contact: "@me", context: ctx, ua: "", ip: "" }, f);
    expect(ok).toBe(true);
    expect(sent!.content).toContain("🐛 バグ");
    expect(sent!.content).toContain("壊れた");
    expect(sent!.content).toContain("状態: v0.1.385 · シミュレーション · Polished Bracers ilvl82 · 狙い 3 · パターン 1 · JS エラー 1");
    expect(sent!.content).toContain("流れ: open (9秒前)");
    expect(sent!.content).toContain("直近のエラー: TypeError: x is undefined");
    expect(file!.name).toBe("feedback-a1b2.json");
    expect(JSON.parse(file!.text).context.sim.targets).toEqual([1, 2, 3]);
  });
});

describe("操作の印と日報 (events / monitor)", () => {
  it("届いた印を確かめる: id の形、名前の形、50 件まで、端末と流入元", async () => {
    const { parseBatch } = await import("../server/live/src/events");
    expect(parseBatch(null)).toBeNull();
    expect(parseBatch({ uid: "x", sid: "abcdefgh", ev: [{ n: "open" }] })).toBeNull();
    const b = parseBatch({ uid: "abcdefgh1234", sid: "zzzzzzzz", first: true, dev: "mobile", ref: "WWW.YouTube.com", ev: [{ n: "open" }, { n: "BAD NAME" }, { n: "error", x: "x".repeat(300) }] })!;
    expect(b.first).toBe(true); expect(b.dev).toBe("mobile"); expect(b.ref).toBe("www.youtube.com");
    expect(b.ev.map((e) => e.n)).toEqual(["open", "error"]);
    expect(b.ev[1]!.x!.length).toBe(120);
    expect(parseBatch({ uid: "abcdefgh1234", sid: "zzzzzzzz", ev: Array.from({ length: 60 }, () => ({ n: "ping" })) })!.ev).toHaveLength(50);
  });
  it("段階の文: 到達した人数と一番減った所", async () => {
    const { funnelText, FUNNEL_SIM } = await import("../server/live/src/events");
    const byEvent = new Map([["open", 50], ["mode:sim", 30], ["sim:base", 28], ["sim:targets", 20], ["sim:order", 8], ["sim:pattern", 7], ["sim:run", 6], ["sim:done", 5], ["trade:open", 2]].map(([k, v]) => [k as string, { sessions: v as number, users: v as number, count: v as number }]));
    const t = funnelText({ sessions: 50, users: 50, newSessions: 0, bounce: null, medianMinutes: null, byEvent, refs: [], devices: [], countries: [], errors: [], wau: null, warnings: [] }, FUNNEL_SIM);
    expect(t).toContain("開いた 50 → シミュレーション 30");
    expect(t).toContain("一番減った所: 狙い→順番 (-60%)");
  });
  it("日本時間の昨日と、直前の流れの文、日報の文面", async () => {
    const { yesterdayJst, reportText } = await import("../server/live/src/monitor");
    const { trailText } = await import("../server/live/src/feedback");
    const y = yesterdayJst(new Date("2026-10-07T00:00:00Z")); // = 10/7 09:00 JST
    expect(y.since).toBe("2026-10-05T15:00:00.000Z"); expect(y.until).toBe("2026-10-06T15:00:00.000Z"); expect(y.label).toBe("10/6");
    expect(trailText({ trail: [{ n: "open", ago: 130 }, { n: "mode:sim", ago: 40 }, { n: "sim:base", ago: 3 }] })).toBe("open (2分前) → mode:sim (40秒前) → sim:base (3秒前)");
    const text = reportText("10/6", null, { visits: null, pageViews: null, liveRequests: null, liveErrors: null, why: "CF_ANALYTICS_TOKEN が無い" }, { requests: 1, bugs: 2 }, null, ["相場の中継"]);
    expect(text).toContain("日報 10/6"); expect(text).toContain("訪問の集計は取れませんでした (CF_ANALYTICS_TOKEN が無い)"); expect(text).toContain("要望が 1 件、バグ報告が 2 件"); expect(text).toContain("異常の通知が 1 回ありました: 相場の中継");
    // 人が来た日は文章で: 何人・どこから・端末・一番減った所
    const byEvent = new Map([["open", 42], ["mode:sim", 25], ["mode:hand", 18], ["sim:base", 24], ["sim:targets", 20], ["sim:order", 8], ["sim:pattern", 7], ["sim:run", 6], ["sim:done", 5], ["trade:open", 3]].map(([k, v]) => [k as string, { sessions: v as number, users: v as number, count: v as number }]));
    const full = reportText("10/6", { sessions: 42, users: 40, newSessions: 30, bounce: 0.48, medianMinutes: 6.2, byEvent, refs: [["www.youtube.com", 20], ["direct", 15], ["t.co", 5]], devices: [["pc", 38], ["mobile", 4]], countries: [["JP", 41], ["US", 1]], errors: [], wau: 120, warnings: [] }, { visits: 40, pageViews: 60, liveRequests: 1200, liveErrors: 0 }, { requests: 0, bugs: 0 }, null, []);
    expect(full).toContain("昨日は 42 回の訪問がありました (新しい人 30、前にも来た人 12、人数にして 40 人)");
    expect(full).toContain("来た道は youtube.com 20 回、次が 直接 (URL を直に開いた) 15 回、次が t.co 5 回。端末は PC が 90%、スマホが 10%。ほぼ日本からです。");
    expect(full).toContain("一番減ったのは「狙い → 順番」(20 人 → 8 人、-60%)");
    expect(full).toContain("この 7 日で来た人は 120 人です。");
  });
  it("異常の通知は同じ物を 6 時間に 1 回、要望は 1 分に 1 件", async () => {
    const { alert } = await import("../server/live/src/monitor");
    const { allowIp } = await import("../server/live/src/feedback");
    const kv = fakeKv();
    let posts = 0;
    const f = (async () => { posts++; return new Response(null, { status: 204 }); }) as unknown as typeof fetch;
    const env: Env = { LIVE: kv, DISCORD_WEBHOOK: "https://discord/hook" };
    expect(await alert(env, "相場の中継", "落ちた", f)).toBe(true);
    expect(await alert(env, "相場の中継", "また落ちた", f)).toBe(false);
    expect(posts).toBe(1);
    expect(await allowIp(kv, "9.9.9.9", 1_000_000)).toBeNull();
    expect(await allowIp(kv, "9.9.9.9", 1_010_000)).toMatch(/1 分に 1 件/);
    expect(await allowIp(kv, "9.9.9.9", 1_070_000)).toBeNull();
  });
});
