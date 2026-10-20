#!/usr/bin/env node
/**
 * build-corruption-mods.mjs — ヴァールのオーブのコラプトで付く MOD の表を poe2db から作る (2026-10-20 オーナー「コラプトの MOD 一覧はエンジン部が持つ」)
 *
 * poe2db の部位のページ (写しは data-cache/poe2db-pages、取り直しは audit-poe2db.mjs --refresh) の ModsView の
 *   corrupted          = ヴァールのオーブで付くエンチャント (ModGenerationTypeID 5)
 *   corruption_upgrade = 強まったコラプトの行 (CorruptionUpgrade…、ModGenerationTypeID 3)
 * を部位ごとに写す。文は日本語のページの物で、値の幅 (a—b) を最小・最大で埋めて貼り付けの型の表 (paste-parse の matchModLine) に当て、
 * 英語の型と値の幅にする (日英どちらの貼り付けでも型で照らせる)。型に当たらない物は template: null (日本語の文で照らす)。
 *
 *   node scripts/build-corruption-mods.mjs   → src/services/mods/corruption-mods.json
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./_bundle-ts.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = resolve(ROOT, "data-cache/poe2db-pages");
const OUT = resolve(ROOT, "src/services/mods/corruption-mods.json");
const { matchModLine } = await bundleEntry("scripts/_corruption-entry.ts");

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
const plain = (s) => String(s).replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " ").trim();
const RANGE = /\((-?\d+(?:\.\d+)?)\s*[—-]\s*(-?\d+(?:\.\d+)?)\)/g;

const KINDS = { corrupted: "enchant", corruption_upgrade: "upgrade" };
const pages = {};
let total = 0, typed = 0;
const dates = [];
for (const f of readdirSync(CACHE).filter((x) => x.endsWith(".html")).sort()) {
  const v = modsView(readFileSync(resolve(CACHE, f), "utf8"));
  if (!v) continue;
  dates.push(statSync(resolve(CACHE, f)).mtime.toISOString().slice(0, 10));
  const rows = [];
  for (const [key, kind] of Object.entries(KINDS)) {
    for (const e of v[key] ?? []) {
      // 複数行の物 (2 つの効果) は行ごとに型に当て、型は改行でつなぐ
      const ja = plain(e.str);
      const lines = ja.split("\n");
      const lo = lines.map((l) => matchModLine(l.replace(RANGE, "$1")));
      const hi = lines.map((l) => matchModLine(l.replace(RANGE, "$2")));
      const ok = lo.every((x, k) => x && hi[k] && x.template === hi[k].template);
      const ranges = ok ? lo.flatMap((x, k) => x.values.map((a, n) => [Math.min(a, hi[k].values[n]), Math.max(a, hi[k].values[n])])) : [];
      rows.push({
        kind, id: String(e.Name), gen: Number(e.ModGenerationTypeID), family: e.ModFamilyList ?? [], level: Number(e.Level ?? 0),
        ja: lines.join("\n"), template: ok ? lo.map((x) => x.template).join("\n") : null, ranges,
      });
      total++; if (ok) typed++;
    }
  }
  pages[f.replace(/\.html$/, "")] = rows;
}
const out = {
  generated: new Date().toISOString().slice(0, 10),
  source: `poe2db.tw の部位のページ (ModsView の corrupted / corruption_upgrade)、写しの日付 ${[...new Set(dates)].join(", ")}`,
  pages,
};
writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`部位 ${Object.keys(pages).length}、行 ${total} (英語の型に当たった ${typed}、当たらない ${total - typed}) → ${OUT}`);
for (const [p, rows] of Object.entries(pages)) for (const r of rows) if (!r.template) console.log("  型なし", p, r.id, JSON.stringify(r.ja));
