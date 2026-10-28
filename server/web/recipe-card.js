// シミュのレシピのシェアのカード絵 (2026-10-28 オーナー「レシピのシェア時のカードもみたいなXに流す用のちっさい画像」「レシピ用に魔改造して欲しいなそのカード絵」、設計図 Y-35)。
//   GET /og/r/<id>.png (card の無い行) / /og/r/<id>-c.png (card のある行) … 1200×630。作り方はスパムの運試しのカード (og-card.js) と同じ workers-og
// そのレシピだけの絵に (10-28 オーナー「人によってレシピの内容変わるからさ　特別感出して欲しいんだよな」): ① レシピの名前を大きな題に ② 完成品をゲームのアイテムの札 (レアの見出し =
// public/og-art/_ui-ihead-rare-*.png、MOD の行、フラクチャーはその色と印) で ③ 右の額にそのレシピの木の形を影絵で敷き (code の中の箱と線、木ごとに違う)、ベースの絵を重ねる
// ④ 完成の割合が高いほど額を豪華に (90% 以上 = 金の二重枠・角の飾り・強い光、50〜89% = 金の二重枠、それ未満 = 細い枠)。左 (題・絵・札) を大きく右の額は細く。PC・スマホ共通の 1 枚なので、縮んでも題・割合が潰れない大きさ (10-28 オーナー「PCでもスマホでもここは多分絵は固定」)。
// 割合・費用はサーバーで回さない (Y-01): シェアを押した時に画面が POST /r/new に一緒に送った card (recipe-share.js) を D1 の recipe_shares.card から読む。card の無い古い行は名前とベースだけ
import { ImageResponse } from "workers-og";
import { dataUrl, esc, font, pngSize } from "./og-card.js";

const MAX_MODS = 8, SHOW_MODS = 4;
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
  // s (手の数) は 10-28 に絵から外した (オーナー「手は意味わかんないから無くしていい」)。送られても捨てる
  return Object.keys(c).length ? c : null;
}


/** 木 (code の中の TreeDoc) → 影絵に使う箱と線だけ。80 箱まで */
export function treeShape(tree) {
  const all = tree && typeof tree.boxes === "object" ? Object.values(tree.boxes) : [];
  const boxes = all.filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y)).slice(0, 80).map((b) => ({ id: String(b.id), x: b.x, y: b.y, out: String(b.out ?? "") }));
  const ids = new Set(boxes.map((b) => b.id));
  const edges = [];
  for (const b of all) {
    if (!b || !ids.has(String(b.id))) continue;
    const kids = [...(Array.isArray(b.outs) ? b.outs : []), ...(Array.isArray(b.split) ? b.split.map((r) => r?.to) : [])];
    for (const k of kids) if (ids.has(String(k))) edges.push([String(b.id), String(k)]);
  }
  return { boxes, edges };
}

/**
 * 題に出すレシピの名前 (10-28 オーナー「あと、時間日付は不要ね」)。保存の既定の名前「<ベース> 10/27 16:15」(tree-save.ts の autoName) の日付・時刻を消し、
 * 頭がベースの名前で後ろに人の付けた言葉があれば言葉の部分だけ。何も残らなければベースの名前
 */
