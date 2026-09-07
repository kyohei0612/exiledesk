#!/usr/bin/env node
/**
 * build-pob2jp-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   同梱 PoB の日本語化パッチ (PoB2-JP) に、GGG クライアントの **公式日本語訳** を流し込む。
 *   PoB2-JP 同梱の翻訳 CSV は人力 + LLM 訳で、装備名やゲーム内表記が直訳気味。
 *   ゲームに由来する文言 (アイテム名 / ユニーク名 / スキル / パッシブ / MOD 文 / フレーバー等) は
 *   すべてクライアントに日本語が入っているので、そこから CSV を生成して上書きする。
 *   PoB 自身の UI (タブ名・設定説明・計算欄) はゲームの文言ではないので PoB2-JP の意訳のまま。
 *
 * 仕組み (PoB2-JP の Modules/PoeJP/Init.lua):
 *   - manifest.lua の順に CSV を読み、`source,translation` を M.strings[source] に登録する。
 *     **後から読んだファイルが勝つ** ので、本スクリプトが作る `client-*.csv` を manifest の末尾に置き、
 *     同じ英文キーがあれば公式訳で上書き、無ければ PoB2-JP の訳がそのまま残る。
 *   - 数値入りの行は PoB 側で数値を `{0}` `{1}`… に置換してからテンプレ照合する
 *     ("12% increased Attack Speed" → "{0}% increased Attack Speed")。csd の英文も同じ `{0}` 形式なので
 *     `{0:+d}` 等の書式指定だけ落とせばキーが一致する。
 *   - `[Physical|物理]` 形式のリンク記法は表示側 (PoB) には無いので表示名側に畳む。
 *
 * 入力: data-cache/client-export/ (build-dicts-from-client.mjs が書き出す。先に実行しておくこと)
 * 出力: <PoB2-JP>/payload/Data/Translate/ja-JP/client-*.csv + manifest.lua 追記
 *   <PoB2-JP> は環境変数 POB2JP_DIR → vendor/PoB2-JP の順。
 *
 * Usage:
 *   node scripts/build-pob2jp-from-client.mjs            # 生成
 *   node scripts/build-pob2jp-from-client.mjs --dry-run  # 件数だけ表示
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CSD_PATH, ROOT, loadPair } from "./client-export-config.mjs";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has("--dry-run");
const POB2JP_DIR = process.env.POB2JP_DIR || resolve(ROOT, "vendor/PoB2-JP");
const OUT_DIR = join(POB2JP_DIR, "payload/Data/Translate/ja-JP");
const MANIFEST = join(POB2JP_DIR, "payload/Modules/PoeJP/manifest.lua");

/** 出力ファイル (manifest への追記順 = この順) */
const OUTPUTS = [
  "client-items.csv",
  "client-uniques.csv",
  "client-flavour.csv",
  "client-skills.csv",
  "client-passives.csv",
  "client-mods.csv",
  "client-stats.csv",
];

function log(...a) {
  console.log("[pob2jp-client]", ...a);
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 文言の正規化
// ---------------------------------------------------------------------------

/** `[Link|表示]` → 表示、`[Link]` → Link (csd / FlavourText に含まれるリンク記法) */
function stripLinks(s) {
  return s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");
}

/** `{0:+d}` `{1:d}` `{}` → `{0}` `{1}` `{n}` (PoeJP のテンプレキーと同じ形にする) */
function normalizePlaceholders(s) {
  let bare = 0;
  return s.replace(/\{(\d*)(?::[^}]*)?\}/g, (_, idx) => `{${idx === "" ? bare++ : idx}}`);
}

