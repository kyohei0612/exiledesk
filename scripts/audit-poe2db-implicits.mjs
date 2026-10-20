#!/usr/bin/env node
/**
 * audit-poe2db-implicits.mjs — ベースの暗黙をエンジン (extra-bases.json の baseInfo.implicits) と poe2db の部位のページのベースの一覧で照らす (2026-10-20 J4)
 *
 * poe2db の部位のページ (写しは data-cache/poe2db-pages、audit-poe2db.mjs --refresh で取り直す) にはベースのカードが並び、
 * 名前の <a class="whiteitem …" href="英語の鍵"> の後に <div class="implicitMod"> が暗黙の MOD の数だけある (1 つの MOD の複数行は <br>)。
 * エンジン側はベースの英語名 → baseInfo (cls・ja・implicits)。cls は属性で分かれていないので、ベースは名前で全体から引く。
 * 比べる物: ベースがどちらかに無い / 暗黙の数 / 文 (数字を除いた形) / 数字。違いは推し量らず並べる。
 * poe2db の隠れた stat の行 (英小文字の内部名) と付与スキルの行 (スキルを付与:) は暗黙に数えない。poe2db は値 0 の行を出さないので、
 * poe2db の MOD の行がこちらの MOD の行に含まれていれば同じとみなす (不在のアミュレットの「サフィックスモッド 0個」)。
 *
 *   node scripts/audit-poe2db-implicits.mjs           直し (poe2db-implicit-fixes.json) を当てた後で照らす → data-cache/poe2db-implicit-audit.json
 *   node scripts/audit-poe2db-implicits.mjs --write   当てる前で照らして直しを作る → src/services/htc/poe2db-implicit-fixes.json (patch.ts が読み込み時に当てる)
 *
 * 直しの中身 (ベースごと): implicits = poe2db の暗黙 (英語は元の文の数字を差し替える / 型の表で作る)、variants = 同じ名前の別物 (poe2db に同じ名前のカードが
 * 2 つ以上ある時、それぞれの暗黙)、stats = 新しい並び → implicit-stats.json の元の並び (引き継げない物は null)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const CACHE_US = resolve(ROOT, "data-cache/poe2db-pages-us");
const OUT = resolve(ROOT, "data-cache/poe2db-implicit-audit.json");
const FIXES = resolve(ROOT, "src/services/htc/poe2db-implicit-fixes.json");
const WRITE = process.argv.includes("--write");
const extra = JSON.parse(readFileSync(resolve(ROOT, "src/services/htc/extra-bases.json"), "utf8"));
const { matchModLine } = await bundleEntry("scripts/_corruption-entry.ts");

const plain = (s) => String(s).replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
/** 数字・幅・記号を除いた文 (文の形の比べ) */
const shape = (s) => String(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/[0-9.()+\-%—\s]+/g, "");
/** 文の数字 (幅は両端) */
const nums = (s) => [...String(s).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const nameOfHref = (h) => decodeURIComponent(h).replace(/_/g, " ");
/** poe2db の隠れた stat の行 (英小文字の内部名、例 "local weapon implicit hidden % base damage is fire [30]") */
const hidden = (t) => /^[a-z0-9_ %+\-]+\[[^\]]*\]$/.test(t);
/** 付与スキルの行 */
const grantLine = (t) => /^(スキルを付与|Grants Skill)[:：]/.test(t);

/** ページのベースのカード: [{ href, ja, mods: string[][] (MOD ごとの行) }] */
function basesOf(html) {
  const out = [];
  for (const p of html.split('<div class="flex-grow-1 ms-2"><a class="whiteitem').slice(1)) {
    const a = /href="([^"]+)">([^<]+)<\/a>/.exec(p);
    if (!a) continue;
    const end = p.indexOf('<div class="col">');
    const body = end > 0 ? p.slice(0, end) : p;
    const divs = [...body.matchAll(/<div class="implicitMod">([\s\S]*?)<\/div>/g)].map((m) => plain(m[1]).split("\n").map((l) => l.trim()).filter(Boolean));
    out.push({ href: a[1], ja: plain(a[2]), mods: divs });
  }
  return out;
}

const byJa = new Map(Object.entries(extra.baseInfo).map(([en, x]) => [x.ja, en]));
const keyOf = (b) => (extra.baseInfo[nameOfHref(b.href)] ? nameOfHref(b.href) : byJa.get(b.ja));

