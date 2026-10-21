#!/usr/bin/env node
/**
 * build-blog-pages.mjs — ブログ (クラフトで発見した事のエッセイ風のレポート) の静的なページを作る (2026-10-22 オーナー、AdSense の「有用性の低いコンテンツ」への答えも兼ねる)
 *
 * 記事の元は src/data/blog/<slug>.<ja|en>.md (書き方は src/data/blog/README.md)。読み方と Markdown の変換は src/services/blog/blog-md.ts の 1 か所。
 * 出す物: /blog/<slug>/ と /en/blog/<slug>/ (JS 無しで読める HTML・OGP・構造化データ Article・hreflang)、一覧 /blog/・/en/blog/、
 * クラフト台の右の列が読む /blog/index.json (新しい順)、絵 /blog/img/、サイトマップへの追記。見た目は読み物のページ (build-seo-pages.mjs) に合わせる。
 * 両脇に縦長の広告の枠 (ads-page-model。--drafts = 開発版では場所だけ見せる)。
 * シェア (X・Reddit・リンクのコピー・Discord 向けのコピー) と、記事を 1 ページとして数える小さな JS (scripts/_blog-client.js → /blog/blog.js)。
 * OGP の絵は 記事の image → 本文の 1 枚目の図 → 題を描いた絵 (scripts/_blog-og.mjs、/blog/og/<言語>-<slug>.png) の順。記事の下にコメント欄の置き場 (#comments、中身はこれから)。
 *
 *   node scripts/build-blog-pages.mjs [出力先 (既定 dist-web)] [--drafts]
 * 今は開発版 (scripts/deploy-web-dev.mjs) の中でだけ回す (--drafts 付き)。本番の build:web にはまだ入れない (オーナーが記事を読んでから)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";
import { titleCard } from "./_blog-og.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DEV = args.includes("--drafts");
const OUT = resolve(ROOT, args.find((a) => !a.startsWith("--")) ?? "dist-web");
const SRC = resolve(ROOT, "src/data/blog");
const SITE = "https://exiledesk.com";
const API = "https://exiledesk-live.exiledesk.workers.dev"; // 記録の受け口 (src/web/config.ts の WEB_API_BASE と同じ)
const VERSION = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
const M = await bundleEntry(resolve(ROOT, "src/services/blog/blog-md.ts"));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const posts = readdirSync(SRC).filter((f) => f.endsWith(".md")).map((f) => M.parseBlogFile(f, readFileSync(resolve(SRC, f), "utf8"))).filter(Boolean)
  .filter((p) => DEV || !p.meta.draft)
  .sort((a, b) => b.meta.date.localeCompare(a.meta.date) || a.meta.slug.localeCompare(b.meta.slug));
const has = (slug, lang) => posts.some((p) => p.meta.slug === slug && p.meta.lang === lang);

const CSS = `:root{--bg:#0e0c09;--panel:#17130e;--line:#3a3024;--fg:#e8dfcf;--sub:#a99b84;--accent:#e0b062;--link:#f0c878;--mod:#c8c8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.9 "Zen Kaku Gothic New","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif}
header{border-bottom:1px solid var(--line);background:#0a0907}header .in,footer .in{max-width:1280px;margin:0 auto;padding:0 16px}
header .in{display:flex;align-items:center;gap:12px;min-height:52px;flex-wrap:wrap}header a{color:var(--fg);text-decoration:none;font-weight:700;letter-spacing:.04em}
header nav{margin-left:auto;display:flex;gap:14px;font-size:13px;flex-wrap:wrap}header nav a{color:var(--sub);font-weight:400}
.wrap{display:flex;justify-content:center;gap:24px;max-width:1280px;margin:0 auto;padding:0 16px}
.ad{flex:0 0 160px;position:sticky;top:12px;align-self:flex-start;margin-top:24px;min-height:600px}
.ad.dev{display:grid;place-items:center;border:1px dashed #5a4a34;color:var(--sub);font-size:12px;text-align:center}
main{flex:1 1 auto;min-width:0;max-width:760px;padding:24px 0 48px}
h1{font-size:26px;line-height:1.4;margin:0 0 8px;color:var(--accent)}h2{font-size:19px;margin:32px 0 10px;padding-bottom:4px;border-bottom:1px solid var(--line);color:var(--accent)}
h3{font-size:16px;margin:22px 0 6px}h4{font-size:15px;margin:18px 0 4px;color:var(--sub)}a{color:var(--link)}p{margin:10px 0}
.meta{color:var(--sub);font-size:13px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}.tag{border:1px solid var(--line);border-radius:4px;padding:0 6px;font-size:12px}
.draft{background:#5a2a12;color:#ffd7a8;border-radius:4px;padding:0 6px;font-size:12px}
.cta{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.cta a{display:inline-block;padding:8px 16px;border:1px solid #8a6a32;border-radius:6px;background:#2a1f12;color:var(--accent);text-decoration:none;font-weight:700}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 12px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--sub);font-weight:400}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
code{background:#211a12;border-radius:3px;padding:0 4px;font-size:.92em}blockquote{margin:12px 0;padding:2px 14px;border-left:3px solid #8a6a32;color:var(--sub)}
figure{margin:16px 0}figure img,main img{max-width:100%;height:auto;border-radius:6px}figcaption{color:var(--sub);font-size:13px;margin-top:4px}
ul.posts{list-style:none;padding:0;margin:12px 0}ul.posts li{padding:12px 0;border-bottom:1px solid var(--line)}ul.posts a.t{font-size:17px;font-weight:700;text-decoration:none}
ul.posts p{margin:4px 0 0;color:var(--sub);font-size:14px}
.share{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:10px 0;font-size:13px;color:var(--sub)}.share a,.share button{font:inherit;font-size:13px;padding:3px 10px;border:1px solid var(--line);border-radius:5px;background:#17130e;color:var(--fg);text-decoration:none;cursor:pointer}
.share a:hover,.share button:hover{border-color:#8a6a32}.share [data-done]{color:var(--accent);border-color:#8a6a32}#comments{margin-top:32px}
.box{margin:16px 0;padding:10px 16px;border-radius:8px;border:1px solid;border-left-width:4px}.box>p.box-h{margin:0 0 4px;font-weight:700;font-size:14px;letter-spacing:.04em}.box>:last-child{margin-bottom:2px}
.box.summary{background:#241b0e;border-color:#8a6a32}.box.summary>.box-h{color:#e0b062}.box.note{background:#2a1212;border-color:#8a3a32}.box.note>.box-h{color:#f08a7a}.box.tip{background:#122218;border-color:#3f7a4c}.box.tip>.box-h{color:#8fd18a}
.chart svg{display:block;width:100%;height:auto;background:#120f0b;border:1px solid var(--line);border-radius:8px}
.say{display:flex;gap:10px;align-items:flex-start;margin:14px 0}.say.right{flex-direction:row-reverse}.say img{flex:0 0 64px;width:64px;height:64px;border-radius:50%;border:2px solid var(--line);background:#1a150f;object-fit:cover}
.bubble{position:relative;max-width:85%;padding:8px 14px;border-radius:12px;background:#1d1812;border:1px solid var(--line)}.bubble p{margin:4px 0}.bubble .who{margin:0;font-size:12px;font-weight:700}
.say.metan .bubble{border-color:#8a4a78}.say.metan .who{color:#e58fb6}.say.zundamon .bubble{border-color:#4f7a3a}.say.zundamon .who{color:#8fd18a}
.credit{color:var(--sub);font-size:12px;margin-top:20px}.crumb{font-size:12px;color:var(--sub);margin-bottom:8px}
footer{border-top:1px solid var(--line);color:var(--sub);font-size:12px}footer .in{padding-top:14px;padding-bottom:20px}
@media (max-width:1023px){.ad{display:none}}@media (max-width:767px){body{font-size:15px}h1{font-size:21px}}`;

const L = {
  ja: {
    prefix: "", app: "/", blog: "ブログ",
    nav: `<a href="/">クラフトステージ</a><a href="/blog/">ブログ</a><a href="/craft-basics">クラフト入門</a><a href="/bases/">ベース一覧</a><a href="/about">ExileDesk について</a>`,
    foot: `ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。記事の数字はゲームのデータ・poe2db・Craft of Exile とエンジンの計算を元にした物で、結果を保証するものではありません。 · <a href="/privacy">プライバシーポリシー</a> · <a href="/contact">お問い合わせ</a>`,
    listTitle: "ExileDesk のブログ — PoE2 のクラフトで分かった事", listDesc: "Path of Exile 2 のクラフトを ExileDesk のエンジンで回して分かった事のレポート。確率・重み・手の順番を、出どころと一緒に。",
    listIntro: "Path of Exile 2 のクラフトを、ExileDesk のエンジンで実際に回して分かった事を書いています。数字には台本と出どころ (poe2db・Craft of Exile) を添えています。",
    tree: "このツリーで試す", craft: "クラフト台で打つ", more: "ほかの記事", updated: "更新", draft: "下書き", none: "まだ記事はありません。", ad: "広告 (開発版だけ)",
    share: "シェア", copyLink: "リンクをコピー", copyDiscord: "Discord 用にコピー", copied: "コピーしました",
  },
  en: {
    prefix: "/en", app: "/?lang=en", blog: "Blog",
    nav: `<a href="/?lang=en">Craft Stage</a><a href="/en/blog/">Blog</a><a href="/en/craft-basics">Crafting basics</a><a href="/en/bases/">Bases</a>`,
    foot: `ExileDesk is an unofficial fan site. Path of Exile 2 and its images and names belong to Grinding Gear Games. Numbers in these posts come from game data, poe2db, Craft of Exile and the ExileDesk engine and are not guaranteed. · <a href="/privacy">Privacy policy (Japanese)</a>`,
    listTitle: "ExileDesk blog — what we found crafting in PoE2", listDesc: "Reports on Path of Exile 2 crafting, run through the ExileDesk engine: chances, weights and step order, with sources.",
    listIntro: "Findings from running Path of Exile 2 crafts through the ExileDesk engine. Every number comes with its script and sources (poe2db, Craft of Exile).",
    tree: "Try it in the tree", craft: "Craft it on the Craft Stage", more: "More posts", updated: "Updated", draft: "Draft", none: "No posts yet.", ad: "Ad (dev only)",
    share: "Share", copyLink: "Copy link", copyDiscord: "Copy for Discord", copied: "Copied",
  },
};
const adBox = (l) => (DEV ? `<aside class="ad dev">${L[l].ad}<br />160 × 600</aside>` : `<aside class="ad"></aside>`);
const imgUrl = (src) => (/^(https?:|\/)/.test(src) ? src : `/blog/${src.replace(/^\.?\//, "")}`);

/** シェアの帯 (X・Reddit はリンク、コピーの 2 つは JS がある時だけ出る) */
function shareBar(lang, title, url) {
  const l = L[lang];
  const q = encodeURIComponent;
  return `<p class="share"><span>${l.share}</span><a data-share="x" href="https://x.com/intent/post?text=${q(title)}&amp;url=${q(url)}" target="_blank" rel="noopener">X</a><a data-share="reddit" href="https://www.reddit.com/submit?url=${q(url)}&amp;title=${q(title)}" target="_blank" rel="noopener">Reddit</a><button type="button" data-share="copy" data-copy="${esc(url)}" hidden>${l.copyLink}</button><button type="button" data-share="discord" data-copy="${esc(`${title}\n${url}`)}" hidden>${l.copyDiscord}</button></p>`;
}
/** 記事の OGP の絵: 頭の image → 本文の 1 枚目の図 → 題を描いた絵 → サイトの既定 */
function ogImageOf(p) {
  const m = p.meta;
  const first = /!\[[^\]]*\]\(([^)\s]+)\)/.exec(p.body)?.[1];
  if (m.image || first) return `${SITE}${imgUrl(m.image || first)}`;
  mkdirSync(resolve(OUT, "blog", "og"), { recursive: true });
  const name = `${m.lang}-${m.slug}.png`;
  return titleCard({ title: m.title, date: m.date, lang: m.lang, out: resolve(OUT, "blog", "og", name) }) ? `${SITE}/blog/og/${name}` : `${SITE}/web/og.png`;
}
/** 数える・コピーの JS (scripts/_blog-client.js)。slug が空 = 一覧 */
const clientTag = (lang, slug) => `<script defer src="/blog/blog.js" data-slug="${esc(slug)}" data-lang="${lang}" data-api="${API}" data-v="${VERSION}" data-copied="${esc(L[lang].copied)}"${DEV ? ' data-dev="1"' : ""}></script>`;

