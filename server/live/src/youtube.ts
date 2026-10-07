/**
 * YouTube: チャンネルが今ライブ中 (か予定あり) かを、API の点数をほぼ使わずに調べる。
 *
 * 1. チャンネルの RSS (feeds/videos.xml、点数 0) と /live ページ (点数 0。ライブ中ならその動画に飛ぶ) から動画 ID を集める
 * 2. 集めた ID を videos.list (50 個まで 1 回 = 1 点) でまとめて確かめる: snippet.liveBroadcastContent が live / upcoming / none
 *
 * search.list (1 回 100 点) は使わない。5 分おきで 1 日 288 点 (無料枠 1 万点)。
 */
import type { ChannelDef, Fetch, LiveEntry } from "./types";

export const feedUrl = (channelId: string): string => `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
export const livePageUrl = (channelId: string): string => `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`;
export const watchUrl = (videoId: string): string => `https://www.youtube.com/watch?v=${videoId}`;
export const thumbUrl = (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

/** RSS から動画 ID (新しい順、最大 15 本) */
export function parseFeedVideoIds(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g)) out.push(m[1]!);
  return out;
}

/**
 * /live ページの canonical。ライブ中 (または予定の配信がある時) は watch?v=... に、無い時はチャンネルのページになる。
 * ページは 1 MB 近いので、読む側は canonical が出た所で読むのをやめる (readUntil)
 */
export function parseLivePageVideoId(html: string): string | null {
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  return m ? m[1]! : null;
}

/** 本文を少しずつ読み、正規表現に当たるか maxBytes まで読んだら止める (CPU 10 ms の枠を守る) */
export async function readUntil(res: Response, re: RegExp, maxBytes = 256 * 1024): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      buf += dec.decode(value, { stream: true });
      if (re.test(buf)) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return buf;
}

/** videos.list の返事のうち使う所 */
export interface VideoItem {
  id: string;
  snippet?: { channelId?: string; title?: string; liveBroadcastContent?: "live" | "upcoming" | "none"; thumbnails?: { medium?: { url?: string }; high?: { url?: string } } };
  liveStreamingDetails?: { actualStartTime?: string; scheduledStartTime?: string; concurrentViewers?: string };
}

/**
 * videos.list の結果から、チャンネルごとに 1 本選ぶ (ライブ中 > 予定。予定は一番近い物)。
 * 返事の channelId で引くので、RSS の古い動画が混ざっていても問題ない
 */
export function pickLive(items: readonly VideoItem[], channels: readonly ChannelDef[]): Map<string, LiveEntry> {
  const byChannel = new Map(channels.filter((c) => c.youtubeChannelId).map((c) => [c.youtubeChannelId!, c] as const));
  const out = new Map<string, LiveEntry>();
  for (const v of items) {
    const sn = v.snippet;
    const ch = sn?.channelId ? byChannel.get(sn.channelId) : undefined;
    if (!ch || !sn || (sn.liveBroadcastContent !== "live" && sn.liveBroadcastContent !== "upcoming")) continue;
    const d = v.liveStreamingDetails ?? {};
    const e: LiveEntry = {
      id: ch.id, name: ch.name, platform: "youtube", url: ch.url, pr: !!ch.pr,
      status: sn.liveBroadcastContent,
      title: sn.title ?? "",
      thumb: sn.thumbnails?.medium?.url ?? sn.thumbnails?.high?.url ?? thumbUrl(v.id),
      watchUrl: watchUrl(v.id),
      startedAt: d.actualStartTime ?? null,
      scheduledAt: d.scheduledStartTime ?? null,
      viewers: d.concurrentViewers != null ? Number(d.concurrentViewers) : null,
    };
    const cur = out.get(ch.id);
    if (!cur) { out.set(ch.id, e); continue; }
    if (cur.status === "live") continue;
    if (e.status === "live" || (e.scheduledAt ?? "") < (cur.scheduledAt ?? "")) out.set(ch.id, e);
  }
  return out;
}

