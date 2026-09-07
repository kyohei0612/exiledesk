#!/usr/bin/env node
/**
 * build-unique-mods-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   ユニーク固有 MOD の文言辞書 `src/i18n/unique-mods-ja.json` ({ "<英文 MOD 行>": "<日本語 MOD 行>" })
 *   を、GGG クライアント由来の `data-cache/mods.en.json` / `mods.ja.json`
 *   (build-mods-from-client.mjs が生成、RePoE 形式) から作る。
 *
 *   従来は POE2DB のカテゴリページ / 個別ユニークページを EN・JP でスクレイプして
 *   行位置で対応付けていた (build-unique-mods-ja.mjs / build-unique-pages-detail.mjs)。
 *   HTML の class 名変更で全滅する等、今日一番壊れていた経路。原本には
 *   `generation_type: "unique"` の MOD が 8,000 件超あり、EN と JA が同じ MOD ID で
 *   対応するので、行を突き合わせるだけで同じ辞書が作れる。
 *
 * 対応付け:
 *   同じ MOD ID の EN text / JA text を "\n" で行分割し、行数が一致するものだけ
 *   i 行目どうしをペアにする (行数が違う = 描画差があるものは安全側で捨てる)。
 *   消費側 (UniqueTooltip.vue の `_uniqueModsJaIndex`) は数値を `#` に正規化して
 *   照合するので、レンジ表記 "(10-20)" の差は問題にならない。
 *
 * 出力: 既存の unique-mods-ja.json に上書きマージ (クライアントが正、キーは消さない)。
 *
 * Usage:
 *   node scripts/build-unique-mods-from-client.mjs
 *   (前提: node scripts/build-mods-from-client.mjs 実行済み)
 *
 * @date 2026-09-07
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const IN_EN = resolve(ROOT, "data-cache/mods.en.json");
const IN_JA = resolve(ROOT, "data-cache/mods.ja.json");
const OUT = resolve(ROOT, "src/i18n/unique-mods-ja.json");

function log(...args) {
  console.log("[build-unique-mods-from-client]", ...args);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(p) {
  return JSON.parse(await readFile(p, "utf8"));
}

async function main() {
  if (!(await exists(IN_EN)) || !(await exists(IN_JA))) {
    throw new Error(`${IN_EN} / ${IN_JA} が無い。先に node scripts/build-mods-from-client.mjs を実行してください。`);
  }
  const en = await loadJson(IN_EN);
  const ja = await loadJson(IN_JA);

  const fresh = {};
  let uniqueMods = 0;
  let lineMismatch = 0;
  let untranslated = 0;
  let pairs = 0;
  for (const [id, v] of Object.entries(en)) {
    if (v.generation_type !== "unique" || !v.text) continue;
    uniqueMods++;
    const jt = ja[id]?.text;
    if (!jt) continue;
    const enLines = v.text.split("\n").map((s) => s.trim()).filter(Boolean);
    const jaLines = jt.split("\n").map((s) => s.trim()).filter(Boolean);
    if (enLines.length !== jaLines.length) {
      lineMismatch++;
      continue;
    }
    for (let i = 0; i < enLines.length; i++) {
      const e = enLines[i];
      const j = jaLines[i];
      if (e === j) {
        untranslated++;
        continue;
      }
      fresh[e] = j;
      pairs++;
    }
  }
  log(`unique-generation mods with text: ${uniqueMods} (line-count mismatch skipped: ${lineMismatch}, untranslated lines: ${untranslated})`);
  log(`EN→JA line pairs from client: ${Object.keys(fresh).length} (${pairs} raw)`);

  let existing = {};
  if (await exists(OUT)) {
    try {
      const j = await loadJson(OUT);
      if (j && typeof j === "object" && !Array.isArray(j)) existing = j;
    } catch (e) {
      log(`WARN: existing ${OUT} unreadable (${e.message}) -> start empty`);
    }
  }
  // クライアントが正: 同じキーはクライアントの訳で更新。poe2db だけが持つキーは残す。
  const merged = { ...existing, ...fresh };
  const before = Object.keys(existing).length;
  const after = Object.keys(merged).length;
  let updated = 0;
  for (const k of Object.keys(fresh)) if (existing[k] !== undefined && existing[k] !== fresh[k]) updated++;
  if (after < before) throw new Error(`unique-mods-ja would shrink ${before} -> ${after}; refusing to write`);

  const sorted = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  log(`OUTPUT: ${OUT}`);
  log(`unique-mods-ja: ${before} -> ${after} (+${after - before} new, ${updated} existing values updated from client)`);
}

main().catch((e) => {
  console.error("[build-unique-mods-from-client] FAILED:", e.message || e);
  process.exit(1);
});
