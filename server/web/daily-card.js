// デイリークラフトチャレンジの結果の X のカード (設計図 daily.md D-38、2026-11-11 オーナー「デイリー挑戦終わった画面でシェアできるようにしたいな流石に」)。
// 置き場・短い id・キャッシュは og-card.js の運試しのカードと同じ (/s/<id>・/og/<id>.png・POST /s/new)。中身の並び PACK の kd = "daily" の時だけここで作る。
// 中身: l=ja|en, b=ベースの英語名, bn=ベースの表示名, a=ベースの絵のファイル名, c=完成 1 個あたりの費用 (完成 0 は —),
//       dy=お題の id (d2026-11-11), rt=完成率, pl=その時の順位 (完成 0 は無し), pe=挑戦した人数。木 (レシピ) は入れない
import { ImageResponse } from "workers-og";
import { dataUrl, esc, font, pngSize } from "./og-card.js";

const num = (v, max = 1e6) => { if (v == null || v === "") return null; const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };

/** 中身を読む (変な値は捨てる) */
export function readDaily(get) {
  const day = /^d\d{4}-\d\d-\d\d$/.test(get("dy") ?? "") ? get("dy") : null;
  return {
    en: get("l") === "en",
    base: String(get("b") ?? "").slice(0, 60),
    baseName: String(get("bn") || get("b") || "").slice(0, 40),
    art: /^[A-Za-z0-9_]{1,80}$/.test(get("a") ?? "") ? get("a") : null,
    cost: String(get("c") ?? "—").slice(0, 20),
    day,
    rate: num(get("rt"), 100) ?? 0,
    place: num(get("pl"), 100000) || null,
    entered: num(get("pe"), 100000) ?? 0,
  };
}

const T = (c, ja, en) => (c.en ? en : ja);
const dayText = (c) => (c.day ? `${Number(c.day.slice(6, 8))}/${Number(c.day.slice(9, 11))}` : "");
const rankText = (c) => (c.place ? T(c, `${c.place} 位 / ${c.entered} 人`, `#${c.place} of ${c.entered}`) : T(c, "順位なし (完成 0)", "Unranked (nothing finished)"));
const titleOf = (c) => T(c, `デイリークラフトチャレンジ ${dayText(c)} 「${c.baseName}」 ${rankText(c)}`, `Daily Craft Challenge ${dayText(c)} "${c.baseName}" ${rankText(c)}`);
const descOf = (c) => T(c, `完成 1 個あたり ${c.cost}・完成率 ${c.rate}% — ExileDesk のデイリー (毎日 16:00 に替わるお題を 1 時間で組む)`, `${c.cost} per finished item, ${c.rate}% finished — ExileDesk Daily (a new challenge every day at 16:00 JST, 1 hour to build)`);

