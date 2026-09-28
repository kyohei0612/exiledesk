#!/usr/bin/env node
/**
 * build-htc-base-rows.mjs — ベース名 → 計算機のエンジンの行 (MOD の置き場の単位) の軽い対応表 (2026-09-29)
 *
 * オーナー「ベースの能力値によってつく MOD 違う。複数の MOD 計算機を使ってるなら 1 つにして管理しやすく」。
 * MOD の置き場はエンジンの行 (Gloves_str / Gloves_int / Wands_fire …) が正。エンジン本体 (4 MB) を読まずに
 * 行だけ引きたい所 (上位プレイヤー MOD 一覧の段の表など) のために、行の対応だけを書き出す。
 *   in : src/vendor/poe2htc/data/base_items.json + src/services/htc/extra-bases.json (items / addedBases)
 *   out: src/services/htc/base-rows.json ({ ベース英語名: 行 })
 *   node scripts/build-htc-base-rows.mjs   (build-htc-bases-from-client.mjs の後に)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const J = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const vendor = J("src/vendor/poe2htc/data/base_items.json").items;
const extra = J("src/services/htc/extra-bases.json");
const out = {};
for (const row of [...vendor, ...(extra.items ?? [])]) for (const n of row.bases ?? []) out[n] ??= row.id;
for (const [id, names] of Object.entries(extra.addedBases ?? {})) for (const n of names) out[n] ??= id;
const keys = Object.keys(out).sort();
writeFileSync(resolve(ROOT, "src/services/htc/base-rows.json"), JSON.stringify(Object.fromEntries(keys.map((k) => [k, out[k]]))) + "\n");
console.log(`ベース ${keys.length} 件 → 行 ${new Set(Object.values(out)).size} 種類`);
