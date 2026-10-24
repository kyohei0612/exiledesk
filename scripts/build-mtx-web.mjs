#!/usr/bin/env node
/**
 * build-mtx-web.mjs — Web の「PoE2 で使える PoE1 のスキン」の一覧のデータ (2026-10-25)
 *
 * オーナー「スキン PoE2 で使える PoE1 スキン一覧みたいな奴、それだけでいいから。DB 調べって話と責任持てませんって話で」。
 * 元はアプリの src/services/mtx/mtx.json (クライアントの MtxTypes の列 19 = PoE1 / 20 = PoE2、build-mtx-from-client.mjs) のうち両方で使える物 (p = 3)。
 * 裏取りは poe2db の Microtransactions の一覧 (PoE2 で使える物だけが載る。英 /us・日 /jp の 2 ページ):
 *   一覧に英語名がある物だけ出す (名前は poe2db の日英)。無い物は出さない (10-25 オーナー)。PoE2 で出た物も外す (下の poe2Born)。
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

/** poedb (PoE1 の DB) のページ。写しは data-cache/poe2db-mtx/packs (--fetch で取り直す) */
async function poedb(name) {
  const file = resolve(CACHE, "packs", `${name}.html`);
  if (process.argv.includes("--fetch") || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    const r = await fetch(`https://poedb.tw/us/${name}`, { headers: UA });
    if (!r.ok) throw new Error(`poedb ${name} ${r.status}`);
    writeFileSync(file, await r.text());
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  return readFileSync(file, "utf8");
}
const mtxNames = (html) => [...html.matchAll(/<a class="MTXTypes"[^>]*>([^<]+)<\/a>/g)].map((m) => unescape(m[1]).toLowerCase());

/**
 * PoE2 で出た物 (外す。2026-10-25 オーナー「PoE2 産の物は表示無しで OK、持ってる PoE1 のスキンを PoE2 で使いたいってだけ」)。
 * クライアントの列 19 は PoE2 で出た物にも立つので、出どころで分ける:
 *   ① poedb の PoE2 のサポーターパック 4 つの中身 (PoE1 のパックは Mercenaries of Trarthus 3.26・Keepers of the Flame 3.27・Mirage 3.28・Curse of the Allflame 3.29、どれもページに PoE1 の版)
 *   ② poedb の Supporter pack のページの、PoE2 の版の Launch / Livestream の報酬の表 (The Game Awards 2025 はドルイドの物)
 *   ③ クライアントの札 (ShopTag) が PoE2 の版の名前の物
 *   ④ 名前に Dodge Roll (ドッジロールは PoE2 だけの動き。PoE1 の同じ種類は水銀フラスコのエフェクト)
 *   ⑤ ①の名前の言い方が違うだけの物 (poedb の Return of the Ancients の店の説明に Storm of Divinity の portal・Bloodreaver の charges)
 */
const P2_PACKS = ["Path_of_Exile_2_Early_Access", "Rise_of_the_Abyssal", "Last_of_the_Druids", "Return_of_the_Ancients"];
const P2_REWARD = /^(Path of Exile 2|Dawn of the Hunt|The Third Edict|The Last of the Druids|Return of the Ancients|The Game Awards)/i;
const P2_TAGS = new Set(["Path of Exile 2 早期アクセス", "Dawn of the Hunt", "サードエディクト", "ラストオブドルイド", "Return of the Ancients"]);
const P2_NAMES = new Set(["storm of divinity portal effect", "bloodreaver charges effect"]);
const p2Pack = new Set();
for (const p of P2_PACKS) for (const n of mtxNames(await poedb(`${p}_supporter_pack`))) p2Pack.add(n);
for (const row of (await poedb("Supporter_pack")).match(/<tr.*?<\/tr>/gs) ?? []) {
  const head = unescape((row.match(/<td[^>]*>(.*?)<\/td>/s)?.[1] ?? "").replace(/<[^>]+>/g, ""));
  if (P2_REWARD.test(head)) for (const n of mtxNames(row)) p2Pack.add(n);
}
const poe2Born = (it) => (p2Pack.has(it.en.toLowerCase()) ? "pack" : P2_TAGS.has(it.t) ? "tag" : /Dodge Roll/i.test(it.en) ? "dodge" : P2_NAMES.has(it.en.toLowerCase()) ? "store" : null);

const us = parse(await page("us"));
const jp = parse(await page("jp"));
const mtx = JSON.parse(readFileSync(resolve(ROOT, "src/services/mtx/mtx.json"), "utf8"));
const slugOf = new Map([...us].map(([slug, v]) => [v.name.toLowerCase(), slug]));

const items = [];
const tagCount = {};
/** 外した物 (理由ごと) */
const dropped = { pack: [], tag: [], dodge: [], store: [], noDb: [] };
for (const it of mtx.items) {
  if (it.p !== 3) continue;
  const why = poe2Born(it);
  if (why) { dropped[why].push(it.en); continue; }
  const slug = slugOf.get(it.en.toLowerCase()) ?? null;
  // poe2db の一覧に無い物は出さない (2026-10-25 オーナー「DB に無ければそもそも表示無くていい」)
  if (!slug) { dropped.noDb.push(it.en); continue; }
  const row = { en: us.get(slug).name, ja: jp.get(slug)?.name ?? it.ja, k: it.c, slug };
  if (it.a != null) row.a = it.a;
  items.push(row);
  {
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
  source: "client MtxTypes c19 (PoE1) & c20 (PoE2) via src/services/mtx/mtx.json, only items listed in poe2db Microtransactions (us / jp), without PoE2-born items (poedb supporter packs / rewards, PoE2 shop tags, dodge roll)",
  url: { ja: "https://poe2db.tw/jp/", en: "https://poe2db.tw/us/" },
  art: "public/mtx-art/<a>.webp",
  kinds,
  items,
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`${items.length} 件 → ${OUT} (poe2db の一覧 ${us.size} 件、PoE2 のパックの名前 ${p2Pack.size} 件)`);
console.log(`外した: PoE2 のパック・報酬 ${dropped.pack.length}・PoE2 の札 ${dropped.tag.length}・ドッジロール ${dropped.dodge.length}・店の説明 ${dropped.store.length}・poe2db に無い ${dropped.noDb.length}`);
for (const [c, k] of Object.entries(kinds)) console.log(c, k.ja, "/", k.en ?? "(英語名なし)", items.filter((x) => x.k === +c).length);
console.log("ドッジロール:", dropped.dodge.join(", "), "/ 店の説明:", dropped.store.join(", "));
console.log("poe2db に無い:", dropped.noDb.join(", "));
