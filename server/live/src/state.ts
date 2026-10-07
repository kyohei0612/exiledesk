/** 調べた結果を、配る JSON (LiveState) にまとめる */
import type { ChannelDef, LiveEntry, LiveState } from "./types";

export function buildState(channels: readonly ChannelDef[], found: ReadonlyMap<string, LiveEntry>, avatars: ReadonlyMap<string, string>, errors: readonly string[], now = new Date()): LiveState {
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
    channels: channels.map((c) => ({ id: c.id, name: c.name, platform: c.platform, url: c.url, pr: !!c.pr, status: found.get(c.id)?.status ?? "off", avatar: avatars.get(c.id) ?? null })),
    errors: [...errors],
  };
}
