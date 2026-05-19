#!/usr/bin/env node
/**
 * クラフト関連素材 (currency / essence / catalyst / bone / omen / soul core / 等) の
 * **JA 名 → POE2 公式 trade2 image URL** map を生成。
 *
 * **データソース:**
 *   - data-cache/trade2-static.json (POE2 公式 trade2 API):
 *     https://www.pathofexile.com/api/trade2/data/static
 *     16 カテゴリ ~465 entries に正式な image URL (`/gen/image/<base64>/<hash>/<filename>.png`)
 *   - src/i18n/items-ja.json: 英→日 翻訳
 *
 * **なぜ trade2 API を使うか (オーナー判断 2026-05-10):**
 *   - 公式 web.poecdn.com の direct path は POE2 専用素材 (Catalyst/Abyss/Omen) が 404
 *   - cdn.poe2db.tw は Referer hot-link 制限 (Tauri webview から不可)
 *   - trade2 API の image URL は CORS 不問、Referer 不問、ブラウザから直叩き可
 *   - 公式 GGG 配信の正規 image なのでライセンス的にも安全
 *
 * **更新方法:**
 *   1. `curl https://www.pathofexile.com/api/trade2/data/static > data-cache/trade2-static.json`
 *   2. `node scripts/extract-craft-icons.mjs`
 *
 * 出力: src/i18n/craft-icons.json
 *   { "<JA 名 / EN 名>": "https://www.pathofexile.com/gen/image/.../<file>.png", ... }
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

const trade2 = JSON.parse(
  readFileSync(resolve(ROOT, "data-cache/trade2-static.json"), "utf-8"),
);
const itemsJa = JSON.parse(
  readFileSync(resolve(ROOT, "src/i18n/items-ja.json"), "utf-8"),
);

const POE2_HOST = "https://www.pathofexile.com";

const out = {};
const stats = { total: 0, withImage: 0, mapped: 0, withJa: 0 };

for (const cat of trade2.result ?? []) {
  for (const entry of cat.entries ?? []) {
    stats.total++;
    if (!entry.text || !entry.image) continue;
    stats.withImage++;
    // 「sep」のようなセクションヘッダ entry はスキップ (image は無いはず)
    const url = entry.image.startsWith("/")
      ? `${POE2_HOST}${entry.image}`
      : entry.image;
    const en = entry.text;
    // EN 名で引けるように
    if (!out[en]) {
      out[en] = url;
      stats.mapped++;
    }
    // JA 翻訳があれば JA 名でも引けるように
    const ja = itemsJa[en];
    if (ja && !out[ja]) {
      out[ja] = url;
      stats.withJa++;
    }
  }
}

// ============================
// エイリアス生成 — AI 表現ゆれを救済
// ============================
const aliasBefore = Object.keys(out).length;
for (const [ja, url] of Object.entries({ ...out })) {
  // パーフェクトエッセンス系
  if (ja.endsWith("のパーフェクトエッセンス")) {
    const stem = ja.slice(0, -"のパーフェクトエッセンス".length);
    if (!out[`完璧な${stem}のエッセンス`]) out[`完璧な${stem}のエッセンス`] = url;
    if (!out[`完璧の${stem}のエッセンス`]) out[`完璧の${stem}のエッセンス`] = url;
    if (!out[`${stem}の完璧エッセンス`]) out[`${stem}の完璧エッセンス`] = url;
  }
  if (ja.endsWith("のグレーターエッセンス")) {
    const stem = ja.slice(0, -"のグレーターエッセンス".length);
    if (!out[`上級${stem}のエッセンス`]) out[`上級${stem}のエッセンス`] = url;
  }
  if (ja.endsWith("のレッサーエッセンス")) {
    const stem = ja.slice(0, -"のレッサーエッセンス".length);
    if (!out[`下級${stem}のエッセンス`]) out[`下級${stem}のエッセンス`] = url;
  }
  // 上級 / 完全 オーブ系
  if (ja.endsWith("オーブ (上級)")) {
    const stem = ja.replace(/ \(上級\)$/, "");
    if (!out[`上級${stem}`]) out[`上級${stem}`] = url;
  }
  if (ja.endsWith("オーブ (完全)")) {
    const stem = ja.replace(/ \(完全\)$/, "");
    if (!out[`完璧な${stem}`]) out[`完璧な${stem}`] = url;
    if (!out[`完全な${stem}`]) out[`完全な${stem}`] = url;
    if (!out[`パーフェクト${stem}`]) out[`パーフェクト${stem}`] = url;
  }
  // 「左側の<X>のお告げ」を「<X>のお告げ」でも引けるように
  const sinistralMatch = ja.match(/^左側の(.+?)のお告げ$/);
  if (sinistralMatch) {
    const core = sinistralMatch[1];
    if (!out[`${core}のお告げ`]) out[`${core}のお告げ`] = url;
  }
}

writeFileSync(
  resolve(ROOT, "src/i18n/craft-icons.json"),
  JSON.stringify(out, null, 2),
);

console.log(
  `✅ 出力: src/i18n/craft-icons.json (${Object.keys(out).length} 件)`,
);
console.log(
  `   trade2 entries: ${stats.total}, with image: ${stats.withImage}, EN mapped: ${stats.mapped}, JA mapped: ${stats.withJa}`,
);
console.log(`   alias 追加: +${Object.keys(out).length - aliasBefore}`);
