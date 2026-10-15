#!/usr/bin/env node
/**
 * build-seo-pages.mjs — ベースごとの読み物のページ (/bases/<名前>.html) と一覧 (/bases/) を作る (2026-10-13)
 *
 * オーナー「完璧に仕上げてくれ」(AdSense の審査の前に)。審査で落ちやすいのは「中身が少ない」なので、手で書かずに、
 * もう持っているデータ (ベースの素の数値・暗黙・付く MOD と段・出やすさ) からベースごとのページを作る。検索の入口にもなる。
 * 中身はアプリと同じエンジン・同じ関数 (scripts/_seo-entry.ts)。「エミュレーターで試す」は /?base=<英語名> でそのベースから始まる。
 *
 *   node scripts/build-seo-pages.mjs [出力先 (既定 dist-web)]
 * pnpm build:web の最後に回す (public には置かない。生成物をリポジトリに入れない)。sitemap.xml も出力先の物を書き直す
 * 英語のページ (2026-10-16 英語版の仕上げ): /en/bases/<名前> と /en/bases/。ゲームの言葉はクライアントの英語の原文 (同じ関数を英語の画面で回す)。
 * 日英は hreflang で結ぶ (canonical はそれぞれ自分)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, process.argv[2] ?? "dist-web");
const SITE = "https://exiledesk.com";
const M = await bundleEntry("scripts/_seo-entry.ts");
const data = M.loadPatchSync();

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (en) => en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pct = (x) => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.01 ? `${(x * 100).toFixed(1)}%` : x > 0 ? `${(x * 100).toFixed(2)}%` : "—");
const SKIP_CLS = /^(LifeFlask|ManaFlask|SkillGem)$/;
const isJewel = (cls) => /^Jewels/.test(cls);

const CSS = `:root{--bg:#0e0c09;--panel:#17130e;--line:#3a3024;--fg:#e8dfcf;--sub:#a99b84;--accent:#e0b062;--link:#f0c878;--mod:#c8c8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.8 "Zen Kaku Gothic New","Hiragino Sans","Yu Gothic UI",system-ui,sans-serif}
header{border-bottom:1px solid var(--line);background:#0a0907}header .in,main,footer .in{max-width:980px;margin:0 auto;padding:0 16px}
header .in{display:flex;align-items:center;gap:12px;height:52px;flex-wrap:wrap}header a{color:var(--fg);text-decoration:none;font-weight:700;letter-spacing:.04em}
header nav{margin-left:auto;display:flex;gap:14px;font-size:13px;flex-wrap:wrap}header nav a{color:var(--sub);font-weight:400}
main{padding-top:24px;padding-bottom:48px}h1{font-size:24px;margin:0 0 4px;color:var(--accent)}.en{color:var(--sub);font-size:13px;margin:0 0 16px}
h2{font-size:17px;margin:28px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line);color:var(--accent)}h3{font-size:15px;margin:18px 0 6px}
a{color:var(--link)}.cta{display:inline-block;margin:6px 0 4px;padding:8px 18px;border:1px solid #8a6a32;border-radius:6px;background:#2a1f12;color:var(--accent);text-decoration:none;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 10px}th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--sub);font-weight:400}td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.mod{color:var(--mod)}
details summary{cursor:pointer}details table{margin:4px 0 8px 12px;width:calc(100% - 12px)}.note{color:var(--sub);font-size:13px}
.kv td:first-child{color:var(--sub);width:9em}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:4px 16px}
.crumb{font-size:12px;color:var(--sub);margin-bottom:8px}footer{border-top:1px solid var(--line);color:var(--sub);font-size:12px}footer .in{padding-top:14px;padding-bottom:20px}`;

/** 画面の言葉 (日本語 / 英語)。ゲームの言葉 (ベース・MOD・部位) はデータから */
const L = {
  ja: {
    html: "ja", prefix: "", emulator: "エミュレーター", bases: "ベース一覧", guide: "使い方", about: "ExileDesk について", contact: "お問い合わせ", privacy: "プライバシーポリシー",
    foot: "ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。MOD・段・重みはゲームのデータと poe2db の情報を元にした推定で、結果を保証するものではありません。",
    none: "無し", modHead: "MOD (一番上の段)", tiers: "段", t1lv: "T1 の Lv", share: "出やすさ", side: { prefix: "プレフィックス", suffix: "サフィックス" },
    title: (b) => `${b.ja} (${b.en}) の MOD と段 — PoE2 ベース | ExileDesk`,
    desc: (b, cls, lvl, pre, suf) => `${b.ja} (${b.en}) は Path of Exile 2 の${cls}のベース。${lvl ? `必要レベル ${lvl}。` : ""}付く MOD はプレフィックス ${pre} 系統・サフィックス ${suf} 系統。段と出やすさの表と、エミュレーターで試すリンク。`,
    intro: (b, cls, lvl, pre, suf, top) => `${esc(b.ja)} は${esc(cls)}のベースです。${lvl ? `必要レベル (ドロップレベル) は ${lvl}。` : "ジュエルの MOD はアイテムレベルを見ず、出やすさは全部同じです。"}普通の MOD はプレフィックス ${pre} 系統・サフィックス ${suf} 系統が付きます${top ? `。プレフィックスで出やすいのは ${esc(top)} など` : ""}。`,
    sep: "、", name: (b) => b.ja, sub: (b, cls) => `${b.en} · ${cls}`,
    cta: "エミュレーターでこのベースを試す", stats: "素の数値", reqLv: "必要レベル", recover: "回復", statsNote: "品質 0%・MOD なしの値。",
    implicit: "暗黙の MOD", implNote: (jewellery) => `暗黙の MOD の数値は幅の中で決まり、神のオーブで振り直せます${jewellery ? "。カタリストの品質で、タグの合う暗黙の MOD も伸びます" : ""}。`,
    normal: "付く MOD (普通)", normalNote: "出やすさ = 同じ側の重みに対する割合 (アイテムレベル 82、MOD なしの時)。MOD を押すと段ごとの数値と MOD レベル。",
    essence: "エッセンスで付く MOD", desecrated: "冒涜 (骨) で付く MOD", desNote: "魂の井戸で発現する時の候補に出る、冒涜専用の MOD。", same: "同じ部位のほかのベース",
    listTitle: "PoE2 ベース一覧 (付く MOD と段) | ExileDesk", listDesc: "Path of Exile 2 の武器・防具・宝飾品・ジュエルのベース一覧。ベースごとに付く MOD・段・出やすさと、エミュレーターで試すリンク。",
    listH1: "ベース一覧", listIntro: "Path of Exile 2 の武器・防具・宝飾品・ジュエルのベースです。押すと、そのベースに付く MOD・段・出やすさの表と、エミュレーターでそのまま試すリンクが出ます。名前はゲームの日本語のままです。",
    row: (r) => r.ja, clsName: (c, label) => label, other: { lang: "English", path: "/en", hreflang: "en" },
  },
  en: {
    html: "en", prefix: "/en", emulator: "Emulator", bases: "Bases", guide: "How to use", about: "About", contact: "Contact", privacy: "Privacy policy",
    foot: "ExileDesk is an unofficial fan site. Path of Exile 2 and its in-game images and names are the property of Grinding Gear Games. Mods, tiers and weights are estimates based on game data and poe2db, with no guarantee of results.",
    none: "None", modHead: "Mod (top tier)", tiers: "Tiers", t1lv: "T1 Lv", share: "Weight", side: { prefix: "Prefixes", suffix: "Suffixes" },
    title: (b) => `${b.en} mods and tiers — PoE2 base | ExileDesk`,
    desc: (b, cls, lvl, pre, suf) => `${b.en} is a Path of Exile 2 ${cls} base.${lvl ? ` Required level ${lvl}.` : ""} It rolls ${pre} prefix groups and ${suf} suffix groups. Tier and weight tables, plus a link to try it in the crafting emulator.`,
    intro: (b, cls, lvl, pre, suf, top) => `${esc(b.en)} is a ${esc(cls)} base.${lvl ? ` Its required (drop) level is ${lvl}.` : " Jewel mods ignore Item Level and all have the same weight."} Normal mods: ${pre} prefix groups and ${suf} suffix groups${top ? `. The most common prefixes are ${esc(top)}` : ""}.`,
    sep: ", ", name: (b) => b.en, sub: (b, cls) => cls,
    cta: "Try this base in the emulator", stats: "Base stats", reqLv: "Required level", recover: "Recovery", statsNote: "Values at 0% quality with no mods.",
    implicit: "Implicit mods", implNote: (jewellery) => `Implicit values roll within their range and can be rerolled with a Divine Orb${jewellery ? ". Catalyst quality also boosts implicits with a matching tag" : ""}.`,
    normal: "Mods (normal)", normalNote: "Weight = share of the total weight on the same side (Item Level 82, no mods). Click a mod for each tier's values and mod level.",
    essence: "Essence mods", desecrated: "Desecrated mods (Abyssal Bones)", desNote: "Desecrated-only mods offered when revealing at the Well of Souls.", same: "Other bases of this type",
    listTitle: "PoE2 bases (mods and tiers) | ExileDesk", listDesc: "Every Path of Exile 2 weapon, armour, jewellery and jewel base, with the mods, tiers and weights each one rolls and a link to try it in the crafting emulator.",
    listH1: "Bases", listIntro: "Path of Exile 2 weapon, armour, jewellery and jewel bases. Open one to see its mods, tiers and weights, and try it straight away in the emulator.",
    row: (r) => M.CATALOG_ROW_EN[r.ja] ?? r.ja, clsName: (c) => M.classEn(c), other: { lang: "日本語", path: "", hreflang: "ja" },
  },
};
/** 出力先の中の置き場 (日本語は bases、英語は en/bases) */
const dirOf = (t) => (t.prefix ? `${t.prefix.slice(1)}/bases` : "bases");

