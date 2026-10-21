/**
 * exiledesk-live: Web 版のサーバー (Cloudflare Worker、無料枠)。
 *
 *   scheduled (1 時間おき) … 相場 (poe2scout → KV "market")。8 時間おきに YouTube / Twitch に問い合わせ → KV "state" に LiveState を書く (配信の見張り)
 *   scheduled (毎朝 9 時 JST) … 日報を Discord に (monitor.ts)・昨日の分析用の記録を JSONL ファイルで LOGS_WEBHOOK に (logs.ts)
 *   GET  /live.json        … 配信の状態 (CORS 許可、60 秒キャッシュ)。サイトはこれを読むだけ
 *   GET  /api/poe2scout/…  … 相場の中継 (端のキャッシュ 10 分)
 *   POST /feedback         … 要望・バグ (KV に 90 日 + Discord、画像は D1)。GET /feedback.json(ヘッダー x-exiledesk-key) で一覧
 *   POST /feedback/<id>/images … 後から画像を足す (送った端末だけ)。GET /feedback/image/<画像 id>(ヘッダー x-exiledesk-key) で見る
 *   POST /event            … 操作の印 (Analytics Engine)。日報の「段階と離脱」「どこから」「端末」の元
 *   POST /log              … 分析用の記録 (D1、logs.ts)。GET /logs/day?day= (ヘッダー x-exiledesk-key) で取り出す
 *   GET  /logs/send?day= (ヘッダー x-exiledesk-key) … その日の記録を今すぐ LOGS_WEBHOOK へ (確かめ用。D1 からは消さない)
 *   GET  /report(ヘッダー x-exiledesk-key)     … 日報を今すぐ (確かめ用)
 *   GET  /refresh(ヘッダー x-exiledesk-key)    … 配信の見張りを今すぐ
 *   GET  /health
 *
 * 見る人が何人いても YouTube / Twitch への問い合わせは 8 時間に 1 回なので、無料枠 (Workers 10 万/日、KV 読み 10 万/日・書き 1,000/日、
 * YouTube 1 万点/日) に収まる。アイコン (アバター) は 1 日 1 回だけ取り直す。1 回ごとの記録はダッシュボードの「ログ」(reqLog)
 */
import { forgetUid, forgottenUids, UID_RE } from "./forget";
import channelsJson from "../channels.json";
import { buildState } from "./state";
import { fetchTwitch, fetchTwitchAvatars, getAppToken, twitchChannels } from "./twitch";
import { fetchYoutube, fetchYoutubeAvatars, type Latest, youtubeChannels } from "./youtube";
import { getImage, MAX_IMAGES, notifyImagesDiscord, parseImages, pruneImages, saveImages } from "./feedback-images";
import { allowIp, FEEDBACK_ID_RE, getFeedback, getReplies, listFeedback, notifyDiscord, parseFeedback, saveFeedback, saveReply, type Feedback } from "./feedback";
import { DATASET, parseBatch, sql, usersBetween, writeEvents } from "./events";
import { dayLogs, jstDay, saveLog, sendDayLogs } from "./logs";
import { alert, dailyReport, lastPosted, reqLog, yesterdayJst } from "./monitor";
import { MARKET_KEY, refreshMarket } from "./market";
import { compare, exportSessions } from "./sim";
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
    const yt = youtubeChannels(channels);
    if (yt.length && env.YOUTUBE_API_KEY) {
      const m = await fetchYoutubeAvatars(yt.map((c) => c.youtubeChannelId!), env.YOUTUBE_API_KEY, fetchFn);
      for (const c of yt) { const u = m.get(c.youtubeChannelId!); if (u) byId[c.id] = u; }
    }
    const tw = twitchChannels(channels);
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

