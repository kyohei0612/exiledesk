/** 調べた結果を、配る JSON (LiveState) にまとめる */
import type { ChannelDef, CraftVideo, LiveEntry, LiveState } from "./types";
import type { Latest } from "./youtube";

export function buildState(channels: readonly ChannelDef[], found: ReadonlyMap<string, LiveEntry>, avatars: ReadonlyMap<string, string>, errors: readonly string[], now = new Date(), latest: ReadonlyMap<string, Latest> = new Map(), videos: ReadonlyMap<string, readonly CraftVideo[]> = new Map()): LiveState {
  const live: LiveEntry[] = [];
  const upcoming: LiveEntry[] = [];
  for (const c of channels) {
    const e = found.get(c.id);
    if (!e) continue;
    (e.status === "live" ? live : upcoming).push(e);
  }
  // ライブ中は視聴者の多い順、予定は近い順。自分のチャンネル (pr でない) は同じ条件なら前
  live.sort((a, b) => Number(a.pr) - Number(b.pr) || (b.viewers ?? 0) - (a.viewers ?? 0));
  upcoming.sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
  return {
    updatedAt: now.toISOString(),
    live,
    upcoming,
    channels: channels.map((c) => ({ id: c.id, name: c.name, platform: c.platform, url: c.url, pr: !!c.pr, lang: c.lang ?? null, status: found.get(c.id)?.status ?? "off", avatar: avatars.get(c.id) ?? null, latest: latest.get(c.id) ?? null })),
    videos: mergeVideos(channels, videos),
    errors: [...errors],
  };
}

/** 1 チャンネルから載せるクラフト動画の数と、全体の数 (state は /boot.json で毎回配るので軽く) */
export const VIDEOS_PER_CHANNEL = 5;
export const VIDEOS_MAX = 40;
/** チャンネルごとのクラフト動画を 1 つの並び (新しい順) に。同じ動画は 1 回 */
export function mergeVideos(channels: readonly ChannelDef[], byCh: ReadonlyMap<string, readonly CraftVideo[]>): CraftVideo[] {
  const seen = new Set<string>();
  const all: CraftVideo[] = [];
  for (const c of channels) for (const v of (byCh.get(c.id) ?? []).slice(0, VIDEOS_PER_CHANNEL)) {
    if (seen.has(v.watchUrl)) continue;
    seen.add(v.watchUrl);
    all.push(v);
  }
  return all.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")).slice(0, VIDEOS_MAX);
}
