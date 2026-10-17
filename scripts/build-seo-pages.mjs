#!/usr/bin/env node
/**
 * build-seo-pages.mjs — ベースごとの読み物のページ (/bases/<名前>.html) と一覧 (/bases/) を作る (2026-10-13)
 *
 * オーナー「完璧に仕上げてくれ」(AdSense の審査の前に)。審査で落ちやすいのは「中身が少ない」なので、手で書かずに、
 * もう持っているデータ (ベースの素の数値・暗黙・付く MOD と段・出やすさ) からベースごとのページを作る。検索の入口にもなる。
 * 中身はアプリと同じエンジン・同じ関数 (scripts/_seo-entry.ts)。「エミュレーターで試す」は /?base=<英語名> でそのベースから始まる。
 * 2026-10-17 英語の仕上げ: 英語のページも /en/bases/ に (同じ関数を画面の言語 = 英語で回す。MOD の文はクライアントの英語の原文)。
 * 日本語と英語は hreflang で結ぶ。英語のページからエミュレーターへは /?lang=en&base=…
 *
 *   node scripts/build-seo-pages.mjs [出力先 (既定 dist-web)]
 * pnpm build:web の最後に回す (public には置かない。生成物をリポジトリに入れない)。sitemap.xml も出力先の物を書き直す
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

/** 言語ごとの決まった言葉。en は英語のページ (パスの頭に /en) */
const LANGS = {
  ja: {
    prefix: "",
    app: "/",
    nav: `<a href="/">エミュレーター</a><a href="/bases/">ベース一覧</a><a href="/guide">使い方</a><a href="/about">ExileDesk について</a><a href="/contact">お問い合わせ</a><a href="/en/bases/" hreflang="en">English</a>`,
    foot: `ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。MOD・段・重みはゲームのデータと poe2db の情報を元にした推定で、結果を保証するものではありません。 · <a href="/privacy">プライバシーポリシー</a> · <a href="/contact">お問い合わせ</a>`,
    side: { prefix: "プレフィックス", suffix: "サフィックス" },
    none: "無し",
    th: ["MOD (一番上の段)", "段", "T1 の Lv"],
    tierLv: (n) => `Lv ${n}`,
    share: "出やすさ",
    name: (b) => b.ja,
    cls: (c) => M.classJa(c),
    row: (r) => r.ja,
  },
  en: {
    prefix: "/en",
    app: "/?lang=en",
    nav: `<a href="/?lang=en">Emulator</a><a href="/en/bases/">Bases</a><a href="/bases/" hreflang="ja">日本語</a>`,
    foot: `ExileDesk is an unofficial fan site. Path of Exile 2 and its images and names belong to Grinding Gear Games. Mods, tiers and weights are estimates based on game data and poe2db and are not guaranteed. · <a href="/privacy">Privacy policy (Japanese)</a>`,
    side: { prefix: "Prefixes", suffix: "Suffixes" },
    none: "None",
    th: ["Mod (top tier)", "Tiers", "T1 level"],
    tierLv: (n) => `Lv ${n}`,
    share: "Weight share",
    name: (b) => b.en,
    cls: (c) => M.classEn(c),
    row: (r) => M.CATALOG_ROW_EN[r.ja] ?? r.ja,
  },
};

const rows = M.baseCatalog(data, false).filter((b) => !SKIP_CLS.test(b.cls));
const byCls = new Map();
for (const b of rows) (byCls.get(b.cls) ?? byCls.set(b.cls, []).get(b.cls)).push(b);

