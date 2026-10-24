#!/usr/bin/env node
/**
 * build-cosmetics-pages.mjs — PoE2 で使える PoE1 のスキン (MTX・コスメティック) の静的なページ (2026-10-25、スキン部長)
 *
 * オーナー「PoE1・PoE2 スキンとかでも色々引っかかるように SEO こっちでも頑張るか」。検索の入口になる、JS 無しで読める一覧。
 * 出す物: /cosmetics/ と /en/cosmetics/ (種類ごとの件数と小さい種類の全部)、件数の多い種類は /cosmetics/<種類> (と /en/…) の子ページ。
 * 中身は src/data/mtx-poe1-in-poe2.json (scripts/build-mtx-web.mjs、名前は poe2db の日英)。絵は /mtx-art/<a>.webp (静的な置き場なので 1 日の枠に数えない)。
 * 英語の子ページは poe2db に種類の英語名がある種類だけ (ペット・隠れ家などは英語の一覧の「Other」に入れる、推測で訳さない)。
 * 見た目と頭・足は読み物のページ (build-seo-pages.mjs) に合わせる。アプリの一覧 (?page=skins) への入口を付ける。
 * 自動で作った一覧なので既定は noindex (10-22 オーナー OK の /bases/ と同じ)。--index で index にしてサイトマップに足す (オーナーの OK の後)。
 *   node scripts/build-cosmetics-pages.mjs [出力先 (既定 dist-web)] [--index]
 * 開発版だけ: 今は手元の開発版の作り (scripts/preview-prod.mjs -- --dev) だけで回す。本番の build:web にはオーナーの OK の後に足す
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const INDEX = args.includes("--index");
const OUT = resolve(ROOT, args.find((a) => !a.startsWith("--")) ?? "dist-web");
const SITE = "https://exiledesk.com";
/** 子ページを作る件数 (これより少ない種類は一覧のページに全部並べる) */
const CHILD_MIN = 20;
/** 英語名の無い種類の道 (道に使うだけで、画面には出さない) */
const SLUG_NO_EN = { 14: "pets", 20: "hideout", 24: "amulet-skins", 28: "ring-skins", 25: "belt-skins", 26: "flask-skins" };

