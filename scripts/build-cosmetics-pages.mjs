#!/usr/bin/env node
/**
 * build-cosmetics-pages.mjs — PoE2 で使える PoE1 のスキン (MTX・コスメティック) の静的なページ (2026-10-25、スキン部長)
 *
 * オーナー「PoE1・PoE2 スキンとかでも色々引っかかるように SEO こっちでも頑張るか」。検索の入口になる、JS 無しで読める一覧。
 * 出す物: /cosmetics/ と /en/cosmetics/ (まとめごとの件数)、まとめごとの子ページ /cosmetics/<まとめ> (と /en/…)。
 * まとめはアプリの一覧の絞り込みと同じ src/views/skins/groups.json の 8 個 + 一式 (同じ名前の頭・同じシリーズ、build-mtx-web.mjs の sets) (オーナー 10-25「8 種類くらい、武器・エフェクト・背面は絶対分けたい」)。
 * 子ページの中は元の種類ごとの見出し (英語名の無い種類が混ざるまとめは英語では見出し無し)。
 * 中身は src/data/mtx-poe1-in-poe2.json (scripts/build-mtx-web.mjs、名前は poe2db の日英)。絵は /mtx-art/<a>.webp (静的な置き場なので 1 日の枠に数えない)。
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
const d = JSON.parse(readFileSync(resolve(ROOT, "src/data/mtx-poe1-in-poe2.json"), "utf8"));
const G = JSON.parse(readFileSync(resolve(ROOT, "src/views/skins/groups.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// まとめごと (groups.json の並び、その他は最後)。中は元の種類ごと (多い順)
const GROUPS = [...G.groups, G.other].map((g) => ({ ...g, items: [] }));
// 一式 (build-mtx-web.mjs の sets) は 1 枚のカードに (絵と飛び先は代表の部品、部品の数を札に)。部品は各まとめにも今までどおり (オーナー 10-25)
const partsOf = d.sets.map(() => 0);
const newest = d.sets.map(() => undefined);
const originsOf = d.sets.map(() => []);
/** ショップで買える物はデータに入っていない (build-mtx-web.mjs で外す、一式も買えない部品だけで組み直し済み。オーナー 10-25) */
const items = d.items;
for (const it of items) if (it.s != null) { partsOf[it.s]++; originsOf[it.s].push(it); if (it.o != null && !(newest[it.s] >= it.o)) newest[it.s] = it.o; }
/** 一式の出どころ: 部品が全部同じパック / 箱ならそれ、混ざれば無し (アプリの一覧と同じ) */
const setOrigin = (l) => (l.every((x) => x.pk && x.pk === l[0].pk) ? { pk: l[0].pk } : l.every((x) => x.bx && x.bx === l[0].bx) ? { bx: l[0].bx } : {});
GROUPS.unshift({ ...G.set, items: d.sets.flatMap((t, i) => (partsOf[i] ? [{ ja: `${t.ja} 一式`, en: `${t.en} Set`, k: -99, a: d.items[t.main].a, slug: d.items[t.main].slug, parts: partsOf[i], o: newest[i], si: i, ...setOrigin(originsOf[i]) }] : [])) });
const groupOf = new Map(G.groups.flatMap((g) => g.k.map((k) => [k, GROUPS.find((x) => x.id === g.id)])));
for (const it of items) (groupOf.get(it.k) ?? GROUPS.at(-1)).items.push(it);
const total = items.length;

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
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:8px 0 12px}@media(max-width:900px){.cards{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.cards{grid-template-columns:1fr 1fr;gap:8px}}
.card{position:relative}.card em{position:absolute;top:8px;left:8px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;font-size:10px;color:#bfe9d0;background:#1d4a3299;border-radius:99px;padding:1px 8px}.card i{position:absolute;top:8px;right:8px;font-style:normal;font-size:11px;font-weight:700;color:#f3d38a;background:#5a3f1a99;border-radius:99px;padding:1px 8px}
.card{display:flex;flex-direction:column;align-items:center;min-width:0;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--fg);text-decoration:none;text-align:center;line-height:1.35}.card:hover{border-color:#8a6a32}
.card img,.card .ph{width:128px;height:128px;max-width:100%;object-fit:contain}
.card b{margin-top:6px;font-weight:400;font-size:13px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;width:100%}.card span{color:var(--sub);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
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
    kind: (k) => d.kinds[k]?.ja ?? null,
    group: (g) => g.ja,
  },
  en: {
    prefix: "/en",
    app: "/?lang=en",
    skins: "/?lang=en&page=skins",
    nav: `<a href="/?lang=en">Emulator</a><a href="/en/craft-basics">Crafting basics</a><a href="/en/blog/">Blog</a><a href="/en/bases/">Bases</a><a href="/en/cosmetics/">Cosmetics</a><a href="/cosmetics/" hreflang="ja">日本語</a>`,
    foot: `<p class="fnav"><a href="/?lang=en">Craft Stage</a> · <a href="/en/bases/">Bases</a> · <a href="/en/cosmetics/">Cosmetics</a> · <a href="/en/blog/">Blog</a> · <a href="/en/about">About</a> · <a href="/en/privacy">Privacy Policy</a> · <a href="/en/contact">Contact</a> · <a href="/cosmetics/" hreflang="ja">日本語</a></p>ExileDesk is an unofficial fan site. Path of Exile, Path of Exile 2 and their images and names belong to Grinding Gear Games.`,
    name: (it) => it.en,
    sub: () => "",
    kind: (k) => d.kinds[k]?.en ?? null,
    group: (g) => g.en,
  },
};

const urls = [];
for (const [code, L] of Object.entries(LANGS)) {
  const ja = code === "ja";
  const other = ja ? "en" : "ja";
  const dir = resolve(OUT, `${L.prefix.slice(1)}${L.prefix ? "/" : ""}cosmetics`);
  mkdirSync(dir, { recursive: true });
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
    ? `<p class="note">poe2db の Microtransactions の一覧を元にした一覧です (PoE2 で出た物と、今ショップで買える物は除く)。ゲームで実際に使えるか・見た目どおりに動くかは保証しません。カードを押すと poe2db のページが開きます。</p>`
    : `<p class="note">Based on the poe2db Microtransactions list (items released in PoE2 and items currently sold in the shop are left out). We can't guarantee that each item works or looks as expected in the game. Click a card to open it on poe2db.</p>`;
  const cta = `<p><a class="cta" href="${L.skins}">${ja ? "名前で探す・種類で絞る (ExileDesk のコスメティックの一覧)" : "Search and filter (ExileDesk cosmetics list)"}</a></p>`;
  /** 発売が新しい順 (build-mtx-web.mjs の o、一式は中の一番新しい物)、日付が分からない物は最後で名前の順 (アプリの一覧と同じ) */
  const sortByNew = (list) => [...list].sort((a, b) => (b.o ?? -1) - (a.o ?? -1) || L.name(a).localeCompare(L.name(b), code));
  const cards = (list) => `<div class="cards">${sortByNew(list).map((it) => {
    // 絵が主役のカード、押すと poe2db (アプリの一覧と同じ。オーナー 10-25)
    const img = it.a != null ? `<img src="/mtx-art/${it.a}.webp" alt="${esc(L.name(it))}" loading="lazy" decoding="async" width="128" height="128" />` : `<span class="ph"></span>`;
    const sub = L.sub(it);
    // 出どころの札 (取れた物だけ、小さく。オーナー 10-25)
    const origin = it.pk ? (ja ? `パック: ${it.pk}` : `Pack: ${it.pk}`) : it.bx ? (ja ? `ボックス: ${it.bx}` : `Box: ${it.bx}`) : it.rr ? (ja ? "レースの報酬" : "Race reward") : "";
    const tag = origin ? `<em>${esc(origin)}</em>` : "";
    const badge = it.parts ? `<i>${ja ? `${it.parts} 点` : `${it.parts} pcs`}</i>` : "";
    return `<a class="card" href="${(ja ? d.url.ja : d.url.en) + it.slug}" target="_blank" rel="noopener">${tag}${badge}${img}<b>${esc(L.name(it))}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</a>`;
  }).join("")}</div>`;
  const childPath = (g) => `/cosmetics/${g.slug}`;
  /** 子ページの中身: 元の種類ごとの見出し + カード (種類が 1 つ・英語名の無い種類が混ざる時は見出し無し) */
  const sections = (g) => {
    const by = new Map();
    for (const it of g.items) (by.get(it.k) ?? by.set(it.k, []).get(it.k)).push(it);
    const ks = [...by.keys()].sort((a, b) => by.get(b).length - by.get(a).length);
    // 一式のページは一式ごとの見出し + 中の部品 (アプリの一式の小窓と同じ中身。オーナー 10-25「一式押したら展開」)
    if (g.id === "set") return sortByNew(g.items).map((t) => `<h2>${esc(L.name(t))} (${ja ? `${t.parts} 点` : `${t.parts} pcs`})</h2>${cards(items.filter((x) => x.s === t.si))}`).join("\n");
    if (ks.length < 2 || ks.some((k) => !L.kind(k))) return cards(g.items);
    return ks.map((k) => `<h2>${esc(L.kind(k))} (${by.get(k).length})</h2>${cards(by.get(k))}`).join("\n");
  };
  /** 名前に多く出る言葉 (翼・Wings など) を数える。種類の説明の 1 文に使う */
  const wings = (list) => list.filter((it) => /Wings/i.test(it.en)).length;

  // 子ページ
  let nChild = 0;
  for (const g of GROUPS) {
    const path = childPath(g);
    const label = L.group(g);
    const n = g.items.length;
    const w = wings(g.items);
    const title = ja ? `PoE2 で使える PoE1 の${label} ${n} 件 — スキン・MTX 一覧 | ExileDesk` : `PoE1 ${label} usable in PoE2 (${n}) — PoE2 cosmetics & MTX | ExileDesk`;
    const desc = ja
      ? `Path of Exile 2 でも使える Path of Exile 1 の MTX (スキン) のうち${label} ${n} 件の一覧${w >= 10 ? ` (翼 ${w} 件を含む)` : ""}。poe2db の日本語と英語の名前・絵・poe2db へのリンク。`
      : `${n} Path of Exile 1 microtransactions (${label}) that are also usable in Path of Exile 2${w >= 10 ? `, including ${w} wings` : ""}. Names, icons and poe2db links.`;
    const intro = ja
      ? `Path of Exile 1 で手に入れた MTX (マイクロトランザクション) のうち、Path of Exile 2 でも使える${esc(label)}は ${n} 件です${w >= 10 ? ` (名前に Wings が付く翼は ${w} 件)` : ""}。名前は poe2db の日本語と英語です。`
      : `${n} of the Path of Exile 1 microtransactions (MTX) in the ${esc(label)} category are also usable in Path of Exile 2${w >= 10 ? ` (${w} of them are wings)` : ""}. Names follow poe2db.`;
    const others = GROUPS.filter((x) => x !== g).map((x) => `<a href="${L.prefix}${childPath(x)}">${esc(L.group(x))}</a>`).join(" · ");
    writeFileSync(resolve(dir, `${g.slug}.html`), `${head(title, desc, path, path)}
<p class="crumb"><a href="${L.prefix}/cosmetics/">${ja ? "PoE2 で使える PoE1 のスキン" : "PoE1 cosmetics usable in PoE2"}</a> › ${esc(label)}</p>
<h1>${ja ? `PoE2 で使える PoE1 の${esc(label)}` : `PoE1 ${esc(label)} usable in PoE2`}</h1>
<p class="en">${ja ? `${n} 件 · スキン / MTX / コスメティック` : `${n} items · skins / MTX / cosmetics`}</p>
<p>${intro}</p>
${note}
${cta}
${sections(g)}
<h2>${ja ? "ほかの種類" : "Other categories"}</h2>
<p>${others}</p>
${foot}`);
    urls.push(`${L.prefix}${path}`);
    nChild++;
  }

  // 一覧
  const rows = GROUPS.map((g) => `<tr><td><a href="${L.prefix}${childPath(g)}">${esc(L.group(g))}</a></td><td class="n">${g.items.length}</td></tr>`).join("");
  const w = wings(items);
  writeFileSync(resolve(dir, "index.html"), `${head(
    ja ? "PoE2 で使える PoE1 のスキン・MTX 一覧 (コスメティック) | ExileDesk" : "PoE1 cosmetics & MTX usable in PoE2 | ExileDesk",
    ja ? `Path of Exile 2 でも使える Path of Exile 1 の MTX (スキン・コスメティック) ${total} 件の一覧。武器・武器エフェクト・背面 (翼・マント)・防具・エフェクト・ペット・ポータル・ポートレートフレーム・隠れ家の種類ごとに、poe2db の日英の名前と絵。` : `All ${total} Path of Exile 1 microtransactions (skins, cosmetics) that also work in Path of Exile 2 — weapon skins and effects, back attachments (wings, cloaks), armour, character effects, pets, portals, portrait frames and hideout decorations, with names and icons from poe2db.`,
    "/cosmetics/", "/cosmetics/")}
<h1>${ja ? "PoE2 で使える PoE1 のスキン (MTX) 一覧" : "PoE1 skins (MTX) usable in PoE2"}</h1>
<p class="en">${ja ? `${total} 件 · Path of Exile 1 / Path of Exile 2 共通のコスメティック` : `${total} items · cosmetics shared by Path of Exile 1 and Path of Exile 2`}</p>
<p>${ja ? `Path of Exile 1 で買った・手に入れた MTX (マイクロトランザクション) のうち、Path of Exile 2 でも使えるスキン・エフェクト・ペット・隠れ家アイテムなどの一覧です (${total} 件、翼は ${w} 件)。種類を押すとその種類の全部の絵と名前が出ます。` : `Path of Exile 1 microtransactions (MTX) that you can also use in Path of Exile 2: armour skins, effects, pets, hideout decorations and more (${total} items, ${w} wings). Open a category to see every item with its icon.`}</p>
${note}
${cta}
<h2>${ja ? "種類" : "Categories"}</h2>
<table><thead><tr><th>${ja ? "種類" : "Category"}</th><th class="n">${ja ? "件数" : "Items"}</th></tr></thead><tbody>${rows}</tbody></table>
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
