// sw.js — Web 版のサービスワーカー (PWA、2026-10-17 オーナー「ホーム画面に追加」「オフラインでも動く」)。
// - 画面 (HTML) は通信を先に、つながらない時は前に取った物 (オフラインでも開く)。新しい版はつながった時にそのまま入る
// - 作った物 (/assets/ は名前に中身の印が入っていて変わらない)・絵・音・フォントは、一度使った物を取っておく (次からは手元から、オフラインでも動く)
// - 相場 (/boot.json) は通信を先に、つながらない時は最後に取った値
// - よそのサーバーへの送り物 (記録・要望) や、シェアのカード・開発版の門 (/s/・/og/・?k=) には触らない
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const FILES = `files-${VERSION}`;
const DATA = `data-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add("/")).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  const keep = new Set([PAGES, FILES, DATA]);
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const FILE_RE = /^\/(assets|base-art|unique-art|rune-art|skill-art|ui-art|og-art|sfx|fonts|web)\//;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // 相場 (server/live の /boot.json): 通信を先に、だめなら最後に取った値
  if (url.pathname === "/boot.json") { e.respondWith(networkFirst(req, DATA)); return; }
  if (url.origin !== self.location.origin) return;
  if (/^\/(s|og)\//.test(url.pathname) || url.searchParams.has("k")) return;
  if (req.mode === "navigate") { e.respondWith(page(req)); return; }
  if (FILE_RE.test(url.pathname)) e.respondWith(cacheFirst(req, FILES));
});

/** 画面: 通信を先に (取れたら "/" として取っておく)。だめなら取っておいた物 */
async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok && new URL(req.url).pathname === "/") (await caches.open(PAGES)).put("/", res.clone());
    return res;
  } catch {
    return (await caches.match(req, { ignoreSearch: true })) ?? (await caches.match("/")) ?? Response.error();
  }
}
async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}
async function networkFirst(req, name) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(name)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) ?? Response.error();
  }
}
