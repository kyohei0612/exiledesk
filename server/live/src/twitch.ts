/**
 * Twitch: Get Streams (100 人まで 1 回) でライブ中を調べる。
 * 認証はアプリのトークン (client credentials、約 58 日有効) を KV に覚えて使い回す。
 * 無料の点数は 1 分 800 点で、ここは 5 分に 1〜2 回なので気にしなくてよい
 */
import type { ChannelDef, Fetch, LiveEntry } from "./types";

const TOKEN_KEY = "twitch_token";

interface TokenRow { token: string; exp: number }

/** アプリのトークン (KV に残り 1 日以上あればそれ、無ければ取り直す) */
export async function getAppToken(kv: KVNamespace, clientId: string, clientSecret: string, fetchFn: Fetch, now = Date.now()): Promise<string> {
  const cached = (await kv.get(TOKEN_KEY, "json")) as TokenRow | null;
  if (cached && cached.exp - now > 24 * 3600 * 1000) return cached.token;
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" });
  const r = await fetchFn("https://id.twitch.tv/oauth2/token", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error(`twitch token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  await kv.put(TOKEN_KEY, JSON.stringify({ token: j.access_token, exp: now + j.expires_in * 1000 } satisfies TokenRow));
  return j.access_token;
}

/** Get Streams の返事のうち使う所 */
export interface StreamRow {
  user_login: string; user_name: string; title: string; viewer_count: number; started_at: string;
  /** {width}x{height} を埋める型 */
  thumbnail_url: string;
  type: string;
}

/** サムネの型 (…-{width}x{height}.jpg) を実際の大きさに */
export const thumbOf = (template: string, w = 320, h = 180): string => template.replace("{width}", String(w)).replace("{height}", String(h));

export function pickStreams(rows: readonly StreamRow[], channels: readonly ChannelDef[]): Map<string, LiveEntry> {
  const byLogin = new Map(channels.filter((c) => c.twitchLogin).map((c) => [c.twitchLogin!.toLowerCase(), c] as const));
  const out = new Map<string, LiveEntry>();
  for (const s of rows) {
    const ch = byLogin.get(s.user_login.toLowerCase());
    if (!ch || s.type !== "live") continue;
    out.set(ch.id, {
      id: ch.id, name: ch.name, platform: "twitch", url: ch.url, pr: !!ch.pr,
      status: "live", title: s.title, thumb: thumbOf(s.thumbnail_url), watchUrl: `https://www.twitch.tv/${s.user_login}`,
      startedAt: s.started_at, scheduledAt: null, viewers: s.viewer_count,
    });
  }
  return out;
}

export async function fetchTwitch(channels: readonly ChannelDef[], env: { TWITCH_CLIENT_ID?: string; TWITCH_CLIENT_SECRET?: string }, kv: KVNamespace, fetchFn: Fetch, errors: string[]): Promise<Map<string, LiveEntry>> {
  const tw = channels.filter((c) => c.platform === "twitch" && c.twitchLogin);
  if (!tw.length) return new Map();
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) { errors.push("twitch: TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET が無い"); return new Map(); }
  try {
    const token = await getAppToken(kv, env.TWITCH_CLIENT_ID, env.TWITCH_CLIENT_SECRET, fetchFn);
    const u = new URL("https://api.twitch.tv/helix/streams");
    for (const c of tw.slice(0, 100)) u.searchParams.append("user_login", c.twitchLogin!);
    u.searchParams.set("first", "100");
    const r = await fetchFn(u.toString(), { headers: { "client-id": env.TWITCH_CLIENT_ID, authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`streams ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { data?: StreamRow[] };
    return pickStreams(j.data ?? [], tw);
  } catch (e) {
    errors.push(`twitch: ${String(e)}`);
    return new Map();
  }
}

/** チャンネルのアイコン (Get Users、100 人まで 1 回。1 日 1 回だけ呼ぶ) */
export async function fetchTwitchAvatars(logins: readonly string[], clientId: string, token: string, fetchFn: Fetch): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!logins.length) return out;
  const u = new URL("https://api.twitch.tv/helix/users");
  for (const l of logins.slice(0, 100)) u.searchParams.append("login", l);
  const r = await fetchFn(u.toString(), { headers: { "client-id": clientId, authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`users ${r.status}`);
  const j = (await r.json()) as { data?: Array<{ login: string; profile_image_url?: string }> };
  for (const x of j.data ?? []) if (x.profile_image_url) out.set(x.login.toLowerCase(), x.profile_image_url);
  return out;
}
