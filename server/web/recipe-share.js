// シミュのレシピの短い URL (2026-10-26 オーナー「シェア URL なっがいし、コピー URL なっが」)。
//   POST /r/new  … 本文 = #recipe= の後ろの文字 (16,000 字まで) → { id }。同じ中身は同じ id (SHA-256 から 8 文字)
//   GET  /r/<id> … レシピの名前を og:title にした小さなページ。人は /#recipe=<code> へ移る (開く側は今の #recipe= の読みのまま、古い長い URL もそのまま)
// 置き場は D1 exiledesk-logs の recipe_shares (server/live/migrations/0011)。KV は使わない。
// 連打の制限は同じ表で数える: 同じ IP から 10 分に 20 本、全体で 1 日 2,000 本まで (もうある中身は数えずに返す)
// カード絵 (2026-10-28、設計図 Y-35): 本文を JSON { code, card } にすると card (完成の割合・平均の費用など、画面が持っている値) を列 card (0013) に置き、
//   /r/<id> の og:image を /og/r/<id>(-c).png (recipe-card.js) にする。本文がただの code の時 (古い形) も今までどおり受ける
import { cleanCard, readRecipeCard, recipeCardImage, recipeDesc, recipeTitle } from "./recipe-card.js";
const ID = /^[0-9A-Za-z]{8}$/;
const CODE = /^[A-Za-z0-9_-]{20,16000}$/;
const IP_N = 20, IP_MS = 10 * 60 * 1000, DAY_N = 2000, DAY_MS = 24 * 60 * 60 * 1000;
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sha = async (s) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

/** 中身 → 8 文字の id (SHA-256 の頭 8 バイトを 62 進で) */
export async function recipeIdOf(code) {
  const h = await sha(code);
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(h[i]);
  let out = "";
  for (let i = 0; i < 8; i++) { out += B62[Number(n % 62n)]; n /= 62n; }
  return out;
}

/** code (deflate-raw + base64url の JSON、src/services/craft-stage/share.ts の packJson) → ツリーのレシピの名前とベースの英語名。形が違えば例外 */
async function recipeOf(code) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const v = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text());
  // ツリーのレシピは { v: 2, n: 名前, t: 木 } (src/views/simulator/recipe-share.ts の PackedTree)
  if (!v || v.v !== 2 || !v.t || typeof v.t !== "object") throw new Error("form");
  return { name: typeof v.n === "string" && v.n.trim() ? v.n.trim().slice(0, 80) : null, base: typeof v.t.base === "string" ? v.t.base.slice(0, 60) : null };
}
/**
 * カード絵のスイッチ (Y-35、オーナーの OK 待ち)。false の間は今までどおり: card の列 (0013) に触らず、og:image はサイト共通の /web/og.png。
 * 開ける時は先に `wrangler d1 migrations apply exiledesk-logs --remote` (server/live) で 0013 を当ててから true にして deploy:web
 */
export const RECIPE_CARD = false;
const PNG_HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" };
const parseCard = (s) => { try { return s ? JSON.parse(String(s)) : null; } catch { return null; } };
/** カード絵の道 (card のある行は -c。後から card が足されても前の絵のキャッシュを使わない) */
const picPath = (id, card) => `/og/r/${id}${card ? "-c" : ""}.png`;
async function renderCard(url, env, row) {
  let base = null;
  try { base = (await recipeOf(String(row.code))).base; } catch { /* 名前だけ */ }
  return new Response(await recipeCardImage(url, env, readRecipeCard(row.name ? String(row.name) : null, parseCard(row.card), base)), { headers: PNG_HEADERS });
}

