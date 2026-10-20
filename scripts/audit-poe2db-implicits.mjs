#!/usr/bin/env node
/**
 * audit-poe2db-implicits.mjs — ベースの暗黙をエンジン (extra-bases.json の baseInfo.implicits) と poe2db の部位のページのベースの一覧で照らす (2026-10-20 J4)
 *
 * poe2db の部位のページ (写しは data-cache/poe2db-pages、audit-poe2db.mjs --refresh で取り直す) にはベースのカードが並び、
 * 名前の <a class="whiteitem …" href="英語の鍵"> の後に <div class="implicitMod"> が暗黙の数だけある。
 * エンジン側はベースの英語名 → baseInfo (cls・ja・implicits)。部位の対応は cls → ページの名前 (audit-poe2db-tags.mjs の pageOf と同じ)。
 * 比べる物: ベースがどちらかに無い / 暗黙の数 / 文 (数字を除いた形) / 数字。違いは推し量らず並べる。
 *
 *   node scripts/audit-poe2db-implicits.mjs   → data-cache/poe2db-implicit-audit.json と標準出力の集計
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const OUT = resolve(ROOT, "data-cache/poe2db-implicit-audit.json");
const extra = JSON.parse(readFileSync(resolve(ROOT, "src/services/htc/extra-bases.json"), "utf8"));

const plain = (s) => String(s).replace(/<br\s*\/?>/g, " / ").replace(/<[^>]+>/g, "").replace(/&#039;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
/** 数字・幅・記号を除いた文 (文の形の比べ) */
const shape = (s) => plain(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/[0-9.()+\-%—\s]+/g, "");
/** 文の数字 (幅は両端) */
const nums = (s) => [...plain(s).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
/** href の鍵 → 英語のベース名 (Grasping_Ring → Grasping Ring) */
const nameOfHref = (h) => decodeURIComponent(h).replace(/_/g, " ");

/** ページのベースのカード: [{ href, ja, implicits[] }] */
function basesOf(html) {
  const out = [];
  const parts = html.split('<div class="flex-grow-1 ms-2"><a class="whiteitem');
  for (const p of parts.slice(1)) {
    const a = /href="([^"]+)">([^<]+)<\/a>/.exec(p);
    if (!a) continue;
    const end = p.indexOf('<div class="col">');
    const body = end > 0 ? p.slice(0, end) : p;
    const imps = [...body.matchAll(/<div class="implicitMod">([\s\S]*?)<\/div>/g)].map((m) => plain(m[1]));
    out.push({ href: a[1], ja: plain(a[2]), implicits: imps });
  }
  return out;
}

// エンジンのベース (英語名 → info、日本語名 → 英語名)。cls は属性で分かれていない (Body_Armours) ので、ベースは名前で全体から引く
const byJa = new Map(Object.entries(extra.baseInfo).map(([en, x]) => [x.ja, en]));
/** poe2db の隠れた stat の行 (英小文字の内部名、例 "local weapon implicit hidden % base damage is fire [30]") */
const hidden = (t) => /^[a-z0-9_ %+\-]+\[[^\]]*\]$/.test(t);
/** 付与スキルの行 */
const grantLine = (t) => /^(スキルを付与|Grants Skill)[:：]/.test(t);
const ourLines = (info) => (info.implicits ?? []).flatMap((x) => x.ja.split("\n").map((l) => l.trim()));

const result = {};
const total = { pages: 0, bases: 0, onlyEngine: 0, onlyDb: 0, count: 0, text: 0, values: 0, grants: 0, hidden: 0, same: 0 };
const seen = new Set();
const pagesOfCls = new Set();
for (const f of readdirSync(CACHE).filter((x) => x.endsWith(".html")).sort()) {
  const page = f.replace(/\.html$/, "");
  const db = basesOf(readFileSync(resolve(CACHE, f), "utf8"));
  const r = { onlyDb: [], count: [], text: [], values: [], grants: [], hidden: 0, same: 0 };
  for (const b of db) {
    const href = nameOfHref(b.href);
    const key = extra.baseInfo[href] ? href : byJa.get(b.ja);
    const info = key ? extra.baseInfo[key] : null;
    if (!info) { r.onlyDb.push(`${href} (${b.ja})${b.implicits.length ? " | " + b.implicits.join(" / ") : ""}`); continue; }
    seen.add(key); pagesOfCls.add(info.cls);
    const lines = b.implicits.flatMap((t) => t.split(" / ").map((x) => x.trim()));
    r.hidden += lines.filter(hidden).length;
    const dbGrants = lines.filter(grantLine), dbImp = lines.filter((t) => !hidden(t) && !grantLine(t));
    if (dbGrants.length !== (info.grants ?? []).length) r.grants.push(`${key} | db: ${dbGrants.join(" / ") || "—"} | こちら: ${(info.grants ?? []).map((g) => g.en).join(" / ") || "—"}`);
    const ourImp = ourLines(info);
    if (ourImp.length !== dbImp.length) { r.count.push(`${key} | db ${dbImp.length}: ${dbImp.join(" / ") || "—"} | こちら ${ourImp.length}: ${ourImp.join(" / ") || "—"}`); continue; }
    let bad = false;
    ourImp.forEach((t, k) => {
      const d = dbImp[k];
      if (shape(t) !== shape(d)) { r.text.push(`${key} | db: ${d} | こちら: ${t}`); bad = true; return; }
      if (nums(t).join(",") !== nums(d).join(",")) { r.values.push(`${key} | db: ${d} | こちら: ${t}`); bad = true; }
    });
    if (!bad) r.same++;
  }
  result[page] = r;
  total.pages++; total.bases += db.length; total.hidden += r.hidden; total.same += r.same;
  for (const k of ["onlyDb", "count", "text", "values", "grants"]) total[k] += r[k].length;
  const bits = ["onlyDb", "count", "text", "values", "grants"].filter((k) => r[k].length).map((k) => `${k} ${r[k].length}`);
  console.log(`${page.padEnd(26)} poe2db ${String(db.length).padStart(3)} 同じ ${String(r.same).padStart(3)}${bits.length ? " / " + bits.join(" / ") : ""}`);
}
// エンジンにあって poe2db のどのページにも出ないベース (写しのページがある種類だけ)
const onlyEngine = Object.entries(extra.baseInfo).filter(([en, x]) => !seen.has(en) && pagesOfCls.has(x.cls)).map(([en, x]) => `${en} (${x.ja}, ${x.cls})`);
total.onlyEngine = onlyEngine.length;
result._onlyEngine = onlyEngine;
writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), total, pages: result }, null, 1));
console.log(total, `→ ${OUT}`);