/** チャンネル 1 つ分の候補の動画 ID (RSS + /live。どちらかが落ちても片方で続ける) */
export async function candidateIds(channelId: string, fetchFn: Fetch, errors: string[]): Promise<string[]> {
  const ids = new Set<string>();
  const [feed, live] = await Promise.allSettled([
    fetchFn(feedUrl(channelId), { headers: { "accept": "application/atom+xml" } }).then(async (r) => { if (!r.ok) throw new Error(`feed ${r.status}`); return parseFeedVideoIds(await r.text()); }),
    fetchFn(livePageUrl(channelId), { headers: { "accept-language": "ja,en;q=0.5", "user-agent": "Mozilla/5.0 (compatible; exiledesk-live/0.1)" } })
      .then(async (r) => { if (!r.ok) throw new Error(`live page ${r.status}`); return parseLivePageVideoId(await readUntil(r, /<link rel="canonical"/)); }),
  ]);
  if (feed.status === "fulfilled") feed.value.forEach((id) => ids.add(id)); else errors.push(`youtube ${channelId}: ${String(feed.reason)}`);
  if (live.status === "fulfilled") { if (live.value) ids.add(live.value); } else errors.push(`youtube ${channelId}: ${String(live.reason)}`);
  return [...ids];
}

/** videos.list を 50 個ずつ (1 回 1 点) */
export async function listVideos(ids: readonly string[], apiKey: string, fetchFn: Fetch): Promise<VideoItem[]> {
  const out: VideoItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const u = new URL("https://www.googleapis.com/youtube/v3/videos");
    u.searchParams.set("part", "snippet,liveStreamingDetails");
    u.searchParams.set("id", chunk.join(","));
    u.searchParams.set("key", apiKey);
    const r = await fetchFn(u.toString());
    if (!r.ok) throw new Error(`videos.list ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { items?: VideoItem[] };
    out.push(...(j.items ?? []));
  }
  return out;
}

/** 全チャンネルの、今ライブ中・予定の配信 (チャンネル id → 1 本) */
export async function fetchYoutube(channels: readonly ChannelDef[], apiKey: string | undefined, fetchFn: Fetch, errors: string[]): Promise<Map<string, LiveEntry>> {
  const yt = channels.filter((c) => c.platform === "youtube" && c.youtubeChannelId);
  if (!yt.length) return new Map();
  if (!apiKey) { errors.push("youtube: YOUTUBE_API_KEY が無い"); return new Map(); }
  const idLists = await Promise.all(yt.map((c) => candidateIds(c.youtubeChannelId!, fetchFn, errors)));
  const ids = [...new Set(idLists.flat())];
  if (!ids.length) return new Map();
  try {
    return pickLive(await listVideos(ids, apiKey, fetchFn), yt);
  } catch (e) {
    errors.push(`youtube: ${String(e)}`);
    return new Map();
  }
}

/** チャンネルのアイコン (channels.list、50 個まで 1 回 1 点。1 日 1 回だけ呼ぶ) */
export async function fetchYoutubeAvatars(channelIds: readonly string[], apiKey: string, fetchFn: Fetch): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < channelIds.length; i += 50) {
    const u = new URL("https://www.googleapis.com/youtube/v3/channels");
    u.searchParams.set("part", "snippet");
    u.searchParams.set("id", channelIds.slice(i, i + 50).join(","));
    u.searchParams.set("key", apiKey);
    const r = await fetchFn(u.toString());
    if (!r.ok) throw new Error(`channels.list ${r.status}`);
    const j = (await r.json()) as { items?: Array<{ id: string; snippet?: { thumbnails?: { default?: { url?: string }; medium?: { url?: string } } } }> };
    for (const it of j.items ?? []) { const url = it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url; if (url) out.set(it.id, url); }
  }
  return out;
}
