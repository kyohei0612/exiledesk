/**
 * recipe-card.ts — 打って作るパターンの手順を 1 枚の画像に (2026-10-09 オーナー「完成した手順を回した結果、無事完走出来たら、
 * その手順を分かりやすく画像とかにまとめて出力できるようにしたい。やさしさ」)。
 * キャンバスに描くだけ (部品を足さない)。アイコンはアプリの通信で取ってから描く (poecdn は書き出し用の読み込みを許していない)
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime } from "../../utils/isTauriRuntime";

export interface CardMove {
  /** カレンシー・お告げのアイコンの URL */
  icons: string[];
  /** 打つ物 (完全高貴 + 左側の高貴なお告げ など) */
  label: string;
  /** 打つだけ / 狙い: どれか 2 つ (火 / 冷気) */
  sub: string;
  /** 外れた時の決まり (文) */
  rules: string[];
}
export interface RecipeCardData {
  title: string;
  subtitle: string;
  goals: string[];
  moves: CardMove[];
  result: {
    total: string; base: string; craft: string; done: string;
    luck: Array<{ label: string; value: string }>;
    usage: Array<{ icon: string | null; name: string; count: string; cost: string }>;
  };
  footer: string;
}

const W = 960;
const PAD = 28;
const FONT = '"Yu Gothic UI", "Meiryo", "Hiragino Sans", sans-serif';
const C = { bg: "#120f0b", panel: "#1c1812", line: "rgba(255,255,255,0.12)", text: "#ece6da", dim: "#a89f8f", amber: "#f3c66b", sky: "#8cc8f0", mag: "#9a9aff", rose: "#f0a0a0", green: "#7fe0a8" };

/**
 * アイコンを読む。アプリは Rust 経由の通信で取り (poecdn は書き出し用の読み込みを許していないので、そのまま描くと画像を書き出せない)、
 * 同じ場所の画像に変えてから描く。取れなければ null (頭文字の丸を描く)
 */
async function loadImg(src: string): Promise<HTMLImageElement | null> {
  let url = src;
  if (isTauriRuntime() && /^https?:/.test(src)) {
    try {
      const r = await tauriFetch(src);
      if (!r.ok) return null;
      url = URL.createObjectURL(await r.blob());
    } catch { return null; }
  } else if (/^https?:/.test(src) && !src.startsWith(location.origin)) return null;
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}
/** 幅に収まるように折り返す */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > width && line) { out.push(line); line = ch; } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

/** 手順の画像を描く (高さは中身に合わせる) */
export async function drawRecipeCard(d: RecipeCardData): Promise<HTMLCanvasElement> {
  const icons = new Map<string, HTMLImageElement | null>();
  for (const u of new Set([...d.moves.flatMap((m) => m.icons), ...d.result.usage.flatMap((u) => (u.icon ? [u.icon] : []))])) icons.set(u, await loadImg(u));
  const measure = document.createElement("canvas").getContext("2d")!;
  // 1 回目は高さを測るだけ、2 回目に描く
  const render = (ctx: CanvasRenderingContext2D, draw: boolean): number => {
    let y = PAD;
    const text = (t: string, x: number, size: number, color: string, bold = false): void => {
      ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
      if (draw) { ctx.fillStyle = color; ctx.fillText(t, x, y); }
    };
    const para = (t: string, x: number, size: number, color: string, width: number, lh = 1.45, bold = false): void => {
      ctx.font = `${bold ? "bold " : ""}${size}px ${FONT}`;
      for (const ln of wrap(ctx, t, width)) { y += size * lh; if (draw) { ctx.fillStyle = color; ctx.fillText(ln, x, y); } }
    };
    // 題
    y += 26; text(d.title, PAD, 26, C.amber, true);
    y += 6; para(d.subtitle, PAD, 14, C.dim, W - PAD * 2);
    // 狙い
    y += 16; text("狙う MOD", PAD, 15, C.sky, true);
    for (const g of d.goals) para(`・${g}`, PAD + 8, 14, C.mag, W - PAD * 2 - 8);
    // 手順
    y += 18; text("手順", PAD, 15, C.sky, true);
    y += 6;
    for (const [i, m] of d.moves.entries()) {
      const top = y;
      y += 10;
      // 番号の丸
      if (draw) {
        ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(PAD + 14, y + 12, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#000"; ctx.font = `bold 14px ${FONT}`; ctx.textAlign = "center"; ctx.fillText(String(i + 1), PAD + 14, y + 17); ctx.textAlign = "left";
      }
      let x = PAD + 38;
      for (const u of m.icons) {
        const img = icons.get(u);
        if (draw) {
          if (img) ctx.drawImage(img, x, y - 2, 28, 28);
          else { ctx.fillStyle = "#3a3226"; ctx.beginPath(); ctx.arc(x + 14, y + 12, 12, 0, Math.PI * 2); ctx.fill(); }
        }
        x += 30;
      }
      y += 18; text(m.label, x + 6, 16, C.text, true);
      y += 2; para(m.sub, PAD + 38, 13, m.sub.startsWith("打つだけ") ? C.dim : C.mag, W - PAD * 2 - 40);
      if (m.rules.length) {
        y += 4; para("外れたら", PAD + 38, 12, C.rose, W - PAD * 2 - 40, 1.4, true);
        for (const r of m.rules) para(`・${r}`, PAD + 46, 13, C.text, W - PAD * 2 - 50, 1.4);
      }
      y += 12;
      if (draw) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(PAD, top, W - PAD * 2, y - top); }
      y += 8;
    }
    // 結果
    y += 14; text("回した結果", PAD, 15, C.sky, true);
    y += 34; text(d.result.total, PAD, 30, C.amber, true);
    ctx.font = `bold 30px ${FONT}`;
    const tw = ctx.measureText(d.result.total).width;
    text(`1 個あたり (ベース ${d.result.base} + クラフト ${d.result.craft}) · ${d.result.done}`, PAD + tw + 14, 14, C.dim);
    y += 8;
    para(d.result.luck.map((l) => `${l.label} ${l.value}`).join("   "), PAD, 13, C.text, W - PAD * 2);
    if (d.result.usage.length) {
      y += 10; para("よく使うカレンシー (1 個あたり)", PAD, 12, C.dim, W - PAD * 2, 1.4, true);
      for (const u of d.result.usage) {
        y += 26;
        const img = u.icon ? icons.get(u.icon) : null;
        if (img && draw) ctx.drawImage(img, PAD + 6, y - 19, 22, 22);
        ctx.font = `14px ${FONT}`;
        if (draw) { ctx.fillStyle = C.text; ctx.fillText(u.name, PAD + 34, y); ctx.fillStyle = C.dim; ctx.fillText(`× ${u.count}`, PAD + 380, y); ctx.fillStyle = C.amber; ctx.fillText(u.cost, PAD + 500, y); }
      }
    }
    y += 26; text(d.footer, PAD, 11, C.dim);
    return y + PAD;
  };
  const h = render(measure, false);
  const cv = document.createElement("canvas");
  const scale = 2;
  cv.width = W * scale; cv.height = h * scale;
  const ctx = cv.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = C.panel; ctx.fillRect(8, 8, W - 16, h - 16);
  ctx.textBaseline = "alphabetic";
  render(ctx, true);
  return cv;
}