/** 1 回分: 調べて KV に書く。テストから fetch と時刻を差し替えられる。気になる所があれば Discord に (6 時間に 1 回) */
export async function refresh(env: Env, channels: readonly ChannelDef[] = CHANNELS, fetchFn: Fetch = fetch, now = new Date()): Promise<LiveState> {
  const t0 = Date.now();
  const errors: string[] = [];
  const latest = new Map<string, Latest>();
  const [yt, tw, avatars] = await Promise.all([
    fetchYoutube(channels, env.YOUTUBE_API_KEY, fetchFn, errors, latest),
    fetchTwitch(channels, env, env.LIVE, fetchFn, errors),
    avatarsOf(env, channels, fetchFn, errors, now.getTime()),
  ]);
  const state = buildState(channels, new Map([...yt, ...tw]), avatars, errors, now, latest);
  await env.LIVE.put(STATE_KEY, JSON.stringify(state));
  console.log(JSON.stringify({ job: "refresh", live: state.live.length, upcoming: state.upcoming.length, errors: errors.length, ms: Date.now() - t0 }));
  // 配信 (ライブ) はもう見ていない (最新動画だけ)。取れなかった時はログだけで、異常の通知・日報には出さない (2026-10-11 オーナー)
  if (errors.length) console.warn("exiledesk-live:", errors.join(" | "));
  return state;
}

/** 毎朝 9 時 (JST): 昨日 (JST) の記録を Discord へ。送れなければ異常として残す (日報に載る) */
export async function sendYesterdayLogs(env: Env, fetchFn: Fetch = fetch, now = new Date()): Promise<void> {
  const day = jstDay(new Date(now.getTime() - 24 * 3600e3));
  try {
    const r = await sendDayLogs(env, day, fetchFn);
    console.log(JSON.stringify({ job: "logs-send", day, ...r }));
    if (!r.ok && env.LOGS_WEBHOOK) await alert(env, "記録の送信", `${day}: ${r.error ?? "?"}`, fetchFn, now);
  } catch (e) {
    await alert(env, "記録の送信", `${day}: ${String(e).slice(0, 300)}`, fetchFn, now);
  }
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

/**
 * 相場の中継 (Web 版用、2026-10-07): GET /api/poe2scout/<path> → https://api.poe2scout.com/<path>。
 * 端のキャッシュに 10 分置くので、見る人が何人いても poe2scout には 10 分に 1 回ずつしか行かない。
 * (ブラウザから poe2scout を直に叩くと CORS で弾かれる。アプリ版は Rust 経由で直に叩くのでここは使わない)
 * 上流が落ちていたら Discord に (6 時間に 1 回)
 */
const SCOUT = "https://api.poe2scout.com";
const SCOUT_TTL = 600;
export async function proxyScout(url: URL, ctx: ExecutionContext, fetchFn: Fetch = fetch, env?: Env): Promise<Response> {
  const up = `${SCOUT}${url.pathname.slice("/api/poe2scout".length)}${url.search}`;
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const key = new Request(up, { method: "GET" });
  let res = cache ? await cache.match(key) : undefined;
  if (!res) {
    let u: Response;
    try {
      u = await fetchFn(up, { headers: { accept: "application/json", "user-agent": "ExileDesk-web/0.1 (https://github.com/kyohei0612/exiledesk)" } });
    } catch (e) {
      if (env) ctx.waitUntil(alert(env, "相場の中継", `poe2scout に繋がらない: ${String(e).slice(0, 200)}`));
      return new Response(JSON.stringify({ error: "upstream unreachable" }), { status: 502, headers: { "content-type": "application/json", ...CORS } });
    }
    if (u.status >= 500 && env) ctx.waitUntil(alert(env, "相場の中継", `poe2scout が ${u.status} (${url.pathname})`));
    res = new Response(u.body, { status: u.status, headers: { "content-type": u.headers.get("content-type") ?? "application/json; charset=utf-8", "cache-control": `public, max-age=${SCOUT_TTL}` } });
    if (u.ok && cache) ctx.waitUntil(cache.put(key, res.clone()));
  }
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
  return out;
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });

/**
 * オーナー用の合言葉は ヘッダー x-exiledesk-key で受ける (2026-10-15 セキュリティの点検: 前の ?key= は URL ごと Cloudflare のログに残るおそれがあった)。
 * 長さの違いや途中の一致で時間が変わらないよう、全部の文字を比べる
 */
