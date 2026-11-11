// デイリークラフトチャレンジの結果の X のカード (設計図 daily.md D-38、2026-11-11 オーナー「デイリー挑戦終わった画面でシェアできるようにしたいな流石に」)。
// 置き場・短い id・キャッシュは og-card.js の運試しのカードと同じ (/s/<id>・/og/<id>.png・POST /s/new)。中身の並び PACK の kd = "daily" の時だけここで作る。
// 見た目はオーナー 11-11 の選び (案 D-3「３で真ん中かな」「見た目おｋ」): 経緯は設計図 D-38
// 中身: l=ja|en, b=ベースの英語名, bn=ベースの表示名, a=ベースの絵のファイル名, c=完成 1 個あたりの費用 (完成 0 は —),
//       dy=お題の id (d2026-11-11), rt=完成率, pl=その時の順位 (完成 0 は無し), pe=挑戦した人数, sk=シェアした人の皮 (D-60 の id)。木 (レシピ) は入れない
import { ImageResponse } from "workers-og";
import { dataUrl, esc, font, pngSize } from "./og-card.js";
// 皮の数字 (src/views/daily/skin/skin.ts の SKINS の写し。scripts/build-og-skin-art.py がカードの飾りの絵と一緒に書く)
import SKINS from "./daily-skins.json";

/** hsl → rgba() (satori が読める形に) */
function hsl(h, s, l, a = 1) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, m = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - m * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `rgba(${f(0)},${f(8)},${f(4)},${a})`;
}
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
    skin: Object.hasOwn(SKINS, get("sk") ?? "") ? get("sk") : null,
  };
}

const T = (c, ja, en) => (c.en ? en : ja);
const dayText = (c) => (c.day ? `${Number(c.day.slice(6, 8))}/${Number(c.day.slice(9, 11))}` : "");
const rankText = (c) => (c.place ? T(c, `${c.place} 位 / ${c.entered} 人`, `#${c.place} of ${c.entered}`) : c.rate === 0 ? T(c, "順位なし (完成 0)", "Unranked (nothing finished)") : T(c, "順位なし", "Unranked"));
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

const COPPER_TEXT = "background-image:linear-gradient(180deg, #ffe2c4 0%, #e0a46e 45%, #a8612e 75%, #6e3a17 100%);background-clip:text;color:transparent";

/** 字の幅の見積もり (字の大きさ 1 の時)。漢字・かな・全角は 1、数字・英字は 0.6 前後 (Zen Antique・Noto Sans JP の実測に近い値) */
function textW(s) {
  let w = 0;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    w += cp >= 0x2e80 || ch === "—" ? 1 : /[0-9]/.test(ch) ? 0.6 : /[A-Z#%]/.test(ch) ? 0.7 : /[a-z]/.test(ch) ? 0.55 : /[ .,/()]/.test(ch) ? 0.32 : 0.6;
  }
  return Math.max(w, 0.5);
}

/** カードの絵 (1200×630)。PoE2 の UI の質感: 地は石、外は面の枠、費用・完成率は像の付いた見出しの上、区切りはゲームの線、字は Zen Antique。
 * 1 位は順位の字だけ銅色。X は下に題を重ねるが、大事な字は 560px より上 */
