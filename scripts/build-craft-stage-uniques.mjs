#!/usr/bin/env node
/**
 * build-craft-stage-uniques.mjs — クラフトステージのユニークの効果 (2026-09-28、POE2Tube 要望 ⑨)
 *
 * 可能性のオーブでなったユニークの効果 (MOD の行) をアイテム枠に出すため。クライアントの表には「どのユニークがどの MOD」の
 * 対応が無いので、保存済みの poe2db のユニークのページ (日本語) の explicitMod を使う。
 *   in : data-cache/poe2db-unique-pages/*_jp.html (2026-05-22 保存) と src/i18n/vaal-enchants.json の uniques (ステージでなり得るユニーク)
 *   out: src/services/craft-stage/stage-uniques.json ({ 英語名: [日本語の行 (値の幅は "(10—20)" のまま)] })
 * ページが無いユニーク (保存後に増えた物) は入らない → アイテム枠は名前だけ。
 *   node scripts/build-craft-stage-uniques.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "data-cache/poe2db-unique-pages");
const want = new Set(Object.keys(JSON.parse(readFileSync(resolve(ROOT, "src/i18n/vaal-enchants.json"), "utf8")).uniques));
const text = (h) => h.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const out = {};
for (const f of readdirSync(DIR).filter((f) => f.endsWith("_jp.html")).sort()) {
  const s = readFileSync(resolve(DIR, f), "utf8");
  // 1 個目のアイテムの箱 (英語名は箱の終わりの <div> 名前 </div>)
  const m = s.match(/<div class="Stats">([\s\S]*?)<\/div>\s*<div>\s*([^<]+?)\s*<\/div>\s*<\/div>/);
  if (!m) continue;
  const name = m[2].trim();
  if (!want.has(name) || out[name]) continue;
  const lines = [...m[1].matchAll(/<div class="explicitMod">([\s\S]*?)<\/div>/g)].map((x) => text(x[1])).filter(Boolean);
  if (lines.length) out[name] = lines;
}
const keys = Object.keys(out).sort();
writeFileSync(resolve(ROOT, "src/services/craft-stage/stage-uniques.json"), JSON.stringify(Object.fromEntries(keys.map((k) => [k, out[k]])), null, 1) + "\n");
console.log(`ユニーク ${keys.length} / ${want.size} 件 (ページ無し ${want.size - keys.length})`);