/** X などが読むページ。人は JS でその日のお題のページへ (オーナー 11-11「そーやね」) */
export function dailySharePage(url, c, img) {
  const to = `/?page=daily${c.day ? `&q=${c.day}` : ""}&via=share`;
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

/** カードの絵 (1200×630)。運試しのカードと同じ地・ロゴ・右の品の絵。X は下 80px に題を重ねるので字は 500px より上。1 位は銅色の枠 */
export async function dailyCardImage(url, env, c) {
  const art = c.art ? await dataUrl(env, url, `/og-art/${c.art}.png`) : null;
  const size = c.art ? await pngSize(env, url, `/og-art/${c.art}.png`) : null;
  const k = size ? Math.min(2.4, 380 / size.w, 440 / size.h) : 1;
  const aw = size ? Math.round(size.w * k) : 300, ah = size ? Math.round(size.h * k) : 300;
  const ax = 930 - aw / 2, ay = 290 - ah / 2;
  const logo = await dataUrl(env, url, "/web/icon-192.png");
  const head = T(c, "デイリークラフトチャレンジ", "Daily Craft Challenge");
  const date = c.day ? T(c, `${dayText(c)} のお題`, dayText(c)) : "";
  const placeBig = c.place ? T(c, String(c.place), `#${c.place}`) : T(c, "順位なし", "Unranked");
  const placeUnit = c.place ? T(c, "位", "") : "";
  const placeTail = c.place ? T(c, `/ ${c.entered} 人`, `of ${c.entered}`) : T(c, "(完成 0)", "(nothing finished)");
  const costLabel = T(c, "完成 1 個あたりの費用", "Cost per finished item"), rateLabel = T(c, "完成率", "Finished");
  const allText = ["ExileDesk", head, date, c.baseName, placeBig, placeUnit, placeTail, costLabel, rateLabel, c.cost, `${c.rate}%`, "#exiledesk.com0123456789/—"].join("");
  const [bold, regular] = await Promise.all([font(allText, 800), font(allText, 500)]);
  const cinzel = await font("EXILEDESK", 600, "Cinzel").catch(() => null);
  const top = c.place === 1;
  const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background-image:radial-gradient(ellipse at 78% 45%, #4a3410 0%, #1c140a 38%, #050403 75%);font-family:'Noto Sans JP';color:#efe6d2">
  <div style="display:flex;position:absolute;left:730px;top:80px;width:400px;height:420px;border-radius:210px;background-image:radial-gradient(circle, rgba(255,190,90,0.28) 0%, rgba(255,150,40,0.10) 45%, rgba(0,0,0,0) 70%)"></div>
  ${art ? `<img src="${art}" width="${aw}" height="${ah}" style="position:absolute;left:${ax}px;top:${ay}px" />` : ""}
  <div style="display:flex;position:absolute;right:48px;top:44px;font-size:26px;font-weight:800;color:#f2c96b">exiledesk.com</div>
  ${top ? `<div style="display:flex;position:absolute;left:18px;top:18px;width:1164px;height:594px;border:2px solid rgba(184,115,51,0.75)"></div>` : ""}
  <div style="display:flex;flex-direction:column;position:absolute;left:70px;top:36px;width:660px">
    <div style="display:flex;align-items:flex-end">
      ${logo ? `<img src="${logo}" width="54" height="54" style="margin-right:12px;margin-bottom:2px" />` : ""}
      <span style="font-family:${cinzel ? "Cinzel" : "Noto Sans JP"};font-size:44px;font-weight:${cinzel ? 600 : 800};letter-spacing:3px;background-image:linear-gradient(180deg, #fff3cf 0%, #f0cf86 38%, #b8873c 62%, #7a5320 100%);background-clip:text;color:transparent">EXILEDESK</span>
    </div>
    <div style="display:flex;font-size:24px;font-weight:500;color:#b9a98a;margin-top:16px;white-space:nowrap"><span>${esc(head)}</span>${date ? `<span style="margin-left:18px">${esc(date)}</span>` : ""}</div>
    <span style="font-size:${c.baseName.length > 16 ? 34 : 40}px;font-weight:800;color:#f3e3b5;margin-top:2px">${esc(c.baseName)}</span>
    <div style="display:flex;align-items:flex-end;margin-top:14px">
      <span style="font-size:${c.place ? 96 : 64}px;font-weight:800;color:${top ? "#e0a46e" : c.place ? "#6ee7b7" : "#a99d86"};line-height:1">${esc(placeBig)}</span>
      ${placeUnit ? `<span style="font-size:44px;font-weight:800;color:#d9f5e8;margin-left:6px;margin-bottom:8px">${esc(placeUnit)}</span>` : ""}
      <span style="font-size:32px;font-weight:800;color:#cfc3aa;margin-left:14px;margin-bottom:12px">${esc(placeTail)}</span>
    </div>
    <div style="display:flex;margin-top:22px">
      <div style="display:flex;flex-direction:column;margin-right:48px">
        <span style="font-size:20px;font-weight:500;color:#a99d86">${esc(costLabel)}</span>
        <span style="font-size:40px;font-weight:800;color:#f2c96b">${esc(c.cost)}</span>
      </div>
      <div style="display:flex;flex-direction:column">
        <span style="font-size:20px;font-weight:500;color:#a99d86">${esc(rateLabel)}</span>
        <span style="font-size:40px;font-weight:800;color:#f2c96b">${c.rate}%</span>
      </div>
    </div>
  </div>
</div>`;
  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Noto Sans JP", data: bold, weight: 800, style: "normal" },
      { name: "Noto Sans JP", data: regular, weight: 500, style: "normal" },
      ...(cinzel ? [{ name: "Cinzel", data: cinzel, weight: 600, style: "normal" }] : []),
    ],
  }).arrayBuffer();
}