export async function dailyCardImage(url, env, c) {
  const k = c.skin ? SKINS[c.skin] : null;
  const size = c.art ? await pngSize(env, url, `/og-art/${c.art}.png`) : null;
  const [art, logo, plaque, slotFrame, cardFrame, headL, headR, divider, stone] = await Promise.all([
    c.art ? dataUrl(env, url, `/og-art/${c.art}.png`) : null,
    dataUrl(env, url, "/web/icon-192.png"),
    dataUrl(env, url, "/og-art/_ui-title-c.png"),
    dataUrl(env, url, "/og-art/_ui-frame-s.png"),
    dataUrl(env, url, "/og-art/_ui-card-frame.png"),
    dataUrl(env, url, "/og-art/_ui-head-l.png"),
    dataUrl(env, url, "/og-art/_ui-head-r.png"),
    dataUrl(env, url, "/og-art/_ui-divider.png"),
    dataUrl(env, url, "/og-art/_ui-stone.jpg"),
  ]);
  const day = dayText(c);
  const head = T(c, "デイリークラフトチャレンジ", "Daily Craft Challenge");
  const plate = T(c, `${day} のお題`, `Challenge ${day}`);
  const placeBig = c.place ? T(c, String(c.place), `#${c.place}`) : T(c, "順位なし", "Unranked");
  const placeUnit = c.place ? T(c, "位", "") : "";
  // 順位なしで「(完成 0)」と書くのは完成率 0% の時だけ (完成があっても、その時の順位の表に自分の行が無いと順位なしで来る)
  const placeTail = c.place ? T(c, `/ ${c.entered} 人`, `of ${c.entered}`) : c.rate === 0 ? T(c, "(完成 0)", "(nothing finished)") : "";
  const costLabel = T(c, "完成 1 個あたり", "Cost per item"), rateLabel = T(c, "完成率", "Finished");
  const antiqueText = [c.baseName, placeBig, placeUnit, plate, c.cost, `${c.rate}%`, "0123456789#/%.—"].join("");
  const plainText = ["ExileDesk", head, placeTail, costLabel, rateLabel, "exiledesk.com0123456789/"].join("");
  const [antique, bold, regular] = await Promise.all([font(antiqueText, 0, "Zen+Antique"), font(plainText, 800), font(plainText, 500)]);
  const cinzel = await font("EXILEDESK", 600, "Cinzel").catch(() => null);
  const top = c.place === 1;
  const gold = "background-image:linear-gradient(180deg, #fff3cf 0%, #f0cf86 38%, #b8873c 62%, #7a5320 100%);background-clip:text;color:transparent";
  const rankStyle = top ? COPPER_TEXT : c.place ? gold : "color:#a99d86";
  const glow = "rgba(255,180,80,0.16)";
  // シェアした人の皮 (D-60) の色で石を暗く渋く染める。皮の無いシェアは真鍮だけ
  const dye = k
    ? `<div style="display:flex;position:absolute;left:0;top:0;width:1200px;height:630px;background-image:radial-gradient(ellipse at 50% 45%, ${hsl(k.h, k.s * 1.4, 22, 0.42)} 0%, ${hsl(k.h, k.s, 10, 0.35)} 60%, rgba(0,0,0,0.2) 100%)"></div>`
    : "";
  // 品の絵は小さな枠 (124) の中で 96 まで。元の大きさ (og-art の 128px) より大きくしない (11-11 オーナー「画質荒くなるからちっさくとか目立たん位がいいかもな」)
  const ak = size ? Math.min(1, 96 / size.w, 96 / size.h) : 1;
  const aw = size ? Math.round(size.w * ak) : 96, ah = size ? Math.round(size.h * ak) : 96;
  const value = "font-family:'Zen Antique';color:#f2d38a";
  // 下の 2 枚の札: 字は札の内枠 (像を除いた中の暗い所。左 = 札の中の横 95〜520、右 = 30〜455、縦 16〜68) の真ん中。
  // はみ出る時は字を小さくして収める (11-11 オーナー「３で真ん中かな枠の内枠を基準に中央寄せではみ出るならフォント小さくして表示させようか」)
  const inner = 400, gap = 12;
  const lw = Math.ceil(textW(costLabel) * 20), rw = Math.ceil(textW(rateLabel) * 20);
  const vpx = (label, v) => Math.max(18, Math.min(46, Math.floor((inner - label - gap) / textW(v))));
  const costPx = vpx(lw, c.cost), ratePx = vpx(rw, `${c.rate}%`);
  const namePx = Math.max(22, Math.min(40, Math.floor(430 / textW(c.baseName))));
  const tailPx = 46, rankPx = c.place ? 196 : 104, unitPx = placeUnit ? 84 : 0;
  const rankW = textW(placeBig) * rankPx + textW(placeUnit) * unitPx + textW(placeTail) * tailPx + 30;
  const rankK = Math.min(1, 1040 / rankW);
  const card = (x, label, v, px) => `
  <div style="display:flex;align-items:center;justify-content:center;position:absolute;left:${x}px;top:456px;width:${inner + 25}px;height:52px">
    <span style="font-size:20px;font-weight:500;color:#b9a98a;margin-right:${gap}px">${esc(label)}</span>
    <span style="${value};font-size:${px}px;line-height:1">${esc(v)}</span>
  </div>`;
  const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background:#0c0a08;font-family:'Noto Sans JP';color:#efe6d2">
  ${stone ? `<img src="${stone}" width="1200" height="630" style="position:absolute;left:0;top:0" />` : ""}
  ${dye}
  <div style="display:flex;position:absolute;left:250px;top:170px;width:700px;height:250px;border-radius:350px;background-image:radial-gradient(ellipse, ${glow} 0%, rgba(0,0,0,0) 70%)"></div>
  ${slotFrame ? `<img src="${slotFrame}" width="124" height="124" style="position:absolute;left:58px;top:44px" />` : ""}
  ${art ? `<img src="${art}" width="${aw}" height="${ah}" style="position:absolute;left:${120 - aw / 2}px;top:${106 - ah / 2}px" />` : ""}
  <div style="display:flex;flex-direction:column;position:absolute;left:200px;top:46px;width:440px">
    <div style="display:flex;align-items:flex-end">
      ${logo ? `<img src="${logo}" width="30" height="30" style="margin-right:8px" />` : ""}
      <span style="font-family:${cinzel ? "Cinzel" : "Noto Sans JP"};font-size:24px;font-weight:600;letter-spacing:3px;${gold}">EXILEDESK</span>
    </div>
    <span style="font-family:'Zen Antique';font-size:${namePx}px;white-space:nowrap;color:#f3e3b5;line-height:1.25;margin-top:4px">${esc(c.baseName)}</span>
    <span style="font-size:19px;font-weight:500;color:#a99d86">${esc(head)}</span>
  </div>
  ${plaque ? `<img src="${plaque}" width="520" height="129" style="position:absolute;left:636px;top:34px" />` : ""}
  <div style="display:flex;position:absolute;left:776px;top:108px;width:240px;height:38px;align-items:center;justify-content:center;font-family:'Zen Antique';font-size:24px;color:#2b1a06">${esc(plate)}</div>
  ${divider ? `<img src="${divider}" width="748" height="4" style="position:absolute;left:226px;top:184px" />` : ""}
  <div style="display:flex;align-items:flex-end;justify-content:center;position:absolute;left:0;top:192px;width:1200px;height:212px;padding-bottom:${c.place ? 0 : 22}px">
    <span style="font-family:'Zen Antique';font-size:${Math.floor(rankPx * rankK)}px;line-height:1;${rankStyle}">${esc(placeBig)}</span>
    ${placeUnit ? `<span style="font-family:'Zen Antique';font-size:${Math.floor(unitPx * rankK)}px;margin-left:6px;margin-bottom:${Math.round(14 * rankK)}px;${rankStyle}">${esc(placeUnit)}</span>` : ""}
    ${placeTail ? `<span style="font-size:${Math.floor(tailPx * rankK)}px;font-weight:800;color:#cfc3aa;margin-left:18px;margin-bottom:${Math.round(24 * rankK)}px">${esc(placeTail)}</span>` : ""}
  </div>
  ${divider ? `<img src="${divider}" width="748" height="4" style="position:absolute;left:226px;top:410px" />` : ""}
  ${headL ? `<img src="${headL}" width="545" height="118" style="position:absolute;left:52px;top:440px" />` : ""}
  ${headR ? `<img src="${headR}" width="549" height="118" style="position:absolute;left:599px;top:440px" />` : ""}
  ${card(52 + 95, costLabel, c.cost, costPx)}
  ${card(599 + 30, rateLabel, `${c.rate}%`, ratePx)}
  ${cardFrame ? `<img src="${cardFrame}" width="1200" height="630" style="position:absolute;left:0;top:0" />` : ""}
</div>`;
  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Noto Sans JP", data: bold, weight: 800, style: "normal" },
      { name: "Noto Sans JP", data: regular, weight: 500, style: "normal" },
      { name: "Zen Antique", data: antique, weight: 400, style: "normal" },
      ...(cinzel ? [{ name: "Cinzel", data: cinzel, weight: 600, style: "normal" }] : []),
    ],
  }).arrayBuffer();
}
