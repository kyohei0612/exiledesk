// カオススパムの自慢のカード (2026-10-16 オーナー「計算機はシェア機能追加。自慢目的、URL と共に宣伝」「画像付きが望ましい」)。
//   GET /s/spam?…      X・Discord・LINE が読む OGP のページ。人はそのベースのエミュレーター (/?base=) へ送る
//   GET /og/spam.png?… そのカードの絵 (1200×630)。中身は URL の code か、短い id (7 文字) なら D1 の shares の行 (下の shortIdOf)。
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
 * 短い形 (/s/<code>): 中身の JSON の配列 [l, b, bn, m, n, a, r, md, u, c, setup] を deflate して base64url にした物 (日本語をそのまま URL に入れると長すぎた。2026-10-16 オーナーのスマホで)。
 * setup (11 番目) はカードには使わず、本体が計算機を開くのに使う (/?spam=<code>、2026-10-17)
 */
// 12・13 番目 (h = 題、o = 主のカレンシーの絵の URL) はスパムシミュレーターの運試し (2026-10-19)。無ければカオススパム計算機
// 14 番目 (p) は比べた人数 (スマホは 10 人。2026-10-19)。無ければ 100
const PACK = ["l", "b", "bn", "m", "n", "a", "r", "md", "u", "c", null, "h", "o", "p"];
async function unpack(code) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  const arr = JSON.parse(json);
  if (!Array.isArray(arr)) throw new Error("pack");
  const m = new Map(PACK.map((k, i) => [k, arr[i] == null ? null : String(arr[i])]).filter(([k]) => k));
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
    head: get("h") ? cut(get("h"), 40) : null,
    people: num(get("p"), 1000) || PEOPLE,
    orb: /^https:\/\/web\.poecdn\.com\/[^"'<>\s]{1,400}$/.test(get("o") ?? "") ? get("o") : null,
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
  if (c.rank != null) parts.push(T(c, `${c.people} 人中 ${rankWord(c, c.rank)} の運 (${luck(c, c.rank)})`, `${rankWord(c, c.rank)} luck among ${c.people} people (${luck(c, c.rank)})`));
  parts.push(c.head ? `ExileDesk ${c.head}` : T(c, "ExileDesk のカオススパム計算機 — PoE2 のクラフトを試せる", "ExileDesk Chaos spam calculator — try PoE2 crafting"));
  return parts.join(" · ");
}

/** X などが読むページ。人は JS でそのベースのエミュレーターへ (クローラーは JS を動かさないので OGP だけ読む) */
function sharePage(url, c, img, code = null) {
  // 押した人はそのベースのエミュレーターへ (2026-10-16 オーナー「開いたらデスクに飛ぶでいい」)
  // via=share と、カードを開く前の referrer のホスト (r) を本体に渡す (本体の referrer はこのページになるので。2026-10-16 どの投稿から来たか分からなかった)
  // 開いた人に同じカオススパム計算機を出す (code の setup を本体が読む、src/state/spam-share-open.ts。2026-10-17 オーナー「開いたら即スパム測定」)
  const to = `/?base=${encodeURIComponent(c.base || "Gold Ring")}&via=share${code ? `&spam=${code}` : ""}`;
  const t = esc(titleOf(c)), d = esc(descOf(c));
  return new Response(`<!doctype html><html lang="${c.en ? "en" : "ja"}"><head><meta charset="utf-8">
<title>${t}</title><meta name="description" content="${d}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ExileDesk">
<meta property="og:title" content="${t}"><meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(url.href)}"><meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${t}"><meta name="twitter:description" content="${d}"><meta name="twitter:image" content="${esc(img)}">
<meta name="robots" content="noindex"><script>var r="";try{r=document.referrer?new URL(document.referrer).hostname:""}catch(e){}location.replace(${JSON.stringify(to)}+(r?"&r="+encodeURIComponent(r):""))</script><meta http-equiv="refresh" content="1;url=${esc(to)}">
</head><body><a href="${esc(to)}">ExileDesk</a></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}

/** 日本語の字は Google Fonts から使う字だけ取る (全部入りは重い) */
async function font(text, weight, family = "Noto+Sans+JP") {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}${weight ? `:wght@${weight}` : ""}&text=${encodeURIComponent(text)}`)).text();
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

/** かなりの強運 (上位 10% 以内) は計算機の中と同じ銅色の特別仕様 (二重の細い枠・線・「かなりの強運 / TOP n%」、2026-10-16 オーナー「銅色の光って大人っぽい」「Twitter にもその特別仕様で」)。
 * X は大きいカードの下 (約 80px) に題を重ねて出すので、字は 500px より上に置く (2026-10-16 オーナーのスマホで「半分の人」の行が隠れた) */
