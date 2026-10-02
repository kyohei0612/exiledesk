#!/usr/bin/env node
/**
 * build-rare-names-ja.mjs — レアの名前の言葉 (英語 → 日本語) (2026-10-02 火力チェックの装備の欄)
 *
 * レアの名前は Words テーブルの 前の言葉 (Wordlist 1) + 後ろの言葉 (Wordlist 2) をつなげた物。
 *   英語: "Vengeance" + " Spur" = "Vengeance Spur" (後ろの言葉は頭に空白込み)
 *   日本語 (Text2): "復讐の" + "拍車" = "復讐の拍車"
 * EN/JA の Words は行が対応している (data-cache/client-export/tables/{English,Japanese}/Words.json)。
 *
 *   出力: src/i18n/rare-names-ja.json  { prefix: { EN: JA }, suffix: { EN (空白なし): JA } }
 *
 *   node scripts/build-rare-names-ja.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const T = "data-cache/client-export/tables";
const en = JSON.parse(readFileSync(`${T}/English/Words.json`, "utf8"));
const ja = JSON.parse(readFileSync(`${T}/Japanese/Words.json`, "utf8"));
const prefix = {};
const suffix = {};
for (let i = 0; i < en.length; i++) {
  const w = en[i].Wordlist;
  const e = (en[i].Text ?? "").trim();
  const j = (ja[i]?.Text2 ?? "").trim();
  if (!e || !j) continue;
  if (w === 1 && !(e in prefix)) prefix[e] = j;
  if (w === 2 && !(e in suffix)) suffix[e] = j;
}
writeFileSync("src/i18n/rare-names-ja.json", JSON.stringify({ prefix, suffix }));
console.log(`前 ${Object.keys(prefix).length} / 後ろ ${Object.keys(suffix).length} → src/i18n/rare-names-ja.json`);
