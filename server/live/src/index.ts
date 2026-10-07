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

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refresh(env));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (req.method !== "GET") return json({ error: "GET だけ" }, 405);
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
        return json({ error: "not found", paths: ["/live.json", "/health"] }, 404);
    }
  },
};
