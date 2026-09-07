#!/usr/bin/env node
/**
 * build-poe2-flavour-ja.mjs
 * --------------------------------------------------------------
 * 目的:
 *   ユニークアイテムの flavour text を `<英文>` -> `<日本語訳>` の
 *   flat 辞書として生成し、`src/i18n/poe2-flavour-ja.json` に書き出す。
 *
 *   UniqueTooltip.vue が `strip(flavourText)` でこの辞書を引き、英語の
 *   フレーバー文 (例: `Power is a matter of perspective.`) を日本語化する。
 *
 * データソース:
 *   RePoE fork (poe2) の翻訳済 flavour データ:
 *     - 英語: https://raw.githubusercontent.com/repoe-fork/poe2/master/data/flavour.json
 *     - 日本語: https://raw.githubusercontent.com/repoe-fork/poe2/master/data/Japanese/flavour.json
 *
 *   両方とも `{ "<key>": "<text>" }` 形式で、key が一致するペアを
 *   `{ "<英文>": "<日本語訳>" }` に変換する。
 *
 * 出力:
 *   src/i18n/poe2-flavour-ja.json
 *     { "<英文 flavour>": "<日本語訳>", ... }
 *
 * Usage:
 *   node scripts/build-poe2-flavour-ja.mjs
 *   node scripts/build-poe2-flavour-ja.mjs --offline   # data-cache 既存ファイル使用
 *
 * 失敗時の挙動 (2026-09-07 改訂):
 *   - 既存の src/i18n/poe2-flavour-ja.json をベースに **補強のみ** 行う
 *     (build-unique-pages-detail.mjs と同方針)。既存キーは上書きしない。
 *   - ソースが取れない (404 / network error で cache も無い) 場合は既存辞書を
 *     そのまま保ち、何も消さない。
 *
 *   背景: RePoE fork の日本語 flavour (URL_JA) は 2026-06 頃から 404 で復活していない。
 *   一方 build-unique-pages-detail.mjs が POE2DB の個別ページから flavour を
 *   直接ペア化して同じ JSON に追記するようになり、事実上そちらが主データ源。
 *   旧実装は「ソース不在なら空 {} を書く」だったため、CI (cache 無し) で
 *   3,103 件の辞書を 0 件に上書きする PR を作りかけた (件数ガードで阻止)。
 *
 * @author craft-discovery 君B (Phase κ)
 * @date 2026-05-22
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache");
const CACHE_EN = resolve(CACHE_DIR, "repoe-flavour-en.json");
const CACHE_JA = resolve(CACHE_DIR, "repoe-flavour-ja.json");
const OUT_FILE = resolve(ROOT, "src/i18n/poe2-flavour-ja.json");

const URL_EN =
  "https://raw.githubusercontent.com/repoe-fork/poe2/master/data/flavour.json";
const URL_JA =
  "https://raw.githubusercontent.com/repoe-fork/poe2/master/data/Japanese/flavour.json";

const USER_AGENT =
  "ExileDesk/0.1 (POE2 personal economy dashboard, +https://github.com/kyohei0612/exiledesk)";

const ARGS = new Set(process.argv.slice(2));
const OFFLINE = ARGS.has("--offline");

function log(...args) {
  console.log("[build-poe2-flavour-ja]", ...args);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 1 ファイル分の JSON を取得 (cache 経由)。
 * --offline で cache 強制、それ以外は fetch → 成功時に cache 更新。
 * 失敗時は cache を fallback、cache も無ければ null を返す。
 */
async function loadJson(url, cachePath, label) {
  if (OFFLINE) {
    if (!(await exists(cachePath))) {
      log(`offline mode: cache miss for ${label} (${cachePath}) → null`);
      return null;
    }
    log(`offline mode: using cache ${cachePath}`);
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch (e) {
      log(`cache parse failed for ${label}: ${e.message}`);
      return null;
    }
  }

  log(`fetching ${url}`);
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja,en" },
    });
  } catch (e) {
    log(`fetch failed for ${label}: ${e.message} → falling back to cache`);
    if (await exists(cachePath)) {
      try {
        return JSON.parse(await readFile(cachePath, "utf8"));
      } catch (parseErr) {
        log(`cache parse failed: ${parseErr.message}`);
      }
    }
    return null;
  }
  if (!res.ok) {
    log(`HTTP ${res.status} for ${label} → falling back to cache`);
    if (await exists(cachePath)) {
      try {
        return JSON.parse(await readFile(cachePath, "utf8"));
      } catch (parseErr) {
        log(`cache parse failed: ${parseErr.message}`);
      }
    }
    return null;
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    log(`JSON parse failed for ${label}: ${e.message}`);
    return null;
  }
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, text);
  log(`cached ${label} → ${cachePath}`);
  return json;
}

/**
 * 入力された flavour JSON 値の正規化。
 * key 同士の比較は行わないが、辞書のキー (英文) と値 (日本語) は両方とも
 * 前後 trim だけ行う。改行コード (\r\n) は POE2 内部表現として保持する。
 *
 * 重複キー対策: 英文が異なるキー間で同一になるケース (例: 共通格言系) は
 * 後勝ちで上書きする。完璧な解決は無理だがフラット辞書の限界として受容。
 */
function normalizeFlavour(s) {
  if (typeof s !== "string") return "";
  return s.trim();
}

/** 既存辞書を読む。無い / 壊れている場合は空から始める。 */
async function loadExisting() {
  if (!(await exists(OUT_FILE))) return {};
  try {
    const json = JSON.parse(await readFile(OUT_FILE, "utf8"));
    return json && typeof json === "object" && !Array.isArray(json) ? json : {};
  } catch (e) {
    log(`WARN: failed to parse existing ${OUT_FILE}: ${e.message} → starting empty`);
    return {};
  }
}

async function main() {
  const enMap = await loadJson(URL_EN, CACHE_EN, "english flavour");
  const jaMap = await loadJson(URL_JA, CACHE_JA, "japanese flavour");

  // 既存辞書をベースに補強する。既存キー (poe2db 由来を含む) は上書きしない。
  const out = await loadExisting();
  const baseCount = Object.keys(out).length;
  let added = 0;

  if (!enMap || !jaMap) {
    log(`one or both sources unavailable → keeping existing ${baseCount} entries untouched`);
  } else if (typeof enMap !== "object" || typeof jaMap !== "object") {
    log(`unexpected JSON shape → keeping existing ${baseCount} entries untouched`);
  } else {
    let skippedMissingJa = 0;
    let alreadyPresent = 0;
    for (const key of Object.keys(enMap)) {
      const en = normalizeFlavour(enMap[key]);
      const ja = normalizeFlavour(jaMap[key]);
      if (!en) continue;
      if (!ja) {
        skippedMissingJa++;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(out, en)) {
        alreadyPresent++;
        continue;
      }
      out[en] = ja;
      added++;
    }
    log(
      `merged: +${added} new pairs (en source keys: ${Object.keys(enMap).length}, ja source keys: ${Object.keys(jaMap).length}, missing-ja: ${skippedMissingJa}, already present (kept): ${alreadyPresent})`,
    );
  }

  // キーをアルファベット順にして diff を見やすく
  const sorted = {};
  for (const k of Object.keys(out).sort()) sorted[k] = out[k];

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");

  log("─".repeat(60));
  log(`OUTPUT: ${OUT_FILE}`);
  log(`entries: ${baseCount} -> ${Object.keys(sorted).length} (+${added})`);
}

main().catch((e) => {
  console.error("[build-poe2-flavour-ja] FAILED:", e);
  process.exit(1);
});
