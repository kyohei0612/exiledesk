// ブログの図の部品 (JS 無しで出る SVG)。色は scripts/build-blog-pages.mjs の暗い地に合わせる。
// 図は <img> で読まれるので、字は system のゴシック、地の色は図の中に持つ。
export const C = {
  bg: "#17130e", line: "#3a3024", fg: "#e8dfcf", sub: "#a99b84",
  hi: "#e0b062", // 強調 (結論の棒)
  lo: "#6e5c42", // それ以外の棒
  good: "#7fb27a", bad: "#c9694f",
};
export const FONT = `"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic UI","Meiryo",system-ui,sans-serif`;

export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const fmt = (n) => n.toLocaleString("en-US");

export function svg(w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" font-family='${FONT}'>
<title>${esc(title)}</title>
<rect width="${w}" height="${h}" rx="8" fill="${C.bg}"/>
${body}
</svg>
`;
}

export const text = (x, y, s, { size = 15, fill = C.fg, anchor = "start", weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;

// 横棒の 1 本 (左が基線、右の端だけ 4px の角丸)
export function hbar(x, y, w, h, fill) {
  if (w <= 0) return "";
  const r = Math.min(4, w / 2, h / 2);
  return `<path d="M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z" fill="${fill}"/>`;
}

/**
 * 横棒グラフ 1 枚分の行を描く。rows: { label, value, valueText, hi?, band? (±の割合) }
 * 返すのは本文の SVG 片と使った高さ。
 */
export function hbars(rows, { x = 20, y = 0, labelW = 200, barW = 260, rowH = 34, barH = 18, max, labelSize = 15 } = {}) {
  const m = max ?? Math.max(...rows.map((r) => r.value * (1 + (r.band ?? 0))));
  let out = "";
  rows.forEach((r, i) => {
    const cy = y + i * rowH;
    const bw = (r.value / m) * barW;
    const bx = x + labelW;
    out += text(x, cy + barH - 4, r.label, { size: labelSize, fill: r.hi ? C.fg : C.sub, weight: r.hi ? 700 : 400 });
    out += hbar(bx, cy, bw, barH, r.hi ? C.hi : C.lo);
    if (r.band) {
      const a = bx + (r.value * (1 - r.band) / m) * barW, b = bx + (r.value * (1 + r.band) / m) * barW, my = cy + barH / 2;
      out += `<path d="M${a},${my}H${b}M${a},${my - 5}V${my + 5}M${b},${my - 5}V${my + 5}" stroke="${C.fg}" stroke-opacity=".55" stroke-width="1.5" fill="none"/>`;
    }
    const tx = bx + Math.max(bw, r.band ? (r.value * (1 + r.band) / m) * barW : 0) + 8;
    out += text(tx, cy + barH - 4, r.valueText, { size: labelSize, fill: r.hi ? C.hi : C.fg, weight: r.hi ? 700 : 400 });
  });
  return { body: out, height: rows.length * rowH };
}
