// カオススパムの自慢のカード (2026-10-16 オーナー「確率機はシェア機能追加。自慢目的、URL と共に宣伝」「画像付きが望ましい」)。
//   GET /s/spam?…      X・Discord・LINE が読む OGP のページ。人はそのベースのエミュレーター (/?base=) へ送る
//   GET /og/spam.png?… そのカードの絵 (1200×630)。結果は全部 URL に入っているので何も保存しない (KV・D1 は使わない)。
//                       一度作った絵は Cloudflare のキャッシュに置いて使い回す (同じ URL は作り直さない)
// 中身 (URL の ?): l=ja|en, b=ベースの英語名, bn=ベースの表示名, a=ベースの絵のファイル名, m=狙った MOD, k=カオスの名前,
//                  n=何回目で付いたか, r=100 人中の順位 (1〜100、小さいほど早い), md=半分の人, u=運が悪い 10 人に 1 人, c=費用
import { ImageResponse } from "workers-og";

const CHAOS_ICON = "https://web.poecdn.com//gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxSYXJlIiwic2NhbGUiOjEsInJlYWxtIjoicG9lMiJ9XQ/c0ca392a78/CurrencyRerollRare.png";
const PEOPLE = 100;

/** 文字の中身を HTML に入れる時のエスケープ */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (v, max = 1e7) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const cut = (s, n) => { const t = String(s ?? "").slice(0, n); return t; };

/**
 * 中身を読む (変な値は捨てる)。get(名前) で 1 つずつ。
 * 短い形 (/s/<code>): 中身の JSON の配列 [l, b, bn, m, n, a, r, md, u, c] を deflate して base64url にした物 (日本語をそのまま URL に入れると長すぎた。2026-10-16 オーナーのスマホで)
 */
const PACK = ["l", "b", "bn", "m", "n", "a", "r", "md", "u", "c"];
async function unpack(code) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("pack");
  const m = new Map(PACK.map((k, i) => [k, arr[i] == null ? null : String(arr[i])]));
  return (k) => m.get(k) ?? null;
}
function readCard(get) {
  const rank = num(get("r"), 100);
  return {
    en: get("l") === "en",
    base: cut(get("b"), 60),
    baseName: cut(get("bn") || get("b"), 40),
    art: /^[A-Za-z0-9_]{1,80}$/.test(get("a") ?? "") ? get("a") : null,
    mods: cut(get("m"), 120),
    uses: num(get("n")),
    rank: rank && rank >= 1 ? rank : null,
    median: num(get("md")),
    unlucky: num(get("u")),
    cost: cut(get("c"), 20),
  };
}

const T = (c, ja, en) => (c.en ? en : ja);
/** 50% より早ければ上位、遅ければ下位 (StageChaosSpam.vue の rankWord と同じ) */
const rankWord = (c, r) => (r <= 50 ? T(c, `上位 ${r}%`, `top ${r}%`) : T(c, `下位 ${Math.max(1, 100 - r)}%`, `bottom ${Math.max(1, 100 - r)}%`));
const luck = (c, r) => (r <= 10 ? T(c, "かなりの強運", "very lucky") : r <= 50 ? T(c, "運がいい方", "lucky") : r <= 90 ? T(c, "運が悪い方", "unlucky") : T(c, "かなりの沼", "very unlucky"));
const fmt = (n) => n.toLocaleString("en-US");

function titleOf(c) {
  if (c.uses == null) return "ExileDesk";
  return T(c, `${c.baseName} に ${c.mods} を ${fmt(c.uses)} 回で付けた！`, `${c.mods} on ${c.baseName} in ${fmt(c.uses)} uses!`);
}
function descOf(c) {
  const parts = [];
  if (c.rank != null) parts.push(T(c, `${PEOPLE} 人中 ${rankWord(c, c.rank)} の運 (${luck(c, c.rank)})`, `${rankWord(c, c.rank)} luck among ${PEOPLE} people (${luck(c, c.rank)})`));
  parts.push(T(c, "ExileDesk のカオススパム確率機 — PoE2 のクラフトを試せる", "ExileDesk Chaos spam calculator — try PoE2 crafting"));
  return parts.join(" · ");
}

