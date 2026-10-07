/**
 * exiledesk-live: 「ライブ中のチャンネル」を 5 分おきに調べて配る Worker。
 *
 *   scheduled (5 分おき)  … YouTube / Twitch に問い合わせ → KV "state" に LiveState を書く
 *   GET /live.json        … KV の state をそのまま返す (CORS 許可、60 秒キャッシュ)。サイトはこれを読むだけ
 *   GET /refresh?key=…    … 手で今すぐ調べ直す (REFRESH_KEY が合う時だけ)
 *   GET /health           … 動いているか
 *
 * 見る人が何人いても YouTube / Twitch への問い合わせは 5 分に 1 回なので、無料枠 (Workers 10 万/日、KV 読み 10 万/日・書き 1,000/日、
 * YouTube 1 万点/日) に収まる。アイコン (アバター) は 1 日 1 回だけ取り直す
 */
import channelsJson from "../channels.json";
import { buildState } from "./state";
import { fetchTwitch, fetchTwitchAvatars, getAppToken } from "./twitch";
import { fetchYoutube, fetchYoutubeAvatars } from "./youtube";
import { allowIp, listFeedback, notifyDiscord, parseFeedback, saveFeedback, type Feedback } from "./feedback";
import type { ChannelDef, Env, Fetch, LiveState } from "./types";

const STATE_KEY = "state";
const AVATARS_KEY = "avatars";
const AVATAR_TTL = 24 * 3600 * 1000;

export const CHANNELS: ChannelDef[] = (channelsJson as { channels: ChannelDef[] }).channels;

interface AvatarRow { at: number; byId: Record<string, string> }

/** アイコンは 1 日 1 回。取れなければ前の物のまま */
async function avatarsOf(env: Env, channels: readonly ChannelDef[], fetchFn: Fetch, errors: string[], now: number): Promise<Map<string, string>> {
  const cached = (await env.LIVE.get(AVATARS_KEY, "json")) as AvatarRow | null;
  if (cached && now - cached.at < AVATAR_TTL) return new Map(Object.entries(cached.byId));
  const byId: Record<string, string> = { ...(cached?.byId ?? {}) };
  try {
    const yt = channels.filter((c) => c.platform === "youtube" && c.youtubeChannelId);
    if (yt.length && env.YOUTUBE_API_KEY) {
      const m = await fetchYoutubeAvatars(yt.map((c) => c.youtubeChannelId!), env.YOUTUBE_API_KEY, fetchFn);
      for (const c of yt) { const u = m.get(c.youtubeChannelId!); if (u) byId[c.id] = u; }
    }
    const tw = channels.filter((c) => c.platform === "twitch" && c.twitchLogin);
    if (tw.length && env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET) {
      const token = await getAppToken(env.LIVE, env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET, fetchFn, now);
      const m = await fetchTwitchAvatars(tw.map((c) => c.twitchLogin!), env.TWITCH_CLIENT_ID, token, fetchFn);
      for (const c of tw) { const u = m.get(c.twitchLogin!.toLowerCase()); if (u) byId[c.id] = u; }
    }
    await env.LIVE.put(AVATARS_KEY, JSON.stringify({ at: now, byId } satisfies AvatarRow));
  } catch (e) {
    errors.push(`avatars: ${String(e)}`);
  }
  return new Map(Object.entries(byId));
}

