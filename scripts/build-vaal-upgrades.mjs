#!/usr/bin/env node
/**
 * build-vaal-upgrades.mjs — 生贄のオーブで上がるコラプトエンチャント (2026-09-29)
 *
 * カマサ / コペック / ヤオマックの生贄のオーブは「コラプトエンチャントをアップグレードし、ランダムな MOD を 1 個取り除く」
 * (クライアントの説明文)。上がった先はクライアントの Mods に `CorruptionUpgrade<名前>` (implicit_tags に upgraded_corruption_mod)
 * として別にあり、元のエンチャントとは groups[0] で対応する。
 *   in : data-cache/mods.{en,ja}.json (build-mods-from-client.mjs)、src/i18n/mods-bundle.json (EN / JA の文面)、src/i18n/vaal-enchants.json
 *   out: src/services/craft-stage/vaal-upgrades.json ({ 元のエンチャント id: { id, en, ja, stats } })
 *   node scripts/build-vaal-upgrades.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const mods = J("data-cache/mods.en.json");
const modsJa = J("data-cache/mods.ja.json");
const bundle = J("src/i18n/mods-bundle.json");
const enchants = J("src/i18n/vaal-enchants.json").mods;
const strip = (s) => String(s ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^|\]]+)\]/g, "$1");
const byGroup = new Map();
for (const [id, m] of Object.entries(mods)) {
  if (!id.startsWith("CorruptionUpgrade") || !(m.implicit_tags ?? []).includes("upgraded_corruption_mod")) continue;
  byGroup.set(m.groups?.[0] ?? id, id);
}
const out = {};
let miss = 0;
for (const [id, e] of Object.entries(enchants)) {
  if (e.domain !== "item") continue;
  const up = byGroup.get(e.group);
  if (!up) { miss++; continue; }
  const b = bundle[up] ?? {};
  const m = mods[up];
  out[id] = { id: up, en: strip(b.text_en ?? m.text ?? up), ja: strip(b.text_ja ?? modsJa[up]?.text ?? b.text_en ?? m.text ?? up), stats: m.stats.map((s) => ({ id: s.id, min: s.min, max: s.max })) };
}
writeFileSync(resolve(ROOT, "src/services/craft-stage/vaal-upgrades.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`上がり先 ${Object.keys(out).length} 件 (上がり先の無いエンチャント ${miss})`);
