// server/live (ライブ中のチャンネルを配る Worker) の、外に繋がずに確かめられる所 (2026-10-07)
import { describe, expect, it } from "vitest";
import { parseFeedVideoIds, parseLivePageVideoId, pickLive, readUntil, type VideoItem } from "../server/live/src/youtube";
import { pickStreams, thumbOf, getAppToken } from "../server/live/src/twitch";
import { buildState } from "../server/live/src/state";
import { refresh } from "../server/live/src/index";
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