/** 1 回分: 調べて KV に書く。テストから fetch と時刻を差し替えられる */
export async function refresh(env: Env, channels: readonly ChannelDef[] = CHANNELS, fetchFn: Fetch = fetch, now = new Date()): Promise<LiveState> {
  const errors: string[] = [];
  const [yt, tw, avatars] = await Promise.all([
    fetchYoutube(channels, env.YOUTUBE_API_KEY, fetchFn, errors),
    fetchTwitch(channels, env, env.LIVE, fetchFn, errors),
    avatarsOf(env, channels, fetchFn, errors, now.getTime()),
  ]);
  const state = buildState(channels, new Map([...yt, ...tw]), avatars, errors, now);
  await env.LIVE.put(STATE_KEY, JSON.stringify(state));
  if (errors.length) console.warn("exiledesk-live:", errors.join(" | "));
  return state;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

/**
 * 相場の中継 (Web 版用、2026-10-07): GET /api/poe2scout/<path> → https://api.poe2scout.com/<path>。
 * 端のキャッシュに 10 分置くので、見る人が何人いても poe2scout には 10 分に 1 回ずつしか行かない。
 * (ブラウザから poe2scout を直に叩くと CORS で弾かれる。アプリ版は Rust 経由で直に叩くのでここは使わない)
 */
const SCOUT = "https://api.poe2scout.com";
const SCOUT_TTL = 600;
export async function proxyScout(url: URL, ctx: ExecutionContext, fetchFn: Fetch = fetch): Promise<Response> {
  const up = `${SCOUT}${url.pathname.slice("/api/poe2scout".length)}${url.search}`;
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(up, { method: "GET" });
  let res = cache ? await cache.match(key) : undefined;
  if (!res) {
    const u = await fetchFn(up, { headers: { accept: "application/json", "user-agent": "ExileDesk-web/0.1 (https://github.com/kyohei0612/exiledesk)" } });
    res = new Response(u.body, { status: u.status, headers: { "content-type": u.headers.get("content-type") ?? "application/json; charset=utf-8", "cache-control": `public, max-age=${SCOUT_TTL}` } });
    if (u.ok && cache) ctx.waitUntil(cache.put(key, res.clone()));
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refresh(env));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    // 要望・バグ (Web 版の「要望・バグを送る」)
    if (url.pathname === "/feedback" && req.method === "POST") {
      let body: unknown;
      try { body = await req.json(); } catch { return json({ error: "JSON ではない" }, 400); }
      const p = parseFeedback(body);
      if (!p.ok) return json({ error: p.why }, p.why === "bot" ? 200 : 400);
      const ip = req.headers.get("cf-connecting-ip") ?? "?";
      if (!(await allowIp(env.LIVE, ip))) return json({ error: "送りすぎ (1 時間に 10 件まで)" }, 429);
      const fb: Feedback = { id: crypto.randomUUID().slice(0, 8), at: new Date().toISOString(), kind: p.kind, text: p.text, contact: p.contact, context: p.context, ua: req.headers.get("user-agent") ?? "", ip };
      await saveFeedback(env.LIVE, fb);
      if (env.DISCORD_WEBHOOK) ctx.waitUntil(notifyDiscord(env.DISCORD_WEBHOOK, fb, fetch));
      return json({ ok: true, id: fb.id });
    }
    if (req.method !== "GET") return json({ error: "GET だけ" }, 405);
    if (url.pathname === "/feedback.json") {
      if (!env.REFRESH_KEY || url.searchParams.get("key") !== env.REFRESH_KEY) return json({ error: "key が違う" }, 403);
      return json(await listFeedback(env.LIVE), 200, { "cache-control": "no-store" });
    }
    if (url.pathname.startsWith("/api/poe2scout/")) return proxyScout(url, ctx);
    switch (url.pathname) {
      case "/live.json": {
        const raw = await env.LIVE.get(STATE_KEY);
        if (!raw) return json({ updatedAt: null, live: [], upcoming: [], channels: [], errors: ["まだ 1 回も調べていない (cron か /refresh を待つ)"] }, 200, { "cache-control": "no-store" });
        return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60", ...CORS } });
      }
      case "/refresh": {
        if (!env.REFRESH_KEY || url.searchParams.get("key") !== env.REFRESH_KEY) return json({ error: "key が違う" }, 403);
        const state = await refresh(env);
        ctx.waitUntil(Promise.resolve());
        return json(state, 200, { "cache-control": "no-store" });
      }
      case "/health":
        return json({ ok: true, channels: CHANNELS.length });
      default:
        return json({ error: "not found", paths: ["/live.json", "/health", "/api/poe2scout/…", "POST /feedback"] }, 404);
    }
  },
};
