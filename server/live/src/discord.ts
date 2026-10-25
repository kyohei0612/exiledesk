/**
 * Discord を読むだけの Bot (2026-10-24 オーナー: 10-21 の「Bot は作らない」を決め直し)。
 * 毎朝 9:03 (JST = UTC 0:03) の cron で、サーバー (vars の DISCORD_GUILD_ID) の文字のチャンネル・お知らせ・動いているスレッドを毎回拾い
 * (10-26 オーナー「全部読んで」。DISCORD_CHANNELS に id をカンマで書けばそれだけ)、それぞれの前回より後の書き込みを
 * Discord の REST (GET /channels/<id>/messages、Bot のトークン = secret の DISCORD_BOT_TOKEN) で取り、D1 の discord_daily に 1 日 1 行で置く。
 * 書くのは置くだけ (Discord には何も書かない)。scripts/daily-summary.mjs が読み、9:05 の日報の md に「Discord の書き込み」の節として載せる。
 * トークンかチャンネルが無い時は status "未設定" の行を置く (日報には「Bot 未設定」の 1 行)。初めての回は 24 時間前までに絞る。
 */
import type { Env, Fetch } from "./types";

const API = "https://discord.com/api/v10";
const PAGE = 100, MAX_PAGES = 5;
/**
 * 1 回の取り込みで Discord を叩く数の上限 (無料プランの外へのサブリクエストは 1 回の起動で 50 まで。D1 は別枠)。
 * チャンネルの一覧 2 回 (チャンネル・動いているスレッド) + 1 チャンネル 1〜5 回。超えた分のチャンネルは今回は読まず、次の朝に前回の続きから
 */
const MAX_CALLS = 45;
/** 文字の読めるチャンネルの種類 (0 = 文字、5 = お知らせ、10・11・12 = スレッド)。ボイス・カテゴリ・フォーラムの親は読まない */
const TEXT_TYPES = new Set([0, 5, 10, 11, 12]);
const headers = (token: string) => ({ authorization: `Bot ${token}`, "user-agent": "ExileDeskBot (https://exiledesk.com, 1.0)" });

/** サーバー (guild) の読める文字のチャンネルとスレッドの id と名前 (読むだけ)。チャンネルの増減に毎回ついていく */
async function guildChannels(token: string, guild: string, fetchFn: Fetch, count: () => boolean): Promise<Array<{ id: string; name: string }>> {
  const get = async (path: string): Promise<unknown> => {
    if (!count()) throw new Error("呼ぶ数の上限");
    const r = await fetchFn(`${API}${path}`, { headers: headers(token) });
    if (!r.ok) throw new Error(`Discord ${r.status}: ${(await r.text()).slice(0, 160)}`);
    return r.json();
  };
  const list = (await get(`/guilds/${encodeURIComponent(guild)}/channels`)) as Array<{ id: string; name?: string; type: number; position?: number }>;
  const threads = ((await get(`/guilds/${encodeURIComponent(guild)}/threads/active`).catch(() => ({ threads: [] }))) as { threads?: Array<{ id: string; name?: string; type: number }> }).threads ?? [];
  return [...list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), ...threads].filter((c) => TEXT_TYPES.has(c.type)).map((c) => ({ id: c.id, name: c.name ?? "" }));
}

