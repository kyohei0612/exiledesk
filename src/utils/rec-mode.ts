/**
 * 録画モード (POE2Tube 要望 ㊶、2026-10-12)。Web 版を `?rec=1` で開いた時だけ:
 *   - 上の帯の「アプリ版 近日公開」「本日の訪問者」、右のチャンネル欄、一番下の行を隠す (「要望・バグを送る」は残す)
 *   - 使い方の記録・訪問者の数を送らない (no-log.ts が見る。端末の「記録しない」の印は書き換えない)
 *   - 起動直後の窓 (更新しました・要望の返事) を出さない、棚・ベースの詳しいカードを出さない
 *   - 押す所に録画用の固定の目印 `data-rec="…"` (普段も付いているが、見た目は何も変わらない)
 * 普段の人には何も変わらない。URL の ?rec=1 は開いた時に 1 回だけ読む
 */
export const REC: boolean = (() => {
  try { return typeof location !== "undefined" && new URLSearchParams(location.search).get("rec") === "1"; } catch { return false; }
})();

const params = (() => { try { return new URLSearchParams(typeof location !== "undefined" ? location.search : ""); } catch { return new URLSearchParams(); } })();

/**
 * 録画モードの乱数の種 (POE2Tube 要望 ㊷、`?rec=1&seed=<数>`)。同じ種・同じ操作なら毎回同じ結果
 * (カレンシーの手・発現の候補・引き直し・次の手で狙うの「回す」・ヒネコラの予見・白に戻した時の値)。
 * 乱数を引くたびに「種 + 何回目か」から決める = 操作の並びが同じなら同じ数が出る。1 手戻した後の新しい乱数も同じく決まる
 */
export const REC_SEED: number | null = (() => {
  if (!REC) return null;
  const v = params.get("seed");
  return v != null && /^-?\d+$/.test(v) ? Number(v) : null;
})();
let recCount = 0;
/** 種から決まる次の数 (0〜2^31-2)。種が無ければ null */
export function recNext(): number | null {
  if (REC_SEED == null) return null;
  let t = (REC_SEED ^ Math.imul(++recCount, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b) >>> 0;
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) % 2_147_483_647;
}

/** 録画モードの最初の状態 (要望 ㊷、`&base=<英語名>&ilvl=<数>&hands=transmute,augment`)。無ければ null */
export const REC_START: { base: string | null; ilvl: number | null; hands: string[] } | null = (() => {
  if (!REC) return null;
  const base = params.get("base");
  const ilvl = Number(params.get("ilvl"));
  const hands = (params.get("hands") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!base && !Number.isFinite(ilvl) && !hands.length) return null;
  return { base: base || null, ilvl: Number.isFinite(ilvl) && ilvl > 0 ? ilvl : null, hands };
})();

/**
 * 録画モードで画面の部分ごとに見せる / 隠す (POE2Tube 要望 ㊸)。部分には `data-rec-part="<名前>"` を付けておき、
 * 隠す物だけ CSS (`display: none`) で消す。切り替えは ① URL の `&hide=a,b` / `&show=a,b` ② 裏の命令 `window.__rec.set({ a: false })`、
 * 今の状態は `window.__rec.get()`。普段 (?rec=1 でない時) は何もしない
 */
export const REC_PARTS = [
  "header", "header-help", "header-feedback", "header-lang", "header-version", "header-visitors", "header-app",
  "title", "tabs", "settings", "trade-search", "quality", "mod-list-button", "card-hint",
  "history", "history-cost", "shelf-price", "mod-list-bottom", "aim-panel",
  "odds", "fx-float", "fx-glow", "held-icon", "display-currency", "channel", "footer",
] as const;
export type RecPart = (typeof REC_PARTS)[number];
/** 録画モードで最初から隠す物 (要望 ㊶ で隠した物 + ㊷ の版の番号) */
export const REC_HIDDEN_DEFAULT: readonly RecPart[] = ["header-version", "header-visitors", "header-app", "channel", "footer"];
const recState: Record<string, boolean> = {};

/** 隠す物の CSS を書き直す (部分の名前ごとに 1 行。演出の 2 つは要素ではなく動きを止める) */
function applyRecStyle(): void {
  let el = document.getElementById("rec-parts-style") as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = "rec-parts-style"; document.head.appendChild(el); }
  const off = REC_PARTS.filter((p) => recState[p] === false);
  el.textContent = off.map((p) =>
    p === "fx-glow" ? `.stage-mod-new,.stage-mod-new-top{animation:none!important;box-shadow:none!important}`
      : p === "fx-float" ? `.stage-float,[data-rec-part~="fx-float"]{display:none!important}`
        : `[data-rec-part~="${p}"]{display:none!important}`).join("\n");
}

/** Web の入口で 1 回 (録画モードの時だけ) */
export function initRecParts(): void {
  if (!REC) return;
  for (const p of REC_PARTS) recState[p] = !REC_HIDDEN_DEFAULT.includes(p);
  const list = (k: string): string[] => (params.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const p of list("hide")) if (p in recState) recState[p] = false;
  for (const p of list("show")) if (p in recState) recState[p] = true;
  applyRecStyle();
  (globalThis as { __rec?: unknown }).__rec = {
    set(v: Record<string, boolean>): Record<string, boolean> {
      for (const [k, on] of Object.entries(v ?? {})) if (k in recState) recState[k] = !!on;
      applyRecStyle();
      return { ...recState };
    },
    get(): Record<string, boolean> { return { ...recState }; },
    parts: [...REC_PARTS],
  };
}
