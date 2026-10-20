/**
 * recipe-card.ts — 打って作るパターンの手順を 1 枚の画像に (2026-10-09 オーナー「完成した手順を回した結果、無事完走出来たら、
 * その手順を分かりやすく画像とかにまとめて出力できるようにしたい。やさしさ」)。
 * キャンバスに描くだけ (部品を足さない)。アイコンはアプリの通信で取ってから描く (poecdn は書き出し用の読み込みを許していない)。
 * 見た目は画面と同じ決まり (金 = 題と主の数字、青紫 = 狙う MOD、緑 = 完成、余白は 8 の刻み)
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { isTauriRuntime } from "../../utils/isTauriRuntime";

export interface CardMove {
  /** カレンシー・お告げのアイコンの URL */
  icons: string[];
  /** 打つ物 (完全高貴 + 左側の高貴なお告げ など) */
  label: string;
  /** 狙わない / 狙い: どれか 2 つ (火 / 冷気) */
  sub: string;
  /** 狙う手か (sub の色) */
  aim: boolean;
  /** 外れた時の決まり: 形 → 次の手 */
  rules: Array<{ when: string; then: string }>;
}
export interface RecipeCardData {
  title: string;
  subtitle: string;
  /** ベースの絵 (同じ場所の画像) */
  art?: string | null;
  goals: string[];
  moves: CardMove[];
  result: {
    total: string; base: string; craft: string; done: string; doneOk: boolean;
    median?: string;
    luck: Array<{ label: string; value: string }>;
    usage: Array<{ icon: string | null; name: string; count: string; cost: string }>;
  };
  footer: string;
}

const W = 1000;
const PAD = 40;
const FONT = '"Yu Gothic UI", "Meiryo", "Hiragino Sans", sans-serif';
const DISPLAY = '"Cinzel", "Yu Gothic UI", "Meiryo", serif';
const C = {
  bg: "#0b0907", panel: "#141009", card: "rgba(255,255,255,0.035)", brass: "#7A5A2E", line: "rgba(255,255,255,0.08)",
  text: "#E6D8B5", dim: "#9A8A6A", faint: "#7A6B52", gold: "#C9A25A", goldHi: "#E8C987", mag: "#8888ff", magBg: "rgba(136,136,255,0.13)",
  green: "#7EC994", greenBg: "rgba(126,201,148,0.14)", warn: "#E0C97A", warnBg: "rgba(224,201,122,0.14)", rose: "#E5806B",
};

/**
 * アイコンを読む。アプリは Rust 経由の通信で取り (poecdn は書き出し用の読み込みを許していないので、そのまま描くと画像を書き出せない)、
 * 同じ場所の画像に変えてから描く。取れなければ null (丸を描く)
 */
