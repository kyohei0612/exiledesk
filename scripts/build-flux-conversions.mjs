#!/usr/bin/env node
/**
 * build-flux-conversions.mjs — 耐性のフラックスの変換表 (2026-10-10 要望「虚無フラックスで T3 火 → T2 混沌、冒涜専用の火 & 混沌 → T1 混沌」)。
 * クライアントの Expedition2ElementalModConversions (火 / 冷気 / 雷 / 混沌の MOD を 1 行ずつ対応させた表) のうち耐性の行を、
 * MOD の名前 (接尾辞)・Lv・数値の幅で書き出す。エンジンの MOD の段とはこの 3 つで突き合わせる (apply-flux.ts)。
 *   cd data-cache/client-export-flux && npx pathofexile-dat   (config.json に表と列)
 *   node scripts/build-flux-conversions.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
const dir = "data-cache/client-export-flux/tables/English";
const rows = JSON.parse(readFileSync(`${dir}/Expedition2ElementalModConversions.json`, "utf8"));
const mods = JSON.parse(readFileSync(`${dir}/Mods.json`, "utf8"));
const side = (i) => {
  const m = mods[i];
  if (!m) return null;
  const ranges = [1, 2, 3, 4].filter((n) => m[`Stat${n}`] != null).map((n) => m[`Stat${n}Value`]);
  return { id: m.Id, name: m.Name, level: m.Level, ranges };
};
const out = rows
  .map((r) => ({ id: r.Id, fire: side(r.FireMod), cold: side(r.ColdMod), lightning: side(r.LightningMod), chaos: side(r.ChaosMod) }))
  .filter((r) => [r.fire, r.cold, r.lightning, r.chaos].some((x) => x && /Resist/i.test(x.id)));
writeFileSync("src/data/flux-conversions.json", JSON.stringify({ source: "GGG クライアント Expedition2ElementalModConversions (耐性の行)", rows: out }, null, 1) + "\n");
console.log(`${out.length} 行 → src/data/flux-conversions.json`);