interface RawMsg { id: string; timestamp: string; content?: string; author?: { username?: string; global_name?: string | null; bot?: boolean }; webhook_id?: string; attachments?: Array<{ filename?: string; url?: string }>; embeds?: Array<{ title?: string; description?: string }> }
export interface DiscordMsg { id: string; at: string; author: string; bot: boolean; webhook: boolean; text: string; files: string[] }
/** skipped = 読まなかった訳 (権限が無い・呼ぶ数の上限)。error = 読みに行って落ちた */
export interface DiscordDay { status: "ok" | "未設定" | "一部失敗"; at: string; error?: string; channels: Array<{ id: string; name?: string; messages: DiscordMsg[]; error?: string; skipped?: string }> }

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
async function readChannel(token: string, channel: string, after: string, fetchFn: Fetch, count: () => boolean = () => true): Promise<DiscordMsg[]> {
  const out: DiscordMsg[] = [];
  let cur = after;
  for (let i = 0; i < MAX_PAGES; i++) {
    if (!count()) break;
    const r = await fetchFn(`${API}/channels/${encodeURIComponent(channel)}/messages?limit=${PAGE}&after=${cur}`, { headers: headers(token) });
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
  const guild = (env.DISCORD_GUILD_ID ?? "").trim();
  let calls = 0;
  const count = (): boolean => ++calls <= MAX_CALLS;
  const day: DiscordDay = { status: "ok", at: now.toISOString(), channels: [] };
  // 読むチャンネル: DISCORD_CHANNELS (id をカンマで) か、無ければサーバー (DISCORD_GUILD_ID) の文字のチャンネルを毎回全部拾う
  let channels: Array<{ id: string; name: string }> = (env.DISCORD_CHANNELS ?? "").split(",").map((s) => s.trim()).filter((s) => /^\d{5,25}$/.test(s)).map((id) => ({ id, name: "" }));
  if (token && !channels.length && /^\d{5,25}$/.test(guild)) {
    try { channels = await guildChannels(token, guild, fetchFn, count); } catch (e) { day.status = "一部失敗"; day.error = `チャンネルの一覧: ${String(e).slice(0, 200)}`; }
  }
  if (!token || (!channels.length && !day.error)) day.status = "未設定";
  else {
    for (const { id: ch, name } of channels) {
      if (calls >= MAX_CALLS) { day.channels.push({ id: ch, name, messages: [], skipped: "呼ぶ数の上限で今回は読まず (次の朝に続きから)" }); continue; }
      const row = await env.LOGS.prepare("SELECT last_id FROM discord_cursor WHERE channel = ?").bind(ch).first<{ last_id: string }>();
      try {
        const messages = await readChannel(token, ch, row?.last_id ?? snowflakeAt(now.getTime() - 86400e3), fetchFn, count);
        day.channels.push({ id: ch, name, messages });
        const last = messages[messages.length - 1]?.id;
        if (last) await env.LOGS.prepare("INSERT OR REPLACE INTO discord_cursor (channel, last_id, at) VALUES (?, ?, ?)").bind(ch, last, now.getTime()).run();
      } catch (e) {
        // Bot に見る権限の無いチャンネル (403) は飛ばして 1 行に残すだけ (失敗にしない)
        if (/Discord 403/.test(String(e))) day.channels.push({ id: ch, name, messages: [], skipped: "見る権限が無い" });
        else { day.status = "一部失敗"; day.channels.push({ id: ch, name, messages: [], error: String(e).slice(0, 200) }); }
      }
    }
  }
  // 同じ日に 2 回目が走った時 (手で起こした後の 9:03 など) は前の回の書き込みに足す (上書きすると前の回の分が消える。読んだ所は discord_cursor で進んでいる)
  const prev = await env.LOGS.prepare("SELECT body FROM discord_daily WHERE day = ?").bind(jstDay(now)).first<{ body: string }>().catch(() => null);
  let out = day;
  try {
    const old = prev ? (JSON.parse(prev.body) as DiscordDay) : null;
    if (old?.channels?.length) {
      const ids = [...new Set([...old.channels.map((c) => c.id), ...day.channels.map((c) => c.id)])];
      out = { ...day, status: day.status === "未設定" ? old.status : day.status, channels: ids.map((id) => {
        const a = old.channels.find((c) => c.id === id), b = day.channels.find((c) => c.id === id);
        return { id, name: b?.name || a?.name || "", messages: [...(a?.messages ?? []), ...(b?.messages ?? [])], ...(b?.error ? { error: b.error } : {}), ...(b?.skipped ? { skipped: b.skipped } : {}) };
      }) };
    }
  } catch { /* 前の行が読めなければ今の回だけ */ }
  await env.LOGS.prepare("INSERT OR REPLACE INTO discord_daily (day, at, body) VALUES (?, ?, ?)").bind(jstDay(now), now.getTime(), JSON.stringify(out)).run();
  return out;
}
