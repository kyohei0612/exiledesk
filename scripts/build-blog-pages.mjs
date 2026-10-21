#!/usr/bin/env node
/**
 * build-blog-pages.mjs — ブログ (クラフトで発見した事のエッセイ風のレポート) の静的なページを作る (2026-10-22 オーナー、AdSense の「有用性の低いコンテンツ」への答えも兼ねる)
 *
 * 記事の元は src/data/blog/<slug>.<ja|en>.md (書き方は src/data/blog/README.md)。読み方と Markdown の変換は src/services/blog/blog-md.ts の 1 か所。
 * 出す物: /blog/<slug>/ と /en/blog/<slug>/ (JS 無しで読める HTML・OGP・構造化データ Article・hreflang)、一覧 /blog/・/en/blog/、
 * クラフト台の右の列が読む /blog/index.json (新しい順)、絵 /blog/img/、サイトマップへの追記。見た目は読み物のページ (build-seo-pages.mjs) に合わせる。
 * 見た目は白い紙面 (2026-10-22 オーナー「記事は note 準拠、後ろが白い方が読みやすい」): 本文の幅 640px・18px・行間 2、本文の横には何も置かない。
 * 広告は note のように本文の下に横長のバナー 1 つ + 長い記事 (見出し 4 つ以上) は真ん中の見出しの前に 1 つ (--drafts = 開発版では見本の箱)。
 * 見本の記事 (slug sample) は一覧・関連・右の列・サイトマップに出さない (開発版で部品を見るためのページだけ作る)。
 * シェア (X・Reddit・リンクのコピー・Discord 向けのコピー) と、記事を 1 ページとして数える小さな JS (scripts/_blog-client.js → /blog/blog.js)。
 * OGP の絵は 記事の image → img/<slug>-og.<言語>.png → 本文の 1 枚目の (svg でない) 図 → 題を描いた絵 (scripts/_blog-og.mjs、/blog/og/<言語>-<slug>.png) の順。記事の下にコメント欄の置き場 (#comments、中身はこれから)。
 *
 *   node scripts/build-blog-pages.mjs [出力先 (既定 dist-web)] [--drafts] [--as-published]
 * --as-published: 下書きを外した時と同じに作る (本番で draft を一度に外す前に、サイトマップ・一覧に全部入るかを確かめる用)
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
const AS_PUBLISHED = args.includes("--as-published");
const OUT = resolve(ROOT, args.find((a) => !a.startsWith("--")) ?? "dist-web");
const SRC = resolve(ROOT, "src/data/blog");
const SITE = "https://exiledesk.com";
const API = "https://exiledesk-live.exiledesk.workers.dev"; // 記録の受け口 (src/web/config.ts の WEB_API_BASE と同じ)
const VERSION = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")).version;
const M = await bundleEntry(resolve(ROOT, "src/services/blog/blog-md.ts"));

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const posts = readdirSync(SRC).filter((f) => f.endsWith(".md")).map((f) => M.parseBlogFile(f, readFileSync(resolve(SRC, f), "utf8"))).filter(Boolean)
  .map((p) => (AS_PUBLISHED ? { ...p, meta: { ...p.meta, draft: false } } : p))
  .filter((p) => DEV || !p.meta.draft)
  .sort((a, b) => b.meta.date.localeCompare(a.meta.date) || a.meta.slug.localeCompare(b.meta.slug));
const has = (slug, lang) => posts.some((p) => p.meta.slug === slug && p.meta.lang === lang);
/** 一覧・関連・右の列・サイトマップに出す記事 (見本 sample は出さない) */
const listed = (p) => p.meta.slug !== "sample";

/**
 * 色の決め (白い紙面。記事の部品と図はこの色に合わせる。README の「色」に同じ表)
 *   --ink 本文 #2b2b2b / --sub 補足 #6b6b6b / --line 線 #e6e6e6 / --link リンク #b5651d / --accent 見出しの印 #c8922a
 *   箱: まとめ 地 #fbf5e6・縁 #c8922a、注意 地 #fdeeee・縁 #d9534f、ヒント 地 #ecf6ee・縁 #4e9a5e
 *   図の系列: #c8922a #2f7fc1 #3c9a4e #c2507e #7b5cc4
 */
