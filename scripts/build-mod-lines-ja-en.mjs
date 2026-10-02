#!/usr/bin/env node
/**
 * build-mod-lines-ja-en.mjs — 日本語の MOD の行 → 英語の行 の辞書 (2026-10-02 火力チェックの装備の差し替え)
 *
 * ゲームの stat_descriptions.csd は 1 つの説明に英語と日本語の行が同じ並び (同じ limit) で入っている。
 * それを組にして「日本語の型 → 英語の型」にする。プレースホルダは番号つきのまま残す
 * (日本語は語順が違うので {1}から{0} のように入れ替わる)。
 *
 *   出力: src/i18n/mod-lines-ja-en.json  [[日本語の型, 英語の型], ...]
 *   型の中の `{0}` `{1:+d}` は数字 1 つ。読む側 (src/services/pob-check/item-text.ts) で正規表現にする
 *
 *   node scripts/build-mod-lines-ja-en.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

const SRC = "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd";
const OUT = "src/i18n/mod-lines-ja-en.json";

/** `[Tag|表示]` → `表示`、`[Tag]` → `Tag` (ゲームのコピーは表示の方) */
const strip = (s) => s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");

const { descriptors } = parseStatDescriptions(decodeCsd(readFileSync(SRC)));
const seen = new Map();
let pairs = 0;
let skipped = 0;
for (const d of descriptors) {
  const en = d.langs?.English ?? [];
  const ja = d.langs?.Japanese ?? [];
  if (!en.length || en.length !== ja.length) { if (en.length) skipped++; continue; }
  for (let k = 0; k < en.length; k++) {
    const e = strip(en[k].text);
    const j = strip(ja[k].text);
    // 複数行の説明は 1 行ずつに分かれて貼られるので組にできない。数字の無い行も貼り付けから見分けが付く物だけ
    if (e.includes("\n") || j.includes("\n")) continue;
    if (!j.trim() || !e.trim()) continue;
    if (seen.has(j)) continue;
    seen.set(j, e);
    pairs++;
  }
}
const out = [...seen.entries()];
writeFileSync(OUT, JSON.stringify(out));
console.log(`説明 ${descriptors.length} / 組 ${pairs} / 行数の合わない説明 ${skipped} → ${OUT} (${(JSON.stringify(out).length / 1e6).toFixed(2)} MB)`);
