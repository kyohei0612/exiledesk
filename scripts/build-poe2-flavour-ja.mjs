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
 * 失敗時の挙動:
 *   - GitHub 到達失敗 (404 / network error) で cache も無ければ、empty `{}` を
 *     出力して進める。UniqueTooltip 側は辞書ヒットなしで英語 fallback されるため
 *     表示崩れは起きない。
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

async function main() {
  const enMap = await loadJson(URL_EN, CACHE_EN, "english flavour");
  const jaMap = await loadJson(URL_JA, CACHE_JA, "japanese flavour");

  let out = {};

  if (!enMap || !jaMap) {
    log("one or both sources unavailable → emitting empty dictionary {}");
  } else if (typeof enMap !== "object" || typeof jaMap !== "object") {
    log("unexpected JSON shape → emitting empty dictionary {}");
  } else {
    let pairs = 0;
    let skippedMissingJa = 0;
    let skippedDuplicate = 0;
    for (const key of Object.keys(enMap)) {
      const en = normalizeFlavour(enMap[key]);
      const ja = normalizeFlavour(jaMap[key]);
      if (!en) continue;
      if (!ja) {
        skippedMissingJa++;
        continue;
      }
      // 同一英文に複数日本語が紐づくケースは後勝ち (RePoE fork 由来なので
      // 通常そんなに頻発しないはず)
      if (Object.prototype.hasOwnProperty.call(out, en)) {
        skippedDuplicate++;
      }
      out[en] = ja;
      pairs++;
    }
    log(
      `built ${Object.keys(out).length} unique pairs (en source keys: ${Object.keys(enMap).length}, ja source keys: ${Object.keys(jaMap).length}, en→ja considered: ${pairs}, missing-ja: ${skippedMissingJa}, dup-en overwrites: ${skippedDuplicate})`,
    );
  }

  // キーをアルファベット順にして diff を見やすく
  const sorted = {};
  for (const k of Object.keys(out).sort()) sorted[k] = out[k];

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");

  log("─".repeat(60));
  log(`OUTPUT: ${OUT_FILE}`);
  log(`entries: ${Object.keys(sorted).length}`);
}

main().catch((e) => {
  console.error("[build-poe2-flavour-ja] FAILED:", e);
  process.exit(1);
});
