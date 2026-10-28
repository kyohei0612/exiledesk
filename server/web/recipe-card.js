// シミュのレシピのシェアのカード絵 (2026-10-28 オーナー「レシピのシェア時のカードもみたいなXに流す用のちっさい画像」「レシピ用に魔改造して欲しいなそのカード絵」、設計図 Y-35)。
//   GET /og/r/<id>.png (card の無い行) / /og/r/<id>-c.png (card のある行) … 1200×630。作り方はスパムの運試しのカード (og-card.js) と同じ workers-og
// 形はゲームのアイテムの説明: レアの見出し (public/og-art/_ui-ihead-rare-*.png = ui-art/ihead-rare を切った物) にレシピの名前とベース → 完成形の MOD → 右にベースの絵 → 下に完成の割合・平均の費用・手の数。
// 割合・費用はサーバーで回さない (Y-01): シェアを押した時に画面が POST /r/new に一緒に送った card (recipe-share.js) を D1 の recipe_shares.card から読む。card の無い古い行は名前とベースだけ
import { ImageResponse } from "workers-og";
import { dataUrl, esc, font, pngSize } from "./og-card.js";

const MAX_MODS = 8, SHOW_MODS = 6;
const num = (v, max) => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const str = (v, n) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);

/** 画面から来た card を読める形だけにする (変な値は捨てる)。何も残らなければ null。D1 にはこの結果の JSON を置く */
export function cleanCard(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = {};
  if (raw.l === "en" || raw.l === "ja") c.l = raw.l;
  const bn = str(raw.bn, 40); if (bn) c.bn = bn;
  if (typeof raw.a === "string" && /^[A-Za-z0-9_]{1,80}$/.test(raw.a)) c.a = raw.a;
  if (Array.isArray(raw.m)) {
    const m = raw.m.slice(0, MAX_MODS).map((x) => (Array.isArray(x) ? [str(x[0], 80), x[1] === 1 ? 1 : 0] : [str(x, 80), 0])).filter((x) => x[0]);
    if (m.length) c.m = m;
  }
  const p = num(raw.p, 100); if (p != null) c.p = Math.round(p * 10) / 10;
  const n = num(raw.n, 100000); if (n != null && n >= 1) c.n = Math.round(n);
  const cost = num(raw.c, 1e7); if (cost != null) c.c = Math.round(cost * 100) / 100;
  if (typeof raw.o === "string" && /^https:\/\/web\.poecdn\.com\/[^"'<>\s]{1,400}$/.test(raw.o)) c.o = raw.o;
  const s = num(raw.s, 10000); if (s != null) c.s = Math.round(s);
  return Object.keys(c).length ? c : null;
}

/** D1 の行 → カードの中身。card は cleanCard を通した JSON (無ければ null)、baseEn は code の中の木のベースの英語名 */
export function readRecipeCard(name, card, baseEn) {
  const c = card ?? {};
  return {
    en: c.l === "en",
    name: name || null,
    baseName: c.bn ?? baseEn ?? null,
    art: c.a ?? null,
    mods: c.m ?? [],
    pct: c.p ?? null,
    people: c.n ?? 100,
    cost: c.c ?? null,
    orb: c.o ?? null,
    hands: c.s ?? null,
  };
}

const T = (c, ja, en) => (c.en ? en : ja);
const fmtPct = (p) => (p > 0 && p < 1 ? p.toFixed(1) : String(Math.round(p)));
const fmtCost = (v) => (v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toLocaleString("en-US"));

/** og:title・og:description の文 */
export function recipeTitle(c) {
  return c.name ? T(c, `${c.name} | ExileDesk クラフトレシピ`, `${c.name} | ExileDesk craft recipe`) : T(c, "ExileDesk クラフトレシピ", "ExileDesk craft recipe");
}
export function recipeDesc(c) {
  const parts = [];
  if (c.baseName) parts.push(c.baseName);
  if (c.pct != null) parts.push(T(c, `${c.people} 人で完成 ${fmtPct(c.pct)}%`, `${fmtPct(c.pct)}% of ${c.people} finish`));
  if (c.cost != null) parts.push(T(c, `平均 ${fmtCost(c.cost)} 神`, `avg ${fmtCost(c.cost)} div`));
  if (c.hands != null) parts.push(T(c, `手の数 ${c.hands}`, `${c.hands} steps`));
  parts.push(T(c, "PoE2 のクラフトの道 (シミュレーター) のレシピ。開くとそのまま回せます。", "A PoE2 crafting route (simulator) recipe. Open it and run it as is."));
  return parts.join(" · ");
}

/** カードの絵 (PNG のバイト列)。X は大きいカードの下に題を重ねるので、字は 540px より上 */
export async function recipeCardImage(url, env, c) {
  const art = c.art ? await dataUrl(env, url, `/og-art/${c.art}.png`) : null;
  const size = c.art ? await pngSize(env, url, `/og-art/${c.art}.png`) : null;
  const k = size ? Math.min(2.4, 340 / size.w, 400 / size.h) : 1;
  const aw = size ? Math.round(size.w * k) : 300, ah = size ? Math.round(size.h * k) : 300;
  const ax = 960 - aw / 2, ay = 300 - ah / 2;
  const [logo, hl, hm, hr, sep, orb] = await Promise.all([
    dataUrl(env, url, "/web/icon-192.png"),
    dataUrl(env, url, "/og-art/_ui-ihead-rare-l.png"),
    dataUrl(env, url, "/og-art/_ui-ihead-rare-m.png"),
    dataUrl(env, url, "/og-art/_ui-ihead-rare-r.png"),
    dataUrl(env, url, "/og-art/_ui-isep-rare.png"),
    c.orb ? dataUrl(env, c.orb) : Promise.resolve(null),
  ]);
  const kicker = T(c, "クラフトレシピ", "Craft recipe");
  const title = c.name ?? T(c, "クラフトレシピ", "Craft recipe");
  const mods = c.mods.slice(0, SHOW_MODS);
  const more = c.mods.length - mods.length;
  const moreText = more > 0 ? T(c, `ほか ${more} 個`, `+${more} more`) : "";
  const stats = [
    c.pct != null ? { v: `${fmtPct(c.pct)}%`, l: T(c, `${c.people} 人で完成`, `of ${c.people} finish`), color: "#6ee7b7" } : null,
    c.cost != null ? { v: fmtCost(c.cost), unit: orb ? "" : T(c, "神", "div"), l: T(c, "平均の費用", "avg cost"), color: "#f2c96b", orb: true } : null,
    c.hands != null ? { v: String(c.hands), l: T(c, "手の数", "steps"), color: "#efe6d2" } : null,
  ].filter(Boolean);
  const noStats = T(c, "シミュレーターで開くと、そのまま 100 人回せます", "Open in the simulator and run 100 crafters as is");
  const W = 660, CAP = 78, H = 88;
  // 見出しの中 (幅 W - CAP * 2 - 40) に 1 行で収める大きさ (全角 1・半角 0.55 で数える)
  const units = (t) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 0xff ? 1 : 0.55), 0);
  const fit = (t, max, min) => Math.max(min, Math.min(max, Math.floor((W - CAP * 2 - 40) / Math.max(1, units(t)))));
  const nameSize = fit(title, c.baseName ? 30 : 34, 17);
  const baseSize = c.baseName ? fit(c.baseName, 21, 15) : 0;
  const modSize = mods.some((m) => m[0].length > 34) ? 20 : 23;
  const allText = ["ExileDesk", kicker, title, c.baseName ?? "", ...mods.map((m) => m[0]), moreText, ...stats.flatMap((s) => [s.v, s.unit ?? "", s.l]), noStats, "exiledesk.com", "0123456789%.,"].join("");
  const [bold, regular, antique, cinzel] = await Promise.all([
    font(allText, 800),
    font(allText, 500),
    font(`${title}${c.baseName ?? ""}`, 0, "Zen+Antique").catch(() => null),
    font("EXILEDESK", 600, "Cinzel").catch(() => null),
  ]);
  const nameFont = antique ? "Zen Antique" : "Noto Sans JP";
  const modRow = (m) => m[1]
    ? `<div style="display:flex;align-items:center;justify-content:center;margin-top:6px"><div style="display:flex;width:11px;height:11px;margin-right:10px;background:#c8a86a;transform:rotate(45deg)"></div><span style="font-size:${modSize}px;font-weight:500;color:#c8a86a">${esc(m[0])}</span></div>`
    : `<div style="display:flex;justify-content:center;margin-top:6px"><span style="font-size:${modSize}px;font-weight:500;color:#8888ff">${esc(m[0])}</span></div>`;
  const statBlock = (s) => `
      <div style="display:flex;flex-direction:column;align-items:flex-start;margin-right:44px">
        <div style="display:flex;align-items:center">
          <span style="font-size:52px;font-weight:800;line-height:1;color:${s.color}">${esc(s.v)}</span>
          ${s.orb && orb ? `<img src="${orb}" width="46" height="46" style="margin-left:6px" />` : ""}
          ${s.unit ? `<span style="font-size:28px;font-weight:800;color:${s.color};margin-left:6px">${esc(s.unit)}</span>` : ""}
        </div>
        <span style="font-size:20px;font-weight:500;color:#b9a98a;margin-top:6px">${esc(s.l)}</span>
      </div>`;
  const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background-image:radial-gradient(ellipse at 80% 48%, #3f2c10 0%, #1a1309 40%, #050403 76%);font-family:'Noto Sans JP';color:#efe6d2">
  <div style="display:flex;position:absolute;left:770px;top:100px;width:380px;height:400px;border-radius:200px;background-image:radial-gradient(circle, rgba(255,190,90,0.26) 0%, rgba(255,150,40,0.09) 45%, rgba(0,0,0,0) 70%)"></div>
  ${art ? `<img src="${art}" width="${aw}" height="${ah}" style="position:absolute;left:${ax}px;top:${ay}px" />` : ""}
  <div style="display:flex;position:absolute;right:48px;top:44px;font-size:26px;font-weight:800;color:#f2c96b">exiledesk.com</div>
  <div style="display:flex;position:absolute;left:60px;top:32px;align-items:flex-end">
    ${logo ? `<img src="${logo}" width="50" height="50" style="margin-right:12px;margin-bottom:2px" />` : ""}
    <span style="font-family:${cinzel ? "Cinzel" : "Noto Sans JP"};font-size:40px;font-weight:${cinzel ? 600 : 800};letter-spacing:3px;background-image:linear-gradient(180deg, #fff3cf 0%, #f0cf86 38%, #b8873c 62%, #7a5320 100%);background-clip:text;color:transparent">EXILEDESK</span>
    <span style="font-size:26px;font-weight:500;color:#b9a98a;margin-left:16px;margin-bottom:5px">${esc(kicker)}</span>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:60px;top:108px;width:${W}px">
    <div style="display:flex;position:relative;width:${W}px;height:${H}px">
      ${hl ? `<img src="${hl}" width="${CAP}" height="${H}" style="position:absolute;left:0;top:0" />` : ""}
      ${hm ? `<img src="${hm}" width="${W - CAP * 2}" height="${H}" style="position:absolute;left:${CAP}px;top:0" />` : ""}
      ${hr ? `<img src="${hr}" width="${CAP}" height="${H}" style="position:absolute;left:${W - CAP}px;top:0" />` : ""}
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;position:absolute;left:${CAP}px;top:0;width:${W - CAP * 2}px;height:${H - 6}px">
        <span style="font-family:'${nameFont}';font-size:${nameSize}px;line-height:1.15;color:#e8d77a;white-space:nowrap">${esc(title)}</span>
        ${c.baseName ? `<span style="font-family:'${nameFont}';font-size:${baseSize}px;line-height:1.2;color:#e8d77a;white-space:nowrap">${esc(c.baseName)}</span>` : ""}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;width:${W}px;padding:10px 0 16px;background:rgba(6,5,4,0.86)">
      ${mods.map(modRow).join("")}
      ${moreText ? `<span style="font-size:19px;font-weight:500;color:#8f8775;margin-top:6px">${esc(moreText)}</span>` : ""}
      ${sep ? `<img src="${sep}" width="${W - 60}" height="16" style="margin-top:${mods.length ? 12 : 4}px" />` : ""}
      ${stats.length ? "" : `<span style="font-size:22px;font-weight:500;color:#cfc3aa;margin-top:10px">${esc(noStats)}</span>`}
    </div>
    ${stats.length ? `<div style="display:flex;margin-top:22px;padding-left:6px">${stats.map(statBlock).join("")}</div>` : ""}
  </div>
</div>`;
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