/** X などが読むページ。人は JS でそのベースのエミュレーターへ (クローラーは JS を動かさないので OGP だけ読む) */
function sharePage(url, c, img) {
  const to = `/?base=${encodeURIComponent(c.base || "Gold Ring")}`;
  const t = esc(titleOf(c)), d = esc(descOf(c));
  return new Response(`<!doctype html><html lang="${c.en ? "en" : "ja"}"><head><meta charset="utf-8">
<title>${t}</title><meta name="description" content="${d}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ExileDesk">
<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(url.href)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${esc(img)}">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${esc(to)}">
</head><body><script>location.replace(${JSON.stringify(to)})</script><a href="${esc(to)}">ExileDesk</a></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

/** 日本語の字は Google Fonts から使う字だけ取る (全部入りは重い) */
async function font(text, weight) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
  const src = /src: url\((.+?)\) format\('(opentype|truetype)'\)/.exec(css)?.[1];
  if (!src) throw new Error("font");
  return (await fetch(src)).arrayBuffer();
}

/** PNG の大きさ (IHDR) */
async function pngSize(env, url, path) {
  try {
    const res = await env.ASSETS.fetch(new Request(new URL(path, url.origin)));
    const b = new Uint8Array(await res.arrayBuffer());
    const v = new DataView(b.buffer);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  } catch {
    return null;
  }
}
/** 絵を data URL に (ASSETS の中の物は Worker から直接読む) */
async function dataUrl(env, url, path) {
  try {
    const res = path ? await env.ASSETS.fetch(new Request(new URL(path, url.origin))) : await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    const buf = new Uint8Array(await res.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const b64 = btoa(s);
    return `data:${type};base64,${b64}`;
  } catch {
    return null;
  }
}

async function cardImage(url, env, c) {
  // satori は WebP を読めないので、カード用の PNG (public/og-art、base-art から作った物) を使う
  const art = c.art ? await dataUrl(env, url, `/og-art/${c.art}.png`) : null;
  // 元の絵は小さい (指輪・アミュレットはゲームでも 108px)。引き伸ばしすぎると粗いので 2.4 倍まで、右の枠 (幅 380・高さ 440) に収める
  const size = c.art ? await pngSize(env, url, `/og-art/${c.art}.png`) : null;
  const k = size ? Math.min(2.4, 380 / size.w, 440 / size.h) : 1;
  const aw = size ? Math.round(size.w * k) : 300, ah = size ? Math.round(size.h * k) : 300;
  const ax = 930 - aw / 2, ay = 300 - ah / 2;
  const orb = await dataUrl(env, CHAOS_ICON);
  const r = c.rank;
  const head = T(c, "カオススパム確率機", "Chaos spam calculator");
  const hit = c.uses != null ? fmt(c.uses) : "?";
  const hitTail = T(c, " 回目で付いた！", " uses to hit!");
  const luckLine = r != null ? T(c, `${PEOPLE} 人中 ${rankWord(c, r)} の運`, `${rankWord(c, r)} luck of ${PEOPLE}`) : "";
  const luckWord = r != null ? luck(c, r) : "";
  const stats = [
    c.median != null ? T(c, `半分の人 ${fmt(c.median)} 回`, `Half: ${fmt(c.median)}`) : "",
    c.unlucky != null ? T(c, `運が悪い 10 人に 1 人 ${fmt(c.unlucky)} 回`, `Unluckiest 1 in 10: ${fmt(c.unlucky)}`) : "",
    c.cost ? T(c, `費用 ${c.cost}`, `Cost ${c.cost}`) : "",
  ].filter(Boolean).join(" · ");
  const lucky = r != null && r <= 50;
  const allText = ["ExileDesk", head, c.baseName, c.mods, hit, hitTail, luckLine, luckWord, stats, T(c, "強運", "Lucky"), T(c, "沼", "Unlucky"), "exiledesk.com", "0123456789%·,!?"].join("");
  const [bold, regular] = await Promise.all([font(allText, 800), font(allText, 500)]);
  const markLeft = r != null ? Math.round(620 * (r / 100)) - 15 : 0;
  const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background-image:radial-gradient(ellipse at 78% 45%, #4a3410 0%, #1c140a 38%, #050403 75%);font-family:'Noto Sans JP';color:#efe6d2">
  <div style="display:flex;position:absolute;left:730px;top:90px;width:400px;height:420px;border-radius:210px;background-image:radial-gradient(circle, rgba(255,190,90,0.28) 0%, rgba(255,150,40,0.10) 45%, rgba(0,0,0,0) 70%)"></div>
  ${art ? `<img src="${art}" width="${aw}" height="${ah}" style="position:absolute;left:${ax}px;top:${ay}px" />` : ""}
  ${orb ? `<img src="${orb}" width="96" height="96" style="position:absolute;left:1030px;top:400px" />` : ""}
  <div style="display:flex;position:absolute;left:70px;top:48px;align-items:flex-end">
    <span style="font-size:46px;font-weight:800;color:#f2c96b">ExileDesk</span>
    <span style="font-size:28px;font-weight:500;color:#b9a98a;margin-left:16px;margin-bottom:6px">${esc(head)}</span>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:70px;top:132px;width:660px">
    <span style="font-size:32px;font-weight:800;color:#f3e3b5">${esc(c.baseName)}</span>
    <span style="font-size:28px;font-weight:800;color:#8f8fff;margin-top:6px">${esc(c.mods)}</span>
  </div>
  <div style="display:flex;position:absolute;left:70px;top:248px;align-items:flex-end">
    <span style="font-size:88px;font-weight:800;color:#6ee7b7;line-height:1">${esc(hit)}</span>
    <span style="font-size:44px;font-weight:800;color:#d9f5e8;margin-left:8px;margin-bottom:8px">${esc(hitTail)}</span>
  </div>
  ${r != null ? `
  <div style="display:flex;position:absolute;left:70px;top:364px;font-size:34px;font-weight:800">
    <span>${esc(luckLine)}</span><span style="margin-left:16px;color:${lucky ? "#6ee7b7" : "#fda4af"}">${esc(luckWord)}</span>
  </div>
  <div style="display:flex;position:absolute;left:70px;top:432px;width:620px;height:16px;border-radius:8px;background-image:linear-gradient(90deg,#10b981,#f59e0b,#f43f5e)"></div>
  <div style="display:flex;position:absolute;left:${70 + markLeft}px;top:425px;width:30px;height:30px;border-radius:15px;background:#14110d;border:4px solid #ffffff"></div>
  <div style="display:flex;position:absolute;left:70px;top:460px;width:620px;justify-content:space-between;font-size:20px;font-weight:500;color:#a99d86"><span>${esc(T(c, "強運", "Lucky"))}</span><span>${esc(T(c, "沼", "Unlucky"))}</span></div>` : ""}
  <div style="display:flex;position:absolute;left:70px;top:512px;font-size:24px;font-weight:500;color:#cfc3aa">${esc(stats)}</div>
  <div style="display:flex;position:absolute;right:48px;bottom:30px;font-size:26px;font-weight:800;color:#f2c96b">exiledesk.com</div>
</div>`;
  // 最後まで読んで、作れなかった時は例外にする (ストリームの途中で失敗すると空の 200 になる)
  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Noto Sans JP", data: bold, weight: 800, style: "normal" },
      { name: "Noto Sans JP", data: regular, weight: 500, style: "normal" },
    ],
  }).arrayBuffer();
}

