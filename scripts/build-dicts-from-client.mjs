#!/usr/bin/env node
/**
 * build-dicts-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   GGG クライアントの dat テーブル (一次ソース) から日本語辞書を生成する。
 *   poe2db / RePoE / PoB は全てこの同じデータの写しなので、写しをスクレイプする
 *   代わりに原本を読む。暗号化は無く、パスワード等は不要。
 *
 * 読み方:
 *   `pathofexile-dat` (devDependency、poe-dat-viewer 作者製) の CLI を子プロセスで
 *   呼び、`data-cache/client-export/` に English / Japanese のテーブルを JSON で
 *   書き出させてから読む。PoE2 のテーブルは `Data/Balance/<Table>` と
 *   `Data/Balance/Japanese/<Table>` にあり、EN / JA は同じ index で行対応する。
 *
 * データソースの指定 (優先順):
 *   --patch <version>   GGG のパッチ配信サーバから直接取得 (ゲーム不要、CI 向け)
 *   --steam <dir>       ローカルのインストールフォルダ
 *   POE2_DIR 環境変数   同上
 *   (無指定)            既定の Steam パスを自動検出
 *
 * 出力 (すべて「既存をベースに補強」。クライアント側が正のため、同じキーは
 *      クライアントの訳で上書きする。キーは消さない = 件数は減らない):
 *   src/i18n/items-ja-client.json   BaseItemTypes: EN Name -> JA Name   (新規ファイル)
 *   src/i18n/unique-names-ja.json   Words:         EN Text -> JA Text2  (Wordlist でユニーク名に限定)
 *   src/i18n/poe2-flavour-ja.json   FlavourText:   EN Text -> JA Text
 *
 * Usage:
 *   node scripts/build-dicts-from-client.mjs
 *   node scripts/build-dicts-from-client.mjs --steam "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2"
 *   node scripts/build-dicts-from-client.mjs --patch 0.5.0.1
 *
 * @date 2026-09-07
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EXPORT_DIR = resolve(ROOT, "data-cache/client-export");
const OUT_ITEMS = resolve(ROOT, "src/i18n/items-ja-client.json");
const OUT_NAMES = resolve(ROOT, "src/i18n/unique-names-ja.json");
const OUT_FLAVOUR = resolve(ROOT, "src/i18n/poe2-flavour-ja.json");

const NEWLINE_RE = /\r?\n/g;

const STEAM_CANDIDATES = [
  "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2",
  "D:/SteamLibrary/steamapps/common/Path of Exile 2",
  "E:/SteamLibrary/steamapps/common/Path of Exile 2",
  "C:/Program Files (x86)/Grinding Gear Games/Path of Exile 2",
];

function log(...args) {
  console.log("[build-dicts-from-client]", ...args);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/**
 * 1 行テキスト (アイテム名 / ユニーク名) 用: 改行を空白にし、連続空白を 1 つに潰して trim。
 */
function normText(s) {
  if (typeof s !== "string") return "";
  return s.replace(NEWLINE_RE, " ").replace(/ +/g, " ").trim();
}

/**
 * flavour text 用: trim のみ。改行コード (CR+LF) は **保持する**。
 * UniqueTooltip.strip() は poe.ninja の flavour 行を改行で連結したキーで辞書を引き
 * (LF 区切り / CR+LF 区切りの両形を試す)、空白に潰した形は試さない。
 * クライアントの FlavourText.Text も CR+LF 形式なので、そのまま使えば旧 RePoE 由来キーと
 * 一致し、重複も生まれない。
 * (2026-09-07: 最初の実装で空白に潰したところ 1,905 件が参照されない重複になった)
 */
function normFlavour(s) {
  if (typeof s !== "string") return "";
  return s.trim();
}

