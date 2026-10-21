/*
 * blog.js — ブログの記事・一覧のページの小さな JS (2026-10-22、scripts/build-blog-pages.mjs が /blog/blog.js に写す)。本文は JS 無しで読める。
 * 1. 数える: 開いた時に visit と screen (to = "blog:<slug>:<言語>" / 一覧は "blog:index:<言語>") を、シェアのボタンで blog_share (slug・言語・どこへ) を溜め、
 *    画面を離れる時に POST /log (server/live、D1)。形と「1 時間に 1 回・それまでは端末に溜める」は Web 版の送り手 (src/services/telemetry/log-sender.ts) と同じ
 *    (同じ localStorage の印 = 同じ人・同じ溜め置き)。記録しない端末 (exiledesk.noLog) と開発版 (data-dev) は送らない (window.__blogLog に溜めるだけ)。
 * 2. コピーのボタン (リンク・Discord 向けの題 + URL) を出して動かす (JS が無いと出ない。X・Reddit はただのリンク)。
 */
(function () {
  var me = document.currentScript;
  var slug = me.getAttribute("data-slug") || "";
  var lang = me.getAttribute("data-lang") || "ja";
  var dev = me.getAttribute("data-dev") === "1";
  var api = me.getAttribute("data-api") || "";
  var ver = me.getAttribute("data-v") || "";
  var PEND = "exiledesk.log.pending", LAST = "exiledesk.log.lastSent", UID = "exiledesk.web.uid", HOUR = 3600000;
  var rnd = function () { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6); };
  var noLog = function () { try { return dev || localStorage.getItem("exiledesk.noLog") === "1"; } catch (e) { return true; } };
  var uid = "", first = false;
  try { uid = localStorage.getItem(UID) || ""; if (!uid) { uid = rnd(); first = true; localStorage.setItem(UID, uid); } } catch (e) { uid = rnd(); }
  var sid = rnd(), devc = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "pc", t0 = Date.now();
  var recs = [];
  window.__blogLog = recs;
  // 「この端末は記録しない」の端末は溜めもしない (送りもしない)。開発版は確かめのために溜めるが送らない
  var optedOut = function () { try { return localStorage.getItem("exiledesk.noLog") === "1"; } catch (e) { return true; } };
  var put = function (k, d) { if (optedOut()) return; recs.push({ k: k, t: Date.now(), d: d }); };
  var ref = "direct";
  try { if (document.referrer) ref = new URL(document.referrer).hostname; } catch (e) { /* 無くてよい */ }
  put("visit", { ref: ref, entry: "path:" + location.pathname.slice(0, 40), path: location.pathname, dev: devc, first: first });
  // 画面名は記事ごと・言語ごとに数えられる形 (2026-10-22 オーナー「ブログも PV 計算できるように」): blog:<slug>:<言語> / 一覧は blog:index:<言語>
  put("screen", { to: (slug ? "blog:" + slug : "blog:index") + ":" + lang, lang: lang, s: 0 });

  function flush() {
    if (!recs.length || noLog()) return;
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

  // 一覧のタグの札: 押したタグのカードだけ出す (「すべて」で戻す)
  document.querySelectorAll("[data-tagf]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      var tag = a.getAttribute("data-tagf");
      document.querySelectorAll("[data-tagf]").forEach(function (b) { b.classList.toggle("on", b === a); });
      document.querySelectorAll(".cards li").forEach(function (li) { li.hidden = !!tag && (li.getAttribute("data-tags") || "").split("|").indexOf(tag) < 0; });
    });
  });
  // シェア: 押した数を数える。コピーのボタンは JS がある時だけ出す
  var copied = me.getAttribute("data-copied") || "Copied";
  document.querySelectorAll("[data-share][hidden]").forEach(function (b) { b.hidden = false; });
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-share]") : null;
    if (!b) return;
    var to = b.getAttribute("data-share");
    put("blog_share", { slug: slug, lang: lang, to: to, s: Math.round((Date.now() - t0) / 1000) });
    var text = b.getAttribute("data-copy");
    if (text == null) return;
    e.preventDefault();
    var done = function () { var old = b.textContent; b.textContent = copied; b.setAttribute("data-done", "1"); setTimeout(function () { b.textContent = old; b.removeAttribute("data-done"); }, 1500); };
    try { navigator.clipboard.writeText(text).then(done, function () { window.prompt("", text); }); } catch (err) { window.prompt("", text); }
  });
})();