function page(lang, { title, desc, path, alt, og, ld, body, slug = "" }) {
  const l = L[lang];
  const other = lang === "ja" ? "en" : "ja";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}${l.prefix}${path}" />
<link rel="alternate" hreflang="${lang}" href="${SITE}${l.prefix}${path}" />
${alt ? `<link rel="alternate" hreflang="${other}" href="${SITE}${L[other].prefix}${path}" />\n` : ""}<meta property="og:type" content="${og.type}" />
<meta property="og:site_name" content="ExileDesk" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:url" content="${SITE}${l.prefix}${path}" />
<meta property="og:image" content="${esc(og.image)}" />
<meta property="og:locale" content="${lang === "ja" ? "ja_JP" : "en_US"}" />
<meta name="twitter:card" content="summary_large_image" />
${og.published ? `<meta property="article:published_time" content="${og.published}" />\n<meta property="article:modified_time" content="${og.modified}" />\n` : ""}<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n` : ""}${clientTag(lang, slug)}
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1993030721214430" crossorigin="anonymous"></script>
</head>
<body>
<header><div class="in"><a href="${l.app}">ExileDesk</a><nav>${l.nav}</nav></div></header>
<div class="wrap">${adBox(lang)}<main>
${body}
</main>${adBox(lang)}</div>
<footer><div class="in">${l.foot}</div></footer>
</body>
</html>
`;
}

