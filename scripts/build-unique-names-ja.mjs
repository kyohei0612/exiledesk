#!/usr/bin/env node
/**
 * build-unique-names-ja.mjs
 * --------------------------------------------------------------
 * 目的:
 *   POE2DB の個別ユニークページ (data-cache/poe2db-unique-pages/<slug>_<lang>.html)
 *   から、ユニュ表示名の EN / JA ペアを抽出し、辞書 JSON
 *   src/i18n/unique-names-ja.json を生成する。
 *
 *   例: "Atziri's Splendour" → "アッツィリの栄耀"
 *
 *   ユニュ詳細パネル (newItemPopup) の最初の itemName が表示名で、
 *   2 つ目 (typeLine 付き) は baseType。今回は表示名のみ拾う。
 *
 * パース仕様 (2026-05-22 実機確認, build-unique-pages-detail.mjs と同じ HTML):
 *   - `<div class="itemName">\s*<span class="lc">NAME</span>\s*</div>`
 *     これが各ページの最初に現れる `class="itemName"` (typeLine が付かないもの)
 *   - 同じページに派生 baseType ぶんの popup が並ぶケースがあるため、
 *     一番最初の itemName (typeLine なし) のみを採用する。
 *
 *   JA ページで翻訳されていないユニュは EN と同じ文字列が返るため、
 *   その場合も「英語のまま」値として保存する (用途上、辞書に存在するだけで
 *   フォールバック処理が省ける)。
 *
 * 入出力:
 *   in : data-cache/poe2db-unique-pages/*.{us,jp}.html
 *   out: src/i18n/unique-names-ja.json
 *        フォーマット: { "<英語名>": "<日本語名>" }
 *
 * 書き込みは tempfile + rename で atomic 化 (途中で落ちても元 JSON が壊れない)。
 *
 * Usage:
 *   node scripts/build-unique-names-ja.mjs
 *   node scripts/build-unique-names-ja.mjs --offline   # HTTP 0 (キャッシュ専用)
 *
 * @author craft-discovery 君B
 * @date 2026-05-22
 */

import { mkdir, readFile, writeFile, stat, readdir, rename, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache");
const DETAIL_CACHE_DIR = resolve(CACHE_DIR, "poe2db-unique-pages");
const OUT_NAMES = resolve(ROOT, "src/i18n/unique-names-ja.json");

const ARGS = process.argv.slice(2);
// 互換のため --offline は受け取るが、本スクリプトは元々キャッシュ専用なので
// 動作には差が出ない (HTTP fetch は行わない)。
const OFFLINE = ARGS.includes("--offline");

function log(...args) {
  console.log("[build-unique-names-ja]", ...args);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTML -> プレーンテキスト (build-unique-pages-detail.mjs 流用)
// ---------------------------------------------------------------------------
function htmlToText(html) {
  let s = html;
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&apos;/g, "'");
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ---------------------------------------------------------------------------
// ページ HTML からユニュ表示名を抽出
// ---------------------------------------------------------------------------
/**
 * `<div class="itemName">\s*<span class="lc">NAME</span>\s*</div>`
 * のうち、class が "itemName" 単体 (typeLine が付かないもの) の
 * 最初の 1 件を返す。typeLine 付きは baseType 名なので除外。
 *
 * @param {string} html
 * @returns {string | null}
 */
function parseDisplayName(html) {
  // typeLine を持たない itemName のみ
  // class 値は "itemName" 単体 (" 後に class が閉じる)
  const re =
    /<div class="itemName">\s*<span class="lc">([\s\S]*?)<\/span>\s*<\/div>/;
  const m = re.exec(html);
  if (!m) return null;
  const text = htmlToText(m[1]);
  return text || null;
}

// ---------------------------------------------------------------------------
// atomic write: <out>.tmp に書いてから rename
// ---------------------------------------------------------------------------
async function atomicWriteJson(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const body = JSON.stringify(obj, null, 2) + "\n";
  await writeFile(tmp, body);
  try {
    await rename(tmp, path);
  } catch (e) {
    // rename 失敗時は tmp を残さない
    try {
      await unlink(tmp);
    } catch {}
    throw e;
  }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  if (!(await exists(DETAIL_CACHE_DIR))) {
    log(`cache dir not found: ${DETAIL_CACHE_DIR}`);
    process.exit(1);
  }
  const files = await readdir(DETAIL_CACHE_DIR);
  // slug 集合: us / jp 両方揃っているもののみ採用
  const usSet = new Set();
  const jpSet = new Set();
  for (const fn of files) {
    if (fn.endsWith("_us.html")) usSet.add(fn.slice(0, -"_us.html".length));
    else if (fn.endsWith("_jp.html"))
      jpSet.add(fn.slice(0, -"_jp.html".length));
  }
  const slugs = [...usSet].filter((s) => jpSet.has(s)).sort();
  log(`paired slugs: ${slugs.length} (us=${usSet.size} jp=${jpSet.size})`);
  if (OFFLINE) log("--offline: cache only (no HTTP)");

  /** @type {Record<string, string>} */
  const dict = {};
  let parsedOk = 0;
  let parsedFailEn = 0;
  let parsedFailJa = 0;
  let dupSkipped = 0;
  let untranslated = 0;
  let translated = 0;

  for (const slug of slugs) {
    const usPath = resolve(DETAIL_CACHE_DIR, `${slug}_us.html`);
    const jpPath = resolve(DETAIL_CACHE_DIR, `${slug}_jp.html`);
    const [usHtml, jpHtml] = await Promise.all([
      readFile(usPath, "utf8").catch(() => null),
      readFile(jpPath, "utf8").catch(() => null),
    ]);
    if (!usHtml || !jpHtml) continue;
    const enName = parseDisplayName(usHtml);
    const jaName = parseDisplayName(jpHtml);
    if (!enName) {
      parsedFailEn++;
      continue;
    }
    if (!jaName) {
      parsedFailJa++;
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(dict, enName)) {
      // 同名英ユニュが複数 slug にまたがる場合 (派生 baseType 等) は
      // 初出を採用。値が一致すれば実質 no-op、衝突した場合のみログ。
      if (dict[enName] !== jaName) {
        log(
          `WARN: duplicate EN "${enName}" with different JA: kept "${dict[enName]}", new "${jaName}" (slug=${slug})`,
        );
      }
      dupSkipped++;
      continue;
    }
    dict[enName] = jaName;
    parsedOk++;
    if (enName === jaName) untranslated++;
    else translated++;
  }

  // ソートして書き出し
  const sorted = {};
  for (const k of Object.keys(dict).sort()) sorted[k] = dict[k];

  await atomicWriteJson(OUT_NAMES, sorted);

  log("─".repeat(60));
  log(`OUTPUT: ${OUT_NAMES}`);
  log(`entries: ${Object.keys(sorted).length}`);
  log(`  translated:   ${translated}`);
  log(`  untranslated: ${untranslated} (EN == JA, 未翻訳)`);
  log(`pairs scanned: ${slugs.length}`);
  log(`  parsed ok:    ${parsedOk}`);
  log(`  parse fail (en): ${parsedFailEn}`);
  log(`  parse fail (ja): ${parsedFailJa}`);
  log(`  duplicate EN: ${dupSkipped}`);
}

main().catch((e) => {
  console.error("[build-unique-names-ja] FAILED:", e);
  process.exit(1);
});