const head = (t, title, desc, path) => `<!doctype html>
<html lang="${t.html}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}${t.prefix}${path}" />
<link rel="alternate" hreflang="ja" href="${SITE}${path}" />
<link rel="alternate" hreflang="en" href="${SITE}/en${path}" />
<link rel="alternate" hreflang="x-default" href="${SITE}${path}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1993030721214430" crossorigin="anonymous"></script>
</head>
<body>
<header><div class="in"><a href="/">ExileDesk</a><nav><a href="/">${t.emulator}</a><a href="${t.prefix}/bases/">${t.bases}</a><a href="/guide">${t.guide}</a><a href="/about">${t.about}</a><a href="/contact">${t.contact}</a><a href="${t.other.path}${path}" hreflang="${t.other.hreflang}">${t.other.lang}</a></nav></div></header>
<main>`;
const foot = (t) => `</main>
<footer><div class="in">${esc(t.foot)} · <a href="/privacy">${t.privacy}</a> · <a href="/contact">${t.contact}</a></div></footer>
</body>
</html>
`;

const rows = M.baseCatalog(data, false).filter((b) => !SKIP_CLS.test(b.cls));
const byCls = new Map();
for (const b of rows) (byCls.get(b.cls) ?? byCls.set(b.cls, []).get(b.cls)).push(b);