async function loadExisting(path) {
  if (!(await exists(path))) return {};
  try {
    const j = JSON.parse(await readFile(path, "utf8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch (e) {
    log(`WARN: existing ${path} unreadable (${e.message}) -> start empty`);
    return {};
  }
}

/** 既存にクライアント由来を上書きマージ。キーは消えない。 */
function mergeOver(existing, fresh) {
  const merged = { ...existing, ...fresh };
  const sorted = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];
  return sorted;
}

async function writeDict(path, label, existing, fresh) {
  const merged = mergeOver(existing, fresh);
  const before = Object.keys(existing).length;
  const after = Object.keys(merged).length;
  let changed = 0;
  for (const k of Object.keys(fresh)) {
    if (existing[k] !== undefined && existing[k] !== fresh[k]) changed++;
  }
  if (after < before) {
    throw new Error(`${label}: would shrink ${before} -> ${after}; refusing to write`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
  log(`${label}: ${before} -> ${after} (+${after - before} new, ${changed} existing values updated from client)`);
}

// ---------------------------------------------------------------------------
// 1. データソース解決
// ---------------------------------------------------------------------------
async function resolveSource() {
  const patch = argValue("--patch");
  if (patch) return { patch };
  const steamArg = argValue("--steam") || process.env.POE2_DIR;
  if (steamArg) {
    if (!(await exists(resolve(steamArg, "Bundles2")))) {
      throw new Error(`--steam / POE2_DIR に Bundles2 が見当たりません: ${steamArg}`);
    }
    return { steam: steamArg };
  }
  for (const c of STEAM_CANDIDATES) {
    if (await exists(resolve(c, "Bundles2"))) return { steam: c };
  }
  throw new Error(
    "PoE2 のインストールが見つかりません。--steam <dir> か POE2_DIR、または --patch <version> を指定してください。",
  );
}

// ---------------------------------------------------------------------------
// 2. pathofexile-dat CLI でテーブルを書き出す
// ---------------------------------------------------------------------------
async function exportTables(source) {
  await mkdir(EXPORT_DIR, { recursive: true });
  const config = {
    ...source,
    translations: ["English", "Japanese"],
    tables: [
      { name: "BaseItemTypes", columns: ["Id", "Name"] },
      { name: "Words", columns: ["Wordlist", "Text", "Text2"] },
      { name: "FlavourText", columns: ["Id", "Text"] },
    ],
  };
  await writeFile(resolve(EXPORT_DIR, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf8");

  const pkgPath = resolve(ROOT, "node_modules/pathofexile-dat/package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const binRel = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin)[0];
  const bin = resolve(dirname(pkgPath), binRel);

  log(`source: ${source.patch ? "patch " + source.patch : source.steam}`);
  log(`running pathofexile-dat ${pkg.version} in ${EXPORT_DIR}`);
  const r = spawnSync(process.execPath, [bin], { cwd: EXPORT_DIR, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`pathofexile-dat exited with ${r.status}`);
}

async function loadTable(lang, name) {
  const p = resolve(EXPORT_DIR, "tables", lang, `${name}.json`);
  const j = JSON.parse(await readFile(p, "utf8"));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
}

// ---------------------------------------------------------------------------
// 3. テーブル -> 辞書
// ---------------------------------------------------------------------------
async function main() {
  const source = await resolveSource();
  await exportTables(source);

  // --- BaseItemTypes: EN Name -> JA Name ---
  const enB = await loadTable("English", "BaseItemTypes");
  const jaB = await loadTable("Japanese", "BaseItemTypes");
  if (enB.length !== jaB.length) {
    throw new Error(`BaseItemTypes row mismatch EN=${enB.length} JA=${jaB.length}`);
  }
  const items = {};
  let itemsSkipped = 0;
  for (let i = 0; i < enB.length; i++) {
    const en = normText(enB[i].Name);
    const ja = normText(jaB[i].Name);
    if (!en || !ja || en === ja) {
      itemsSkipped++;
      continue;
    }
    items[en] = ja;
  }
  log(`BaseItemTypes: ${enB.length} rows -> ${Object.keys(items).length} translated names (${itemsSkipped} unnamed/untranslated)`);

  // --- Words: EN Text -> JA Text2、Wordlist でユニーク名種別に限定 ---
  const enW = await loadTable("English", "Words");
  const jaW = await loadTable("Japanese", "Words");
  if (enW.length !== jaW.length) {
    throw new Error(`Words row mismatch EN=${enW.length} JA=${jaW.length}`);
  }
  const existingNames = await loadExisting(OUT_NAMES);
  // 既知ユニーク名がどの Wordlist 値に属するかを実測し、その種別だけ採る。
  const tally = new Map();
  for (const r of enW) {
    if (existingNames[r.Text] !== undefined) tally.set(r.Wordlist, (tally.get(r.Wordlist) || 0) + 1);
  }
  const uniqueWordlist = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const names = {};
  if (!uniqueWordlist) {
    log("WARN: Wordlist の種別を判定できず (既知ユニーク名が Words に無い)。ユニーク名の更新をスキップ");
  } else {
    log(`Words: unique-name Wordlist = ${uniqueWordlist[0]} (matched ${uniqueWordlist[1]} known uniques; tally ${JSON.stringify([...tally])})`);
    for (let i = 0; i < enW.length; i++) {
      if (enW[i].Wordlist !== uniqueWordlist[0]) continue;
      const en = normText(enW[i].Text);
      const ja = normText(jaW[i].Text2);
      if (!en || !ja || en === ja) continue;
      names[en] = ja;
    }
    log(`Words: ${Object.keys(names).length} translated unique names`);
  }

  // --- FlavourText: EN Text -> JA Text ---
  const enF = await loadTable("English", "FlavourText");
  const jaF = await loadTable("Japanese", "FlavourText");
  if (enF.length !== jaF.length) {
    throw new Error(`FlavourText row mismatch EN=${enF.length} JA=${jaF.length}`);
  }
  const flavour = {};
  for (let i = 0; i < enF.length; i++) {
    const en = normFlavour(enF[i].Text);
    const ja = normFlavour(jaF[i].Text);
    if (!en || !ja || en === ja) continue;
    flavour[en] = ja;
  }
  log(`FlavourText: ${enF.length} rows -> ${Object.keys(flavour).length} translated`);

  // --- 書き出し (補強、減らさない) ---
  await writeDict(OUT_ITEMS, "items-ja-client", await loadExisting(OUT_ITEMS), items);
  if (Object.keys(names).length) {
    await writeDict(OUT_NAMES, "unique-names-ja", existingNames, names);
  }
  await writeDict(OUT_FLAVOUR, "poe2-flavour-ja", await loadExisting(OUT_FLAVOUR), flavour);
  log("done");
}

main().catch((e) => {
  console.error("[build-dicts-from-client] FAILED:", e.message || e);
  process.exit(1);
});
