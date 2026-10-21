/**
 * blog-md.ts — ブログの記事の元 (src/data/blog/<slug>.<ja|en>.md) を読む 1 か所 (2026-10-22 オーナー、クラフトで発見した事のエッセイ風のレポート)。
 * 頭の --- で囲んだ所 (題・説明・日付・タグ・リンク) と、本文の Markdown (使える書き方は src/data/blog/README.md に書いた物だけ) を HTML にする。
 * 読むのは scripts/build-blog-pages.mjs (静的な HTML を作る、開発版のデプロイの中だけ)。部品を足さずに書いた小さな変換なので、README に無い書き方は文字のまま出る。
 */

export interface BlogMeta {
  slug: string;
  lang: "ja" | "en";
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  /** 直した日 (無ければ date) */
  updated: string;
  tags: string[];
  /** 「このツリーで試す」の行き先 (サイトの中のパス、例 /?page=sim-tree&base=Gold%20Ring) */
  tree: string | null;
  /** 「クラフト台で打つ」の行き先 (例 /?base=Gold%20Ring) */
  craft: string | null;
  /** OGP の絵 (img/ の中の名前。無ければサイトの既定) */
  image: string | null;
  /** 下書き (開発版だけに出す) */
  draft: boolean;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** ファイル名 <slug>.<ja|en>.md と中身から、頭の項目と本文 */
export function parseBlogFile(name: string, raw: string): { meta: BlogMeta; body: string } | null {
  const m = /^([a-z0-9][a-z0-9-]*)\.(ja|en)\.md$/.exec(name);
  if (!m) return null;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const head: Record<string, string> = {};
  for (const line of (fm?.[1] ?? "").split(/\r?\n/)) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (kv) head[kv[1]!] = kv[2]!.replace(/^"(.*)"$/, "$1").trim();
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(head.date ?? "") ? head.date! : "1970-01-01";
  return {
    meta: {
      slug: m[1]!, lang: m[2] as "ja" | "en",
      title: head.title || m[1]!, description: head.description ?? "", date,
      updated: /^\d{4}-\d{2}-\d{2}$/.test(head.updated ?? "") ? head.updated! : date,
      tags: (head.tags ?? "").replace(/^\[|\]$/g, "").split(/[,、]/).map((t) => t.trim()).filter(Boolean),
      tree: head.tree || null, craft: head.craft || null, image: head.image || null,
      draft: head.draft === "true",
    },
    body: fm ? raw.slice(fm[0].length) : raw,
  };
}

/** 本文の中の 1 行 (太字・コード・リンク・絵) */
function inline(s: string, img: (src: string) => string): string {
  let out = esc(s);
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => `<img src="${esc(img(src))}" alt="${alt}" loading="lazy" />`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t: string, href: string) => `<a href="${href}"${/^https?:/.test(href) ? ' rel="noopener" target="_blank"' : ""}>${t}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

/** 箱の種類 (:::summary など) と見出し・色の名前 (CSS の .box.<種類>) */
const BOXES: Record<string, { ja: string; en: string }> = {
  summary: { ja: "まとめ", en: "Summary" }, note: { ja: "注意", en: "Note" }, tip: { ja: "ヒント", en: "Tip" },
};
/** 吹き出しのキャラ (絵は /blog/chars/<キャラ>-<表情>.webp、scripts/build-blog-chars.py で書き出した物) */
const CHARS: Record<string, { ja: string; en: string; side: "left" | "right" }> = {
  metan: { ja: "めたん", en: "Metan", side: "left" }, zundamon: { ja: "ずんだもん", en: "Zundamon", side: "right" },
};
const FACES = ["normal", "happy", "surprised", "troubled"];
/** グラフの色 (暗い地に合う、系列の順) */
const PALETTE = ["#e0b062", "#7cc4f0", "#8fd18a", "#e58fb6", "#b9a2f0"];
const fmt = (v: number): string => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v * 100) / 100));

/**
 * 数字の表から SVG のグラフ (JS 無しで出る)。中身の行: `unit: %`・`labels: a, b, c`・`<系列の名前>: 1, 2, 3` (系列は何本でも)。
 * kind = bar (縦の棒、系列が複数なら並べる) / line (折れ線)。目盛りの線は 4 本の細い実線だけ (点線は使わない)
 */
function chartSvg(kind: string, title: string, body: string[]): string {
  let unit = "";
  let labels: string[] = [];
  const series: Array<{ name: string; vals: number[] }> = [];
  for (const raw of body) {
    const m = /^([^:]+):\s*(.*)$/.exec(raw.trim());
    if (!m) continue;
    const [k, v] = [m[1]!.trim(), m[2]!.trim()];
    if (k === "unit") unit = v;
    else if (k === "labels") labels = v.split(",").map((x) => x.trim());
    else series.push({ name: k, vals: v.split(",").map((x) => Number(x.trim())) });
  }
  if (!labels.length || !series.length) return `<p>${esc(title)}</p>`;
  const W = 720, H = 300, L = 56, R = 16, T = 20, B = 44 + (series.length > 1 ? 22 : 0);
  const max = Math.max(0, ...series.flatMap((s) => s.vals.filter(Number.isFinite)));
  const top = max > 0 ? (() => { const p = 10 ** Math.floor(Math.log10(max)); const n = [1, 2, 2.5, 5, 10].find((k) => k * p >= max)!; return n * p; })() : 1;
  const y = (v: number): number => T + (H - T - B) * (1 - v / top);
  const step = (W - L - R) / labels.length;
  const parts: string[] = [];
  for (let k = 0; k <= 4; k++) {
    const v = (top * k) / 4;
    parts.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#3a3024" stroke-width="1"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" fill="#a99b84" font-size="12">${fmt(v)}${esc(unit)}</text>`);
  }
  labels.forEach((lb, i) => parts.push(`<text x="${L + step * (i + 0.5)}" y="${H - B + 18}" text-anchor="middle" fill="#e8dfcf" font-size="13">${esc(lb)}</text>`));
  if (kind === "line") {
    series.forEach((s, j) => {
      const c = PALETTE[j % PALETTE.length]!;
      const pts = s.vals.map((v, i) => [L + step * (i + 0.5), y(v)] as const).filter(([, py]) => Number.isFinite(py));
      parts.push(`<polyline fill="none" stroke="${c}" stroke-width="2.5" points="${pts.map(([px, py]) => `${px},${py}`).join(" ")}"/>`);
      s.vals.forEach((v, i) => { if (Number.isFinite(v)) parts.push(`<circle cx="${L + step * (i + 0.5)}" cy="${y(v)}" r="4" fill="${c}"/><text x="${L + step * (i + 0.5)}" y="${y(v) - 9}" text-anchor="middle" fill="${c}" font-size="12">${fmt(v)}${esc(unit)}</text>`); });
    });
  } else {
    const bw = Math.min(56, (step * 0.7) / series.length);
    series.forEach((s, j) => {
      const c = PALETTE[j % PALETTE.length]!;
      s.vals.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x = L + step * (i + 0.5) - (bw * series.length) / 2 + bw * j;
        parts.push(`<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(0, H - B - y(v))}" rx="2" fill="${c}"/><text x="${x + (bw - 2) / 2}" y="${y(v) - 5}" text-anchor="middle" fill="${c}" font-size="12">${fmt(v)}${esc(unit)}</text>`);
      });
    });
  }
  if (series.length > 1) series.forEach((s, j) => parts.push(`<rect x="${L + j * 150}" y="${H - 16}" width="12" height="12" rx="2" fill="${PALETTE[j % PALETTE.length]}"/><text x="${L + j * 150 + 18}" y="${H - 6}" fill="#e8dfcf" font-size="12">${esc(s.name)}</text>`));
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" xmlns="http://www.w3.org/2000/svg" font-family="inherit"><title>${esc(title)}</title>${parts.join("")}</svg>${title ? `<figcaption>${esc(title)}</figcaption>` : ""}</figure>`;
}

