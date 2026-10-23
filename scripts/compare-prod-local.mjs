#!/usr/bin/env node
/**
 * compare-prod-local.mjs — 本番 (exiledesk.com) と手元 (pnpm preview:prod) で同じ URL を叩き、返り方を並べる (2026-10-24)
 *   node scripts/compare-prod-local.mjs [手元の住所 (既定 http://127.0.0.1:1460)] [--md]
 * 見る物: ステータス・Location・content-type・cache-control・x-robots-tag。人 (普通の Chrome) とクローラー (Googlebot) の 2 通り。
 * 読むだけ (GET)。/s/・/og/ は本番の shares の行の id (手元には preview-prod.mjs が写している) を使う。
 * 中身 (HTML の文・JS の塊の名前) は手元の作りと本番の版が違えば違うので比べない。
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "http://127.0.0.1:1460";
const MD = process.argv.includes("--md");
const PROD = "https://exiledesk.com";
const UA = { 人: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", クローラー: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" };
const HEADS = ["location", "content-type", "cache-control", "x-robots-tag"];

// 本番の shares の新しい 1 行 (読むだけ)
let sid = null;
try {
  const web = resolve(ROOT, "server/web");
  const out = execFileSync(process.execPath, [resolve(web, "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "exiledesk-logs", "--remote", "--json", "--command", "SELECT id FROM shares ORDER BY at DESC LIMIT 1"], { cwd: web, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  sid = JSON.parse(out)[0].results[0]?.id ?? null;
} catch { /* 無ければ /s/ は飛ばす */ }

const PATHS = ["/", "/index.html", "/web.html", "/?page=sim-tree", "/?page=routes", "/?lang=en", "/about", "/about.html", "/about/", "/blog", "/blog/", "/en/", "/faq", "/ads.txt", "/robots.txt", "/sitemap.xml", "/market-fallback.json", "/bases/", "/no-such-page-x", ...(sid ? [`/s/${sid}`, `/og/${sid}.png`] : [])];

async function look(base, path, ua) {
  // 人のブラウザはページを開く時に必ず sec-fetch-mode を付ける (move-gate.js がクローラーとの見分けに使う)
  const headers = { "user-agent": UA[ua], ...(ua === "人" ? { "sec-fetch-mode": "navigate" } : {}) };
  try {
    const r = await fetch(base + path, { headers, redirect: "manual" });
    await r.arrayBuffer();
    const h = HEADS.map((k) => (r.headers.get(k) ?? "").replace(base, "").replace(PROD, "").replace(/^https?:\/\/127\.0\.0\.1:\d+/, "").slice(0, 40));
    return [String(r.status), ...h];
  } catch (e) { return ["ERR " + String(e).slice(0, 40), "", "", "", ""]; }
}

const rows = [];
let diff = 0;
for (const path of PATHS) for (const ua of Object.keys(UA)) {
  const [p, l] = await Promise.all([look(PROD, path, ua), look(LOCAL, path, ua)]);
  const same = p.every((v, i) => v === l[i]);
  if (!same) diff++;
  rows.push({ path, ua, same, p, l });
}
if (MD) {
  console.log(`| URL | 誰 | 本番 | 手元 | 同じ |\n|---|---|---|---|---|`);
  const fmt = (a) => [a[0], ...a.slice(1).map((v, i) => (v ? `${HEADS[i]}: ${v}` : "")).filter(Boolean)].join("<br>");
  for (const r of rows) console.log(`| ${r.path} | ${r.ua} | ${fmt(r.p)} | ${r.same ? "同じ" : fmt(r.l)} | ${r.same ? "○" : "×"} |`);
} else {
  for (const r of rows) console.log(`${r.same ? "  同じ" : "★違う"} ${r.ua.padEnd(5)} ${r.path}\n        本番 ${r.p.join(" | ")}${r.same ? "" : `\n        手元 ${r.l.join(" | ")}`}`);
}
console.log(`\n${rows.length} 通りのうち違う物 ${diff}`);
