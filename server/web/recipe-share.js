// シミュのレシピの短い URL (2026-10-26 オーナー「シェア URL なっがいし、コピー URL なっが」)。
//   POST /r/new  … 本文 = #recipe= の後ろの文字 (16,000 字まで) → { id }。同じ中身は同じ id (SHA-256 から 8 文字)
//   GET  /r/<id> … レシピの名前を og:title にした小さなページ。人は /#recipe=<code> へ移る (開く側は今の #recipe= の読みのまま、古い長い URL もそのまま)
// 置き場は D1 exiledesk-logs の recipe_shares (server/live/migrations/0011)。KV は使わない。
// 連打の制限は同じ表で数える: 同じ IP から 10 分に 20 本、全体で 1 日 2,000 本まで (もうある中身は数えずに返す)
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

/** code (deflate-raw + base64url の JSON、src/services/craft-stage/share.ts の packJson) → ツリーのレシピの名前。形が違えば例外 */
async function recipeNameOf(code) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const v = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text());
  // ツリーのレシピは { v: 2, n: 名前, t: 木 } (src/views/simulator/recipe-share.ts の PackedTree)
  if (!v || v.v !== 2 || !v.t || typeof v.t !== "object") throw new Error("form");
  return typeof v.n === "string" && v.n.trim() ? v.n.trim().slice(0, 80) : null;
}

function recipePage(url, id, code, name) {
  const to = `/#recipe=${code}`;
  const t = esc(name ? `${name} | ExileDesk クラフトレシピ` : "ExileDesk クラフトレシピ");
  const d = esc("PoE2 のクラフトの道 (シミュレーター) のレシピ。開くとそのまま回せます。");
  const img = `${url.origin}/web/og.png`;
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>${t}</title><meta name="description" content="${d}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ExileDesk">
<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(`${url.origin}/r/${id}`)}"><meta property="og:image" content="${esc(img)}">
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
    const code = (await request.text()).trim();
    if (!CODE.test(code)) return json({ error: "bad" }, 400);
    let name;
    try { name = await recipeNameOf(code); } catch { return json({ error: "bad" }, 400); }
    const id = await recipeIdOf(code);
    // もうある中身は数えずに返す (同じ人が何回押しても行は増えない)
    if (await env.LOGS.prepare("SELECT 1 FROM recipe_shares WHERE id = ?").bind(id).first()) return json({ id });
    const ip = [...(await sha(`recipe:${request.headers.get("cf-connecting-ip") ?? "?"}`)).slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const mine = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM recipe_shares WHERE ip = ? AND at > ?").bind(ip, now - IP_MS).first();
    if ((mine?.n ?? 0) >= IP_N) return json({ error: "busy" }, 429);
    const all = await env.LOGS.prepare("SELECT COUNT(*) AS n FROM recipe_shares WHERE at > ?").bind(now - DAY_MS).first();
    if ((all?.n ?? 0) >= DAY_N) return json({ error: "busy" }, 429);
    await env.LOGS.prepare("INSERT OR IGNORE INTO recipe_shares (id, code, name, at, ip) VALUES (?, ?, ?, ?, ?)").bind(id, code, name, now, ip).run();
    return json({ id });
  }
  const m = /^\/r\/([^/]+)\/?$/.exec(url.pathname);
  if (!m || request.method !== "GET") return null;
  if (!ID.test(m[1]) || !env.LOGS) return Response.redirect(`${url.origin}/`, 302);
  // 端のキャッシュにあれば D1 を読まない
  const key = new Request(`${url.origin}/r/${m[1]}`, { method: "GET" });
  const hit = await caches.default.match(key);
  if (hit) return hit;
  const row = await env.LOGS.prepare("SELECT code, name FROM recipe_shares WHERE id = ?").bind(m[1]).first();
  if (!row) return Response.redirect(`${url.origin}/`, 302);
  const res = recipePage(url, m[1], String(row.code), row.name ? String(row.name) : null);
  ctx?.waitUntil?.(caches.default.put(key, res.clone()));
  return res;
}
