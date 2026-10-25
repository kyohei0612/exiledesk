/*
 * pv.js — 静的なページを 1 ページとして数えるだけの小さな JS (2026-10-25、サーバー管理人。オーナー「コスメにも PV 計測」)。
 * 今はコスメティックのページ (scripts/build-cosmetics-pages.mjs が /pv.js に写す) が使う。本文は JS 無しで読める。
 * 開いた時に visit と screen (to = data-screen、例 "cosmetics:index:ja") を溜め、画面を離れる時に POST /log (server/live、D1)。
 * 形と「1 時間に 1 回・それまでは端末に溜める」は Web 版の送り手 (src/services/telemetry/log-sender.ts)・ブログ (scripts/_blog-client.js) と同じ
 * (同じ localStorage の印 = 同じ人・同じ溜め置き)。1 ページで送るのは多くて 1 回 (1 日 10 万の枠)。
 * 送らない: 記録しない端末 (exiledesk.noLog)・ロボット (UA・webdriver)・exiledesk.com の外 (手元の作り。data-api を付けた時だけ送る = 確かめ用)。
 */
(function () {
  var me = document.currentScript;
  var screen = me.getAttribute("data-screen") || "page:" + location.pathname.slice(0, 40);
  var lang = me.getAttribute("data-lang") || "ja";
  var ver = me.getAttribute("data-v") || "";
  var api = me.getAttribute("data-api") || "";
  var PEND = "exiledesk.log.pending", LAST = "exiledesk.log.lastSent", UID = "exiledesk.web.uid", HOUR = 3600000;
  var ua = navigator.userAgent || "";
  if (navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless/i.test(ua)) return;
  if (!api) {
    if (!/(^|\.)exiledesk\.com$/.test(location.hostname)) return;
    api = "https://exiledesk-live.exiledesk.workers.dev";
  }
  try { if (localStorage.getItem("exiledesk.noLog") === "1") return; } catch (e) { return; }
  var rnd = function () { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); };
  var uid = "", first = false;
  try { uid = localStorage.getItem(UID) || ""; if (!uid) { uid = rnd(); first = true; localStorage.setItem(UID, uid); } } catch (e) { uid = rnd(); }
  var sid = rnd(), devc = /Mobi|Android|iPhone|iPad/i.test(ua) ? "mobile" : "pc";
  var ref = "direct";
  try { if (document.referrer) ref = new URL(document.referrer).hostname; } catch (e) { /* 無くてよい */ }
  var recs = [
    { k: "visit", t: Date.now(), d: { ref: ref, entry: "path:" + location.pathname.slice(0, 40), path: location.pathname, dev: devc, first: first } },
    { k: "screen", t: Date.now(), d: { to: screen, lang: lang, s: 0 } },
  ];

  function flush() {
    if (!recs.length) return;
    var pend = { recs: [], ev: [] };
    try { var v = JSON.parse(localStorage.getItem(PEND) || "null"); if (v && v.recs && v.ev) pend = v; } catch (e) { /* 無くてよい */ }
    pend.recs = pend.recs.concat(recs.splice(0, recs.length));
    var last = 0;
    try { last = Number(localStorage.getItem(LAST) || 0) || 0; } catch (e) { /* 無くてよい */ }
    try { if (Date.now() - last < HOUR && JSON.stringify(pend).length < 200000) { localStorage.setItem(PEND, JSON.stringify(pend)); return; } } catch (e) { /* 置けなければ送る */ }
    var rs = pend.recs.slice(-200);
    var body = '{"app":"web","n":' + rs.length + ',"v":"' + ver + '","uid":"' + uid + '","sid":"' + sid + '","dev":"' + devc + '","recs":' + JSON.stringify(rs) + (pend.ev.length ? ',"__ev":[' + pend.ev.join(",") + "]" : "") + "}";
    try { localStorage.removeItem(PEND); localStorage.setItem(LAST, String(Date.now())); } catch (e) { /* 無くてよい */ }
    try { if (!(navigator.sendBeacon && navigator.sendBeacon(api + "/log", new Blob([body], { type: "text/plain;charset=UTF-8" })))) fetch(api + "/log", { method: "POST", body: body, keepalive: true, credentials: "omit" }); } catch (e) { /* 落としてよい */ }
  }
  addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
})();