const CSS = `:root{--bg:#fff;--ink:#2b2b2b;--sub:#6b6b6b;--line:#e6e6e6;--link:#b5651d;--accent:#c8922a;--soft:#f6f6f4}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/2 "Yu Gothic Medium","YuGothic","Hiragino Sans","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;-webkit-text-size-adjust:100%}
header{border-bottom:1px solid var(--line);background:#fff}header .in{max-width:960px;margin:0 auto;padding:0 20px;display:flex;align-items:center;gap:12px;min-height:48px;flex-wrap:wrap}
header a{color:var(--ink);text-decoration:none;font-weight:700;letter-spacing:.04em;font-size:15px}header nav{margin-left:auto;display:flex;gap:14px;font-size:12px;flex-wrap:wrap}header nav a{color:var(--sub);font-weight:400;font-size:12px}
main{max-width:640px;margin:0 auto;padding:40px 20px 56px}
h1{font-size:30px;line-height:1.5;margin:0 0 14px;font-weight:700}h2{font-size:24px;line-height:1.6;margin:56px 0 18px;font-weight:700}
h3{font-size:20px;line-height:1.6;margin:40px 0 12px;font-weight:700}h4{font-size:18px;margin:28px 0 8px;font-weight:700}
a{color:var(--link)}p{margin:0 0 2em}ul,ol{margin:0 0 2em;padding-left:1.4em}
/* 折り返し: 行頭に 、。」を置かない (行頭禁則)・見出しは行をそろえる。英語は長い語のはみ出しだけ止める。
   本文の文節折り (auto-phrase)・最後の行の調整 (pretty) は 2026-10-22 オーナー「文の途中で折れると字が滑る」で外した (word-break は既定) */
html[lang=ja] main :is(p,li,figcaption,.bubble){word-break:normal;line-break:strict}html[lang=ja] main :is(h1,h2,h3,h4){word-break:auto-phrase;line-break:strict;text-wrap:balance}
html[lang=en] main{overflow-wrap:anywhere}html[lang=en] main :is(h1,h2,h3,h4){text-wrap:balance}li{margin:.2em 0}strong{font-weight:700}
.meta{color:var(--sub);font-size:14px;line-height:1.6;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;margin:0 0 14px}.tag{color:var(--sub);font-size:13px}.tag::before{content:"#"}
.draft{background:#fff1e0;color:#a5521a;border-radius:4px;padding:0 6px;font-size:12px}
.backlink{display:inline-block;margin:0 0 14px;font-size:14px;line-height:1.6;color:var(--ink);text-decoration:none;padding:4px 12px 4px 8px;border-radius:999px;background:var(--soft)}.backlink:hover{color:var(--link)}
.crumb{font-size:13px;line-height:1.6;color:var(--sub);margin:0 0 10px}.crumb a{color:var(--sub)}
.share{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 36px;font-size:13px;line-height:1.6;color:var(--sub)}
.share a,.share button{font:inherit;font-size:13px;padding:4px 12px;border:1px solid var(--line);border-radius:999px;background:#fff;color:var(--ink);text-decoration:none;cursor:pointer}
.share a:hover,.share button:hover{border-color:#bbb}.share [data-done]{color:var(--accent);border-color:var(--accent)}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:40px 0 0;line-height:1.6}.cta a{display:inline-block;padding:12px 22px;border-radius:8px;background:#2b2b2b;color:#fff;text-decoration:none;font-weight:700;font-size:15px}.cta a+a{background:#fff;color:var(--ink);border:1px solid #cfcfcf}
.tbl{overflow-x:auto;margin:0 0 1.6em}table{width:100%;border-collapse:collapse;font-size:15px;line-height:1.7}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--sub);font-weight:700;font-size:13px}.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
code{background:var(--soft);border-radius:3px;padding:1px 5px;font-size:.88em}blockquote{margin:0 0 1.6em;padding:2px 0 2px 18px;border-left:3px solid var(--line);color:var(--sub)}
figure{margin:32px 0}figure img,main img{display:block;width:100%;height:auto}figcaption{color:var(--sub);font-size:13px;line-height:1.6;margin-top:8px;text-align:center}
.chart svg{display:block;width:100%;height:auto}
details.fold{margin:0 0 2em;border:1px solid var(--line);border-radius:8px;padding:0 18px}details.fold>summary{cursor:pointer;list-style:none;padding:12px 0;font-weight:700;color:var(--ink)}details.fold>summary::-webkit-details-marker{display:none}details.fold>summary::before{content:"▶";display:inline-block;width:1.4em;color:var(--sub);font-size:.8em}details.fold[open]>summary::before{content:"▼"}details.fold[open]>summary{border-bottom:1px solid var(--line);margin-bottom:12px}details.fold>:last-child{margin-bottom:16px}
details.box.fold{padding:4px 20px}details.box.fold>summary{border-bottom:0;margin-bottom:0;padding:10px 0;font-size:14px}details.box.fold[open]>summary{margin-bottom:6px}
.box{margin:0 0 1.6em;padding:16px 20px;border-radius:8px;border-left:4px solid;font-size:16px;line-height:1.9}.box>p.box-h{margin:0 0 6px;font-weight:700;font-size:14px;letter-spacing:.04em}.box>:last-child{margin-bottom:0}
.box.summary{background:#fbf5e6;border-color:#c8922a}.box.summary>.box-h{color:#9a6b12}.box.note{background:#fdeeee;border-color:#d9534f}.box.note>.box-h{color:#b8322d}.box.tip{background:#ecf6ee;border-color:#4e9a5e}.box.tip>.box-h{color:#2f7a3f}
.say{display:flex;gap:12px;align-items:flex-start;margin:0 0 1.6em}.say.right{flex-direction:row-reverse}.say img{flex:0 0 56px;width:56px;height:56px;border-radius:50%;background:var(--soft);object-fit:cover}
.bubble{max-width:82%;padding:10px 16px;border-radius:14px;background:var(--soft);font-size:16px;line-height:1.8}.bubble p,.bubble ul{margin:4px 0}.bubble .who{margin:0;font-size:12px;font-weight:700;line-height:1.4}
.say.metan .who{color:#b04a86}.say.zundamon .who{color:#3c8a2e}
.adbn{margin:48px 0;line-height:1.6}.adbn.dev{display:grid;place-items:center;min-height:120px;background:#f3f3f1;color:#9a9a9a;font-size:12px;border-radius:6px}
.author{display:flex;gap:14px;align-items:center;margin:32px 0;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);line-height:1.6}.author b{display:block;font-size:15px}.author span{color:var(--sub);font-size:13px}.author img{width:48px;height:48px;border-radius:50%}
.credit{color:var(--sub);font-size:12px;line-height:1.6;margin:16px 0 0}
.more h2{font-size:18px;margin:48px 0 8px}ul.posts{list-style:none;padding:0;margin:0}ul.posts li{padding:16px 0;border-bottom:1px solid var(--line);line-height:1.6}
ul.posts a.t{font-size:17px;font-weight:700;text-decoration:none;color:var(--ink)}ul.posts a.t:hover{color:var(--link)}main.wide{max-width:1240px}
.lhead{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:8px 0 20px;line-height:1.6}.sort{display:flex;gap:8px}.sort span{padding:4px 14px;border-radius:999px;background:var(--ink);color:#fff;font-size:13px;font-weight:700}
.tagf{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px}.tagf a{padding:3px 12px;border-radius:999px;border:1px solid var(--line);color:var(--sub);font-size:13px;text-decoration:none}.tagf a.on,.tagf a:hover{border-color:var(--ink);color:var(--ink)}
.cards{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:40px 28px}.cards li{margin:0;line-height:1.6}
.cards a{display:block;text-decoration:none;color:var(--ink)}.cards img{display:block;width:100%;height:auto;aspect-ratio:1200/630;object-fit:contain;image-rendering:auto;border-radius:10px;background:var(--soft);border:1px solid var(--line)}
.cards .ct{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin:14px 0 8px;font-size:18px;font-weight:700;line-height:1.55}.cards a:hover .ct{color:var(--link)}.cards time{color:var(--sub);font-size:13px}
@media (max-width:1023px){.cards{grid-template-columns:repeat(2,1fr);gap:32px 20px}}@media (max-width:767px){.cards{grid-template-columns:1fr;gap:32px}.cards .ct{font-size:17px}.tagf{margin-left:0}}
ul.posts p{margin:6px 0 0;color:var(--sub);font-size:14px}
#comments{margin-top:32px}
footer{border-top:1px solid var(--line);color:var(--sub);font-size:12px;line-height:1.7;background:#fafafa}footer .in{max-width:960px;margin:0 auto;padding:16px 20px 24px}footer .fnav{margin:0 0 6px}footer .fnav a{color:var(--sub)}
@media (max-width:767px){body{font-size:16px;line-height:1.9}main{padding:28px 22px 48px}h1{font-size:24px}h2{font-size:21px;margin-top:44px}h3{font-size:18px}.say img{flex-basis:44px;width:44px;height:44px}}`;

