#!/usr/bin/env node
/**
 * build-unique-pages-detail.mjs
 * --------------------------------------------------------------
 * 目的 (Phase λ):
 *   Phase κ で構築した「種別ページ」由来のユニーク特殊 MOD 辞書を、
 *   POE2DB の「個別ユニークページ」(例: https://poe2db.tw/us/Brynhands_Mark
 *   / https://poe2db.tw/jp/Brynhands_Mark) から補強する。
 *
 *   個別ページはユニーク 1 個に絞られているため、Stats div 単位で
 *   EN/JP の MOD / FlavourText 行を順序対応でペア化でき、種別ページから
 *   こぼれていたユニーク (ジュエル / マップ / 派生ベース) を拾える。
 *
 * 改修対象 (既存ファイルを「補強」のみ。既存エントリは上書きしない):
 *   - src/i18n/unique-mods-ja.json   (Phase κ 出力、新規 MOD ペアを追記)
 *   - src/i18n/poe2-flavour-ja.json  (Phase κ 出力、新規 flavour ペアを追記)
 *
 * データソース:
 *   1. slug 一覧:
 *      - data-cache/poe2db_<Cat>_us.html (Phase κ で作成済キャッシュ) を
 *        全 read → `class="UniqueItems UniqueItem" ... href="<slug>"` で
 *        抽出 → 重複除去。オフライン専用 (Phase κ 同等の slug 範囲)
 *   2. 個別ページ:
 *      - https://poe2db.tw/us/<slug>
 *      - https://poe2db.tw/jp/<slug>
 *      - キャッシュ: data-cache/poe2db-unique-pages/<slug>_<lang>.html
 *
 * パース仕様 (2026-05-22 実機確認):
 *   - `<div class="Stats">` がページ内 1 個以上 (派生 baseType ごとに 1 個)
 *   - Stats div 内に `<div class="explicitMod">` / `implicitMod` /
 *     `enchantMod` / `FlavourText` (大文字 F) が並ぶ
 *   - EN ページの数値レンジは `(16<span class="ndash">—</span>20)`、
 *     JP ページは `(16—20)` (生 em dash) で書かれている → htmlToText で
 *     どちらも `(16—20)` に揃う
 *
 * 礼節:
 *   - User-Agent に contact 明記
 *   - 1 req/sec (両言語合計 2 req/slug → 1 slug あたり 2 秒)
 *   - --offline でキャッシュ専用 (CI / 再現実行)
 *
 * Usage:
 *   node scripts/build-unique-pages-detail.mjs
 *   node scripts/build-unique-pages-detail.mjs --offline
 *   node scripts/build-unique-pages-detail.mjs --limit 20    # 上から 20 slug だけ (試走)
 *
 * @author craft-discovery 君B (Phase λ)
 * @date 2026-05-22
 */

