// デイリーのクラフト箱に届いた投稿の品の絵 (設計図 daily.md D-20c、2026-11-12 オーナー「画像付きで欲しいなこの形でディスコに途中変換して」「投稿の画像と一致させておk表示の仕方」)。
// 受け口 (server/live の box-notify.ts) が Discord の知らせに付ける。置き場・道は og-card.js のシェアのカードと同じ (/og/<code>.png)。中身の並び PACK の kd = "box" の時だけここで作る。
// 中身 bx = JSON の文字: { n: 品の名前, a: ベースの絵のファイル名, h: [種類・アイテムレベル・防具の数値の行], r: [{ s: "P"|"S", g: 札 (P2 以上), t: MOD の文, f: 1 = フラクチャー }] }
// 字は投稿の確かめの画面のカードに出ていた物そのまま (画面が投稿の時に添える)。札の段だけはお題になった時の段 (オーナー「お題になった時の段かなそこだけ変えてあげたい」)
import { ImageResponse } from "workers-og";
import { dataUrl, esc, font, pngSize } from "./og-card.js";

const str = (v, n) => (typeof v === "string" ? v : "").replace(/\s+/g, " ").trim().slice(0, n);

/** 中身を読む (変な値は捨てる)。読めなければ null */
export function readBox(get) {
  let j;
  try { j = JSON.parse(get("bx") ?? ""); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const rows = (Array.isArray(j.r) ? j.r : []).slice(0, 12).map((x) => ({ side: x?.s === "S" ? "S" : "P", tag: str(x?.g, 12), text: str(x?.t, 120), frac: !!x?.f })).filter((x) => x.text);
  const name = str(j.n, 60);
  if (!name || !rows.length) return null;
  return { en: get("l") === "en", name, art: /^[A-Za-z0-9_]{1,80}$/.test(j.a ?? "") ? j.a : null, head: (Array.isArray(j.h) ? j.h : []).slice(0, 8).map((x) => str(x, 60)).filter(Boolean), rows };
}

/** 幅 640 の縦長の 1 枚 (高さは行の数で決まる)。上 = ベースの絵と名前、下 = ゲームのアイテムの説明と同じ形のカード */
export async function boxCardImage(url, env, c) {
  const W = 640, PAD = 28, IW = W - PAD * 2, CAP = 56, HH = 72, ROW = 40, TAGW = 86;
  const artPath = c.art ? `/og-art/${c.art}.png` : null;
  const [art, size] = artPath ? await Promise.all([dataUrl(env, url, artPath), pngSize(env, url, artPath)]) : [null, null];
  const k = size ? Math.min(1.6, 92 / size.w, 92 / size.h) : 1, aw = size ? Math.round(size.w * k) : 0, ah = size ? Math.round(size.h * k) : 0;
  const [frame, hl, hm, hr, sep, logo] = await Promise.all(["/og-art/_ui-frame-s.png", "/og-art/_ui-ihead-rare-l.png", "/og-art/_ui-ihead-rare-m.png", "/og-art/_ui-ihead-rare-r.png", "/og-art/_ui-isep-rare.png", "/web/icon-192.png"].map((p) => dataUrl(env, url, p)));
  const kicker = c.en ? "Craft box post" : "クラフト箱の投稿", meta = c.head.slice(0, 2).join(" · ");
  // 字の大きさは幅から (全角 1・半角 0.55 で数える、recipe-card.js と同じ)
  const units = (t) => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 1 : 0.55), 0);
  const TW = IW - 28 - TAGW - 30;
  // 1 行に入る大きさ (22〜14px)。14px でも入らない長い文は 14px で折り返し、その行だけ高くする (画面のカードと同じ: まず縮め、入らなければ折る)
  const rows = c.rows.map((r) => {
    const u = Math.max(1, units(r.text)), fit = Math.floor(TW / u);
    if (fit >= 14) return { ...r, px: Math.min(22, fit), wrap: false, h: ROW };
    const lines = Math.min(3, Math.ceil((u * 14) / (TW * 0.94)));
    return { ...r, px: 14, wrap: true, h: Math.max(ROW, lines * 19 + 10) };
  });
  const all = ["EXILEDESK", kicker, meta, c.name, ...rows.flatMap((r) => [r.tag, r.text]), ...c.head, "exiledesk.com", "0123456789%+-:()TPS以上"].join("");
  const [bold, regular, antique, cinzel] = await Promise.all([font(all, 800), font(all, 500), font(`${c.name}${rows.map((r) => r.text).join("")}0123456789%+-()`, 0, "Zen+Antique").catch(() => null), font("EXILEDESK", 600, "Cinzel").catch(() => null)]);
  const serif = antique ? "Zen Antique" : "Noto Sans JP";
  const namePx = Math.max(20, Math.min(36, Math.floor((IW - 132) / Math.max(1, units(c.name))))), titlePx = Math.max(18, Math.min(28, Math.floor((IW - CAP * 2) / Math.max(1, units(c.name)))));
  const TOP = 150, cardH = HH + 14 + c.head.length * 30 + 22 + rows.reduce((n, r) => n + r.h, 0) + 34, H = TOP + cardH + 62;
  const tagColor = (r) => (r.side === "P" ? "#e58a72" : "#6fb1e8");
  const html = `
<div style="display:flex;width:${W}px;height:${H}px;position:relative;background-image:radial-gradient(ellipse at 50% 18%, #33250f 0%, #150f08 46%, #060504 82%);font-family:'Noto Sans JP';color:#efe6d2">
  <div style="display:flex;position:absolute;left:8px;top:8px;width:${W - 16}px;height:${H - 16}px;border:1px solid #6b5326"></div>
  <div style="display:flex;position:absolute;left:${PAD}px;top:24px;width:${IW}px;height:112px;align-items:center">
    <div style="display:flex;position:relative;width:112px;height:112px;align-items:center;justify-content:center;flex-shrink:0">
      ${frame ? `<img src="${frame}" width="112" height="112" style="position:absolute;left:0;top:0" />` : ""}
      ${art ? `<img src="${art}" width="${aw}" height="${ah}" />` : ""}
    </div>
    <div style="display:flex;flex-direction:column;margin-left:20px;width:${IW - 132}px">
      <div style="display:flex;align-items:center">
        ${logo ? `<img src="${logo}" width="22" height="22" style="margin-right:6px" />` : ""}
        <span style="font-family:${cinzel ? "Cinzel" : "Noto Sans JP"};font-size:17px;font-weight:600;letter-spacing:2px;color:#d9b76a">EXILEDESK</span>
        <span style="font-size:15px;font-weight:500;color:#a99d86;margin-left:10px">${esc(kicker)}</span>
      </div>
      <span style="font-family:'${serif}';font-size:${namePx}px;line-height:1.3;color:#f3e3b5;white-space:nowrap">${esc(c.name)}</span>
      <span style="font-size:17px;font-weight:500;color:#b9a98a">${esc(meta)}</span>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;position:absolute;left:${PAD}px;top:${TOP}px;width:${IW}px">
    <div style="display:flex;position:relative;width:${IW}px;height:${HH}px">
      ${hl ? `<img src="${hl}" width="${CAP}" height="${HH}" style="position:absolute;left:0;top:0" />` : ""}
      ${hm ? `<img src="${hm}" width="${IW - CAP * 2}" height="${HH}" style="position:absolute;left:${CAP}px;top:0" />` : ""}
      ${hr ? `<img src="${hr}" width="${CAP}" height="${HH}" style="position:absolute;left:${IW - CAP}px;top:0" />` : ""}
      <div style="display:flex;align-items:center;justify-content:center;position:absolute;left:${CAP}px;top:0;width:${IW - CAP * 2}px;height:${HH - 4}px">
        <span style="font-family:'${serif}';font-size:${titlePx}px;color:#e8d77a;white-space:nowrap">${esc(c.name)}</span>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;width:${IW}px;padding:14px 0 16px;background:rgba(4,4,3,0.92);border:1px solid #5a4a26;border-top:0">
      ${c.head.map((t, i) => `<span style="font-size:17px;font-weight:500;line-height:30px;color:${i === 0 ? "#8f8775" : "#b8b0a0"}">${esc(t)}</span>`).join("")}
      ${sep ? `<img src="${sep}" width="${IW - 60}" height="14" style="margin:4px 0" />` : ""}
      ${rows.map((r) => `<div style="display:flex;align-items:center;width:${IW - 28}px;height:${r.h}px">
        <span style="display:flex;flex-shrink:0;width:${TAGW}px;font-size:15px;font-weight:800;color:${tagColor(r)}">${esc(r.tag)}</span>
        <span style="display:flex;justify-content:center;width:${TW}px;font-family:'${serif}';font-size:${r.px}px;line-height:${r.wrap ? "19px" : "1.2"};color:${r.frac ? "#a29162" : "#8888ff"};text-align:center;${r.wrap ? "flex-wrap:wrap" : "white-space:nowrap"}">${esc(r.text)}</span>
      </div>`).join("")}
    </div>
  </div>
  <div style="display:flex;position:absolute;left:${PAD}px;top:${H - 44}px;width:${IW}px;justify-content:flex-end;font-size:15px;font-weight:800;color:#c9a25a">exiledesk.com</div>
</div>`;
  return new ImageResponse(html, {
    width: W, height: H,
    fonts: [
      { name: "Noto Sans JP", data: bold, weight: 800, style: "normal" },
      { name: "Noto Sans JP", data: regular, weight: 500, style: "normal" },
      ...(antique ? [{ name: "Zen Antique", data: antique, weight: 400, style: "normal" }] : []),
      ...(cinzel ? [{ name: "Cinzel", data: cinzel, weight: 600, style: "normal" }] : []),
    ],
  }).arrayBuffer();
}