function clean(s) {
  if (typeof s !== "string") return "";
  return stripLinks(s).replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

/** CSV 1 フィールドのクォート (PoeJP の parse_csv_row / csv_records と互換) */
function csvField(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** 追加先の辞書。同じ英文が複数あれば最初を採用 (テーブルの先頭優先) */
class Dict {
  constructor() {
    this.map = new Map();
    this.skipped = 0;
  }
  add(en, ja) {
    en = clean(en);
    ja = clean(ja);
    if (!en || !ja || en === ja) {
      this.skipped++;
      return;
    }
    if (!this.map.has(en)) this.map.set(en, ja);
  }
  toCsv() {
    const lines = ["source,translation"];
    for (const [en, ja] of this.map) lines.push(`${csvField(en)},${csvField(ja)}`);
    return lines.join("\n") + "\n";
  }
}

// ---------------------------------------------------------------------------
// 各テーブル → 辞書
// ---------------------------------------------------------------------------

async function pairColumn(name, col, dict, filter = () => true) {
  const { en, ja } = await loadPair(name);
  let n = 0;
  for (let i = 0; i < en.length; i++) {
    if (!filter(en[i])) continue;
    dict.add(en[i][col], ja[i][col]);
    n++;
  }
  return n;
}

async function buildItems() {
  const d = new Dict();
  await pairColumn("BaseItemTypes", "Name", d);
  await pairColumn("ItemClasses", "Name", d);
  return d;
}

async function buildUniques() {
  const d = new Dict();
  // Words: EN テーブルは Text (= Text2)、JA テーブルは Text2 が日本語名
  const { en, ja } = await loadPair("Words");
  for (let i = 0; i < en.length; i++) {
    if (en[i].Wordlist !== 6) continue;
    d.add(en[i].Text, ja[i].Text2 || ja[i].Text);
  }
  return d;
}

async function buildFlavour() {
  const d = new Dict();
  await pairColumn("FlavourText", "Text", d);
  return d;
}

async function buildSkills() {
  const d = new Dict();
  await pairColumn("ActiveSkills", "DisplayedName", d);
  await pairColumn("ActiveSkills", "Description", d);
  await pairColumn("GemTags", "Name", d);
  return d;
}

async function buildPassives() {
  const d = new Dict();
  await pairColumn("PassiveSkills", "Name", d);
  await pairColumn("PassiveSkills", "FlavourText", d);
  await pairColumn("Ascendancy", "Name", d);
  await pairColumn("Ascendancy", "FlavourText", d);
  await pairColumn("Characters", "Name", d);
  return d;
}

async function buildMods() {
  const d = new Dict();
  // prefix (1) / suffix (2) の名前だけ (モンスター MOD 等の内部名は除く)
  await pairColumn("Mods", "Name", d, (row) => row.GenerationType === 1 || row.GenerationType === 2);
  await pairColumn("MonsterVarieties", "Name", d);
  return d;
}

/**
 * stat_descriptions.csd: descriptor ごとに English / Japanese の行を対応させる。
 * 行数が同じなら index で、違えば limit の並びで突き合わせる。
 */
async function buildStats() {
  const d = new Dict();
  const text = decodeCsd(await readFile(CSD_PATH));
  const { descriptors } = parseStatDescriptions(text);
  let paired = 0;
  let unpaired = 0;
  const limitKey = (line) => JSON.stringify(line.limits);
  for (const desc of descriptors) {
    const en = desc.langs?.English ?? [];
    const ja = desc.langs?.Japanese ?? [];
    if (en.length === 0 || ja.length === 0) continue;
    const byLimit = new Map(ja.map((l) => [limitKey(l), l]));
    en.forEach((line, i) => {
      const jaLine = en.length === ja.length ? ja[i] : byLimit.get(limitKey(line));
      if (!jaLine) {
        unpaired++;
        return;
      }
      d.add(normalizePlaceholders(line.text), normalizePlaceholders(jaLine.text));
      paired++;
    });
  }
  log(`stats: ${paired} 行を対応付け (${unpaired} 行は対応する日本語行なし)`);
  return d;
}

// ---------------------------------------------------------------------------
// manifest.lua への追記 (末尾 = 最優先)
// ---------------------------------------------------------------------------
async function updateManifest() {
  const src = await readFile(MANIFEST, "utf8");
  const nl = src.includes("\r\n") ? "\r\n" : "\n";
  const missing = OUTPUTS.filter((f) => !src.includes(`"${f}"`));
  if (missing.length === 0) return 0;
  const close = src.lastIndexOf("}");
  if (close < 0) throw new Error("manifest.lua: closing brace not found");
  const insert =
    `${nl}\t-- ExileDesk: GGG クライアント由来の公式日本語 (build-pob2jp-from-client.mjs)。末尾 = 同キーは公式訳が勝つ${nl}` +
    missing.map((f) => `\t"${f}",`).join(nl) +
    nl;
  const before = src.slice(0, close).replace(/\s+$/, "");
  await writeFile(MANIFEST, before + insert + src.slice(close));
  return missing.length;
}

async function main() {
  if (!(await exists(MANIFEST))) {
    throw new Error(`PoB2-JP が見つからない: ${POB2JP_DIR} (POB2JP_DIR で指定可)`);
  }
  if (!(await exists(CSD_PATH))) {
    throw new Error(`${CSD_PATH} が無い。先に node scripts/build-dicts-from-client.mjs を実行すること`);
  }
  const builders = {
    "client-items.csv": buildItems,
    "client-uniques.csv": buildUniques,
    "client-flavour.csv": buildFlavour,
    "client-skills.csv": buildSkills,
    "client-passives.csv": buildPassives,
    "client-mods.csv": buildMods,
    "client-stats.csv": buildStats,
  };
  let total = 0;
  for (const name of OUTPUTS) {
    const dict = await builders[name]();
    total += dict.map.size;
    log(`${name}: ${dict.map.size} 件 (skip ${dict.skipped})`);
    if (!DRY) await writeFile(join(OUT_DIR, name), dict.toCsv(), "utf8");
  }
  if (!DRY) {
    const added = await updateManifest();
    log(`manifest.lua: ${added} 件追記`);
  }
  log(`${DRY ? "(dry-run) " : ""}合計 ${total} 件 → ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("[pob2jp-client] FAILED:", e);
  process.exit(1);
});