import { mkdir, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache");
const DETAIL_CACHE_DIR = resolve(CACHE_DIR, "poe2db-unique-pages");
const OUT_MODS = resolve(ROOT, "src/i18n/unique-mods-ja.json");
const OUT_FLAVOUR = resolve(ROOT, "src/i18n/poe2-flavour-ja.json");

const USER_AGENT =
  "ExileDesk/0.1 (POE2 personal economy dashboard, +https://github.com/kyohei0612/exiledesk)";

const ARGS = process.argv.slice(2);
const OFFLINE = ARGS.includes("--offline");
const LIMIT = (() => {
  const i = ARGS.indexOf("--limit");
  if (i < 0) return 0;
  const n = parseInt(ARGS[i + 1] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

const BASE_URL = "https://poe2db.tw";
const FETCH_DELAY_MS = 1000;

function log(...args) {
  console.log("[build-unique-pages-detail]", ...args);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// HTML -> プレーンテキスト
//   Phase κ (build-unique-mods-ja.mjs) と同等の処理。
//   <span class="ndash">—</span> 等のタグを除去し、HTML エンティティを復元。
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
// (1) slug 一覧を Phase κ キャッシュから抽出
// ---------------------------------------------------------------------------
async function collectSlugs() {
  const slugs = new Set();
  let files = [];
  try {
    files = await readdir(CACHE_DIR);
  } catch {
    log(`cache dir not found: ${CACHE_DIR}`);
    return [];
  }
  const usFiles = files.filter(
    (f) => f.startsWith("poe2db_") && f.endsWith("_us.html"),
  );
  for (const fn of usFiles) {
    const html = await readFile(resolve(CACHE_DIR, fn), "utf8").catch(
      () => null,
    );
    if (!html) continue;
    // href が "Brynhands_Mark" のように bare slug 形式 と "/us/Foo" 形式が
    // 混在する可能性があるため、両方拾って正規化する。
    // 2026-09-07: casing 変更 ("uniqueitem" → "UniqueItem") で 0 件になっていた。
    // build-unique-mods-ja.mjs 側と同様に大文字小文字を無視する。
    const re = /class="UniqueItems UniqueItem"[^>]*href="([^"]+)"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let slug = m[1];
      // "/us/Foo" / "/jp/Foo" / "Foo" 形式を正規化
      slug = slug.replace(/^\/(?:us|jp)\//, "");
      // 残った "/" や クエリは除去
      slug = slug.split(/[?#]/)[0];
      if (!slug || slug.includes("/")) continue;
      // 明らかに無効なものを弾く (空白等)
      if (!/^[A-Za-z0-9_]+$/.test(slug)) continue;
      slugs.add(slug);
    }
  }
  return [...slugs].sort();
}

// ---------------------------------------------------------------------------
// (2) 個別ページ取得 (キャッシュ経由)
// ---------------------------------------------------------------------------
async function fetchUniquePage(lang, slug) {
  const cachePath = resolve(DETAIL_CACHE_DIR, `${slug}_${lang}.html`);
  if (await exists(cachePath)) {
    return await readFile(cachePath, "utf8");
  }
  if (OFFLINE) {
    return null;
  }
  const url = `${BASE_URL}/${lang}/${slug}`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": lang === "jp" ? "ja" : "en",
      },
    });
  } catch (e) {
    log(`fetch error ${url}: ${e.message}`);
    return null;
  }
  if (!res.ok) {
    log(`HTTP ${res.status} ${url}`);
    return null;
  }
  const html = await res.text();
  await mkdir(DETAIL_CACHE_DIR, { recursive: true });
  await writeFile(cachePath, html);
  return html;
}

// ---------------------------------------------------------------------------
// (3) パース: Stats div 単位で MOD / Flavour を抽出
// ---------------------------------------------------------------------------
/**
 * 個別ページ HTML から、Stats div ごとに
 *   { mods: ["explicit/implicit/enchant text", ...], flavours: ["flavour text", ...] }
 * の配列を返す。
 *
 * Stats div の終端は次の Stats 開始 or 文書末で区切る (HTML 構造的に Stats
 * の中身は MOD と FlavourText しか拾わないので、外側 div 等が紛れても
 * 影響は無い)。
 */
function parseUniquePage(html) {
  const startRe = /<div class="Stats">/g;
  const starts = [];
  let m;
  while ((m = startRe.exec(html)) !== null) {
    starts.push(m.index);
  }
  if (starts.length === 0) return [];
  const result = [];
  for (let i = 0; i < starts.length; i++) {
    const begin = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : html.length;
    const chunk = html.slice(begin, end);
    const mods = [];
    const flavours = [];
    // 順序を保ったまま 1 ループでブロック収集
    const blockRe =
      /<div class="(explicitMod|implicitMod|enchantMod|FlavourText)">([\s\S]*?)<\/div>(?=\s*(?:<div |<\/div>|$))/g;
    let bm;
    while ((bm = blockRe.exec(chunk)) !== null) {
      const cls = bm[1];
      const text = htmlToText(bm[2]);
      if (!text) continue;
      if (cls === "FlavourText") {
        flavours.push(text);
      } else {
        mods.push(text);
      }
    }
    if (mods.length === 0 && flavours.length === 0) continue;
    result.push({ mods, flavours });
  }
  return result;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  // 既存辞書を読み込み (補強モード: 既存キーは上書きしない)
  /** @type {Record<string, string>} */
  let modsDict = {};
  /** @type {Record<string, string>} */
  let flavourDict = {};
  if (await exists(OUT_MODS)) {
    try {
      modsDict = JSON.parse(await readFile(OUT_MODS, "utf8"));
    } catch (e) {
      log(`WARN: failed to parse existing ${OUT_MODS}: ${e.message}`);
    }
  }
  if (await exists(OUT_FLAVOUR)) {
    try {
      flavourDict = JSON.parse(await readFile(OUT_FLAVOUR, "utf8"));
    } catch (e) {
      log(`WARN: failed to parse existing ${OUT_FLAVOUR}: ${e.message}`);
    }
  }
  const baseModsCount = Object.keys(modsDict).length;
  const baseFlavourCount = Object.keys(flavourDict).length;
  log(`existing entries: mods=${baseModsCount} flavour=${baseFlavourCount}`);

  // slug 一覧
  let slugs = await collectSlugs();
  log(`collected ${slugs.length} unique slugs from Phase κ cache`);
  if (LIMIT > 0 && slugs.length > LIMIT) {
    slugs = slugs.slice(0, LIMIT);
    log(`--limit ${LIMIT}: truncated to ${slugs.length}`);
  }
  if (slugs.length === 0) {
    // 2026-09-07: 旧実装は return (exit 0) で通過し、次の build-unique-names-ja が
    // 別のエラーで落ちて原因が分かりにくかった。ここで明示的に失敗させる。
    log(
      "no slugs available; abort — data-cache/poe2db_<Category>_us.html が無いか、" +
        "アンカー抽出の正規表現が poe2db の現 HTML と合っていない。" +
        "先に build-unique-mods-ja.mjs を実行するか README のメンテ手順を参照。",
    );
    process.exit(1);
  }

  let scrapedOk = 0;
  let scrapedFail = 0;
  const failedSlugs = [];
  let newModsAdded = 0;
  let newFlavourAdded = 0;
  let blocksMismatch = 0;
  let blocksPaired = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    // EN
    const enHtml = await fetchUniquePage("us", slug);
    if (!OFFLINE && enHtml !== null) {
      await sleep(FETCH_DELAY_MS);
    }
    // JP
    const jaHtml = await fetchUniquePage("jp", slug);
    if (!OFFLINE && jaHtml !== null) {
      await sleep(FETCH_DELAY_MS);
    }
    if (!enHtml || !jaHtml) {
      scrapedFail++;
      failedSlugs.push(slug);
      continue;
    }
    scrapedOk++;

    const enBlocks = parseUniquePage(enHtml);
    const jaBlocks = parseUniquePage(jaHtml);
    const blockCount = Math.min(enBlocks.length, jaBlocks.length);
    for (let b = 0; b < blockCount; b++) {
      const en = enBlocks[b];
      const ja = jaBlocks[b];
      // MOD 配列のペアリング
      if (en.mods.length === ja.mods.length) {
        for (let k = 0; k < en.mods.length; k++) {
          const enText = en.mods[k];
          const jaText = ja.mods[k];
          if (!enText || !jaText) continue;
          if (enText === jaText) continue; // 翻訳されてない (英字残り)
          if (!Object.prototype.hasOwnProperty.call(modsDict, enText)) {
            modsDict[enText] = jaText;
            newModsAdded++;
          }
        }
        blocksPaired++;
      } else {
        blocksMismatch++;
      }
      // Flavour 配列のペアリング
      if (en.flavours.length === ja.flavours.length) {
        for (let k = 0; k < en.flavours.length; k++) {
          const enText = en.flavours[k];
          const jaText = ja.flavours[k];
          if (!enText || !jaText) continue;
          if (enText === jaText) continue;
          if (!Object.prototype.hasOwnProperty.call(flavourDict, enText)) {
            flavourDict[enText] = jaText;
            newFlavourAdded++;
          }
        }
      } else {
        // FlavourText が片側だけ無いケースもあるので mismatch カウントには含めない
      }
    }
    if ((i + 1) % 25 === 0) {
      log(
        `progress ${i + 1}/${slugs.length}: ok=${scrapedOk} fail=${scrapedFail} mods+=${newModsAdded} flv+=${newFlavourAdded}`,
      );
    }
  }

  // ソートして書き出し
  const sortedMods = {};
  for (const k of Object.keys(modsDict).sort()) sortedMods[k] = modsDict[k];
  const sortedFlavour = {};
  for (const k of Object.keys(flavourDict).sort())
    sortedFlavour[k] = flavourDict[k];

  await mkdir(dirname(OUT_MODS), { recursive: true });
  await writeFile(OUT_MODS, JSON.stringify(sortedMods, null, 2) + "\n");
  await writeFile(OUT_FLAVOUR, JSON.stringify(sortedFlavour, null, 2) + "\n");

  log("─".repeat(60));
  log(`OUTPUT (mods):    ${OUT_MODS}`);
  log(`OUTPUT (flavour): ${OUT_FLAVOUR}`);
  log(`unique pages scraped OK:  ${scrapedOk}`);
  log(`unique pages scraped FAIL: ${scrapedFail}`);
  log(`Stats blocks paired: ${blocksPaired}, mod-count mismatch: ${blocksMismatch}`);
  log(
    `mods dict: ${baseModsCount} -> ${Object.keys(sortedMods).length} (+${newModsAdded})`,
  );
  log(
    `flavour dict: ${baseFlavourCount} -> ${Object.keys(sortedFlavour).length} (+${newFlavourAdded})`,
  );
  if (failedSlugs.length > 0) {
    log(
      `failed slugs (first 5): ${failedSlugs.slice(0, 5).join(", ")}${failedSlugs.length > 5 ? `, ... (+${failedSlugs.length - 5})` : ""}`,
    );
  }
}

main().catch((e) => {
  console.error("[build-unique-pages-detail] FAILED:", e);
  process.exit(1);
});