// poe2db のカードをベースごとに集める (同じ名前の別物は 2 枚以上)
const cards = new Map();
/** ベース + 日本語のカードの中身 → 英語版の同じカードの MOD (行) */
const usOf = new Map();
const pageOfKey = new Map();
const onlyDb = {};
const hiddenCount = { n: 0 };
for (const f of readdirSync(CACHE).filter((x) => x.endsWith(".html")).sort()) {
  const page = f.replace(/\.html$/, "");
  // 英語版の写し (data-cache/poe2db-pages-us、あれば) はカードの並びが同じ。英語の暗黙の文に使う
  const usPath = resolve(CACHE_US, f);
  const us = existsSync(usPath) ? basesOf(readFileSync(usPath, "utf8")) : [];
  for (const [n, b] of basesOf(readFileSync(resolve(CACHE, f), "utf8")).entries()) {
    const key = keyOf(b);
    const mods = b.mods.map((lines) => { hiddenCount.n += lines.filter(hidden).length; return lines.filter((t) => !hidden(t) && !grantLine(t)); }).filter((l) => l.length);
    if (!key) { (onlyDb[page] ??= []).push(`${nameOfHref(b.href)} (${b.ja})${mods.length ? " | " + mods.map((m) => m.join(" / ")).join(" / ") : ""}`); continue; }
    if (!cards.has(key)) cards.set(key, []);
    // 同じページに同じカードが 2 度出ることがある (並びの表と一覧)。中身が同じなら 1 枚に
    if (!cards.get(key).some((c) => JSON.stringify(c) === JSON.stringify(mods))) cards.get(key).push(mods);
    const u = us[n];
    if (u && u.href === b.href) usOf.set(key + JSON.stringify(mods), u.mods.map((lines) => lines.filter((t) => !hidden(t) && !grantLine(t))).filter((l) => l.length));
    if (!pageOfKey.has(key)) pageOfKey.set(key, page);
  }
}

/** こちらの MOD (行の並び) と poe2db の MOD が同じか: 行の形が順に同じ。poe2db の行がこちらの行に含まれていればよい (値 0 の行は poe2db が出さない) */
const sameShape = (ours, db) => db.every((l) => ours.some((o) => shape(o) === shape(l))) && ours.filter((o) => !db.some((l) => shape(l) === shape(o))).every((o) => nums(o).every((n) => n === 0));
const sameNums = (ours, db) => db.every((l) => { const o = ours.find((x) => shape(x) === shape(l)); return o && nums(o).join(",") === nums(l).join(","); });
const linesOf = (imp) => imp.ja.split("\n").map((l) => l.trim());