async function cardImage(url, env, c) {
  // satori は WebP を読めないので、カード用の PNG (public/og-art、base-art から作った物) を使う
  const art = c.art ? await dataUrl(env, url, `/og-art/${c.art}.png`) : null;
  // 元の絵は小さい (指輪・アミュレットはゲームでも 108px)。引き伸ばしすぎると粗いので 2.4 倍まで、右の枠 (幅 380・高さ 440) に収める
  const size = c.art ? await pngSize(env, url, `/og-art/${c.art}.png`) : null;
  const k = size ? Math.min(2.4, 380 / size.w, 440 / size.h) : 1;
  const aw = size ? Math.round(size.w * k) : 300, ah = size ? Math.round(size.h * k) : 300;
  const ax = 930 - aw / 2, ay = 290 - ah / 2;
  const orb = await dataUrl(env, c.orb ?? CHAOS_ICON);
  // 左上のロゴはサイトの上の帯と同じ (アプリのアイコン + Cinzel の金の EXILEDESK)。前は Noto Sans の平たい字だった (2026-10-18 オーナー「旧エグザイルデスクじゃね？のっぺりしてる」)
  const logo = await dataUrl(env, url, "/web/icon-192.png");
  const r = c.rank;
  const head = c.head ?? T(c, "カオススパム計算機", "Chaos spam calculator");
  const hit = c.uses != null ? fmt(c.uses) : "?";
  const hitTail = T(c, " 回目で付いた！", " uses to hit!");
  const luckLine = r != null ? T(c, `${c.people} 人中 ${rankWord(c, r)} の運`, `${rankWord(c, r)} luck of ${c.people}`) : "";
  const luckWord = r != null ? luck(c, r) : "";
  const stats = [
    c.median != null ? T(c, `半分の人 ${fmt(c.median)} 回`, `Half: ${fmt(c.median)}`) : "",
    c.unlucky != null ? T(c, `運が悪い 10 人に 1 人 ${fmt(c.unlucky)} 回`, `Unluckiest 1 in 10: ${fmt(c.unlucky)}`) : "",
    c.cost ? T(c, `費用 ${c.cost}`, `Cost ${c.cost}`) : "",
  ].filter(Boolean).join(" · ");
  const lucky = r != null && r <= 50;
  const allText = ["ExileDesk", head, c.baseName, c.mods, hit, hitTail, luckLine, luckWord, stats, T(c, "強運", "Lucky"), T(c, "沼", "Unlucky"), "exiledesk.com", "0123456789%·,!?"].join("");
  const top = r != null && r <= 10;
  const kicker = T(c, "かなりの強運", "EXCEPTIONAL LUCK");
  const [bold, regular, antique] = await Promise.all([
    font(allText, 800),
    font(allText, 500),
    // かなりの強運の字は計算機の中と同じ明朝寄りの字 (Zen Antique)
    top ? font(`${kicker}TOP0123456789%`, 0, "Zen+Antique") : Promise.resolve(null),
  ]);
  const cinzel = await font("EXILEDESK", 600, "Cinzel").catch(() => null);
  const markLeft = r != null ? Math.max(0, Math.min(590, Math.round(620 * (r / 100)) - 15)) : 0;
  const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background-image:radial-gradient(ellipse at 78% 45%, #4a3410 0%, #1c140a 38%, #050403 75%);font-family:'Noto Sans JP';color:#efe6d2">
  <div style="display:flex;position:absolute;left:730px;top:80px;width:400px;height:420px;border-radius:210px;background-image:radial-gradient(circle, rgba(255,190,90,0.28) 0%, rgba(255,150,40,0.10) 45%, rgba(0,0,0,0) 70%)"></div>
  ${art ? `<img src="${art}" width="${aw}" height="${ah}" style="position:absolute;left:${ax}px;top:${ay}px" />` : ""}
  ${orb ? `<img src="${orb}" width="96" height="96" style="position:absolute;left:1030px;top:390px" />` : ""}
  <div style="display:flex;position:absolute;right:48px;top:44px;font-size:26px;font-weight:800;color:#f2c96b">exiledesk.com</div>
  ${r != null && r <= 10 ? `<div style="display:flex;position:absolute;left:18px;top:18px;width:1164px;height:594px;border:2px solid rgba(184,115,51,0.75)"></div><div style="display:flex;position:absolute;left:26px;top:26px;width:1148px;height:578px;border:1px solid rgba(184,115,51,0.35)"></div>` : ""}
  <div style="display:flex;flex-direction:column;position:absolute;left:70px;top:36px;width:650px">
    <div style="display:flex;align-items:flex-end">
      ${logo ? `<img src="${logo}" width="54" height="54" style="margin-right:12px;margin-bottom:2px" />` : ""}
      <span style="font-family:${cinzel ? "Cinzel" : "Noto Sans JP"};font-size:44px;font-weight:${cinzel ? 600 : 800};letter-spacing:3px;background-image:linear-gradient(180deg, #fff3cf 0%, #f0cf86 38%, #b8873c 62%, #7a5320 100%);background-clip:text;color:transparent">EXILEDESK</span>
      <span style="font-size:28px;font-weight:500;color:#b9a98a;margin-left:16px;margin-bottom:6px">${esc(head)}</span>
    </div>
    <span style="font-size:30px;font-weight:800;color:#f3e3b5;margin-top:14px">${esc(c.baseName)}</span>
    <span style="font-size:${c.mods.length > 26 ? 24 : 28}px;font-weight:800;color:#8f8fff;margin-top:4px;line-height:1.3">${esc(c.mods)}</span>
    <div style="display:flex;align-items:flex-end;margin-top:12px">
      <span style="font-size:84px;font-weight:800;color:${top ? "#e0a46e" : "#6ee7b7"};line-height:1">${esc(hit)}</span>
      <span style="font-size:42px;font-weight:800;color:${top ? "#f0d2b4" : "#d9f5e8"};margin-left:8px;margin-bottom:6px">${esc(hitTail)}</span>
    </div>
    ${top ? `
    <div style="display:flex;flex-direction:column;align-items:center;width:620px;margin-top:14px;padding:6px 0 4px;background-image:radial-gradient(ellipse at 50% 55%, rgba(150,82,40,0.30), rgba(150,82,40,0) 70%)">
      <div style="display:flex;width:620px;height:2px;background-image:linear-gradient(90deg, rgba(184,115,51,0), rgba(184,115,51,0.95), rgba(184,115,51,0))"></div>
      <span style="font-family:'Zen Antique';font-size:22px;letter-spacing:12px;color:#b87333;margin-top:10px">${esc(kicker)}</span>
      <div style="display:flex;align-items:flex-end;margin-top:2px">
        <span style="font-family:'Zen Antique';font-size:24px;letter-spacing:8px;color:#9c7a62;margin-right:10px;margin-bottom:16px">TOP</span>
        <span style="font-family:'Zen Antique';font-size:96px;line-height:1;color:#e0a46e">${r}</span>
        <span style="font-family:'Zen Antique';font-size:44px;color:#c4814a;margin-left:4px;margin-bottom:10px">%</span>
      </div>
      <div style="display:flex;width:620px;height:2px;margin-top:8px;background-image:linear-gradient(90deg, rgba(184,115,51,0), rgba(184,115,51,0.95), rgba(184,115,51,0))"></div>
    </div>` : r != null ? `
    <div style="display:flex;margin-top:18px;font-size:32px;font-weight:800">
      <span>${esc(luckLine)}</span><span style="margin-left:16px;color:${r <= 10 ? "#d9965f" : lucky ? "#6ee7b7" : "#fda4af"}">${esc(luckWord)}</span>
    </div>
    <div style="display:flex;position:relative;margin-top:16px;width:620px;height:30px">
      <div style="display:flex;position:absolute;left:0;top:7px;width:620px;height:16px;border-radius:8px;background-image:linear-gradient(90deg,#10b981,#f59e0b,#f43f5e)"></div>
      <div style="display:flex;position:absolute;left:${markLeft}px;top:0;width:30px;height:30px;border-radius:15px;background:#14110d;border:4px solid #ffffff"></div>
    </div>
    <div style="display:flex;width:620px;justify-content:space-between;font-size:20px;font-weight:500;color:#a99d86"><span>${esc(T(c, "強運", "Lucky"))}</span><span>${esc(T(c, "沼", "Unlucky"))}</span></div>` : ""}
    <span style="font-size:21px;font-weight:500;color:#cfc3aa;margin-top:12px;white-space:nowrap">${esc(stats)}</span>
  </div>
</div>`;
  // 最後まで読んで、作れなかった時は例外にする (ストリームの途中で失敗すると空の 200 になる)
  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Noto Sans JP", data: bold, weight: 800, style: "normal" },
      { name: "Noto Sans JP", data: regular, weight: 500, style: "normal" },
      ...(antique ? [{ name: "Zen Antique", data: antique, weight: 400, style: "normal" }] : []),
      ...(cinzel ? [{ name: "Cinzel", data: cinzel, weight: 600, style: "normal" }] : []),
    ],
  }).arrayBuffer();
}

/**
 * 短い URL (2026-10-18 オーナー「スマホからシェアの URL 長くて怖い」): 中身の code を D1 (exiledesk-logs の shares) に 1 行置いて /s/<id> に。
 * id は code の SHA-256 から決まる 7 文字 (src/views/craft-stage/use-spam-share.ts の shortIdOf と同じ式)。同じ結果は同じ id なので行は増えない。
 * 画面は押した時に POST /s/new (keepalive) で置いてすぐ X へ。置いた時にカードの絵も作ってキャッシュしておく (X が読みに来た時に待たせない)。KV は使わない
 */
const SHORT = /^[A-Za-z0-9]{7}$/;
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export async function shortIdOf(code) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)));
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(h[i]);
  let out = "";
  for (let i = 0; i < 7; i++) { out += B62[Number(n % 62n)]; n /= 62n; }
  return out;
}
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
const PNG_HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" };
/** 短い id → code (無ければ null)。長い code はそのまま */
async function codeOf(token, env) {
  if (!SHORT.test(token)) return token;
  if (!env.LOGS) return null;
  const row = await env.LOGS.prepare("SELECT code FROM shares WHERE id = ?").bind(token).first();
  return row ? String(row.code) : null;
}
async function renderPng(url, env, code) {
  return new Response(await cardImage(url, env, readCard(await unpack(code))), { headers: PNG_HEADERS });
}

/** /s/<code|id> (と古い形の /s/spam?…)、/og/<code|id>.png (/og/spam.png?…)、POST /s/new だけ受ける。違えば null (呼んだ側が今まで通りに続ける) */
export async function ogCard(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/s/new") {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST" || !env.LOGS) return new Response("no", { status: 405, headers: CORS });
    const code = (await request.text()).trim();
    if (!/^[A-Za-z0-9_-]{8,1500}$/.test(code)) return new Response("bad", { status: 400, headers: CORS });
    try { await unpack(code); } catch { return new Response("bad", { status: 400, headers: CORS }); }
    const id = await shortIdOf(code);
    await env.LOGS.prepare("INSERT OR IGNORE INTO shares (id, code, at) VALUES (?, ?, ?)").bind(id, code, Date.now()).run();
    // カードの絵を先に作ってキャッシュ (X が読みに来た時にすぐ出す)
    const picUrl = new URL(`/og/${id}.png`, url.origin);
    ctx?.waitUntil?.((async () => {
      const key = new Request(picUrl.toString(), { method: "GET" });
      if (await caches.default.match(key)) return;
      try { await caches.default.put(key, await renderPng(picUrl, env, code)); } catch { /* 読みに来た時に作る */ }
    })());
    return new Response(JSON.stringify({ id }), { headers: { "content-type": "application/json", ...CORS } });
  }
  const page = /^\/s\/([A-Za-z0-9_-]{7,1500})$/.exec(url.pathname);
  const pic = /^\/og\/([A-Za-z0-9_-]{7,1500})\.png$/.exec(url.pathname);
  if (url.pathname === "/s/spam") return sharePage(url, readCard((k) => url.searchParams.get(k)), `${url.origin}/og/spam.png${url.search}`);
  if (page) {
    let get, code;
    try { code = await codeOf(page[1], env); if (!code) throw new Error("none"); get = await unpack(code); } catch { return Response.redirect(`${url.origin}/`, 302); }
    return sharePage(url, readCard(get), `${url.origin}/og/${page[1]}.png`, code);
  }
  if (url.pathname !== "/og/spam.png" && !pic) return null;
  const cache = caches.default;
  const key = new Request(url.toString(), { method: "GET" });
  const hit = await cache.match(key);
  if (hit) return hit;
  let res;
  try {
    const code = pic ? await codeOf(pic[1], env) : null;
    if (pic && !code) throw new Error("none");
    res = code ? await renderPng(url, env, code) : new Response(await cardImage(url, env, readCard((k) => url.searchParams.get(k))), { headers: PNG_HEADERS });
  } catch {
    // 作れなかった時はサイトの共通の絵 (キャッシュしない)
    return env.ASSETS.fetch(new Request(new URL("/web/og.png", url.origin)));
  }
  ctx?.waitUntil?.(cache.put(key, res.clone()));
  return res;
}