const urls = [];
for (const [code, L] of Object.entries(LANGS)) {
  M.setLang(code);
  const other = code === "ja" ? "en" : "ja";
  const head = (title, desc, path) => `<!doctype html>
<html lang="${code}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}${L.prefix}${path}" />
<link rel="alternate" hreflang="${code}" href="${SITE}${L.prefix}${path}" />
<link rel="alternate" hreflang="${other}" href="${SITE}${LANGS[other].prefix}${path}" />
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
  const modTable = (list) => {
    if (!list.length) return `<p class="note">${L.none}</p>`;
    return `<table><thead><tr><th>${L.th[0]}</th><th class="n">${L.th[1]}</th><th class="n">${L.th[2]}</th><th class="n">${L.share}</th></tr></thead><tbody>${list.map((r) => `<tr><td><details><summary class="mod">${esc(r.text)}</summary><table><tbody>${r.tiers.map((t) => `<tr><td class="n">${esc(t.rank)}</td><td class="mod">${esc(t.text)}</td><td class="n">${L.tierLv(esc(t.ilvl))}</td></tr>`).join("")}</tbody></table></details></td><td class="n">${r.tiers.length}</td><td class="n">${esc(r.topLevel)}</td><td class="n">${pct(r.share)}</td></tr>`).join("")}</tbody></table>`;
  };
  const textList = (list) => (list.length ? `<ul>${list.map((r) => `<li class="mod">${esc(r.text)}</li>`).join("")}</ul>` : `<p class="note">${L.none}</p>`);
  mkdirSync(resolve(OUT, `${L.prefix.slice(1)}${L.prefix ? "/" : ""}bases`), { recursive: true });

  let n = 0;
  for (const b of rows) {
    let item;
    try { item = M.freshItem(data, b.en, 82); } catch { continue; }
    const cls = L.cls(b.cls);
    const list = M.modListFor(data, item);
    const normal = list.filter((r) => r.group === "normal");
    const pre = normal.filter((r) => r.side === "prefix").sort((a, c) => c.share - a.share);
    const suf = normal.filter((r) => r.side === "suffix").sort((a, c) => c.share - a.share);
    const ess = list.filter((r) => r.group === "essence" || r.group === "perfect_essence");
    const des = list.filter((r) => r.group === "desecrated");
    const props = M.propRows(item, code === "ja");
    const impl = M.implicitRows(item, code === "ja");
    const implRange = (M.htcBaseInfo()[b.en]?.implicits ?? []).map((x) => (code === "ja" ? x.ja : x.en));
    const lvl = isJewel(b.cls) ? null : b.lvl;
    const path = `/bases/${slug(b.en)}`;
    const topPre = pre.slice(0, 3).map((r) => r.text).join(code === "ja" ? "、" : ", ");
    const name = L.name(b);
    const ja = code === "ja";
    const desc = ja
      ? `${b.ja} (${b.en}) は Path of Exile 2 の${cls}のベース。${lvl ? `必要レベル ${lvl}。` : ""}付く MOD はプレフィックス ${pre.length} 系統・サフィックス ${suf.length} 系統。段と出やすさの表と、エミュレーターで試すリンク。`
      : `${b.en} is a Path of Exile 2 base (${cls}).${lvl ? ` Required level ${lvl}.` : ""} It can roll ${pre.length} prefix and ${suf.length} suffix mod groups. Tier and weight tables, plus a link to try it in the crafting emulator.`;
    const intro = ja
      ? `${esc(b.ja)} は${esc(cls)}のベースです。${lvl ? `必要レベル (ドロップレベル) は ${lvl}。` : "ジュエルの MOD はアイテムレベルを見ず、出やすさは全部同じです。"}普通の MOD はプレフィックス ${pre.length} 系統・サフィックス ${suf.length} 系統が付きます${topPre ? `。プレフィックスで出やすいのは ${esc(topPre)} など` : ""}。`
      : `${esc(b.en)} is a base in the ${esc(cls)} class. ${lvl ? `Required (drop) level is ${lvl}. ` : "Jewel mods ignore item level and all weights are equal. "}It can roll ${pre.length} prefix and ${suf.length} suffix mod groups${topPre ? `. Common prefixes include ${esc(topPre)}` : ""}.`;
    const same = (byCls.get(b.cls) ?? []).filter((x) => x.en !== b.en).slice(0, 24);
    const title = ja ? `${b.ja} (${b.en}) の MOD と段 — PoE2 ベース | ExileDesk` : `${b.en} mods and tiers — PoE2 base | ExileDesk`;
    const html = `${head(title, desc, path)}
<p class="crumb"><a href="${L.prefix}/bases/">${ja ? "ベース一覧" : "Bases"}</a> › ${esc(cls)}</p>
<h1>${esc(name)}</h1>
<p class="en">${ja ? `${esc(b.en)} · ${esc(cls)}` : `${esc(b.ja)} · ${esc(cls)}`}</p>
<p>${intro}</p>
<p><a class="cta" href="/?${ja ? "" : "lang=en&"}base=${encodeURIComponent(b.en)}">${ja ? "エミュレーターでこのベースを試す" : "Try this base in the emulator"}</a></p>
${props.length || lvl ? `<h2>${ja ? "素の数値" : "Base stats"}</h2><table class="kv"><tbody>${lvl ? `<tr><td>${ja ? "必要レベル" : "Required level"}</td><td>${lvl}</td></tr>` : ""}${props.map((p) => `<tr><td>${esc(p.label || (ja ? "回復" : "Recovery"))}</td><td>${esc(p.value)}</td></tr>`).join("")}</tbody></table><p class="note">${ja ? "品質 0%・MOD なしの値。" : "At 0% quality with no mods."}</p>` : ""}
${implRange.length ? `<h2>${ja ? "暗黙の MOD" : "Implicit mods"}</h2><ul>${implRange.map((t, i) => `<li class="mod">${esc(t)}${impl[i]?.tags?.length ? ` <span class="note">(${esc(impl[i].tags.map((t) => M.tagLabel(t)).join(" · "))})</span>` : ""}</li>`).join("")}</ul><p class="note">${ja ? `暗黙の MOD の数値は幅の中で決まり、神のオーブで振り直せます${/^(Rings|Amulets|Jewels)/.test(b.cls) ? "。カタリストの品質で、タグの合う暗黙の MOD も伸びます" : ""}。` : `Implicit values roll within their range and can be rerolled with a Divine Orb${/^(Rings|Amulets|Jewels)/.test(b.cls) ? ". Catalyst quality also boosts implicit mods with matching tags" : ""}.`}</p>` : ""}
<h2>${ja ? "付く MOD (普通)" : "Mods (regular)"}</h2>
<p class="note">${ja ? "出やすさ = 同じ側の重みに対する割合 (アイテムレベル 82、MOD なしの時)。MOD を押すと段ごとの数値と MOD レベル。" : "Weight share = share of the weight on the same side (item level 82, no mods). Click a mod for each tier's values and mod level."}</p>
<h3>${L.side.prefix} (${pre.length})</h3>${modTable(pre)}
<h3>${L.side.suffix} (${suf.length})</h3>${modTable(suf)}
${ess.length ? `<h2>${ja ? "エッセンスで付く MOD" : "Essence mods"}</h2>${textList(ess)}` : ""}
${des.length ? `<h2>${ja ? "冒涜 (骨) で付く MOD" : "Desecrated mods (bones)"}</h2><p class="note">${ja ? "魂の井戸で発現する時の候補に出る、冒涜専用の MOD。" : "Desecrated-only mods that can appear as options when revealing at the Well of Souls."}</p>${textList(des)}` : ""}
${same.length ? `<h2>${ja ? "同じ部位のほかのベース" : "Other bases of this type"}</h2><div class="grid">${same.map((x) => `<a href="${L.prefix}/bases/${slug(x.en)}">${esc(L.name(x))}</a>`).join("")}</div>` : ""}
${foot}`;
    writeFileSync(resolve(OUT, `${L.prefix.slice(1)}${L.prefix ? "/" : ""}bases/${slug(b.en)}.html`), html);
    urls.push(`${L.prefix}${path}`);
    n++;
  }

  // 一覧
  const sections = M.CATALOG_ROWS.filter((r) => r.cls.some(([c]) => !SKIP_CLS.test(c))).map((r) => {
    const parts = r.cls.filter(([c]) => byCls.has(c)).map(([c, label]) => `<h3>${esc(code === "ja" ? label : M.classEn(c))}</h3><div class="grid">${byCls.get(c).sort((a, c2) => c2.lvl - a.lvl).map((b) => `<a href="${L.prefix}/bases/${slug(b.en)}">${esc(L.name(b))}</a>`).join("")}</div>`);
    return parts.length ? `<h2>${esc(L.row(r))}</h2>${parts.join("")}` : "";
  }).join("");
  const ja = code === "ja";
  writeFileSync(resolve(OUT, `${L.prefix.slice(1)}${L.prefix ? "/" : ""}bases/index.html`), `${head(ja ? "PoE2 ベース一覧 (付く MOD と段) | ExileDesk" : "PoE2 bases (mods and tiers) | ExileDesk", ja ? "Path of Exile 2 の武器・防具・宝飾品・ジュエルのベース一覧。ベースごとに付く MOD・段・出やすさと、エミュレーターで試すリンク。" : "All Path of Exile 2 weapon, armour, jewellery and jewel bases, with the mods, tiers and weights each can roll and a link to try it in the crafting emulator.", "/bases/")}
<h1>${ja ? "ベース一覧" : "Bases"}</h1>
<p>${ja ? "Path of Exile 2 の武器・防具・宝飾品・ジュエルのベースです。押すと、そのベースに付く MOD・段・出やすさの表と、エミュレーターでそのまま試すリンクが出ます。名前はゲームの日本語のままです。" : "Weapon, armour, jewellery and jewel bases in Path of Exile 2. Open one for the mods, tiers and weights it can roll, and a link to try it straight away in the crafting emulator."}</p>
${sections}
${foot}`);
  urls.push(`${L.prefix}/bases/`);
  console.log(`${code}: ベースのページ ${n} 枚 + 一覧`);
}
M.setLang("ja");

// サイトマップ (出力先の物を書き直す)
const fixed = ["/", "/guide", "/about", "/contact", "/privacy"];
writeFileSync(resolve(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...fixed, ...urls].map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}
</urlset>
`);
console.log(`sitemap (${fixed.length + urls.length} URL) → ${OUT}`);
