/**
 * build-skills-ja-from-client.mjs
 * --------------------------------------------------------------
 * GGG クライアントの ActiveSkills (DisplayedName) から スキル名 EN → JA 辞書を作る。
 * 用途: 上位プレイヤー MOD 一覧の「ベースが付与するスキル」(不在のアミュレット / 王笏) の日本語表示 (2026-09-12)。
 *
 * 前提: build-dicts-from-client.mjs が data-cache/client-export/ に ActiveSkills を書き出し済み。
 * 出力: src/i18n/skills-ja-client.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EXPORT_DIR, ROOT } from "./client-export-config.mjs";

const OUT = resolve(ROOT, "src/i18n/skills-ja-client.json");

async function loadTable(lang, name) {
  return JSON.parse(await readFile(resolve(EXPORT_DIR, "tables", lang, `${name}.json`), "utf8"));
}
const norm = (s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

const en = await loadTable("English", "ActiveSkills");
const ja = await loadTable("Japanese", "ActiveSkills");
if (en.length !== ja.length) throw new Error(`ActiveSkills row mismatch EN=${en.length} JA=${ja.length}`);

const dict = {};
let skipped = 0;
for (let i = 0; i < en.length; i++) {
  const e = norm(en[i].DisplayedName);
  const j = norm(ja[i].DisplayedName);
  if (!e || !j || e === j || e.startsWith("[DNT")) {
    skipped++;
    continue;
  }
  // 同名の英語スキルが複数行ある (モンスター用等)。先勝ちで固定して安定させる。
  if (dict[e] === undefined) dict[e] = j;
}
const sorted = Object.fromEntries(Object.entries(dict).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(OUT, JSON.stringify(sorted, null, 2) + "\n", "utf8");
console.log(`[build-skills-ja] ActiveSkills ${en.length} rows -> ${Object.keys(sorted).length} names (${skipped} skipped) -> ${OUT}`);