function recipePage(url, id, code, c, img) {
  const to = `/#recipe=${code}`;
  const t = esc(recipeTitle(c));
  const d = esc(recipeDesc(c));
  return new Response(`<!doctype html><html lang="${c.en ? "en" : "ja"}"><head><meta charset="utf-8">
<title>${t}</title><meta name="description" content="${d}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ExileDesk">
<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(`${url.origin}/r/${id}`)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${esc(img)}">
<meta name="robots" content="noindex"><script>location.replace(${JSON.stringify(to)})</script><meta http-equiv="refresh" content="0;url=${esc(to)}">
</head><body><a href="${esc(to)}">ExileDesk</a></body></html>`, {
    // 中身は変わらない (id = 中身) ので 1 日キャッシュ
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}

/** /r/new と /r/<id> だけ受ける。違えば null (呼んだ側が今まで通りに続ける) */
export async function recipeShare(request, env, ctx, now = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname === "/r/new") {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST" || !env.LOGS) return json({ error: "no" }, 405);
    const raw = (await request.text()).trim();
    if (raw.length > 20000) return json({ error: "bad" }, 400);
    let code = raw, card = null;
    if (raw.startsWith("{")) {
      let v;
      try { v = JSON.parse(raw); } catch { return json({ error: "bad" }, 400); }
      code = typeof v?.code === "string" ? v.code.trim() : "";
      const c = cleanCard(v?.card);
      card = c && RECIPE_CARD ? JSON.stringify(c) : null;
      if (card && card.length > 3000) card = null;
    }
    if (!CODE.test(code)) return json({ error: "bad" }, 400);
    let name;
    try { name = (await recipeOf(code)).name; } catch { return json({ error: "bad" }, 400); }
    const id = await recipeIdOf(code);
    const warm = (row) => ctx?.waitUntil?.((async () => {
      // カード絵を先に作ってキャッシュ (X が読みに来た時にすぐ出す)。card が足された時は前のページのキャッシュを捨てる
      const pic = new URL(picPath(id, row.card), url.origin);
      try { await caches.default.delete(new Request(`${url.origin}/r/${id}`, { method: "GET" })); } catch { /* 無くてよい */ }
      const key = new Request(pic.toString(), { method: "GET" });
      if (await caches.default.match(key)) return;
      try { await caches.default.put(key, await renderCard(pic, env, row)); } catch { /* 読みに来た時に作る */ }
    })());
    // もうある中身は数えずに返す (同じ人が何回押しても行は増えない)。card の無い行に card が来たら足す
    if (await env.LOGS.prepare("SELECT 1 FROM recipe_shares WHERE id = ?").bind(id).first()) {
      if (card && (await env.LOGS.prepare("UPDATE recipe_shares SET card = ? WHERE id = ? AND card IS NULL").bind(card, id).run()).meta.changes) warm({ code, name, card });
      return json({ id });
    }
    const ip = [...(await sha(`recipe:${request.headers.get("cf-connecting-ip") ?? "?"}`)).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const mine = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM recipe_shares WHERE ip = ? AND at > ?").bind(ip, now - IP_MS).first();
    if ((mine?.n ?? 0) >= IP_N) return json({ error: "busy" }, 429);
    const all = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM recipe_shares WHERE at > ?").bind(now - DAY_MS).first();
    if ((all?.n ?? 0) >= DAY_N) return json({ error: "busy" }, 429);
    await (card
      ? env.LOGS.prepare("INSERT OR IGNORE INTO recipe_shares (id, code, name, at, ip, card) VALUES (?, ?, ?, ?, ?, ?)").bind(id, code, name, now, ip, card)
      : env.LOGS.prepare("INSERT OR IGNORE INTO recipe_shares (id, code, name, at, ip) VALUES (?, ?, ?, ?, ?)").bind(id, code, name, now, ip)).run();
    if (card) warm({ code, name, card });
    return json({ id });
  }
  // カード絵 /og/r/<id>.png・/og/r/<id>-c.png
  const pic = /^\/og\/r\/([0-9A-Za-z]{8})(-c)?\.png$/.exec(url.pathname);
  if (pic && request.method === "GET" && RECIPE_CARD) {
    const key = new Request(`${url.origin}${url.pathname}`, { method: "GET" });
    const hit = await caches.default.match(key);
    if (hit) return hit;
    let res;
    try {
      const row = env.LOGS ? await env.LOGS.prepare("SELECT code, name, card FROM recipe_shares WHERE id = ?").bind(pic[1]).first() : null;
      if (!row) throw new Error("none");
      res = await renderCard(url, env, row);
    } catch {
      // 作れなかった時はサイトの共通の絵 (キャッシュしない)
      return env.ASSETS.fetch(new Request(new URL("/web/og.png", url.origin)));
    }
    ctx?.waitUntil?.(caches.default.put(key, res.clone()));
    return res;
  }
  const m = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  if (!m || request.method !== "GET") return null;
  if (!ID.test(m[1]) || !env.LOGS) return Response.redirect(`${url.origin}/`, 302);
  // 端のキャッシュにあれば D1 を読まない
  const key = new Request(`${url.origin}/r/${m[1]}`, { method: "GET" });
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const row = await env.LOGS.prepare(`SELECT code, name${RECIPE_CARD ? ", card" : ""} FROM recipe_shares WHERE id = ?`).bind(m[1]).first();
  if (!row) return Response.redirect(`${url.origin}/`, 302);
  let base = null;
  try { base = (await recipeOf(String(row.code))).base; } catch { /* 名前だけ */ }
  const card = parseCard(row.card);
  const res = recipePage(url, m[1], String(row.code), readRecipeCard(row.name ? String(row.name) : null, card, RECIPE_CARD ? base : null), RECIPE_CARD ? `${url.origin}${picPath(m[1], card)}` : `${url.origin}/web/og.png`);
  ctx?.waitUntil?.(caches.default.put(key, res.clone()));
  return res;
}
