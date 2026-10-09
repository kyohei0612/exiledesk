#!/usr/bin/env node
/**
 * audit-poe2db.mjs — ベースと MOD の置き場を poe2db (今のページ) と照らし合わせる (2026-10-09)
 *
 * オーナー「最終確認は db で確認が絶対いい」「POB 確認はダメ、あれ古いから必ず確認は db」「ベースチェックだなこれ片っ端から」。
 * ワンドの冒涜の置き場に攻撃武器用の MOD 6 つ (耐性貫通・スピリットリザーブ効率など) が混ざり、ルーンマスターのルーニックフォーク 3 種が無かった。
 *
 *   node scripts/audit-poe2db.mjs            (手元の写しで照らし合わせる。無いページだけ取る)
 *   node scripts/audit-poe2db.mjs --refresh  (poe2db を全部取り直す。1 ページ 1.2 秒おき)
 *
 * 取り方: poe2db の各部位のページ (/jp/<部位>) の埋め込み JSON (new ModsView({...})) の normal / desecrated。
 * 各 MOD は ModGenerationTypeID (1 = プレ、2 = サフィ) と ModFamilyList (系統)。ベースはページの説明の後の
 * 「名前 装備条件 / スキルを付与」の行。こちらはアプリと同じデータ (applyExtras 済み) の置き場とベースの一覧。
 * 比べるのは系統 (ModFamilyList を並べた物) とプレ/サフィ。数値・段の違いは見ない。
 * 結果は data-cache/poe2db-audit.json と標準出力。直し (置き場から外す物) は src/services/htc/poe2db-pool-fixes.json (--write の時)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const REFRESH = process.argv.includes("--refresh");
const WRITE = process.argv.includes("--write");
const UA = { "User-Agent": "ExileDesk/0.1 pool-audit (+https://github.com/kyohei0612/exiledesk)", "Accept-Language": "ja" };
mkdirSync(CACHE, { recursive: true });

const { loadPatchSync, baseCatalog, jaOfMod } = await bundleEntry("scripts/_audit-poe2db-entry.ts");
const data = loadPatchSync();

/** こちらの部位 → poe2db のページ (属性違いのワンド・スタッフ・クロスボウは 1 ページ) */
const pageOf = (cls) => cls.replace(/^(Wands|Staves|Crossbows)_.*$/, "$1").replace(/^OneHand_/, "One_Hand_").replace(/^TwoHand_/, "Two_Hand_");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(name) {
  const p = resolve(CACHE, `${name}.html`);
  if (!REFRESH && existsSync(p)) return readFileSync(p, "utf8");
  const r = await fetch(`https://poe2db.tw/jp/${name}`, { headers: UA });
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const html = await r.text();
  writeFileSync(p, html);
  await sleep(1200);
  return html;
}
/** 埋め込み JSON (new ModsView({...})) */
function modsView(html) {
  const i = html.indexOf("new ModsView(");
  if (i < 0) return null;
  let j = i + 13, depth = 0, inStr = false, esc = false;
  for (; j < html.length; j++) {
    const ch = html[j];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { j++; break; } }
  }
  return JSON.parse(html.slice(i + 13, j));
}
/** ページの文からベースの名前 (説明の後の「名前 装備条件 / スキルを付与」の行) */
function baseNames(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<br\s*\/?>/g, "\n").replace(/<\/(div|tr|li|h\d|p)>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const end = lines.findIndex((l) => l.includes("Modifier weight information"));
  const names = new Set();
  for (const l of lines.slice(0, end > 0 ? end : lines.length)) {
    const m = /^(\S+) (装備条件|スキルを付与|アーマー|回避力|エナジーシールド|物理ダメージ|ブロック率|品質|要求)/.exec(l);
    if (m) names.add(m[1]);
  }
  return names;
}
const famKey = (fams) => [...fams].sort().join("+");
const ourFams = (m) => famKey(m.families ?? [m.family]);

const catalog = baseCatalog(data, false);
const report = { generated: new Date().toISOString(), pages: {} };
const fixes = {};
const pages = new Map();
for (const cls of data.bases.keys()) { const p = pageOf(cls); pages.set(p, [...(pages.get(p) ?? []), cls]); }