const L = {
  ja: {
    prefix: "", app: "/", blog: "ブログ",
    nav: `<a href="/">クラフトステージ</a><a href="/blog/">ブログ</a><a href="/craft-basics">クラフト入門</a><a href="/bases/">ベース一覧</a><a href="/about">ExileDesk について</a>`,
    foot: `<p class="fnav"><a href="/">クラフトステージ</a> · <a href="/guide">使い方</a> · <a href="/craft-basics">クラフト入門</a> · <a href="/bases/">ベース一覧</a> · <a href="/blog/">ブログ</a> · <a href="/about">ExileDesk について</a> · <a href="/privacy">プライバシーポリシー</a> · <a href="/contact">お問い合わせ</a> · <a href="/en/about" hreflang="en">English</a></p>ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。記事の数字はゲームのデータ・poe2db・Craft of Exile とエンジンの計算を元にした物で、結果を保証するものではありません。`,
    listTitle: "ExileDesk のブログ — PoE2 のクラフトで分かった事", listDesc: "Path of Exile 2 のクラフトを ExileDesk のエンジンで回して分かった事のレポート。確率・重み・手の順番を、出どころと一緒に。",
    listIntro: "Path of Exile 2 のクラフトを、ExileDesk のエンジンで実際に回して分かった事を書いています。数字には台本と出どころ (poe2db・Craft of Exile) を添えています。",
    tree: "このツリーで試す", craft: "クラフト台で打つ", more: "ほかの記事", updated: "更新", draft: "下書き", none: "まだ記事はありません。", ad: "広告 (開発版だけ)",
    author: "Path of Exile 2 のクラフトをエンジンで回して確かめています", backCraft: "← クラフトに戻る", backSim: "← シミュレーターに戻る", share: "シェア", copyLink: "リンクをコピー", copyDiscord: "Discord 用にコピー", copied: "コピーしました",
  },
  en: {
    prefix: "/en", app: "/?lang=en", blog: "Blog",
    nav: `<a href="/?lang=en">Craft Stage</a><a href="/en/blog/">Blog</a><a href="/en/craft-basics">Crafting basics</a><a href="/en/bases/">Bases</a>`,
    foot: `<p class="fnav"><a href="/?lang=en">Craft Stage</a> · <a href="/en/craft-basics">Crafting basics</a> · <a href="/en/bases/">Bases</a> · <a href="/en/blog/">Blog</a> · <a href="/en/about">About</a> · <a href="/en/privacy">Privacy Policy</a> · <a href="/en/contact">Contact</a> · <a href="/blog/" hreflang="ja">日本語</a></p>ExileDesk is an unofficial fan site. Path of Exile 2 and its images and names belong to Grinding Gear Games. Numbers in these posts come from game data, poe2db, Craft of Exile and the ExileDesk engine and are not guaranteed.`,
    listTitle: "ExileDesk blog — what we found crafting in PoE2", listDesc: "Reports on Path of Exile 2 crafting, run through the ExileDesk engine: chances, weights and step order, with sources.",
    listIntro: "Findings from running Path of Exile 2 crafts through the ExileDesk engine. Every number comes with its script and sources (poe2db, Craft of Exile).",
    tree: "Try it in the tree", craft: "Craft it on the Craft Stage", more: "More posts", updated: "Updated", draft: "Draft", none: "No posts yet.", ad: "Ad (dev only)",
    author: "Testing Path of Exile 2 crafting by running it through the engine", backCraft: "← Back to Craft Stage", backSim: "← Back to Simulator", share: "Share", copyLink: "Copy link", copyDiscord: "Copy for Discord", copied: "Copied",
  },
};
/** 横長のバナーの枠 (AdSense が通るまで本番は空、開発版は見本の箱)。ボタン・リンクから離す (上下 48px) */
const adBanner = (l) => (DEV ? `<aside class="adbn dev">${L[l].ad} · 728 × 90 / 320 × 100</aside>` : `<aside class="adbn"></aside>`);
/** 長い記事 (見出し 4 つ以上) は真ん中の見出しの前にもう 1 つ */
function withMidAd(html, lang) {
  const at = [...html.matchAll(/<h2>/g)].map((m) => m.index);
  if (at.length < 4) return html;
  const i = at[Math.floor(at.length / 2)];
  return html.slice(0, i) + adBanner(lang) + "\n" + html.slice(i);
}
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
  // 記事編集長が作る目を引く絵 (img/<slug>-og.<言語>.png → img/<slug>-og.png)。X・Discord は SVG を出さないので、本文の図は svg 以外だけ
  const own = [`${m.slug}-og.${m.lang}.png`, `${m.slug}-og.png`].find((n) => existsSync(resolve(SRC, "img", n)));
  const first = [...p.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((x) => x[1]).find((src) => !/\.svg$/i.test(src));
  const pick = m.image || (own ? `img/${own}` : null) || first;
  if (pick) return `${SITE}${imgUrl(pick)}`;
  mkdirSync(resolve(OUT, "blog", "og"), { recursive: true });
  const name = `${m.lang}-${m.slug}.png`;
  return titleCard({ title: m.title, date: m.date, lang: m.lang, out: resolve(OUT, "blog", "og", name) }) ? `${SITE}/blog/og/${name}` : `${SITE}/web/og.png`;
}
/** 数える・コピーの JS (scripts/_blog-client.js)。slug が空 = 一覧 */
const clientTag = (lang, slug) => `<script defer src="/blog/blog.js" data-slug="${esc(slug)}" data-lang="${lang}" data-api="${API}" data-v="${VERSION}" data-copied="${esc(L[lang].copied)}"${DEV ? ' data-dev="1"' : ""}></script>`;

