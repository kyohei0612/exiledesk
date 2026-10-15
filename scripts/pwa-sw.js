/*
 * Web 版の service worker の本体 (2026-10-15 PWA)。scripts/build-sw.mjs が頭に VERSION / ART_VERSION / PRECACHE を足して dist-web/sw.js に出す。
 *
 * 持つ物:
 *   shell (版ごと) … 画面と計算とデータ (index.html・assets・ui-art・fonts・アイコン)。入れる時に全部落とす = オフラインでも全部動く
 *   art (絵の版ごと) … ベース・ユニーク・ルーン・スキルの絵。使った物から順にためる (一度に 25 MB を落とさない)
 *   data … 相場 (/boot.json) とほかのページ。電波がある時はいつも取り直し、無い時に最後の物を出す
 * 版が上がったら: 裏で新しい shell を落として待つ (waiting)。画面の「更新」か、次に開いた時に切り替わる (src/web/pwa.ts)。
 * 広告・解析・YouTube など外の物は触らない (respondWith しない = ブラウザがそのまま取る)
 */
/* global VERSION, ART_VERSION, PRECACHE */
const SHELL = `exiledesk-shell-${VERSION}`;
const ART = `exiledesk-art-${ART_VERSION}`;
const DATA = "exiledesk-data";
/** 前の版の shell を 1 つ残す (切り替えた時に開いたままの別のタブが、まだ読んでいない JS を取れるように) */
const META = "/__exiledesk-sw-meta";
const ART_RE = /^\/(base-art|unique-art|rune-art|skill-art)\//;
const SHELL_RE = /^\/(assets|ui-art|fonts|web)\/|^\/favicon\.(png|ico)$/;

self.addEventListener("install", (e) => {
  // index.html は HTTP のキャッシュを通さず取る (古い版の画面を新しい版の箱に入れない)
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: u === "/" ? "no-cache" : "default" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const data = await caches.open(DATA);
    const prev = await data.match(META).then((r) => (r ? r.json() : { shells: [] })).catch(() => ({ shells: [] }));
    const keep = [...prev.shells.filter((n) => n !== SHELL).slice(-1), SHELL];
    await data.put(META, new Response(JSON.stringify({ shells: keep })));
    for (const k of await caches.keys()) {
      if ((k.startsWith("exiledesk-shell-") && !keep.includes(k)) || (k.startsWith("exiledesk-art-") && k !== ART)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

/** 手元にあればそれ、無ければ取って入れる (版の名前が付いた物・絵) */
async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req, { ignoreSearch: cacheName === ART });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type !== "opaque") { const c = await caches.open(cacheName); await c.put(req, res.clone()); }
  return res;
}
/** 電波があれば取り直して入れる、無ければ最後の物 */
async function networkFirst(req, key) {
  const c = await caches.open(DATA);
  try {
    const res = await fetch(req);
    if (res.ok) await c.put(key || req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(key || req, { ignoreSearch: !key });
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // 相場と配信の情報 (server/live の /boot.json)。電波が無い時は最後の値段 (画面は「◯時の値段」と出す)
    if (url.pathname === "/boot.json") e.respondWith(networkFirst(req, url.origin + url.pathname));
    return;
  }
  if (req.mode === "navigate") {
    // エミュレーターの画面 (/?base=… なども) は手元の版。ほかのページ (/bases/・/guide など) は取り直し、無ければ最後の物、それも無ければエミュレーター
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/web.html") {
      e.respondWith(caches.open(SHELL).then((c) => c.match("/")).then((hit) => hit || fetch(req)));
    } else {
      e.respondWith(networkFirst(req).catch(() => caches.match("/")));
    }
    return;
  }
  if (url.pathname === "/sw.js") return;
  if (ART_RE.test(url.pathname)) { e.respondWith(cacheFirst(req, ART)); return; }
  if (SHELL_RE.test(url.pathname)) { e.respondWith(cacheFirst(req, SHELL)); return; }
  if (url.pathname === "/market-fallback.json") { e.respondWith(networkFirst(req)); return; }
});
