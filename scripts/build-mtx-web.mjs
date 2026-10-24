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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * 出どころ (2026-10-25 オーナー「札と絞り込み付けて」。外さずにカードに札)。強い順に 1 つ:
 *   c = ショップの値段 (poedb (PoE1) → 無ければ poe2db の一覧の Cost。店は PoE1 と PoE2 で共通で、両方に値段のある 739 件中 733 件が同じ)
 *   pk = サポーターパックの名前 (poedb のパックのページ 52 枚の中身、または一覧の札「〜 Supporter Packs」「〜 Supporter」)
 *   bx = ミステリーボックスの名前 (poedb の箱のページ 52 枚 packs/box-*.html。10-25 に読んだが箱の値段と説明だけで中身の一覧が無く、今は 0 件。中身の出どころが見つかれば足す)
 *   rr = レースの報酬 (一覧の札 Race Rewards)。どれも無い物は出どころ不明
 */
const listInfo = new Map();
for (const html of [await poedb("Microtransactions"), await page("us")]) {
  for (const m of html.matchAll(/<a class="MTXTypes" href="[^"]+">([^<]*)<\/a><\/div>(.*?)<div class="separator">/gs)) {
    const key = unescape(m[1]).toLowerCase();
    if (listInfo.has(key) && listInfo.get(key).cost != null) continue;
    const cost = m[2].match(/Cost: <span[^>]*>(\d+)<\/span>/);
    const tags = [...(m[2].match(/<div class="property">(.*?)<\/div>/s)?.[1] ?? "").matchAll(/<a href="[^"]+">([^<]*)<\/a>/g)].map((x) => unescape(x[1]));
    listInfo.set(key, { cost: cost ? +cost[1] : null, tags });
  }
}
const packOf = new Map();
for (const f of readdirSync(resolve(CACHE, "packs")).filter((x) => /_(supporter_pack|Starter_Pack)\.html$/i.test(x))) {
  const name = f.replace(/_(supporter_pack|Starter_Pack)\.html$/i, "").replace(/_/g, " ");
  for (const n of mtxNames(readFileSync(resolve(CACHE, "packs", f), "utf8"))) if (!packOf.has(n)) packOf.set(n, name);
}
const boxOf = new Map();
for (const f of readdirSync(resolve(CACHE, "packs")).filter((x) => /^box-.*_Mystery_Box\.html$/.test(x))) {
  const name = f.replace(/^box-/, "").replace(/_Mystery_Box\.html$/, "").replace(/_/g, " ");
  for (const n of mtxNames(readFileSync(resolve(CACHE, "packs", f), "utf8"))) if (!/mystery box/.test(n) && !boxOf.has(n)) boxOf.set(n, name);
}
function originOf(en) {
  const key = en.toLowerCase();
  const info = listInfo.get(key);
  if (info?.cost != null) return { c: info.cost };
  const tag = info?.tags.find((t) => / Supporter( Packs)?$/.test(t));
  if (packOf.has(key) || tag) return { pk: packOf.get(key) ?? tag.replace(/ Supporter( Packs)?$/, "") };
  if (boxOf.has(key)) return { bx: boxOf.get(key) };
  if (info?.tags.includes("Race Rewards")) return { rr: 1 };
  return {};
}

const us = parse(await page("us"));
const jp = parse(await page("jp"));
const mtx = JSON.parse(readFileSync(resolve(ROOT, "src/services/mtx/mtx.json"), "utf8"));
const slugOf = new Map([...us].map(([slug, v]) => [v.name.toLowerCase(), slug]));

/** シリーズの札 → クライアントの表に初めて出た行 (PoE1 だけの物も含めた全部で) */
const seriesFirst = new Map();
for (const it of mtx.items) if (it.t) seriesFirst.set(it.t, Math.min(seriesFirst.get(it.t) ?? Infinity, it.i));

const items = [];
/** items と同じ並びのクライアントのシリーズの札 (ShopTag、一式の見分けに使う。出力には入れない) */
const series = [];
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
  // 発売の順の目安 (大きいほど新しい。2026-10-25 オーナー「上から発売日が近い順」): シリーズの札がある物は、そのシリーズがクライアントの表に初めて出た行 + 自分の行の小数。
  // 表の行は後から足された物が後ろに付くので、行そのままより札の初めの行の方が発売の順に合う (poedb の 7 つのパックの発売日の順と合うのを見た)。札の無い物は日付が分からないので無し (最後)
  if (it.t) row.o = seriesFirst.get(it.t) + it.i / 100000;
  Object.assign(row, originOf(it.en));
  items.push(row);
  series.push(it.t ?? "");
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

/**
 * 一式 (2026-10-25 オーナー「同じ種類の一式はもう一式としてまとめちゃっていい」「インシネレーターの幻影ポータル・武器・翼・フレーム・武器エフェクトも一式で」)。
 * poe2db に一式の分けは無いので、英語名の頭 (語の区切り) が同じで、クライアントのシリーズの札 (ShopTag) も同じ物が 3 つ以上で一式。
 * 札の無い物 (隠れ家の家具など) と札の違う物 (Arcane の防具と Arcane Golem のポータルなど) は混ぜない。頭は長い方を先に取る (Sin と Sin and Innocence は別)。
 * 種類が 2 つ以上ある物だけ (同じ種類の段違い・色違いは一式にしない)。
 * 出力: sets = [{ en, ja, main (代表の items の番号: 鎧 → 背面 → 初めの物) }]、items[].s = 入っている一式の番号、items[].o = 発売の順の目安 (無い物は日付不明)
 */
/** 一式の頭にしない言葉 (Alternate Art = レースの報酬の別絵で、一式ではない) */
const STOP = new Set(["The", "A", "An", "Alternate", "Alternate Art"]);
const prefixes = (en) => { const w = en.split(" "); return w.slice(0, -1).map((_, i) => w.slice(0, i + 1).join(" ")).reverse(); };
const count = new Map();
items.forEach((x, i) => { if (!series[i]) return; for (const p of prefixes(x.en)) { const key = `${series[i]}\t${p}`; count.set(key, (count.get(key) ?? 0) + 1); } });
const setOf = new Map();
items.forEach((x, i) => {
  if (!series[i]) return;
  const p = prefixes(x.en).find((q) => !STOP.has(q) && (count.get(`${series[i]}\t${q}`) ?? 0) >= 3);
  if (p) setOf.set(i, `${series[i]}\t${p}`);
});
// 長い頭に取られて 3 つ未満になった一式は外す
const members = new Map();
for (const [i, key] of setOf) (members.get(key) ?? members.set(key, []).get(key)).push(i);
const lcp = (a) => { let s = a[0]; for (const t of a) while (!t.startsWith(s)) s = s.slice(0, -1); return s; };
const sets = [];
for (const [key, idx] of members) {
  // 種類が 1 つだけ (フレームの段違い・同じペットの色違い・隠れ家の家具など) は一式にしない
  if (idx.length < 3 || new Set(idx.map((i) => items[i].k)).size < 2) continue;
  const en = key.split("\t")[1];
  // 日本語は部品の名前の頭 (日本語の付け方がばらばらで 1 文字しか揃わない時はシリーズの札の名前。例 Celestial = 天体)
  const head = lcp(idx.map((i) => items[i].ja)).replace(/[の・\s-]+$/, "");
  const ja = head.length >= 2 ? head : key.split("\t")[0];
  const main = idx.find((i) => items[i].k === 4) ?? idx.find((i) => items[i].k === 5) ?? idx.find((i) => items[i].a != null) ?? idx[0];
  for (const i of idx) items[i].s = sets.length;
  sets.push({ en, ja, main });
}

/**
 * ショップで買える物 (c) は出さない (2026-10-25 オーナー最後の決め「PoE2 でコスメ売ってない物、PoE1 から移植できる物のみ表示ね」。店は PoE1 と PoE2 で共通、切り替えも無し)。
 * 一式は全部の部品で見分けた後に、買えない部品だけで組み直す (残りが 1 つ以下なら一式にしない。代表は残りから同じ順で選び直す)
 */
const shopCount = items.filter((x) => x.c != null).length;
const keepIdx = items.flatMap((x, i) => (x.c == null ? [i] : []));
const newIdx = new Map(keepIdx.map((i, j) => [i, j]));
const setsOut = [];
const setDrop = { allShop: 0, onePart: 0 };
sets.forEach((t, si) => {
  const idx = keepIdx.filter((i) => items[i].s === si);
  if (idx.length < 2) {
    for (const i of idx) delete items[i].s;
    setDrop[idx.length ? "onePart" : "allShop"]++;
    return;
  }
  const main = idx.includes(t.main) ? t.main : (idx.find((i) => items[i].k === 4) ?? idx.find((i) => items[i].k === 5) ?? idx.find((i) => items[i].a != null) ?? idx[0]);
  for (const i of idx) items[i].s = setsOut.length;
  setsOut.push({ ...t, main: newIdx.get(main) });
});
const allSets = sets.length;
sets.length = 0;
sets.push(...setsOut);
items.splice(0, items.length, ...keepIdx.map((i) => items[i]));
for (const c of Object.keys(kinds)) if (!items.some((x) => x.k === +c)) delete kinds[c];

const data = {
  generated: new Date().toISOString().slice(0, 10),
  source: "client MtxTypes c19 (PoE1) & c20 (PoE2) via src/services/mtx/mtx.json, only items listed in poe2db Microtransactions (us / jp), without PoE2-born items (poedb supporter packs / rewards, PoE2 shop tags, dodge roll) and without items sold in the shop (cost on poedb / poe2db; the shop is shared by PoE1 and PoE2)",
  url: { ja: "https://poe2db.tw/jp/", en: "https://poe2db.tw/us/" },
  art: "public/mtx-art/<a>.webp",
  kinds,
  sets,
  items,
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`${items.length} 件 → ${OUT} (poe2db の一覧 ${us.size} 件、PoE2 のパックの名前 ${p2Pack.size} 件)`);
console.log(`外した: PoE2 のパック・報酬 ${dropped.pack.length}・PoE2 の札 ${dropped.tag.length}・ドッジロール ${dropped.dodge.length}・店の説明 ${dropped.store.length}・poe2db に無い ${dropped.noDb.length}`);
for (const [c, k] of Object.entries(kinds)) console.log(c, k.ja, "/", k.en ?? "(英語名なし)", items.filter((x) => x.k === +c).length);
console.log(`一式 ${sets.length} (部品 ${items.filter((x) => x.s != null).length})、例: ${sets.slice(0, 8).map((x) => `${x.en} / ${x.ja} (${items.filter((y) => sets[y.s] === x).length})`).join("、")}`);
console.log(`ショップで買える物 ${shopCount} 件を外した。一式 ${allSets} → ${sets.length} (全部ショップで消した ${setDrop.allShop}・残り 1 つで消した ${setDrop.onePart})`);
console.log(`出どころ (出す物): サポーターパック ${items.filter((x) => x.pk).length}・ミステリーボックス ${items.filter((x) => x.bx).length}・レースの報酬 ${items.filter((x) => x.rr).length}・不明 ${items.filter((x) => !x.pk && !x.bx && !x.rr).length} (パックのページ ${new Set(packOf.values()).size} 枚・箱 ${new Set(boxOf.values()).size} 個)`);
console.log("ドッジロール:", dropped.dodge.join(", "), "/ 店の説明:", dropped.store.join(", "));
console.log("poe2db に無い:", dropped.noDb.join(", "));