function page(lang, { title, desc, path, alt, og, ld, body, slug = "", wide = false }) {
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
<style>${CSS}</style>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n` : ""}${clientTag(lang, slug)}
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1993030721214430" crossorigin="anonymous"></script>
</head>
<body>
<header><div class="in"><a href="${l.app}">ExileDesk</a><nav>${l.nav}</nav></div></header>
<main${wide ? ' class="wide"' : ""}>
<a class="backlink" data-backlink hidden href="${l.app}" data-craft="${l.backCraft}" data-sim="${l.backSim}">${l.backCraft}</a>
${body}
</main>
<footer><div class="in">${l.foot}</div></footer>
</body>
</html>
`;
}

/** 一覧の下のタグごとの節 (カテゴリ。2 本以上の記事が付いたタグだけ) */
function tagSections(lang, list) {
  const l = L[lang];
  const by = new Map();
  for (const p of list) for (const t of p.meta.tags) by.set(t, [...(by.get(t) ?? []), p]);
  const tags = [...by].filter(([, ps]) => ps.length >= 2).sort((a, b) => b[1].length - a[1].length);
  if (!tags.length) return "";
  return `<h2>${lang === "ja" ? "タグごと" : "By tag"}</h2>` + tags.map(([t, ps]) => `<h3 id="tag-${encodeURIComponent(t)}">#${esc(t)} (${ps.length})</h3><ul>${ps.map((x) => `<li><a href="${l.prefix}/blog/${x.meta.slug}/">${esc(x.meta.title)}</a></li>`).join("")}</ul>`).join("");
}