/** 英語の文: 元の文があれば数字を順に差し替える、無ければ型の表で作る (作れなければ日本語のまま) */
function enOf(dbLines, old) {
  if (old) {
    const want = dbLines.flatMap((l) => nums(l));
    let i = 0;
    const re = /\d+(?:\.\d+)?/g;
    if ((old.en.match(re) ?? []).length === want.length) return old.en.replace(re, () => String(want[i++]));
  }
  return dbLines.map((l) => {
    const RANGE = /\((\d+(?:\.\d+)?)\s*—\s*(\d+(?:\.\d+)?)\)/g;
    const hit = matchModLine(l.replace(RANGE, "$1"));
    if (!hit) return l.replace(/—/g, "-");
    const ranges = [...l.matchAll(/\((\d+(?:\.\d+)?)\s*—\s*(\d+(?:\.\d+)?)\)|(\d+(?:\.\d+)?)/g)].map((m) => (m[1] ? `(${m[1]}-${m[2]})` : m[3]));
    let k = 0;
    const en = hit.template.replace(/#/g, () => ranges[k++] ?? "#");
    // 型の表は「# to …」で符号を値に含める。日本語の行に + があれば英語の頭にも付ける
    return hit.template.startsWith("#") && /\+[(\d]/.test(l) ? "+" + en : en;
  }).join("\n");
}

/** poe2db の 1 枚 (MOD の並び) を baseInfo の暗黙と stat の並びに直す。元の MOD は 1 度ずつ (先に数字まで同じ物、次に形だけ同じ物) */
function fromCard(mods, old, usMods) {
  const implicits = [], stats = [];
  const used = new Set();
  const find = (db, withNums) => old.findIndex((o, i) => !used.has(i) && sameShape(linesOf(o), db) && (!withNums || sameNums(linesOf(o), db)));
  // 先に全部の行で数字まで同じ物を組み、残りを形だけ同じ物と組む
  const exact = mods.map((db) => { const k = find(db, true); if (k >= 0) used.add(k); return k; });
  const loose = mods.map((db, n) => { if (exact[n] >= 0) return -1; const k = find(db, false); if (k >= 0) used.add(k); return k; });
  mods.forEach((db, n) => {
    if (exact[n] >= 0) { implicits.push(old[exact[n]]); stats.push(exact[n]); return; }
    const k = loose[n];
    const o = k >= 0 ? old[k] : null;
    // 英語は英語版のカードの同じ位置 (行の数が同じ時)、無ければ元の文の数字を差し替える / 型の表で作る
    const usLines = usMods?.[n];
    const en = usLines && usLines.length === db.length ? usLines.join("\n").replace(/—/g, "-") : enOf(db, o && linesOf(o).length === db.length ? o : null);
    implicits.push({ en, ja: db.join("\n").replace(/—/g, "-") });
    stats.push(k >= 0 ? k : null);
  });
  return { implicits, stats };
}

const fixes = WRITE ? {} : JSON.parse(readFileSync(FIXES, "utf8")).bases;
const result = { onlyDb, count: [], text: [], values: [], variants: [], same: 0 };
const newFixes = {};
for (const [key, list] of cards) {
  const info = extra.baseInfo[key];
  const old = (WRITE ? null : fixes[key]?.implicits) ?? info.implicits ?? [];
  const okCard = (mods) => mods.length === old.length && mods.every((db, i) => sameShape(linesOf(old[i]), db) && sameNums(linesOf(old[i]), db));
  if (list.length > 1) {
    // 同じ名前の別物: どれか 1 枚と同じなら暗黙はそのまま、別物として全部を持つ
    const vs = list.map((mods) => fromCard(mods, info.implicits ?? [], usOf.get(key + JSON.stringify(mods))));
    const pick = list.findIndex(okCard);
    const cur = pick >= 0 ? null : vs[0];
    newFixes[key] = { ...(cur ? { implicits: cur.implicits, stats: cur.stats } : {}), variants: vs.map((v) => v.implicits) };
    if (!WRITE && !fixes[key]?.variants) result.variants.push(`${key} | db ${list.length} 枚: ${list.map((m) => m.map((x) => x.join(" / ")).join(" + ") || "—").join(" ‖ ")}`);
    if (pick >= 0 || !WRITE) { result.same++; continue; }
    continue;
  }
  const mods = list[0];
  if (okCard(mods)) { result.same++; continue; }
  const line = `${key} | db: ${mods.map((m) => m.join(" / ")).join(" ・ ") || "—"} | こちら: ${old.map((o) => o.ja.replace(/\n/g, " / ")).join(" ・ ") || "—"}`;
  if (mods.length !== old.length) result.count.push(line);
  else if (mods.some((db, i) => !sameShape(linesOf(old[i]), db))) result.text.push(line);
  else result.values.push(line);
  newFixes[key] = fromCard(mods, info.implicits ?? [], usOf.get(key + JSON.stringify(mods)));
}
const seen = new Set(cards.keys());
const clsWithPage = new Set([...cards.keys()].map((k) => extra.baseInfo[k].cls));
const onlyEngine = Object.entries(extra.baseInfo).filter(([en, x]) => !seen.has(en) && clsWithPage.has(x.cls)).map(([en, x]) => `${en} (${x.ja}, ${x.cls})`);
const total = { poe2dbBases: cards.size, same: result.same, onlyDb: Object.values(onlyDb).flat().length, count: result.count.length, text: result.text.length, values: result.values.length, variants: result.variants.length, onlyEngine: onlyEngine.length, hidden: hiddenCount.n };
if (WRITE) {
  writeFileSync(FIXES, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), source: "poe2db の部位・ベースのページのベースのカード (scripts/audit-poe2db-implicits.mjs --write)", bases: newFixes }, null, 1) + "\n");
  console.log(`直し ${Object.keys(newFixes).length} ベース (別物つき ${Object.values(newFixes).filter((x) => x.variants).length}) → ${FIXES}`);
}
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), total, ...result, onlyEngine }, null, 1));
console.log(total, `→ ${OUT}`);
