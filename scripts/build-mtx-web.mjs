#!/usr/bin/env node
/**
 * build-mtx-web.mjs — Web の「PoE2 で使える PoE1 のスキン」の一覧のデータ (2026-10-25)
 *
 * オーナー「スキン PoE2 で使える PoE1 スキン一覧みたいな奴、それだけでいいから。DB 調べって話と責任持てませんって話で」。
 * 元はアプリの src/services/mtx/mtx.json (クライアントの MtxTypes の列 19 = PoE1 / 20 = PoE2、build-mtx-from-client.mjs) のうち両方で使える物 (p = 3)。
 * 裏取りは poe2db の Microtransactions の一覧 (PoE2 で使える物だけが載る。英 /us・日 /jp の 2 ページ):
 *   一覧に英語名があれば ok = true、名前は poe2db の日英。無ければ ok = false、名前はクライアントの日英のまま (訳していない)。
 *   PoE1 で使えるかは poe2db に書いていないのでクライアントの列 19 だけ。
 * 種類 k はクライアントの MicrotransactionCategory (日本語名は kinds)。英語名は poe2db の一覧の種類の札がその種類の 6 割以上で同じ時だけ、それ以外は null。
 *   種類ではない札 (シリーズの Race Rewards・別の種類の Pet) は英語名にしない (NOT_KIND)。
 *   node scripts/build-mtx-web.mjs [--fetch]   (--fetch で poe2db の 2 ページを取り直す、ふだんは data-cache/poe2db-mtx の写し)
 *   out: src/data/mtx-poe1-in-poe2.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-mtx");
const OUT = resolve(ROOT, "src/data/mtx-poe1-in-poe2.json");
const UA = { "User-Agent": "ExileDesk/0.1 mtx-check (+https://github.com/kyohei0612/exiledesk)" };

async function page(lang) {
  const file = resolve(CACHE, `mtx-${lang}.html`);
  if (process.argv.includes("--fetch") || !existsSync(file)) {
    mkdirSync(CACHE, { recursive: true });
    const r = await fetch(`https://poe2db.tw/${lang}/Microtransactions`, { headers: UA });
    if (!r.ok) throw new Error(`poe2db ${lang} ${r.status}`);
    writeFileSync(file, await r.text());
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return readFileSync(file, "utf8");
}

const unescape = (s) => s.replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();

/** 一覧の 1 件 = <a class="MTXTypes" href="slug">名前</a> の後に種類・シリーズの札 (無い物もある) */
function parse(html) {
  const out = new Map();
  const re = /<div class="fw-bold"><a class="MTXTypes" href="([^"]+)">([^<]*)<\/a><\/div><div>(<div class="property">(.*?)<\/div>)?/g;
  for (const m of html.matchAll(re)) {
    const tags = [...(m[4] ?? "").matchAll(/<a href="[^"]+">([^<]*)<\/a>/g)].map((x) => unescape(x[1]));
    out.set(m[1], { name: unescape(m[2]), tags });
  }
  return out;
}

const us = parse(await page("us"));
const jp = parse(await page("jp"));
const mtx = JSON.parse(readFileSync(resolve(ROOT, "src/services/mtx/mtx.json"), "utf8"));
const slugOf = new Map([...us].map(([slug, v]) => [v.name.toLowerCase(), slug]));

const items = [];
const tagCount = {};
for (const it of mtx.items) {
  if (it.p !== 3) continue;
  const slug = slugOf.get(it.en.toLowerCase()) ?? null;
  const row = slug
    ? { en: us.get(slug).name, ja: jp.get(slug)?.name ?? it.ja, k: it.c, slug, ok: true }
    : { en: it.en, ja: it.ja, k: it.c, slug: null, ok: false };
  if (it.a != null) row.a = it.a;
  items.push(row);
  if (slug) {
    const t = (tagCount[it.c] ??= {});
    const key = `${us.get(slug).tags[0] ?? ""}\t${jp.get(slug)?.tags[0] ?? ""}`;
    t[key] = (t[key] ?? 0) + 1;
  }
}

const NOT_KIND = new Set(["Race Rewards", "Pet"]);
const kinds = {};
for (const c of [...new Set(items.map((x) => x.k))].sort((a, b) => a - b)) {
  const t = tagCount[c] ?? {};
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const [top, n] = Object.entries(t).sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const tag = top.split("\t")[0];
  const en = total && n / total >= 0.6 && tag && !NOT_KIND.has(tag) ? tag : null;
  kinds[c] = { ja: mtx.cats[c] ?? null, en };
}

const data = {
  generated: new Date().toISOString().slice(0, 10),
  source: "client MtxTypes c19 (PoE1) & c20 (PoE2) via src/services/mtx/mtx.json, checked against poe2db Microtransactions (us / jp)",
  url: { ja: "https://poe2db.tw/jp/", en: "https://poe2db.tw/us/" },
  art: "public/mtx-art/<a>.webp",
  kinds,
  items,
};
writeFileSync(OUT, JSON.stringify(data));
const ok = items.filter((x) => x.ok).length;
console.log(`${items.length} 件 (poe2db で裏が取れた ${ok} / 無い ${items.length - ok})、poe2db の一覧 ${us.size} 件 → ${OUT}`);
for (const [c, k] of Object.entries(kinds)) console.log(c, k.ja, "/", k.en ?? "(英語名なし)", items.filter((x) => x.k === +c).length);
console.log("poe2db に無い:", items.filter((x) => !x.ok).map((x) => x.en).join(", "));