/** 本文の Markdown → HTML。img: 絵の場所 (img/foo.png → /blog/img/foo.png)。lang: 箱の見出し・キャラの名前の言語 */
export function blogHtml(md: string, img: (src: string) => string, lang: "ja" | "en" = "ja"): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const isTable = (l: string | undefined): boolean => !!l && /^\s*\|.*\|\s*$/.test(l);
  const cells = (l: string): string[] => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) { i++; continue; }
    // 部品 (:::種類 … :::)。箱・吹き出しの中は普通の本文の書き方、グラフの中は数字の行
    const blk = /^:::\s*([a-z]+)(?:\s+(.*))?$/.exec(l.trim());
    if (blk) {
      const [kind, arg = ""] = [blk[1]!, blk[2]?.trim() ?? ""];
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== ":::") body.push(lines[i++]!);
      i++;
      if (BOXES[kind]) out.push(`<aside class="box ${kind}"><p class="box-h">${esc(arg || BOXES[kind]![lang])}</p>${blogHtml(body.join("\n"), img, lang)}</aside>`);
      else if (CHARS[kind]) {
        const c = CHARS[kind]!;
        const face = FACES.includes(arg) ? arg : "normal";
        out.push(`<div class="say ${c.side} ${kind}"><img src="/blog/chars/${kind}-${face}.webp" alt="${c[lang]}" width="64" height="64" loading="lazy" /><div class="bubble"><p class="who">${c[lang]}</p>${blogHtml(body.join("\n"), img, lang)}</div></div>`);
      } else if (kind === "chart") {
        const [type, ...rest] = arg.split(/\s+/);
        out.push(chartSvg(type === "line" ? "line" : "bar", rest.join(" "), body));
      } else out.push(blogHtml(body.join("\n"), img, lang));
      continue;
    }
    // SVG を直に置く (<svg … </svg> の行をそのまま図に)
    if (/^\s*<svg[\s>]/.test(l)) {
      const svg: string[] = [];
      while (i < lines.length) { svg.push(lines[i]!); if (/<\/svg>\s*$/.test(lines[i++]!)) break; }
      out.push(`<figure class="chart">${svg.join("\n")}</figure>`);
      continue;
    }
    const h = /^(#{2,4})\s+(.*)$/.exec(l);
    if (h) { const n = h[1]!.length; out.push(`<h${n}>${inline(h[2]!, img)}</h${n}>`); i++; continue; }
    if (isTable(l) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const head = cells(l);
      const align = cells(lines[i + 1]!).map((c) => (/^-+:$/.test(c) ? ' class="n"' : ""));
      i += 2;
      const rows: string[] = [];
      while (isTable(lines[i])) { rows.push(`<tr>${cells(lines[i]!).map((c, k) => `<td${align[k] ?? ""}>${inline(c, img)}</td>`).join("")}</tr>`); i++; }
      out.push(`<div class="tbl"><table><thead><tr>${head.map((c, k) => `<th${align[k] ?? ""}>${inline(c, img)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`);
      continue;
    }
    const list = /^(\s*)([-*]|\d+\.)\s+/.exec(l);
    if (list) {
      const tag = /\d/.test(list[2]!) ? "ol" : "ul";
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i]!)) { items.push(`<li>${inline(lines[i]!.replace(/^\s*([-*]|\d+\.)\s+/, ""), img)}</li>`); i++; }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) { q.push(lines[i]!.replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote><p>${inline(q.join(" "), img)}</p></blockquote>`);
      continue;
    }
    const fig = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(l);
    if (fig) { out.push(`<figure><img src="${esc(img(fig[2]!))}" alt="${esc(fig[1]!)}" loading="lazy" />${fig[1] ? `<figcaption>${esc(fig[1]!)}</figcaption>` : ""}</figure>`); i++; continue; }
    const p: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,4}\s|>|\s*([-*]|\d+\.)\s|:::|\s*<svg[\s>])/.test(lines[i]!) && !isTable(lines[i])) { p.push(lines[i]!.trim()); i++; }
    out.push(`<p>${inline(p.join(" "), img)}</p>`);
  }
  return out.join("\n");
}