for (const [pg, classes] of pages) {
  let html;
  try { html = await page(pg); } catch (e) { report.pages[pg] = { error: String(e) }; console.log(`! ${pg}: ${e}`); continue; }
  const mv = modsView(html);
  if (!mv) { report.pages[pg] = { error: "ModsView が無い" }; console.log(`! ${pg}: ModsView が無い`); continue; }
  const db = {};
  for (const g of ["normal", "desecrated"]) {
    db[g] = { prefix: new Set(), suffix: new Set() };
    for (const e of mv[g] ?? []) {
      const side = e.ModGenerationTypeID === "1" ? "prefix" : e.ModGenerationTypeID === "2" ? "suffix" : null;
      if (side && e.ModFamilyList?.length) db[g][side].add(famKey(e.ModFamilyList));
    }
  }
  const out = { classes, bases: {}, pools: {} };
  // ベース
  const dbBases = baseNames(html);
  const ours = new Set(catalog.filter((b) => classes.includes(b.cls)).map((b) => b.ja));
  out.bases = { db: dbBases.size, ours: ours.size, missing: [...dbBases].filter((n) => !ours.has(n)), extra: [...ours].filter((n) => !dbBases.has(n)) };
  // 置き場 (部位ごと。属性違いもそれぞれ poe2db の 1 ページと比べる)
  for (const cls of classes) {
    const b = data.bases.get(cls);
    for (const g of ["normal", "desecrated"]) {
      for (const side of ["prefix", "suffix"]) {
        const ids = b.pools[g]?.[side === "prefix" ? "prefixes" : "suffixes"] ?? [];
        const mods = ids.map((id) => data.mods.get(id)).filter(Boolean).filter((m) => !m.rune && m.tiers.some((t) => t.weight > 0) || g === "desecrated");
        // 2 つの系統にまたがる MOD を、こちらが 1 つの系統で持っている時は同じ物 (poe2db の「A+B」の中に A がある)
        const inDb = (m) => db[g][side].has(ourFams(m)) || [...db[g][side]].some((k) => k.split("+").includes(m.family));
        const extra = mods.filter((m) => !inDb(m));
        const ourKeys = new Set(mods.map(ourFams));
        const ourFamSet = new Set(mods.flatMap((m) => m.families ?? [m.family]));
        const missing = [...db[g][side]].filter((k) => !ourKeys.has(k) && !k.split("+").some((f) => ourFamSet.has(f)));
        if (extra.length || missing.length) {
          (out.pools[cls] ??= {})[`${g}.${side}`] = { extra: extra.map((m) => `${m.id} | ${jaOfMod(m)}`), missing };
          // 直しに入れるのは冒涜の置き場だけ (普通の置き場は全部 poe2db と一致。キャノンの専用 MOD は poe2db のページの書き方が違うので触らない)
          if (extra.length && g === "desecrated" && !/_cannon$/.test(cls)) ((fixes[cls] ??= {})[g] ??= []).push(...extra.map((m) => m.id));
        }
      }
    }
  }
  report.pages[pg] = out;
  const poolIssues = Object.values(out.pools).reduce((a, x) => a + Object.values(x).reduce((b, y) => b + y.extra.length + y.missing.length, 0), 0);
  console.log(`${pg.padEnd(18)} ベース db ${String(out.bases.db).padStart(2)} / こちら ${String(out.bases.ours).padStart(2)}${out.bases.missing.length ? ` 無い: ${out.bases.missing.join("・")}` : ""}${out.bases.extra.length ? ` 余計: ${out.bases.extra.join("・")}` : ""} | 置き場の食い違い ${poolIssues}`);
}
writeFileSync(resolve(ROOT, "data-cache/poe2db-audit.json"), JSON.stringify(report, null, 1));
console.log("→ data-cache/poe2db-audit.json");
if (WRITE) {
  writeFileSync(resolve(ROOT, "src/services/htc/poe2db-pool-fixes.json"), JSON.stringify({ generated: report.generated, note: "poe2db のページに無い系統を置き場から外す (scripts/audit-poe2db.mjs --write)", remove: fixes }, null, 1));
  console.log("→ src/services/htc/poe2db-pool-fixes.json");
}
