/**
 * Discord を読むだけの Bot (2026-10-24 オーナー: 10-21 の「Bot は作らない」を決め直し)。
 * 毎朝 9:03 (JST = UTC 0:03) の cron で、決めたチャンネル (vars の DISCORD_CHANNELS、id をカンマで) の前回より後の書き込みを
 * Discord の REST (GET /channels/<id>/messages、Bot のトークン = secret の DISCORD_BOT_TOKEN) で取り、D1 の discord_daily に 1 日 1 行で置く。
 * 書くのは置くだけ (Discord には何も書かない)。scripts/daily-summary.mjs が読み、9:05 の日報の md に「Discord の書き込み」の節として載せる。
 * トークンかチャンネルが無い時は status "未設定" の行を置く (日報には「Bot 未設定」の 1 行)。初めての回は 24 時間前までに絞る。
 */
import type { Env, Fetch } from "./types";

const API = "https://discord.com/api/v10";
const PAGE = 100, MAX_PAGES = 5;

interface RawMsg { id: string; timestamp: string; content?: string; author?: { username?: string; global_name?: string | null; bot?: boolean }; webhook_id?: string; attachments?: Array<{ filename?: string; url?: string }>; embeds?: Array<{ title?: string; description?: string }> }
export interface DiscordMsg { id: string; at: string; author: string; bot: boolean; webhook: boolean; text: string; files: string[] }
export interface DiscordDay { status: "ok" | "未設定" | "一部失敗"; at: string; channels: Array<{ id: string; messages: DiscordMsg[]; error?: string }> }

/** JST の日付 (YYYY-MM-DD) */
const jstDay = (d: Date): string => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
/** Discord の id (snowflake) は時刻を含む。初めての回の「24 時間前から」に使う */
const snowflakeAt = (ms: number): string => ((BigInt(ms) - 1420070400000n) << 22n).toString();

const shrink = (m: RawMsg): DiscordMsg => ({
  id: m.id, at: m.timestamp, author: m.author?.global_name ?? m.author?.username ?? "?", bot: !!m.author?.bot, webhook: !!m.webhook_id,
  text: [m.content ?? "", ...(m.embeds ?? []).map((e) => [e.title, e.description].filter(Boolean).join(": "))].filter(Boolean).join("\n").slice(0, 4000),
  files: (m.attachments ?? []).map((a) => a.filename ?? a.url ?? "").filter(Boolean).slice(0, 10),
});

/** 1 チャンネルの after より後の書き込みを古い順に (100 件ずつ、最大 500 件) */
async function readChannel(token: string, channel: string, after: string, fetchFn: Fetch): Promise<DiscordMsg[]> {
  const out: DiscordMsg[] = [];
  let cur = after;
  for (let i = 0; i < MAX_PAGES; i++) {
    const r = await fetchFn(`${API}/channels/${encodeURIComponent(channel)}/messages?limit=${PAGE}&after=${cur}`, { headers: { authorization: `Bot ${token}`, "user-agent": "ExileDeskBot (https://exiledesk.com, 1.0)" } });
    if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 160)}`);
    const page = ((await r.json()) as RawMsg[]).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    out.push(...page.map(shrink));
    if (page.length < PAGE) break;
    cur = page[page.length - 1]!.id;
  }
  return out;
}

/** 毎朝の取り込み。置いた 1 日分を返す (確かめ用) */
export async function pullDiscord(env: Env, fetchFn: Fetch = fetch, now = new Date()): Promise<DiscordDay | null> {
  if (!env.LOGS) return null;
  const token = (env.DISCORD_BOT_TOKEN ?? "").trim();
  const channels = (env.DISCORD_CHANNELS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{5,25}$/.test(s));
  const day: DiscordDay = { status: "ok", at: now.toISOString(), channels: [] };
  if (!token || !channels.length) day.status = "未設定";
  else {
    for (const ch of channels) {
      const row = await env.LOGS.prepare("SELECT last_id FROM discord_cursor WHERE channel = ?").bind(ch).first<{ last_id: string }>();
      try {
        const messages = await readChannel(token, ch, row?.last_id ?? snowflakeAt(now.getTime() - 86400e3), fetchFn);
        day.channels.push({ id: ch, messages });
        const last = messages[messages.length - 1]?.id;
        if (last) await env.LOGS.prepare("INSERT OR REPLACE INTO discord_cursor (channel, last_id, at) VALUES (?, ?, ?)").bind(ch, last, now.getTime()).run();
      } catch (e) {
        day.status = "一部失敗";
        day.channels.push({ id: ch, messages: [], error: String(e).slice(0, 200) });
      }
    }
  }
  await env.LOGS.prepare("INSERT OR REPLACE INTO discord_daily (day, at, body) VALUES (?, ?, ?)").bind(jstDay(now), now.getTime(), JSON.stringify(day)).run();
  return day;
}