const keyOk = (env: Env, req: Request): boolean => {
  const want = env.REFRESH_KEY ?? "", got = req.headers.get("x-exiledesk-key") ?? "";
  if (!want || got.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
};

async function handle(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  // 操作の印 (Web 版の track.ts が sendBeacon でまとめて送る)
  if (url.pathname === "/event" && req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "JSON ではない" }, 400); }
    const b = parseBatch(body);
    if (!b) return json({ error: "形が違う" }, 400);
    // 記録しない端末の分は置かない (forget.ts)
    if ((await forgottenUids(env)).includes(b.uid)) return json({ ok: true, n: 0 });
    const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? "";
    return json({ ok: true, n: writeEvents(env, b, country) });
  }
  // 分析用の記録 (log-sender.ts がまとめて送る。中身は解かずに D1 へ)
  if (url.pathname === "/log" && req.method === "POST") {
    const text = await req.text();
    // 記録しない端末の分は置かない (forget.ts)。uid は送る側が先頭近くに置く
    const uid = /"uid":"([A-Za-z0-9_-]{6,40})"/.exec(text.slice(0, 300))?.[1];
    if (uid && (await forgottenUids(env)).includes(uid)) return json({ ok: true });
    const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? "";
    // 操作の印は最後の "__ev" に乗ってくる (2026-10-10 /event と 1 本に)。切り取って Analytics Engine へ、残りを D1 へ
    let body = text;
    const at = text.lastIndexOf(',"__ev":');
    if (at > 0 && text.endsWith("}")) {
      // 1 訪問分 (前の形) か、端末に溜めた訪問ごとの配列 (2026-10-10 1 時間に 1 回まとめて送る形)
      try {
        const raw = JSON.parse(text.slice(at + 8, -1)) as unknown;
        for (const one of (Array.isArray(raw) ? raw : [raw]).slice(0, 50)) { const b = parseBatch(one); if (b) writeEvents(env, b, country); }
      } catch { /* 印は落としてよい */ }
      body = `${text.slice(0, at)}}`;
    }
    // 記録が 0 件 (印だけ) なら D1 には置かない
    if (/"n":0[,}]/.test(body.slice(0, 200))) return json({ ok: true });
    const r = await saveLog(env, body, country);
    return json(r === "ok" ? { ok: true } : { error: r }, r === "ok" ? 200 : 400);
  }
  // この端末を記録しない (「記録しない」をオンにした時に送る側から。今までの記録も消す。forget.ts)
  if (url.pathname === "/forget" && req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "JSON ではない" }, 400); }
    const uid = (body as { uid?: unknown })?.uid;
    if (typeof uid !== "string" || !UID_RE.test(uid)) return json({ error: "形が違う" }, 400);
    return json({ ok: true, deleted: await forgetUid(env, uid) });
  }
  // 要望・バグ (Web 版の「要望・バグを送る」)
  if (url.pathname === "/feedback" && req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "JSON ではない" }, 400); }
    const p = parseFeedback(body);
    if (!p.ok) return json({ error: p.why }, p.why === "bot" ? 200 : 400);
    const ip = req.headers.get("cf-connecting-ip") ?? "?";
    const limited = await allowIp(env.LIVE, ip);
    if (limited) return json({ error: limited }, 429);
    const im = parseImages((body as { images?: unknown }).images);
    if (!im.ok) return json({ error: im.why }, 400);
    const fb: Feedback = { id: crypto.randomUUID().slice(0, 8), at: new Date().toISOString(), kind: p.kind, text: p.text, contact: p.contact, context: p.context, ua: req.headers.get("user-agent") ?? "", ip };
    if (im.images.length && env.LOGS) fb.images = await saveImages(env.LOGS, fb.id, im.images);
    await saveFeedback(env.LIVE, fb);
    if (env.DISCORD_WEBHOOK) ctx.waitUntil(notifyDiscord(env.DISCORD_WEBHOOK, fb, fetch, im.images));
    return json({ ok: true, id: fb.id });
  }
  // 後から画像を足す (返事で「画像を下さい」と頼んだ時)。送った端末 (同じ uid) だけ: { uid, images, text? }
  const addImg = url.pathname.match(/^\/feedback\/([A-Za-z0-9-]{4,16})\/images$/);
  if (addImg && req.method === "POST") {
    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "JSON ではない" }, 400, CORS); }
    const im = parseImages((body as { images?: unknown }).images);
    if (!im.ok || !im.images.length) return json({ error: im.ok ? "画像が無い" : im.why }, 400, CORS);
    const ip = req.headers.get("cf-connecting-ip") ?? "?";
    const limited = await allowIp(env.LIVE, ip);
    if (limited) return json({ error: limited }, 429, CORS);
    const fb = await getFeedback(env.LIVE, addImg[1]!);
    const uid = (body as { uid?: unknown }).uid;
    const owner = (fb?.context as { uid?: unknown } | null)?.uid;
    if (!fb || typeof uid !== "string" || !uid || uid !== owner) return json({ error: "送った端末からだけ足せる" }, 403, CORS);
    if (!env.LOGS) return json({ error: "置き場が無い" }, 500, CORS);
    if ((fb.images?.length ?? 0) + im.images.length > MAX_IMAGES * 3) return json({ error: "画像が多すぎる" }, 400, CORS);
    const text = typeof (body as { text?: unknown }).text === "string" ? ((body as { text: string }).text.trim().slice(0, 1000)) : "";
    fb.images = [...(fb.images ?? []), ...(await saveImages(env.LOGS, fb.id, im.images))];
    if (text) fb.text = `${fb.text}

(画像と一緒に) ${text}`;
    await saveFeedback(env.LIVE, fb);
    if (env.DISCORD_WEBHOOK) ctx.waitUntil(notifyImagesDiscord(env.DISCORD_WEBHOOK, fb.id, text, im.images, fetch));
    return json({ ok: true }, 200, CORS);
  }
  // 要望への返事を書く (オーナー側だけ): { id, text, en?, version? }
  if (url.pathname === "/feedback/reply" && req.method === "POST") {
    if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
    let b: { id?: string; text?: string; en?: string; version?: string; askImage?: boolean };
    try { b = await req.json(); } catch { return json({ error: "JSON ではない" }, 400); }
    if (!b.id || !FEEDBACK_ID_RE.test(b.id) || !b.text?.trim()) return json({ error: "id と text が要る" }, 400);
    return json({ ok: true, reply: await saveReply(env.LIVE, b.id, { text: b.text.trim().slice(0, 500), ...(b.en ? { en: b.en.slice(0, 500) } : {}), ...(b.version ? { version: b.version.slice(0, 20) } : {}), ...(b.askImage ? { askImage: true } : {}) }) });
  }
  if (req.method !== "GET") return json({ error: "GET だけ" }, 405);
  // 送った本人が、自分の覚えている要望の id の返事を聞く (送ったことのある人だけが来る)
  if (url.pathname === "/feedback/replies") {
    const ids = (url.searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    return json({ replies: await getReplies(env.LIVE, ids) }, 200, { "cache-control": "no-store", ...CORS });
  }
  if (url.pathname.startsWith("/api/poe2scout/")) return proxyScout(url, ctx, fetch, env);
  // 要望に付いた画像 (オーナー用)
  const img = url.pathname.match(/^\/feedback\/image\/([a-f0-9]{12})$/);
  if (img) {
    if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
    const r = env.LOGS ? await getImage(env.LOGS, img[1]!) : null;
    return r ? new Response(r.data, { headers: { "content-type": r.mime, "cache-control": "no-store" } }) : json({ error: "無い" }, 404);
  }
  // 要望 1 件 (添付ごと)。Discord に付いたファイルと同じ物
  const one = url.pathname.match(/^\/feedback\/([A-Za-z0-9-]{4,16})\.json$/);
  if (one) {
    if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
    const fb = await getFeedback(env.LIVE, one[1]!);
    return fb ? json(fb, 200, { "cache-control": "no-store" }) : json({ error: "無い" }, 404);
  }
  switch (url.pathname) {
    // 開いた時に 1 回だけ読む物をまとめて (配信の情報 + 1 時間おきにサーバーが取った相場。2026-10-10 前は live.json と相場 2 本の 3 回)
    case "/boot.json": {
      const [live, market, visitors] = await Promise.all([env.LIVE.get(STATE_KEY, { cacheTtl: 300 }), env.LIVE.get(MARKET_KEY, { cacheTtl: 300 }), env.LIVE.get(VISITORS_KEY, { cacheTtl: 300 })]);
      let m = market;
      if (!m) { try { m = JSON.stringify(await refreshMarket(env)); } catch { m = null; } }
      // ブラウザに次の相場の取り直し (毎時 0 分の cron) の少し後まで覚えさせる。同じ人が 1 時間に何回開いてもサーバーに来るのは 1 回 (2026-10-10)
      const now = new Date();
      const untilNext = Math.max(60, 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds()) + 120);
      return new Response(`{"live":${live ?? "null"},"market":${m ?? "null"},"visitors":${visitors ?? "null"}}`, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${untilNext}`, ...CORS } });
    }
    case "/live.json": {
      const raw = await env.LIVE.get(STATE_KEY);
      if (!raw) return json({ updatedAt: null, live: [], upcoming: [], channels: [], errors: ["まだ 1 回も調べていない (cron か /refresh を待つ)"] }, 200, { "cache-control": "no-store" });
      return new Response(raw, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60", ...CORS } });
    }
    case "/logs/day": {
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      const day = url.searchParams.get("day") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "day=YYYY-MM-DD" }, 400);
      return new Response(await dayLogs(env, day), { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
    }
    case "/logs/send": {
      // その日の記録を今すぐ LOGS_WEBHOOK へ (確かめ用)。D1 からは消さない
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      const day = url.searchParams.get("day") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: "day=YYYY-MM-DD" }, 400);
      const r = await sendDayLogs(env, day);
      return json(r, r.ok ? 200 : 502, { "cache-control": "no-store" });
    }
    case "/feedback.json":
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      return json(await listFeedback(env.LIVE), 200, { "cache-control": "no-store" });
    case "/refresh":
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      return json(await refresh(env), 200, { "cache-control": "no-store" });
    // 画面のエラーの全文 (日報は頭の 80 字だけ)。直す時に読む (2026-10-11)。hours = 何時間前から (既定 48)
    case "/errors.json": {
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      const h = Math.min(24 * 14, Math.max(1, Number(url.searchParams.get("hours")) || 48));
      const D = env.EVENTS_DATASET ?? DATASET;
      const rows = await sql(env, `SELECT blob8 AS msg, blob4 AS dev, blob5 AS ref, count(DISTINCT blob2) AS sessions, SUM(_sample_interval) AS n FROM ${D} WHERE timestamp > NOW() - INTERVAL '${h}' HOUR AND blob1 = 'error' GROUP BY msg, dev, ref ORDER BY n DESC LIMIT 50`);
      return json(rows, 200, { "cache-control": "no-store" });
    }
    // KV の使い方 (読み・書き・一覧・消す の回数を日ごと)。無料枠に近づいた時に何が多いか見る (2026-10-11)
    case "/kv-usage.json": {
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      const days = Math.min(7, Math.max(1, Number(url.searchParams.get("days")) || 2));
      const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
      const query = `query($acc: String!, $since: Date!) { viewer { accounts(filter: { accountTag: $acc }) {
        kvOperationsAdaptiveGroups(limit: 200, filter: { date_geq: $since }) { sum { requests } dimensions { date actionType namespaceId } } } } }`;
      const r = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.CF_ANALYTICS_TOKEN ?? ""}` }, body: JSON.stringify({ query, variables: { acc: env.CF_ACCOUNT_ID, since } }) });
      return json(await r.json(), 200, { "cache-control": "no-store" });
    }
    case "/report":
      if (!keyOk(env, req)) return json({ error: "key が違う" }, 403);
      // &today=1 で「今日のここまで」(集計が通っているかの確かめ用)
      { const text = await dailyReport(env, fetch, new Date(), url.searchParams.get("today") === "1");
        return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-discord": lastPosted ? "ok" : "ng" } }); }
    // 新しい送り方の再現の確かめ (sim.ts)。wrangler.sim.jsonc で動かした時だけ
    case "/__sim/export":
      if (env.SIM !== "1" || !keyOk(env, req)) return json({ error: "not found" }, 404);
      return json(await exportSessions(env, url.searchParams.get("since") ?? "", url.searchParams.get("until") ?? ""));
    case "/__sim/compare":
      if (env.SIM !== "1" || !keyOk(env, req)) return json({ error: "not found" }, 404);
      return json(await compare(env, url));
    case "/health":
      return json({ ok: true, channels: CHANNELS.length, events: !!env.EVENTS, logs: !!env.LOGS, analytics: !!env.CF_ANALYTICS_TOKEN });
    default:
      return json({ error: "not found", paths: ["/live.json", "/health", "/api/poe2scout/…", "POST /feedback", "POST /event", "POST /log"] }, 404);
  }
}

