#!/usr/bin/env node
/**
 * build-passives-ja.mjs — パッシブ (キーストーン・ノータブル) の英語名 → 日本語名 (2026-09-29)
 *
 * 上位プレイヤー MOD 一覧のビルド別の中身で、キーストーンを公式の日本語で出すため。
 * クライアントの PassiveSkills (English / Japanese は行が揃っている) から、名前の付いた物を全部。
 * 出力: src/i18n/passives-ja-client.json  ({ "Chaos Inoculation": "カオスイノキュレイション", ... })
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const dir = readdirSync(resolve(ROOT, "data-cache"))
  .map((d) => resolve(ROOT, "data-cache", d, "tables"))
  .find((d) => existsSync(resolve(d, "English/PassiveSkills.json")) && existsSync(resolve(d, "Japanese/PassiveSkills.json")));
if (!dir) {
  console.error("PassiveSkills が書き出されていない (data-cache/client-export-*/tables/{English,Japanese}/PassiveSkills.json)");
  process.exit(1);
}
const en = require(resolve(dir, "English/PassiveSkills.json"));
const ja = require(resolve(dir, "Japanese/PassiveSkills.json"));
const out = {};
en.forEach((r, i) => {
  const e = (r.Name ?? "").trim();
  const j = (ja[i]?.Name ?? "").trim();
  if (e && j && e !== j && !(e in out)) out[e] = j;
});
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(resolve(ROOT, "src/i18n/passives-ja-client.json"), JSON.stringify(sorted, null, 0) + "\n");
console.log(`passives-ja-client.json: ${Object.keys(sorted).length} 件`);
