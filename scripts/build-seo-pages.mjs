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

const head = (title, desc, path) => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${SITE}${path}" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;700&display=swap" rel="stylesheet" />
<style>${CSS}</style>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1993030721214430" crossorigin="anonymous"></script>
</head>
<body>
<header><div class="in"><a href="/">ExileDesk</a><nav><a href="/">エミュレーター</a><a href="/bases/">ベース一覧</a><a href="/guide">使い方</a><a href="/about">ExileDesk について</a><a href="/contact">お問い合わせ</a></nav></div></header>
<main>`;
const foot = `</main>
<footer><div class="in">ExileDesk は非公式のファンサイトです。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。MOD・段・重みはゲームのデータと poe2db の情報を元にした推定で、結果を保証するものではありません。 · <a href="/privacy">プライバシーポリシー</a> · <a href="/contact">お問い合わせ</a></div></footer>
</body>
</html>
`;

const rows = M.baseCatalog(data, false).filter((b) => !SKIP_CLS.test(b.cls));
const byCls = new Map();
for (const b of rows) (byCls.get(b.cls) ?? byCls.set(b.cls, []).get(b.cls)).push(b);
mkdirSync(resolve(OUT, "bases"), { recursive: true });

const SIDE = { prefix: "プレフィックス", suffix: "サフィックス" };
function modTable(list) {
  if (!list.length) return `<p class="note">無し</p>`;
  return `<table><thead><tr><th>MOD (一番上の段)</th><th class="n">段</th><th class="n">T1 の Lv</th><th class="n">出やすさ</th></tr></thead><tbody>${list.map((r) => `<tr><td><details><summary class="mod">${esc(r.text)}</summary><table><tbody>${r.tiers.map((t) => `<tr><td class="n">${esc(t.rank)}</td><td class="mod">${esc(t.text)}</td><td class="n">Lv ${esc(t.ilvl)}</td></tr>`).join("")}</tbody></table></details></td><td class="n">${r.tiers.length}</td><td class="n">${esc(r.topLevel)}</td><td class="n">${pct(r.share)}</td></tr>`).join("")}</tbody></table>`;
}
const textList = (list) => (list.length ? `<ul>${list.map((r) => `<li class="mod">${esc(r.text)}</li>`).join("")}</ul>` : `<p class="note">無し</p>`);

let n = 0;
const urls = [];
for (const b of rows) {
  let item;
  try { item = M.freshItem(data, b.en, 82); } catch { continue; }
  const cls = M.classJa(b.cls);
  const list = M.modListFor(data, item);
  const normal = list.filter((r) => r.group === "normal");
  const pre = normal.filter((r) => r.side === "prefix").sort((a, c) => c.share - a.share);
  const suf = normal.filter((r) => r.side === "suffix").sort((a, c) => c.share - a.share);
  const ess = list.filter((r) => r.group === "essence" || r.group === "perfect_essence");
  const des = list.filter((r) => r.group === "desecrated");
  const props = M.propRows(item, true);
  const impl = M.implicitRows(item, true);
  const implRange = (M.htcBaseInfo()[b.en]?.implicits ?? []).map((x) => x.ja);
  const lvl = isJewel(b.cls) ? null : b.lvl;
  const path = `/bases/${slug(b.en)}`;
  const topPre = pre.slice(0, 3).map((r) => r.text).join("、");
  const desc = `${b.ja} (${b.en}) は Path of Exile 2 の${cls}のベース。${lvl ? `必要レベル ${lvl}。` : ""}付く MOD はプレフィックス ${pre.length} 系統・サフィックス ${suf.length} 系統。段と出やすさの表と、エミュレーターで試すリンク。`;
  const intro = `${esc(b.ja)} は${esc(cls)}のベースです。${lvl ? `必要レベル (ドロップレベル) は ${lvl}。` : "ジュエルの MOD はアイテムレベルを見ず、出やすさは全部同じです。"}普通の MOD はプレフィックス ${pre.length} 系統・サフィックス ${suf.length} 系統が付きます${topPre ? `。プレフィックスで出やすいのは ${esc(topPre)} など` : ""}。`;
  const same = (byCls.get(b.cls) ?? []).filter((x) => x.en !== b.en).slice(0, 24);
  const html = `${head(`${b.ja} (${b.en}) の MOD と段 — PoE2 ベース | ExileDesk`, desc, path)}