/**
 * 訪問者の数 (画面の「本日の訪問者」。2026-10-11 オーナー「1 時間ごとに 9 時からの累積」、10-15 から訪問の回数 = 同じ人の 2 回目も数える)。1 時間おきの cron で 1 回だけ数えて KV に置き、
 * 画面は /boot.json に乗せて受け取る (来た人ごとにサーバーへ聞かない)。昨日の分は日が変わった時に 1 回だけ数える。書くのは 1 時間に 1 回
 */
const VISITORS_KEY = "visitors";
interface Visitors { today: number; since: string; at: string; yesterday: number | null; yesterdayFor: string | null }
async function updateVisitors(env: Env, now = new Date()): Promise<void> {
  if (!env.CF_ANALYTICS_TOKEN) return;
  const y = yesterdayJst(now, true);
  const floor = env.STATS_SINCE ?? "";
  const since = y.since < floor ? floor : y.since;
  const prev = (await env.LIVE.get(VISITORS_KEY, "json")) as Visitors | null;
  const today = await usersBetween(env, since, now.toISOString(), fetch, "visits");
  if (today == null) return;
  let yesterday = prev?.yesterdayFor === y.since ? prev.yesterday : null;
  if (yesterday == null) {
    const ys = new Date(new Date(y.since).getTime() - 86400e3).toISOString();
    yesterday = await usersBetween(env, ys < floor ? floor : ys, y.since, fetch, "visits");
  }
  await env.LIVE.put(VISITORS_KEY, JSON.stringify({ today, since: y.since, at: now.toISOString(), yesterday, yesterdayFor: y.since } satisfies Visitors));
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // 1 時間おきに相場、8 時間おきに配信の見張り (最新動画。2026-10-10 オーナー「5 分監視、8 時間に 1 回でええな」「相場も 1 時間に 1 回」)、毎朝 9 時 (JST = 0:00 UTC) は日報
    // 同じ時に、昨日 (JST) の分析用の記録をファイルで (日報とは別々に動かす。片方が落ちても、もう片方は送る)
    if (controller.cron === "0 0 * * *") {
      ctx.waitUntil(dailyReport(env));
      ctx.waitUntil(sendYesterdayLogs(env));
      if (env.LOGS) ctx.waitUntil(pruneImages(env.LOGS).catch((e) => console.warn("fb images:", String(e).slice(0, 160))));
    } else {
      // 1 時間おき: 相場を取り直す (全員に同じ物を配る、market.ts)。配信の見張りは 8 時間おき (UTC 0・8・16 時)
      ctx.waitUntil(refreshMarket(env).catch((e) => alert(env, "相場の取得", `poe2scout から取れない: ${String(e).slice(0, 200)}`)));
      if (new Date(controller.scheduledTime).getUTCHours() % 8 === 0) ctx.waitUntil(refresh(env));
      ctx.waitUntil(updateVisitors(env, new Date(controller.scheduledTime)).catch((e) => console.warn("visitors:", String(e).slice(0, 160))));
    }
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const t0 = Date.now();
    try {
      const res = await handle(req, env, ctx, url);
      reqLog(req, url, res.status, Date.now() - t0);
      return res;
    } catch (e) {
      reqLog(req, url, 500, Date.now() - t0, { error: String(e).slice(0, 200) });
      ctx.waitUntil(alert(env, "サーバーのエラー", `${url.pathname}: ${String(e).slice(0, 300)}`));
      return json({ error: "server error" }, 500);
    }
  },
};