const urls = [];
const index = { ja: [], en: [] };
/** 記事ごとのサムネ (OGP の絵のパス)。一覧のカードが使う */
const thumbs = new Map();
/** 一覧のカード (16:9 のサムネ・題 3 行・公開日)。data-tags は blog.js のタグの絞り込み用 (JS 無しでは全部出る) */
function cards(lang, list) {
  const l = L[lang];
  return `<ul class="cards">${list.map((x) => `<li data-tags="${esc(x.meta.tags.join("|"))}"><a href="${l.prefix}/blog/${x.meta.slug}/"><img src="${esc(thumbs.get(`${lang}:${x.meta.slug}`) ?? "/web/og.png")}" alt="" width="1200" height="630" loading="lazy" decoding="async" /><span class="ct">${esc(x.meta.title)}</span><time datetime="${x.meta.date}">${x.meta.date}</time>${x.meta.draft ? ` <span class="draft">${l.draft}</span>` : ""}</a></li>`).join("")}</ul>`;
}
/** 一覧の上の札: 並べ替えは「新着」だけ (人気・急上昇は数字が無い)、右にタグで絞る札 (3 本以上の記事が付いたタグ、多い順に 8 つ。JS 無しでは下のタグごとの節へ飛ぶ) */
function listHead(lang, list) {
  const by = new Map();
  for (const p of list) for (const t of p.meta.tags) by.set(t, (by.get(t) ?? 0) + 1);
  const tags = [...by].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="lhead"><div class="sort"><span>${lang === "ja" ? "新着" : "Latest"}</span></div>${tags.length ? `<nav class="tagf" aria-label="tags"><a href="#" class="on" data-tagf="">${lang === "ja" ? "すべて" : "All"}</a>${tags.map(([t]) => `<a href="#tag-${encodeURIComponent(t)}" data-tagf="${esc(t)}">#${esc(t)}</a>`).join("")}</nav>` : ""}</div>`;
}
for (const lang of ["ja", "en"]) {
  const l = L[lang];
  const mine = posts.filter((p) => p.meta.lang === lang);
  const dir = resolve(OUT, `${l.prefix.slice(1)}${l.prefix ? "/" : ""}blog`);
  mkdirSync(dir, { recursive: true });
  for (const p of mine) {
    const m = p.meta;
    const path = `/blog/${m.slug}/`;
    const image = ogImageOf(p);
    thumbs.set(`${lang}:${m.slug}`, image.replace(SITE, ""));
    const url = `${SITE}${l.prefix}${path}`;
    const cta = m.tree || m.craft ? `<p class="cta">${m.tree ? `<a href="${esc(m.tree)}">${l.tree}</a>` : ""}${m.craft ? `<a href="${esc(m.craft)}">${l.craft}</a>` : ""}</p>` : "";
    const others = mine.filter((x) => x.meta.slug !== m.slug && listed(x)).slice(0, 5);
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
${withMidAd(M.blogHtml(p.body, imgUrl, lang), lang)}
${cta}
${adBanner(lang)}
${shareBar(lang, m.title, url)}
<div class="author"><img src="/favicon.png" alt="" width="48" height="48" /><div><b>ExileDesk</b><span>${l.author}</span></div></div>
${/^:::\s*(metan|zundamon)\b/m.test(p.body) ? `<p class="credit">${lang === "ja" ? "キャラの絵: 四国めたん・ずんだもん 立ち絵素材 (坂本アヒル)" : "Character art: Shikoku Metan / Zundamon standing art by Sakamoto Ahiru"}</p>` : ""}
</article>
<!-- コメント欄の置き場 (これから: Reddit 風、サーバーは分析君・画面はジン部長。前の掲示板 archive/board-2026-10-16 の作りを戻して使う) -->
<section id="comments" data-slug="${esc(m.slug)}" data-lang="${lang}"></section>
${others.length ? `<section class="more"><h2>${l.more}</h2><ul class="posts">${others.map((x) => `<li><a class="t" href="${l.prefix}/blog/${x.meta.slug}/">${esc(x.meta.title)}</a><p>${esc(x.meta.date)} · ${esc(x.meta.description)}</p></li>`).join("")}</ul></section>` : ""}`;
    mkdirSync(resolve(dir, m.slug), { recursive: true });
    writeFileSync(resolve(dir, m.slug, "index.html"), page(lang, { title: `${m.title} | ExileDesk`, desc: m.description, path, alt: has(m.slug, lang === "ja" ? "en" : "ja"), og: { type: "article", image, published: m.date, modified: m.updated }, ld, body, slug: m.slug }));
    if (!listed(p)) continue;
    if (!m.draft) urls.push(`${l.prefix}${path}`);
    // 右の列 (src/web/SideReads.vue) が読む: 題・1 行の説明・タグ (関係する記事を選ぶ)・絵 (OGP の絵のパス)
    index[lang].push({ slug: m.slug, title: m.title, date: m.date, href: `${l.prefix}${path}`, draft: m.draft, description: m.description, tags: m.tags, image: image.replace(SITE, "") });
  }
  const shown = mine.filter(listed);
  const list = shown.length ? `${listHead(lang, shown)}${cards(lang, shown)}` : `<p>${l.none}</p>`;
  const ld = { "@context": "https://schema.org", "@type": "Blog", name: l.listTitle, url: `${SITE}${l.prefix}/blog/`, inLanguage: lang };
  writeFileSync(resolve(dir, "index.html"), page(lang, { title: l.listTitle, desc: l.listDesc, path: "/blog/", alt: true, og: { type: "website", image: `${SITE}/web/og.png` }, ld, body: `<h1>${l.blog}</h1>\n<p>${l.listIntro}</p>\n${list}${tagSections(lang, shown)}`, wide: true }));
  urls.push(`${l.prefix}/blog/`);
  console.log(`${lang}: 記事 ${shown.length} 本 + 一覧 (見本 ${mine.length - shown.length})`);
}
// クラフト台の右の列が読む (新しい順、日本語・英語)
writeFileSync(resolve(OUT, "blog", "index.json"), JSON.stringify(index));
cpSync(resolve(ROOT, "scripts/_blog-client.js"), resolve(OUT, "blog", "blog.js"));
cpSync(resolve(SRC, "chars"), resolve(OUT, "blog", "chars"), { recursive: true });
if (existsSync(resolve(SRC, "img"))) cpSync(resolve(SRC, "img"), resolve(OUT, "blog", "img"), { recursive: true, filter: (f) => !f.endsWith(".gitkeep") });

// トップの初めの HTML (web.html → index.html) の印に新しい記事 3 本と一覧へのリンク (JS を動かさない読み手にも記事の入口を、2026-10-22)
const top = resolve(OUT, "index.html");
if (existsSync(top)) {
  const html = readFileSync(top, "utf8");
  const pick = index.ja.slice(0, 3);
  const block = pick.length ? `<h2 style="font-size:17px;color:#f0cf86;margin:24px 0 6px">新しい記事</h2><ul>${pick.map((x) => `<li><a href="${x.href}" style="color:#f0c878">${esc(x.title)}</a> <span style="color:#8f856f;font-size:12px">${x.date}</span></li>`).join("")}</ul><p><a href="/blog/" style="color:#f0c878">ブログの記事をすべて見る</a> · <a href="/en/blog/" style="color:#f0c878">Blog (English)</a></p>` : "";
  if (html.includes("<!--blog-latest-->")) writeFileSync(top, html.replace("<!--blog-latest-->", block));
}

// サイトマップ (出力先にあれば足す。下書きは入れない)
const sm = resolve(OUT, "sitemap.xml");
if (existsSync(sm)) {
  const xml = readFileSync(sm, "utf8");
  const add = urls.filter((u) => !xml.includes(`<loc>${SITE}${u}</loc>`)).map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n");
  if (add) writeFileSync(sm, xml.replace("</urlset>", `${add}\n</urlset>`));
}
console.log(`ブログ → ${OUT}/blog (サイトマップ +${urls.length})`);