export function titleOf(name, bases) {
  // 時刻の付いた日付はどこでも消す。時刻の無い日付 (人が時刻だけ消した物) はベースの名前のすぐ後ろの時だけ (「1/2 の確率」などを消さない)
  let t = String(name ?? "").replace(/(^|\s)(\d{4}\/)?\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
  for (const b of bases) {
    if (!b || (t !== b && !t.startsWith(b + " "))) continue;
    t = t.slice(b.length).replace(/^\s*(\d{4}\/)?\d{1,2}\/\d{1,2}(?=\s|$)/, "").trim();
    return t || b;
  }
  return t || bases.find(Boolean) || null;
}

/** D1 の行 → カードの中身。card は cleanCard を通した JSON (無ければ null)、tree は code の中の木 (無ければ null) */
export function readRecipeCard(name, card, tree) {
  const c = card ?? {};
  return {
    en: c.l === "en",
    name: titleOf(name, [c.bn, typeof tree?.base === "string" ? tree.base : null]),
    baseName: c.bn ?? (typeof tree?.base === "string" ? tree.base.slice(0, 60) : null),
    art: c.a ?? null,
    mods: c.m ?? [],
    pct: c.p ?? null,
    people: c.n ?? 100,
    cost: c.c ?? null,
    orb: c.o ?? null,
    shape: tree ? treeShape(tree) : { boxes: [], edges: [] },
  };
}

const T = (c, ja, en) => (c.en ? en : ja);
const fmtPct = (p) => (p > 0 && p < 1 ? p.toFixed(1) : String(Math.round(p)));
const fmtCost = (v) => (v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toLocaleString("en-US"));

/**
 * 額の格 (10-28 オーナー「達成率低い方がレア演出やけど100%に近い方がええに決まっとるやろ」)。完成の割合が高いほど豪華:
 * 3 = 90% 以上 (金の二重枠・角の飾り・強い光)、2 = 50〜89% (金の二重枠)、1 = それ未満 (細い枠)、0 = 割合が無い。至難・沼の札は 10-28 に外した (オーナー「これならぬまとかしなんとかいらんな」)
 */
export function tierOf(c) {
  return c.pct == null ? 0 : c.pct >= 90 ? 3 : c.pct >= 50 ? 2 : 1;
}
const TIERS = [
  { line: "rgba(150,110,60,0.45)", inner: "rgba(150,110,60,0.2)", glow: "rgba(255,170,70,0.10)" },
  { line: "rgba(170,140,100,0.60)", inner: "rgba(170,140,100,0.25)", glow: "rgba(255,170,70,0.12)", big: "#e6d8bb" },
  { line: "rgba(226,184,92,0.85)", inner: "rgba(226,184,92,0.4)", glow: "rgba(255,190,90,0.22)", big: "#6ee7b7", double: true },
  { line: "rgba(246,208,120,1)", inner: "rgba(246,208,120,0.5)", glow: "rgba(255,196,96,0.40)", big: "#ffe08a", double: true, corners: true, bg: "#4a3410" },
];

/** og:title・og:description の文 */
export function recipeTitle(c) {
  return c.name ? T(c, `${c.name} | ExileDesk クラフトレシピ`, `${c.name} | ExileDesk craft recipe`) : T(c, "ExileDesk クラフトレシピ", "ExileDesk craft recipe");
}
export function recipeDesc(c) {
  const parts = [];
  if (c.baseName) parts.push(c.baseName);
  if (c.pct != null) parts.push(T(c, `${c.people} 人で完成 ${fmtPct(c.pct)}%`, `${fmtPct(c.pct)}% of ${c.people} finish`));
  if (c.cost != null) parts.push(T(c, `平均 ${fmtCost(c.cost)} 神`, `avg ${fmtCost(c.cost)} div`));
  parts.push(T(c, "PoE2 のクラフトの道 (シミュレーター) のレシピ。開くとそのまま回せます。", "A PoE2 crafting route (simulator) recipe. Open it and run it as is."));
  return parts.join(" · ");
}

/** 木の影絵 (箱と直角の線)。w×h の中に収めて真ん中に置く。当たりの箱は明るく、外れ・消えた箱は暗く */
function silhouette(shape, w, h, TI) {
  if (!shape.boxes.length) return "";
  const BW = 316, BH = 200;
  const xs = shape.boxes.map((b) => b.x), ys = shape.boxes.map((b) => b.y);
  const minX = Math.min(...xs) - BW / 2, maxX = Math.max(...xs) + BW / 2, minY = Math.min(...ys), maxY = Math.max(...ys) + BH;
  const k = Math.min(w / (maxX - minX), h / (maxY - minY), 0.28);
  const ox = (w - (maxX - minX) * k) / 2 - minX * k, oy = (h - (maxY - minY) * k) / 2 - minY * k;
  const r1 = (v) => Math.round(v * 10) / 10;
  const X = (v) => r1(ox + v * k), Y = (v) => r1(oy + v * k);
  const ink = "232,205,130";
  const t = Math.max(1.5, Math.min(3, BW * k * 0.03));
  const at = new Map(shape.boxes.map((b) => [b.id, b]));
  const line = (x, y, lw, lh) => `<div style="display:flex;position:absolute;left:${r1(x)}px;top:${r1(y)}px;width:${r1(Math.max(t, lw))}px;height:${r1(Math.max(t, lh))}px;background:rgba(${ink},0.32)"></div>`;
  const lines = shape.edges.map(([a, b]) => {
    const p = at.get(a), q = at.get(b);
    const x1 = X(p.x), y1 = Y(p.y + BH), x2 = X(q.x), y2 = Y(q.y), my = r1((y1 + y2) / 2);
    if (y2 <= y1) return "";
    return line(x1 - t / 2, y1, t, my - y1) + line(Math.min(x1, x2) - t / 2, my - t / 2, Math.abs(x2 - x1) + t, t) + line(x2 - t / 2, my, t, y2 - my);
  }).join("");
  const boxes = shape.boxes.map((b) => {
    const good = b.out === "start" || b.out === "hit" || b.out === "done", bad = /junk|lost|Gone/.test(b.out);
    const a = good ? 0.75 : bad ? 0.28 : 0.45;
    return `<div style="display:flex;position:absolute;left:${X(b.x - BW / 2)}px;top:${Y(b.y)}px;width:${Math.round(BW * k)}px;height:${Math.round(BH * k)}px;border:${r1(t)}px solid rgba(${ink},${a});border-radius:${Math.round(BW * k * 0.06)}px;background:rgba(${ink},${r1(a * 0.22 * 100) / 100})"></div>`;
  }).join("");
  return `<div style="display:flex;position:absolute;left:0;top:0;width:${w}px;height:${h}px">${lines}${boxes}</div>`;
}

/** カードの絵 (PNG のバイト列)。1200×630 を PC・スマホ共通で。X は下の端に題を重ねるので大事な字は 560px より上 */
export async function recipeCardImage(url, env, c) {
  const tier = tierOf(c), TI = TIERS[tier];
  const art = c.art ? await dataUrl(env, url, `/og-art/${c.art}.png`) : null;
  const size = c.art ? await pngSize(env, url, `/og-art/${c.art}.png`) : null;
  const k = size ? Math.min(2.2, 200 / size.w, 230 / size.h) : 1;
  const aw = size ? Math.round(size.w * k) : 0, ah = size ? Math.round(size.h * k) : 0;
  const [logo, hl, hm, hr, sep, orb, ctl, ctr, cbl, cbr] = await Promise.all([
    dataUrl(env, url, "/web/icon-192.png"),
    dataUrl(env, url, "/og-art/_ui-ihead-rare-l.png"),
    dataUrl(env, url, "/og-art/_ui-ihead-rare-m.png"),
    dataUrl(env, url, "/og-art/_ui-ihead-rare-r.png"),
    dataUrl(env, url, "/og-art/_ui-isep-rare.png"),
    c.orb ? dataUrl(env, c.orb) : Promise.resolve(null),
    ...(TI.corners ? ["tl", "tr", "bl", "br"].map((n) => dataUrl(env, url, `/og-art/_ui-sel-${n}.png`)) : [null, null, null, null]),
  ]);
  const kicker = T(c, "クラフトレシピ", "Craft recipe");
  const title = c.name ?? T(c, "クラフトレシピ", "Craft recipe");
  const mods = c.mods.slice(0, SHOW_MODS);
  const more = c.mods.length - mods.length;
  const moreText = more > 0 ? T(c, `ほか ${more} 個`, `+${more} more`) : "";
  const noStats = T(c, "開くと、そのまま 100 人回せます", "Open it and run 100 crafters as is");
  const pctLabel = T(c, `${c.people} 人で完成`, `of ${c.people} finish`), costLabel = T(c, "平均の費用", "avg cost");
  // 字の大きさは幅から (全角 1・半角 0.55 で数える)
  const units = (t) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 0xff ? 1 : 0.55), 0);
  const fit = (t, room, max, min) => Math.max(min, Math.min(max, Math.floor(room / Math.max(1, units(t)))));
  // 左を大きく広く、右の額は細く (10-28 オーナー「あとこのカードなら左側は大きくしたいツリーが軽く出るのはいいね」)
  const LW = 790, CAP = 72, H = 92, AW = 220, IW = LW - AW;
  // 題は 1 行。最小の大きさでも入らなければ後ろを「…」で切る
  const titleSize = fit(title, LW, 68, 34);
  let titleText = title;
  while (units(titleText) * titleSize > LW && titleText.length > 4) titleText = titleText.slice(0, -2) + "…";
  const baseSize = c.baseName ? fit(c.baseName, IW - CAP * 2 - 20, 34, 18) : 28;
  // MOD は折り返してよい (1 行に入らない長い MOD は小さめの字で 2 行)
  const modSize = mods.some((m) => units(m[0]) * 31 > IW - 30) ? 26 : 31;
  const allText = ["ExileDesk", kicker, titleText, c.baseName ?? "", ...mods.map((m) => m[0]), moreText, noStats, pctLabel, costLabel, T(c, "神", "div"), "exiledesk.com", "0123456789%.,"].join("");
  const [bold, regular, antique, cinzel] = await Promise.all([
    font(allText, 800),
    font(allText, 500),
    font(`${titleText}${c.baseName ?? ""}${kicker}`, 0, "Zen+Antique").catch(() => null),
    font("EXILEDESK", 600, "Cinzel").catch(() => null),
  ]);
  const serif = antique ? "Zen Antique" : "Noto Sans JP";
  const dot = Math.round(modSize * 0.45);
  const modRow = (m) => m[1]
    ? `<div style="display:flex;align-items:center;justify-content:center;width:${IW - 24}px;margin-top:6px"><div style="display:flex;flex-shrink:0;width:${dot}px;height:${dot}px;margin-right:10px;background:#c8a86a;transform:rotate(45deg)"></div><span style="font-size:${modSize}px;font-weight:500;line-height:1.25;color:#c8a86a;text-align:center">${esc(m[0])}</span></div>`
    : `<div style="display:flex;justify-content:center;width:${IW - 24}px;margin-top:6px"><span style="font-size:${modSize}px;font-weight:500;line-height:1.25;color:#8888ff;text-align:center">${esc(m[0])}</span></div>`;
  // 右の額 (x 750〜1166、y 30〜600)。上の 300px に木の影絵とベースの絵、下に割合・費用・手
  const PX = 868, PY = 30, PW = 300, PH = 570, SH = 250;
  const corner = (img, x, y) => (img ? `<img src="${img}" width="40" height="40" style="position:absolute;left:${x}px;top:${y}px" />` : "");
  const big = TI.big ?? "#e6d8bb";
  const stats = c.pct != null || c.cost != null;
  const small = (v, unit, label, color) => `
          <div style="display:flex;flex-direction:column;align-items:center;margin:0 14px">
            <div style="display:flex;align-items:center"><span style="font-size:60px;font-weight:800;line-height:1.1;color:${color}">${v}</span>${unit}</div>
            <span style="font-size:22px;font-weight:500;color:#b9a98a">${esc(label)}</span>
          </div>`;
  const statsHtml = stats ? `
      <div style="display:flex;flex-direction:column;align-items:center;width:${PW}px">
        ${c.pct != null ? `<div style="display:flex;align-items:flex-end"><span style="font-size:100px;font-weight:800;line-height:1;color:${big}">${fmtPct(c.pct)}</span><span style="font-size:50px;font-weight:800;color:${big};margin-left:2px;margin-bottom:6px">%</span></div>
        <span style="font-size:24px;font-weight:500;color:#cfc3aa;margin-top:2px">${esc(pctLabel)}</span>` : ""}
        <div style="display:flex;align-items:flex-start;margin-top:14px">
          ${c.cost != null ? small(fmtCost(c.cost), orb ? `<img src="${orb}" width="56" height="56" style="margin-left:6px" />` : `<span style="font-size:30px;font-weight:800;color:#f2c96b;margin-left:4px">${esc(T(c, "神", "div"))}</span>`, costLabel, "#f2c96b") : ""}
        </div>
      </div>` : `<span style="font-size:24px;font-weight:500;color:#cfc3aa;width:${PW - 30}px;text-align:center;justify-content:center">${esc(noStats)}</span>`;
  const html = `
<div style="display:flex;width:1200px;height:630px;position:relative;background-image:radial-gradient(ellipse at 80% 40%, ${TI.bg ?? "#3a2a10"} 0%, #160f08 42%, #050403 78%);font-family:'Noto Sans JP';color:#efe6d2">
  <div style="display:flex;position:absolute;left:${PX}px;top:${PY}px;width:${PW}px;height:${PH}px;background:rgba(10,8,5,0.55);border:${TI.double ? 3 : 2}px solid ${TI.line}"></div>
  ${TI.double ? `<div style="display:flex;position:absolute;left:${PX + 9}px;top:${PY + 9}px;width:${PW - 18}px;height:${PH - 18}px;border:1px solid ${TI.inner}"></div>` : ""}
  <div style="display:flex;position:absolute;left:${PX + 20}px;top:${PY + 30}px;width:${PW - 40}px;height:${SH}px;border-radius:${SH / 2}px;background-image:radial-gradient(circle, ${TI.glow} 0%, rgba(0,0,0,0) 70%)"></div>
  <div style="display:flex;position:absolute;left:${PX + 24}px;top:${PY + 50}px;width:${PW - 48}px;height:${SH - 20}px;opacity:0.85">${silhouette(c.shape, PW - 48, SH - 20, TI)}</div>
  ${TI.corners ? corner(ctl, PX - 4, PY - 4) + corner(ctr, PX + PW - 36, PY - 4) + corner(cbl, PX - 4, PY + PH - 36) + corner(cbr, PX + PW - 36, PY + PH - 36) : ""}
  <div style="display:flex;position:absolute;left:${PX}px;top:${PY + 40 + SH + 6}px;width:${PW}px;justify-content:center">${statsHtml}</div>
  <div style="display:flex;position:absolute;left:40px;top:30px;align-items:flex-end">
    ${logo ? `<img src="${logo}" width="44" height="44" style="margin-right:10px;margin-bottom:2px" />` : ""}
    <span style="font-family:${cinzel ? "Cinzel" : "Noto Sans JP"};font-size:32px;font-weight:${cinzel ? 600 : 800};letter-spacing:3px;background-image:linear-gradient(180deg, #fff3cf 0%, #f0cf86 38%, #b8873c 62%, #7a5320 100%);background-clip:text;color:transparent">EXILEDESK</span>
    <span style="font-size:22px;font-weight:500;color:#b9a98a;margin-left:14px;margin-bottom:4px">${esc(kicker)}</span>
  </div>
  <div style="display:flex;position:absolute;left:38px;top:88px;width:${LW + 20}px">
    <span style="font-family:'${serif}';font-size:${titleSize}px;line-height:1.2;white-space:nowrap;background-image:linear-gradient(180deg, #fff6dc 0%, #f3d690 45%, #c7953f 100%);background-clip:text;color:transparent">${esc(titleText)}</span>
  </div>
  <div style="display:flex;position:absolute;left:40px;top:${88 + Math.round(titleSize * 1.2) + 14}px;width:${LW}px">
    <div style="display:flex;position:relative;width:${AW}px;height:250px;align-items:center;justify-content:center">
      <div style="display:flex;position:absolute;left:0;top:10px;width:${AW - 10}px;height:230px;border-radius:115px;background-image:radial-gradient(circle, ${TI.glow} 0%, rgba(0,0,0,0) 70%)"></div>
      ${art ? `<img src="${art}" width="${aw}" height="${ah}" />` : ""}
    </div>
    <div style="display:flex;flex-direction:column;width:${IW}px">
    <div style="display:flex;position:relative;width:${IW}px;height:${H}px">
      ${hl ? `<img src="${hl}" width="${CAP}" height="${H}" style="position:absolute;left:0;top:0" />` : ""}
      ${hm ? `<img src="${hm}" width="${IW - CAP * 2}" height="${H}" style="position:absolute;left:${CAP}px;top:0" />` : ""}
      ${hr ? `<img src="${hr}" width="${CAP}" height="${H}" style="position:absolute;left:${IW - CAP}px;top:0" />` : ""}
      <div style="display:flex;align-items:center;justify-content:center;position:absolute;left:${CAP}px;top:0;width:${IW - CAP * 2}px;height:${H - 4}px">
        <span style="font-family:'${serif}';font-size:${baseSize}px;color:#e8d77a;white-space:nowrap">${esc(c.baseName ?? kicker)}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;width:${IW}px;padding:8px 0 14px;background:rgba(6,5,4,0.88)">
      ${mods.map(modRow).join("")}
      ${moreText ? `<span style="font-size:22px;font-weight:500;color:#8f8775;margin-top:6px">${esc(moreText)}</span>` : ""}
      ${sep ? `<img src="${sep}" width="${IW - 40}" height="16" style="margin-top:${mods.length ? 12 : 4}px" />` : ""}
    </div>
  </div>
  </div>
  <div style="display:flex;position:absolute;left:42px;top:566px;font-size:24px;font-weight:800;color:#f2c96b">exiledesk.com</div>
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