/** /s/<code> (と古い形の /s/spam?…) と /og/<code>.png (/og/spam.png?…) だけ受ける。違えば null (呼んだ側が今まで通りに続ける) */
export async function ogCard(request, env, ctx) {
  const url = new URL(request.url);
  const page = /^\/s\/([A-Za-z0-9_-]{8,1500})$/.exec(url.pathname);
  const pic = /^\/og\/([A-Za-z0-9_-]{8,1500})\.png$/.exec(url.pathname);
  if (url.pathname === "/s/spam") return sharePage(url, readCard((k) => url.searchParams.get(k)), `${url.origin}/og/spam.png${url.search}`);
  if (page) {
    let get;
    try { get = await unpack(page[1]); } catch { return Response.redirect(`${url.origin}/`, 302); }
    return sharePage(url, readCard(get), `${url.origin}/og/${page[1]}.png`);
  }
  if (url.pathname !== "/og/spam.png" && !pic) return null;
  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  let res;
  try {
    const get = pic ? await unpack(pic[1]) : (k) => url.searchParams.get(k);
    const png = await cardImage(url, env, readCard(get));
    res = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    // 作れなかった時はサイトの共通の絵
    return env.ASSETS.fetch(new Request(new URL("/web/og.png", url.origin)));
  }
  ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res;
}
