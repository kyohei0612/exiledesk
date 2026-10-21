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

/** 本文の Markdown → HTML。img: 絵の場所 (img/foo.png → /blog/img/foo.png) */
export function blogHtml(md: string, img: (src: string) => string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  const isTable = (l: string | undefined): boolean => !!l && /^\s*\|.*\|\s*$/.test(l);
  const cells = (l: string): string[] => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i]!;
    if (!l.trim()) { i++; continue; }
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
    while (i < lines.length && lines[i]!.trim() && !/^(#{2,4}\s|>|\s*([-*]|\d+\.)\s)/.test(lines[i]!) && !isTable(lines[i])) { p.push(lines[i]!.trim()); i++; }
    out.push(`<p>${inline(p.join(" "), img)}</p>`);
  }
  return out.join("\n");
}
