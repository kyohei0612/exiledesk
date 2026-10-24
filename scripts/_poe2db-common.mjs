// poe2db の照合の共通 (audit-poe2db*.mjs・build-poe2db-fixes.mjs。2026-10-22 に 4 本の写しを 1 つに、中身はそのまま)

/** 引数「--名前 値」の値 (無ければ def)。写しの置き場 --cache・英語の写し --cache-us・結果 --out・取る間 --wait を日付つきで分ける (2026-10-24 取り直し、前の写しは消さない) */
export const argOf = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };

/** 置き場の行 → poe2db のページの名前 */
export const pageOf = (cls) => cls.replace(/^(Wands|Staves|Crossbows)_.*$/, "$1").replace(/^OneHand_/, "One_Hand_").replace(/^TwoHand_/, "Two_Hand_");
/** 埋め込み JSON (new ModsView({...})) */
export function modsView(html) {
  const i = html.indexOf("new ModsView(");
  if (i < 0) return null;
  let j = i + 13, depth = 0, inStr = false, esc = false;
  for (; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return JSON.parse(html.slice(i + 13, j));
}
/** 系統の組の鍵 */
export const famKey = (fams) => [...fams].sort().join("+");
/** 数字の組が同じか (ours を db の 1・60・100・1000・0.1 倍のどれかで全部取れれば同じ) */
export const sameNumsScaled = (ours, db) => [1, 60, 100, 1000, 0.1].some((k) => { const left = [...db]; return ours.every((x) => { const i = left.findIndex((y) => Math.abs(x - y * k) < 0.011 * Math.max(k, 1)); if (i < 0) return false; left.splice(i, 1); return true; }); });