<p class="crumb"><a href="/bases/">ベース一覧</a> › ${esc(cls)}</p>
<h1>${esc(b.ja)}</h1>
<p class="en">${esc(b.en)} · ${esc(cls)}</p>
<p>${intro}</p>
<p><a class="cta" href="/?base=${encodeURIComponent(b.en)}">エミュレーターでこのベースを試す</a></p>
${props.length || lvl ? `<h2>素の数値</h2><table class="kv"><tbody>${lvl ? `<tr><td>必要レベル</td><td>${lvl}</td></tr>` : ""}${props.map((p) => `<tr><td>${esc(p.label || "回復")}</td><td>${esc(p.value)}</td></tr>`).join("")}</tbody></table><p class="note">品質 0%・MOD なしの値。</p>` : ""}
${implRange.length ? `<h2>暗黙の MOD</h2><ul>${implRange.map((t, i) => `<li class="mod">${esc(t)}${impl[i]?.tags?.length ? ` <span class="note">(${esc(impl[i].tags.map((t) => M.tagLabel(t)).join(" · "))})</span>` : ""}</li>`).join("")}</ul><p class="note">暗黙の MOD の数値は幅の中で決まり、神のオーブで振り直せます${/^(Rings|Amulets|Jewels)/.test(b.cls) ? "。カタリストの品質で、タグの合う暗黙の MOD も伸びます" : ""}。</p>` : ""}
<h2>付く MOD (普通)</h2>
<p class="note">出やすさ = 同じ側の重みに対する割合 (アイテムレベル 82、MOD なしの時)。MOD を押すと段ごとの数値と MOD レベル。</p>
<h3>${SIDE.prefix} (${pre.length})</h3>${modTable(pre)}
<h3>${SIDE.suffix} (${suf.length})</h3>${modTable(suf)}
${ess.length ? `<h2>エッセンスで付く MOD</h2>${textList(ess)}` : ""}
${des.length ? `<h2>冒涜 (骨) で付く MOD</h2><p class="note">魂の井戸で発現する時の候補に出る、冒涜専用の MOD。</p>${textList(des)}` : ""}
${same.length ? `<h2>同じ部位のほかのベース</h2><div class="grid">${same.map((x) => `<a href="/bases/${slug(x.en)}">${esc(x.ja)}</a>`).join("")}</div>` : ""}
${foot}`;
  writeFileSync(resolve(OUT, `bases/${slug(b.en)}.html`), html);
  urls.push(path);
  n++;
}

// 一覧
const sections = M.CATALOG_ROWS.filter((r) => r.cls.some(([c]) => !SKIP_CLS.test(c))).map((r) => {
  const parts = r.cls.filter(([c]) => byCls.has(c)).map(([c, label]) => `<h3>${esc(label)}</h3><div class="grid">${byCls.get(c).sort((a, c2) => c2.lvl - a.lvl).map((b) => `<a href="/bases/${slug(b.en)}">${esc(b.ja)}</a>`).join("")}</div>`);
  return parts.length ? `<h2>${esc(r.ja)}</h2>${parts.join("")}` : "";
}).join("");
writeFileSync(resolve(OUT, "bases/index.html"), `${head("PoE2 ベース一覧 (付く MOD と段) | ExileDesk", "Path of Exile 2 の武器・防具・宝飾品・ジュエルのベース一覧。ベースごとに付く MOD・段・出やすさと、エミュレーターで試すリンク。", "/bases/")}
<h1>ベース一覧</h1>
<p>Path of Exile 2 の武器・防具・宝飾品・ジュエルのベースです。押すと、そのベースに付く MOD・段・出やすさの表と、エミュレーターでそのまま試すリンクが出ます。名前はゲームの日本語のままです。</p>
${sections}
${foot}`);

// サイトマップ (出力先の物を書き直す)
const fixed = ["/", "/guide", "/bases/", "/about", "/contact", "/privacy"];
writeFileSync(resolve(OUT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...fixed, ...urls].map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join("\n")}
</urlset>
`);
console.log(`ベースのページ ${n} 枚 + 一覧 + sitemap (${fixed.length + urls.length} URL) → ${OUT}`);