async function loadImg(src: string): Promise<HTMLImageElement | null> {
  let url = src;
  if (isTauriRuntime() && /^https?:/.test(src) && !src.startsWith(location.origin)) {
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
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 手順の画像を描く (高さは中身に合わせる) */
export async function drawRecipeCard(d: RecipeCardData): Promise<HTMLCanvasElement> {
  const icons = new Map<string, HTMLImageElement | null>();
  for (const u of new Set([...d.moves.flatMap((m) => m.icons), ...d.result.usage.flatMap((u) => (u.icon ? [u.icon] : [])), ...(d.art ? [d.art] : [])])) icons.set(u, await loadImg(u));
  try { await document.fonts?.load(`26px ${DISPLAY}`); } catch { /* フォントが無くても描ける */ }
  const measure = document.createElement("canvas").getContext("2d")!;
  // 1 回目は高さを測るだけ、2 回目に描く
  const render = (ctx: CanvasRenderingContext2D, draw: boolean): number => {
    let y = PAD;
    const font = (size: number, bold = false, fam = FONT): void => { ctx.font = `${bold ? "bold " : ""}${size}px ${fam}`; };
    const text = (t: string, x: number, yy: number, size: number, color: string, bold = false, fam = FONT): number => {
      font(size, bold, fam);
      if (draw) { ctx.fillStyle = color; ctx.fillText(t, x, yy); }
      return ctx.measureText(t).width;
    };
    const label = (t: string): void => { y += 28; text(t, PAD, y, 12, C.gold, true); y += 10; };

    // 題: ベースの絵 + 名前 + 副題
    const art = d.art ? icons.get(d.art) : null;
    const tx = art ? PAD + 76 : PAD;
    if (art && draw) ctx.drawImage(art, PAD, y - 4, 64, 64);
    text(d.title, tx, y + 28, 28, C.goldHi, true, DISPLAY);
    font(14);
    let sy = y + 54;
    for (const ln of wrap(ctx, d.subtitle, W - tx - PAD)) { text(ln, tx, sy, 14, C.dim); sy += 20; }
    y = Math.max(y + 64, sy - 6);
    y += 16;
    if (draw) { const g = ctx.createLinearGradient(PAD, 0, W - PAD, 0); g.addColorStop(0, C.brass); g.addColorStop(1, "rgba(122,90,46,0)"); ctx.fillStyle = g; ctx.fillRect(PAD, y, W - PAD * 2, 1); }

    // 狙う MOD (札)
    label("狙う MOD");
    let cx = PAD;
    y += 6;
    for (const g of d.goals) {
      font(14);
      const w = ctx.measureText(g).width + 20;
      if (cx + w > W - PAD) { cx = PAD; y += 34; }
      if (draw) { const fr = /^フラクチャー/.test(g); ctx.fillStyle = fr ? "rgba(200,168,106,0.10)" : "rgba(136,136,255,0.07)"; rrect(ctx, cx, y, w, 26, 6); ctx.fill(); ctx.strokeStyle = fr ? "rgba(200,168,106,0.5)" : "rgba(136,136,255,0.5)"; ctx.lineWidth = 1; rrect(ctx, cx + 0.5, y + 0.5, w - 1, 25, 6); ctx.stroke(); }
      text(g, cx + 10, y + 18, 14, /^フラクチャー/.test(g) ? "#c8a86a" : C.mag);
      cx += w + 8;
    }
    y += 26;

    // 手順
    label("手順");
    if (d.moves.some((m) => m.rules.length)) { y += 14; text("「外れたら」の表: 狙い = 狙う MOD の数、ほか = それ以外の MOD の数", PAD, y, 12, C.faint); }
    for (const [i, m] of d.moves.entries()) {
      y += 6;
      const top = y;
      // 中身の高さを先に測る
      font(13);
      const ruleH = m.rules.length ? 30 + m.rules.length * 24 : 0;
      const h = 64 + ruleH;
      if (draw) { ctx.fillStyle = C.card; rrect(ctx, PAD, top, W - PAD * 2, h, 8); ctx.fill(); }
      // 番号
      if (draw) {
        ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(PAD + 28, top + 32, 14, 0, Math.PI * 2); ctx.fill();
        font(14, true); ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.fillText(String(i + 1), PAD + 28, top + 37); ctx.textAlign = "left";
      }
      let x = PAD + 56;
      for (const u of m.icons) {
        const img = icons.get(u);
        if (draw) { if (img) ctx.drawImage(img, x, top + 14, 34, 34); else { ctx.fillStyle = "#3a3226"; ctx.beginPath(); ctx.arc(x + 17, top + 31, 13, 0, Math.PI * 2); ctx.fill(); } }
        x += 32;
      }
      x += 10;
      text(m.label, x, top + 30, 17, C.text, true);
      text(m.sub, x, top + 50, 13, m.aim ? C.mag : C.faint);
      if (m.rules.length) {
        let ry = top + 72;
        text("外れたら", PAD + 56, ry, 12, C.rose, true);
        ry += 8;
        font(13);
        const thenX = PAD + 56 + Math.min(360, Math.max(140, ...m.rules.map((r) => ctx.measureText(r.when).width)) + 28);
        for (const r of m.rules) {
          ry += 24;
          if (draw) { ctx.fillStyle = C.line; ctx.fillRect(PAD + 56, ry - 17, W - PAD * 2 - 72, 1); }
          text(r.when, PAD + 56, ry, 13, C.dim);
          if (draw) text("→", thenX - 20, ry, 13, C.faint);
          text(r.then, thenX, ry, 13, C.text);
        }
      }
      y = top + h;
    }

    // 回した結果
    label("回した結果");
    y += 6;
    const top = y;
    if (draw) { ctx.fillStyle = C.card; rrect(ctx, PAD, top, W - PAD * 2, 96, 8); ctx.fill(); }
    text("1 個あたりの平均", PAD + 20, top + 28, 13, C.dim);
    const tw = text(d.result.total, PAD + 20, top + 66, 36, C.goldHi, true);
    text(`ベース ${d.result.base} + クラフト ${d.result.craft}`, PAD + 20, top + 86, 12, C.faint);
    let bx = PAD + 20 + Math.max(tw, 220) + 40;
    if (d.result.median) {
      if (draw) { ctx.fillStyle = C.line; ctx.fillRect(bx - 20, top + 16, 1, 64); }
      text("2 人に 1 人は", bx, top + 28, 13, C.dim);
      const mw = text(d.result.median, bx, top + 64, 26, C.text, true);
      text("以内で完成", bx, top + 86, 12, C.faint);
      bx += Math.max(mw, 120) + 40;
    }
    font(14, true);
    const dw = ctx.measureText(d.result.done).width + 24;
    if (draw) { ctx.fillStyle = d.result.doneOk ? C.greenBg : C.warnBg; rrect(ctx, bx, top + 34, dw, 28, 14); ctx.fill(); }
    text(d.result.done, bx + 12, top + 53, 14, d.result.doneOk ? C.green : C.warn, true);
    y = top + 96;
    // 運の幅
    y += 28;
    let lx = PAD;
    for (const [k, l] of d.result.luck.entries()) {
      text(l.label, lx, y, 12, C.dim);
      text(l.value, lx, y + 22, 16, k === 0 ? C.goldHi : C.text, true);
      lx += (W - PAD * 2) / Math.max(1, d.result.luck.length);
    }
    y += 22;
    // よく使うカレンシー
    if (d.result.usage.length) {
      label("よく使うカレンシー (1 個あたり)");
      for (const u of d.result.usage) {
        y += 30;
        const img = u.icon ? icons.get(u.icon) : null;
        if (img && draw) ctx.drawImage(img, PAD, y - 21, 26, 26);
        text(u.name, PAD + 36, y, 14, C.text);
        font(14);
        if (draw) {
          ctx.textAlign = "right";
          ctx.fillStyle = C.dim; ctx.fillText(`× ${u.count}`, W - PAD - 160, y);
          ctx.fillStyle = C.goldHi; ctx.fillText(u.cost, W - PAD, y);
          ctx.textAlign = "left";
          ctx.fillStyle = C.line; ctx.fillRect(PAD, y + 9, W - PAD * 2, 1);
        }
      }
    }
    y += 36;
    text(d.footer, PAD, y, 11, C.faint);
    return y + PAD - 10;
  };
  const h = render(measure, false);
  const cv = document.createElement("canvas");
  const scale = 2;
  cv.width = W * scale; cv.height = h * scale;
  const ctx = cv.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, h);
  ctx.fillStyle = C.panel; rrect(ctx, 10, 10, W - 20, h - 20, 14); ctx.fill();
  ctx.strokeStyle = "rgba(122,90,46,0.55)"; ctx.lineWidth = 1; rrect(ctx, 10.5, 10.5, W - 21, h - 21, 14); ctx.stroke();
  ctx.textBaseline = "alphabetic";
  render(ctx, true);
  return cv;
}