const d = JSON.parse(readFileSync(resolve(ROOT, "src/data/mtx-poe1-in-poe2.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugOf = (k) => (d.kinds[k]?.en ? d.kinds[k].en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : SLUG_NO_EN[k] ?? null);

// 種類ごと (多い順、種類の無い物 -1 は最後)
const byKind = new Map();
for (const it of d.items) (byKind.get(it.k) ?? byKind.set(it.k, []).get(it.k)).push(it);
const kinds = [...byKind.keys()].sort((a, b) => Number(a < 0) - Number(b < 0) || byKind.get(b).length - byKind.get(a).length);
// 同じ英語名の種類 (例 鎧装飾品 と 腰装飾品 = Body Armour Attachment) は英語の子ページを 1 つに
const total = d.items.length;

// 読み物のページ (build-seo-pages.mjs) と同じ見た目 + 絵つきのカード
const CSS = `:root{--bg:#0e0c09;--panel:#17130e;--line:#3a3024;--fg:#e8dfcf;--sub:#a99b84;--accent:#e0b062;--link:#f0c878}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.8 "Zen Kaku Gothic New","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif}
header{border-bottom:1px solid var(--line);background:#0a0907}header .in,main,footer .in{max-width:980px;margin:0 auto;padding:0 16px}
header .in{display:flex;align-items:center;gap:6px 12px;min-height:52px;padding-top:8px;padding-bottom:8px;flex-wrap:wrap}header a{color:var(--fg);text-decoration:none;font-weight:700;letter-spacing:.04em}
header nav{margin-left:auto;display:flex;gap:14px;font-size:13px;flex-wrap:wrap}header nav a{color:var(--sub);font-weight:400}
main{padding-top:24px;padding-bottom:48px}h1{font-size:24px;margin:0 0 4px;color:var(--accent)}.en{color:var(--sub);font-size:13px;margin:0 0 16px}
h2{font-size:17px;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line);color:var(--accent)}
a{color:var(--link)}.cta{display:inline-block;margin:6px 0 4px;padding:8px 18px;border:1px solid #8a6a32;border-radius:6px;background:#2a1f12;color:var(--accent);text-decoration:none;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 10px}th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left}th{color:var(--sub);font-weight:400}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.note{color:var(--sub);font-size:13px}.crumb{font-size:12px;color:var(--sub);margin-bottom:8px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px 12px;margin:8px 0 12px}
.card{display:flex;align-items:center;gap:10px;min-width:0;padding:4px 0;border-bottom:1px solid var(--line)}.card img,.card .ph{flex:none;width:48px;height:48px;object-fit:contain;border-radius:6px;background:#000a}
.card .t{min-width:0;flex:1;line-height:1.35}.card .t b{display:block;font-weight:400;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.card .t span{display:block;color:var(--sub);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card a.db{flex:none;font-size:12px}.card .no{flex:none;font-size:11px;color:var(--sub)}
footer{border-top:1px solid var(--line);color:var(--sub);font-size:12px}footer .fnav{margin:0 0 6px}footer .fnav a{color:var(--sub)}footer .in{padding-top:14px;padding-bottom:20px}`;

const LANGS = {
  ja: {
    prefix: "",
    app: "/",
    skins: "/?page=skins",
    nav: `<a href="/">エミュレーター</a><a href="/craft-basics">クラフト入門</a><a href="/blog/">ブログ</a><a href="/bases/">ベース一覧</a><a href="/cosmetics/">コスメティック</a><a href="/guide">使い方</a><a href="/en/cosmetics/" hreflang="en">English</a>`,
    foot: `<p class="fnav"><a href="/">クラフトステージ</a> · <a href="/guide">使い方</a> · <a href="/bases/">ベース一覧</a> · <a href="/cosmetics/">コスメティック</a> · <a href="/blog/">ブログ</a> · <a href="/about">ExileDesk について</a> · <a href="/privacy">プライバシーポリシー</a> · <a href="/contact">お問い合わせ</a> · <a href="/en/cosmetics/" hreflang="en">English</a></p>ExileDesk は非公式のファンサイトです。Path of Exile・Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。`,
    name: (it) => it.ja,
    sub: (it) => it.en,
    kind: (k) => d.kinds[k]?.ja ?? "その他",
  },
  en: {
    prefix: "/en",
    app: "/?lang=en",
    skins: "/?lang=en&page=skins",
    nav: `<a href="/?lang=en">Emulator</a><a href="/en/craft-basics">Crafting basics</a><a href="/en/blog/">Blog</a><a href="/en/bases/">Bases</a><a href="/en/cosmetics/">Cosmetics</a><a href="/cosmetics/" hreflang="ja">日本語</a>`,
    foot: `<p class="fnav"><a href="/?lang=en">Craft Stage</a> · <a href="/en/bases/">Bases</a> · <a href="/en/cosmetics/">Cosmetics</a> · <a href="/en/blog/">Blog</a> · <a href="/en/about">About</a> · <a href="/en/privacy">Privacy Policy</a> · <a href="/en/contact">Contact</a> · <a href="/cosmetics/" hreflang="ja">日本語</a></p>ExileDesk is an unofficial fan site. Path of Exile, Path of Exile 2 and their images and names belong to Grinding Gear Games.`,
    name: (it) => it.en,
    sub: () => "",
    kind: (k) => d.kinds[k]?.en ?? "Other",
  },
};

const urls = [];
for (const [code, L] of Object.entries(LANGS)) {
  const ja = code === "ja";
  const other = ja ? "en" : "ja";
  const dir = resolve(OUT, `${L.prefix.slice(1)}${L.prefix ? "/" : ""}cosmetics`);
  mkdirSync(dir, { recursive: true });
  /** 英語の子ページがある種類か (英語名の無い種類は日本語だけ) */
  const hasChild = (k, lang) => k >= 0 && byKind.get(k).length >= CHILD_MIN && slugOf(k) && (lang === "ja" || !!d.kinds[k]?.en);
  /** 英語は同じ英語名の種類を 1 つにまとめる (鎧装飾品 + 腰装飾品 = Body Armour Attachment) */
  const groups = [];
  for (const k of kinds) {
    const key = ja || !d.kinds[k]?.en ? `k${k}` : d.kinds[k].en;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(...byKind.get(k)), g.ks.push(k);
    else groups.push({ key, ks: [k], items: [...byKind.get(k)], label: L.kind(k), slug: slugOf(k) });
  }
  // 英語の「Other」= 英語名の無い種類をまとめた箱
  const en = !ja;
  const shown = en ? [...groups.filter((g) => d.kinds[g.ks[0]]?.en), { key: "other", ks: groups.filter((g) => !d.kinds[g.ks[0]]?.en).flatMap((g) => g.ks), items: groups.filter((g) => !d.kinds[g.ks[0]]?.en).flatMap((g) => g.items), label: "Other", slug: null }] : groups;
  for (const g of shown) g.child = g.slug && g.items.length >= CHILD_MIN && g.ks.every((k) => k >= 0) && (ja || hasChild(g.ks[0], "en"));

  const head = (title, desc, path, alt) => `<!doctype html>
<html lang="${code}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<meta name="robots" content="${INDEX ? "index, follow" : "noindex, follow"}" />
<link rel="canonical" href="${SITE}${L.prefix}${path}" />
<link rel="alternate" hreflang="${code}" href="${SITE}${L.prefix}${path}" />
${alt ? `<link rel="alternate" hreflang="${other}" href="${SITE}${LANGS[other].prefix}${alt}" />\n` : ""}<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${SITE}${L.prefix}${path}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1993030721214430" crossorigin="anonymous"></script>
</head>
<body>
<header><div class="in"><a href="${L.app}">ExileDesk</a><nav>${L.nav}</nav></div></header>
<main>`;
  const foot = `</main>
<footer><div class="in">${L.foot}</div></footer>
</body>
</html>
`;
  const note = ja
    ? `<p class="note">poe2db の Microtransactions の一覧を元にした一覧です。ゲームで実際に使えるか・見た目どおりに動くかは保証しません。「poe2db に無し」はゲームのデータには両方で使える印があるのに poe2db の一覧に無い物で、名前はゲームのデータのままです。</p>`
    : `<p class="note">Based on the poe2db Microtransactions list. We can't guarantee that each item works or looks as expected in the game. "Not on poe2db" marks items the game data flags as usable in both games but that aren't in the poe2db list (names come from the game data).</p>`;
  const cta = `<p><a class="cta" href="${L.skins}">${ja ? "名前で探す・種類で絞る (ExileDesk のコスメティックの一覧)" : "Search and filter (ExileDesk cosmetics list)"}</a></p>`;
  const sortByName = (list) => [...list].sort((a, b) => L.name(a).localeCompare(L.name(b), code));
  const cards = (list) => `<div class="cards">${sortByName(list).map((it) => {
    const img = it.a != null ? `<img src="/mtx-art/${it.a}.webp" alt="" loading="lazy" decoding="async" width="48" height="48" />` : `<span class="ph"></span>`;
    const sub = L.sub(it);
    const link = it.slug ? `<a class="db" href="${(ja ? d.url.ja : d.url.en) + it.slug}" target="_blank" rel="noopener">poe2db</a>` : `<span class="no">${ja ? "poe2db に無し" : "Not on poe2db"}</span>`;
    return `<div class="card">${img}<span class="t"><b>${esc(L.name(it))}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</span>${link}</div>`;
  }).join("")}</div>`;
  const childPath = (g) => `/cosmetics/${g.slug}`;
  /** 名前に多く出る言葉 (翼・Wings など) を数える。種類の説明の 1 文に使う */
  const wings = (list) => list.filter((it) => /Wings/i.test(it.en)).length;

  // 子ページ
  let nChild = 0;
  for (const g of shown.filter((x) => x.child)) {
    const path = childPath(g);
    const altG = (ja ? g.ks.some((k) => d.kinds[k]?.en) : true) ? path : null;
    const n = g.items.length;
    const w = wings(g.items);
    const title = ja ? `PoE2 で使える PoE1 の${g.label} ${n} 件 — スキン・MTX 一覧 | ExileDesk` : `PoE1 ${g.label} usable in PoE2 (${n}) — PoE2 cosmetics & MTX | ExileDesk`;
    const desc = ja
      ? `Path of Exile 2 でも使える Path of Exile 1 の MTX (スキン) のうち${g.label} ${n} 件の一覧${w >= 10 ? ` (翼 ${w} 件を含む)` : ""}。poe2db の日本語と英語の名前・絵・poe2db へのリンク。`
      : `${n} Path of Exile 1 microtransactions (${g.label}) that are also usable in Path of Exile 2${w >= 10 ? `, including ${w} wings` : ""}. Names, icons and poe2db links.`;
    const intro = ja
      ? `Path of Exile 1 で手に入れた MTX (マイクロトランザクション) のうち、Path of Exile 2 でも使える${esc(g.label)}は ${n} 件です${w >= 10 ? ` (名前に Wings が付く翼は ${w} 件)` : ""}。名前は poe2db の日本語と英語です。`
      : `${n} of the Path of Exile 1 microtransactions (MTX) in the ${esc(g.label)} category are also usable in Path of Exile 2${w >= 10 ? ` (${w} of them are wings)` : ""}. Names follow poe2db.`;
    const others = shown.filter((x) => x.child && x !== g).map((x) => `<a href="${L.prefix}${childPath(x)}">${esc(x.label)}</a>`).join(" · ");
    writeFileSync(resolve(dir, `${g.slug}.html`), `${head(title, desc, path, altG)}
<p class="crumb"><a href="${L.prefix}/cosmetics/">${ja ? "PoE2 で使える PoE1 のスキン" : "PoE1 cosmetics usable in PoE2"}</a> › ${esc(g.label)}</p>
<h1>${ja ? `PoE2 で使える PoE1 の${esc(g.label)}` : `PoE1 ${esc(g.label)} usable in PoE2`}</h1>
<p class="en">${ja ? `${n} 件 · スキン / MTX / コスメティック` : `${n} items · skins / MTX / cosmetics`}</p>
<p>${intro}</p>
${note}
${cta}
${cards(g.items)}
<h2>${ja ? "ほかの種類" : "Other categories"}</h2>
<p>${others}</p>
${foot}`);
    urls.push(`${L.prefix}${path}`);
    nChild++;
  }

  // 一覧
  const rows = shown.map((g) => `<tr><td>${g.child ? `<a href="${L.prefix}${childPath(g)}">${esc(g.label)}</a>` : `<a href="#${g.key}">${esc(g.label)}</a>`}</td><td class="n">${g.items.length}</td></tr>`).join("");
  const small = shown.filter((g) => !g.child).map((g) => `<h2 id="${g.key}">${esc(g.label)} (${g.items.length})</h2>${cards(g.items)}`).join("\n");
  const w = wings(d.items);
  writeFileSync(resolve(dir, "index.html"), `${head(
    ja ? "PoE2 で使える PoE1 のスキン・MTX 一覧 (コスメティック) | ExileDesk" : "PoE1 cosmetics & MTX usable in PoE2 | ExileDesk",
    ja ? `Path of Exile 2 でも使える Path of Exile 1 の MTX (スキン・コスメティック) ${total} 件の一覧。鎧装飾品 (翼)・ペット・兜・武器エフェクト・ポータル・ポートレートフレームなど種類ごとに、poe2db の日英の名前と絵。` : `All ${total} Path of Exile 1 microtransactions (skins, cosmetics) that also work in Path of Exile 2 — wings, pets, helmets, weapon effects, portals, portrait frames and more, with names and icons from poe2db.`,
    "/cosmetics/", "/cosmetics/")}
<h1>${ja ? "PoE2 で使える PoE1 のスキン (MTX) 一覧" : "PoE1 skins (MTX) usable in PoE2"}</h1>
<p class="en">${ja ? `${total} 件 · Path of Exile 1 / Path of Exile 2 共通のコスメティック` : `${total} items · cosmetics shared by Path of Exile 1 and Path of Exile 2`}</p>
<p>${ja ? `Path of Exile 1 で買った・手に入れた MTX (マイクロトランザクション) のうち、Path of Exile 2 でも使えるスキン・エフェクト・ペット・隠れ家アイテムなどの一覧です (${total} 件、翼は ${w} 件)。種類を押すとその種類の全部の絵と名前が出ます。` : `Path of Exile 1 microtransactions (MTX) that you can also use in Path of Exile 2: armour skins, effects, pets, hideout decorations and more (${total} items, ${w} wings). Open a category to see every item with its icon.`}</p>
${note}
${cta}
<h2>${ja ? "種類" : "Categories"}</h2>
<table><thead><tr><th>${ja ? "種類" : "Category"}</th><th class="n">${ja ? "件数" : "Items"}</th></tr></thead><tbody>${rows}</tbody></table>
${small}
${foot}`);
  urls.push(`${L.prefix}/cosmetics/`);
  console.log(`${code}: 一覧 + 種類のページ ${nChild} 枚`);
}

// サイトマップ (--index の時だけ。出力先にあれば足す)
const sm = resolve(OUT, "sitemap.xml");
if (INDEX && existsSync(sm)) {
  const xml = readFileSync(sm, "utf8");
  const add = urls.filter((u) => !xml.includes(`<loc>${SITE}${u}</loc>`)).map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n");
  if (add) writeFileSync(sm, xml.replace("</urlset>", `${add}\n</urlset>`));
}
console.log(`コスメティックのページ ${urls.length} 枚 → ${OUT} (${INDEX ? "index・サイトマップに追加" : "noindex・サイトマップに入れない"})`);