function modTable(t, list) {
  if (!list.length) return `<p class="note">${t.none}</p>`;
  return `<table><thead><tr><th>${t.modHead}</th><th class="n">${t.tiers}</th><th class="n">${t.t1lv}</th><th class="n">${t.share}</th></tr></thead><tbody>${list.map((r) => `<tr><td><details><summary class="mod">${esc(r.text)}</summary><table><tbody>${r.tiers.map((x) => `<tr><td class="n">${esc(x.rank)}</td><td class="mod">${esc(x.text)}</td><td class="n">Lv ${esc(x.ilvl)}</td></tr>`).join("")}</tbody></table></details></td><td class="n">${r.tiers.length}</td><td class="n">${esc(r.topLevel)}</td><td class="n">${pct(r.share)}</td></tr>`).join("")}</tbody></table>`;
}
const textList = (t, list) => (list.length ? `<ul>${list.map((r) => `<li class="mod">${esc(r.text)}</li>`).join("")}</ul>` : `<p class="note">${t.none}</p>`);
/** ゲームの文の印 ([Resistances|Fire Resistance] → Fire Resistance) を外す (英語の文はクライアントの原文) */
const plain = (x) => String(x ?? "").replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

const urls = [];
let n = 0;
for (const code of ["ja", "en"]) {
  const t = L[code];
  M.setLang(code);
  mkdirSync(resolve(OUT, dirOf(t)), { recursive: true });
  for (const b of rows) {
    let item;
    try { item = M.freshItem(data, b.en, 82); } catch { continue; }
    const cls = code === "en" ? M.classEn(b.cls) : M.classJa(b.cls);
    const list = M.modListFor(data, item).map((r) => ({ ...r, text: plain(r.text), tiers: r.tiers.map((x) => ({ ...x, text: plain(x.text) })) }));
    const normal = list.filter((r) => r.group === "normal");
    const pre = normal.filter((r) => r.side === "prefix").sort((a, c) => c.share - a.share);
    const suf = normal.filter((r) => r.side === "suffix").sort((a, c) => c.share - a.share);
    const ess = list.filter((r) => r.group === "essence" || r.group === "perfect_essence");
    const des = list.filter((r) => r.group === "desecrated");
    const props = M.propRows(item, code === "ja");
    const impl = M.implicitRows(item, code === "ja");
    const implRange = (M.htcBaseInfo()[b.en]?.implicits ?? []).map((x) => (code === "en" ? x.en : x.ja));
    const lvl = isJewel(b.cls) ? null : b.lvl;
    const path = `/bases/${slug(b.en)}`;
    const topPre = pre.slice(0, 3).map((r) => r.text).join(t.sep);
    const same = (byCls.get(b.cls) ?? []).filter((x) => x.en !== b.en).slice(0, 24);
    const html = `${head(t, t.title(b), t.desc(b, cls, lvl, pre.length, suf.length), path)}
<p class="crumb"><a href="${t.prefix}/bases/">${t.bases}</a> › ${esc(cls)}</p>
<h1>${esc(t.name(b))}</h1>
<p class="en">${esc(t.sub(b, cls))}</p>
<p>${t.intro(b, cls, lvl, pre.length, suf.length, topPre)}</p>
<p><a class="cta" href="/?base=${encodeURIComponent(b.en)}">${t.cta}</a></p>
${props.length || lvl ? `<h2>${t.stats}</h2><table class="kv"><tbody>${lvl ? `<tr><td>${t.reqLv}</td><td>${lvl}</td></tr>` : ""}${props.map((x) => `<tr><td>${esc(x.label || t.recover)}</td><td>${esc(x.value)}</td></tr>`).join("")}</tbody></table><p class="note">${t.statsNote}</p>` : ""}
${implRange.length ? `<h2>${t.implicit}</h2><ul>${implRange.map((x, i) => `<li class="mod">${esc(plain(x))}${impl[i]?.tags?.length ? ` <span class="note">(${esc(impl[i].tags.map((g) => M.tagLabel(g)).join(" · "))})</span>` : ""}</li>`).join("")}</ul><p class="note">${t.implNote(/^(Rings|Amulets|Jewels)/.test(b.cls))}</p>` : ""}
<h2>${t.normal}</h2>
<p class="note">${t.normalNote}</p>
<h3>${t.side.prefix} (${pre.length})</h3>${modTable(t, pre)}
<h3>${t.side.suffix} (${suf.length})</h3>${modTable(t, suf)}
${ess.length ? `<h2>${t.essence}</h2>${textList(t, ess)}` : ""}
${des.length ? `<h2>${t.desecrated}</h2><p class="note">${t.desNote}</p>${textList(t, des)}` : ""}
${same.length ? `<h2>${t.same}</h2><div class="grid">${same.map((x) => `<a href="${t.prefix}/bases/${slug(x.en)}">${esc(t.name(x))}</a>`).join("")}</div>` : ""}
${foot(t)}`;
    writeFileSync(resolve(OUT, `${dirOf(t)}/${slug(b.en)}.html`), html);
    urls.push(`${t.prefix}${path}`);
    n++;
  }

  // 一覧
  const sections = M.CATALOG_ROWS.filter((r) => r.cls.some(([c]) => !SKIP_CLS.test(c))).map((r) => {
    const parts = r.cls.filter(([c]) => byCls.has(c)).map(([c, label]) => `<h3>${esc(t.clsName(c, label))}</h3><div class="grid">${byCls.get(c).sort((a, c2) => c2.lvl - a.lvl).map((b) => `<a href="${t.prefix}/bases/${slug(b.en)}">${esc(t.name(b))}</a>`).join("")}</div>`);
    return parts.length ? `<h2>${esc(t.row(r))}</h2>${parts.join("")}` : "";
  }).join("");
  writeFileSync(resolve(OUT, `${dirOf(t)}/index.html`), `${head(t, t.listTitle, t.listDesc, "/bases/")}
<h1>${t.listH1}</h1>
<p>${t.listIntro}</p>
${sections}
${foot(t)}`);
}
M.setLang("ja");

// サイトマップ (出力先の物を書き直す)
const fixed = ["/", "/guide", "/bases/", "/en/bases/", "/about", "/contact", "/privacy"];
writeFileSync(resolve(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...fixed, ...urls].map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}
</urlset>
`);
console.log(`ベースのページ ${n} 枚 (日英) + 一覧 2 + sitemap (${fixed.length + urls.length} URL) → ${OUT}`);