const urls = [];
const index = { ja: [], en: [] };
for (const lang of ["ja", "en"]) {
  const l = L[lang];
  const mine = posts.filter((p) => p.meta.lang === lang);
  const dir = resolve(OUT, `${l.prefix.slice(1)}${l.prefix ? "/" : ""}blog`);
  mkdirSync(dir, { recursive: true });
  for (const p of mine) {
    const m = p.meta;
    const path = `/blog/${m.slug}/`;
    const image = ogImageOf(p);
    const url = `${SITE}${l.prefix}${path}`;
    const cta = m.tree || m.craft ? `<p class="cta">${m.tree ? `<a href="${esc(m.tree)}">${l.tree}</a>` : ""}${m.craft ? `<a href="${esc(m.craft)}">${l.craft}</a>` : ""}</p>` : "";
    const others = mine.filter((x) => x.meta.slug !== m.slug).slice(0, 5);
    const ld = {
      "@context": "https://schema.org", "@type": "Article", headline: m.title, description: m.description, image: [image],
      datePublished: m.date, dateModified: m.updated, inLanguage: lang, mainEntityOfPage: `${SITE}${l.prefix}${path}`,
      author: { "@type": "Organization", name: "ExileDesk", url: SITE }, publisher: { "@type": "Organization", name: "ExileDesk", logo: { "@type": "ImageObject", url: `${SITE}/favicon.png` } },
      ...(m.tags.length ? { keywords: m.tags.join(", ") } : {}),
    };
    const body = `<p class="crumb"><a href="${l.prefix}/blog/">${l.blog}</a></p>
<article>
<h1>${esc(m.title)}</h1>
<p class="meta"><time datetime="${m.date}">${m.date}</time>${m.updated !== m.date ? `<span>${l.updated} <time datetime="${m.updated}">${m.updated}</time></span>` : ""}${m.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${m.draft ? `<span class="draft">${l.draft}</span>` : ""}</p>
${shareBar(lang, m.title, url)}
${cta}
${M.blogHtml(p.body, imgUrl, lang)}
${cta}
${shareBar(lang, m.title, url)}
${/^:::\s*(metan|zundamon)\b/m.test(p.body) ? `<p class="credit">${lang === "ja" ? "キャラの絵: 四国めたん・ずんだもん 立ち絵素材 (坂本アヒル)" : "Character art: Shikoku Metan / Zundamon standing art by Sakamoto Ahiru"}</p>` : ""}
</article>
<!-- コメント欄の置き場 (これから: Reddit 風、サーバーは分析君・画面はジン部長。前の掲示板 archive/board-2026-10-16 の作りを戻して使う) -->
<section id="comments" data-slug="${esc(m.slug)}" data-lang="${lang}"></section>
${others.length ? `<h2>${l.more}</h2><ul class="posts">${others.map((x) => `<li><a class="t" href="${l.prefix}/blog/${x.meta.slug}/">${esc(x.meta.title)}</a><p>${esc(x.meta.date)} · ${esc(x.meta.description)}</p></li>`).join("")}</ul>` : ""}`;
    mkdirSync(resolve(dir, m.slug), { recursive: true });
    writeFileSync(resolve(dir, m.slug, "index.html"), page(lang, { title: `${m.title} | ExileDesk`, desc: m.description, path, alt: has(m.slug, lang === "ja" ? "en" : "ja"), og: { type: "article", image, published: m.date, modified: m.updated }, ld, body, slug: m.slug }));
    if (!m.draft) urls.push(`${l.prefix}${path}`);
    index[lang].push({ slug: m.slug, title: m.title, date: m.date, href: `${l.prefix}${path}`, draft: m.draft });
  }
  const list = mine.length ? `<ul class="posts">${mine.map((x) => `<li><a class="t" href="${l.prefix}/blog/${x.meta.slug}/">${esc(x.meta.title)}</a>${x.meta.draft ? ` <span class="draft">${l.draft}</span>` : ""}<p>${esc(x.meta.date)} · ${esc(x.meta.description)}</p></li>`).join("")}</ul>` : `<p>${l.none}</p>`;
  const ld = { "@context": "https://schema.org", "@type": "Blog", name: l.listTitle, url: `${SITE}${l.prefix}/blog/`, inLanguage: lang };
  writeFileSync(resolve(dir, "index.html"), page(lang, { title: l.listTitle, desc: l.listDesc, path: "/blog/", alt: true, og: { type: "website", image: `${SITE}/web/og.png` }, ld, body: `<h1>${l.blog}</h1>\n<p>${l.listIntro}</p>\n${list}` }));
  urls.push(`${l.prefix}/blog/`);
  console.log(`${lang}: 記事 ${mine.length} 本 + 一覧`);
}
// クラフト台の右の列が読む (新しい順、日本語・英語)
writeFileSync(resolve(OUT, "blog", "index.json"), JSON.stringify(index));
cpSync(resolve(ROOT, "scripts/_blog-client.js"), resolve(OUT, "blog", "blog.js"));
cpSync(resolve(SRC, "chars"), resolve(OUT, "blog", "chars"), { recursive: true });
if (existsSync(resolve(SRC, "img"))) cpSync(resolve(SRC, "img"), resolve(OUT, "blog", "img"), { recursive: true, filter: (f) => !f.endsWith(".gitkeep") });

// サイトマップ (出力先にあれば足す。下書きは入れない)
const sm = resolve(OUT, "sitemap.xml");
if (existsSync(sm)) {
  const xml = readFileSync(sm, "utf8");
  const add = urls.filter((u) => !xml.includes(`<loc>${SITE}${u}</loc>`)).map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n");
  if (add) writeFileSync(sm, xml.replace("</urlset>", `${add}\n</urlset>`));
}
console.log(`ブログ → ${OUT}/blog (サイトマップ +${urls.length})`);
