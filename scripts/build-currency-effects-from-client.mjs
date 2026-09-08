#!/usr/bin/env node
/**
 * build-currency-effects-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   通貨ランキングのホバーに出す「効果説明 (日本語)」辞書 `src/i18n/currency-effects-ja.json`
 *   を、GGG クライアントの `CurrencyItems` テーブル (Description / StackSize) から作る。
 *
 *   従来は POE2DB の JP カテゴリページ 15 枚をスクレイプしていた (build-currency-effects-ja.mjs)。
 *   Divine Orb の説明文が両者で一字一句同じ = poe2db もこのテーブルを描画していただけ。
 *
 * 形式 (既存と同じ、フロントは EN 名を小文字英数に正規化したキーで引く):
 *   { "<norm(EN name)>": { "e": ["効果行", ...], "s": "1 / <StackSize>" } }
 *
 * カバー範囲:
 *   CurrencyItems.Description を持つもの (通貨・エッセンス・オーメン・タブレット等、JA 879 件)。
 *   ルーン / ソウルコアは Description が空で、効果は SoulCores テーブル経由の別結合が必要
 *   → 当面は既存 (poe2db 由来) をそのまま残す (マージなので消えない)。
 *
 * 出力: 既存に上書きマージ (クライアントが正、キーは消さない、減れば書かない)。
 *
 * Usage:
 *   node scripts/build-currency-effects-from-client.mjs            # Steam 既定パス自動検出
 *   node scripts/build-currency-effects-from-client.mjs --no-export
 *
 * @date 2026-09-07
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions, renderDescriptor } from "./parse-stat-descriptions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EXPORT_DIR = resolve(ROOT, "data-cache/client-export-currency");
const CSD_PATH = resolve(ROOT, "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd");
const OUT = resolve(ROOT, "src/i18n/currency-effects-ja.json");

const STEAM_CANDIDATES = [
  "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2",
  "D:/SteamLibrary/steamapps/common/Path of Exile 2",
  "E:/SteamLibrary/steamapps/common/Path of Exile 2",
  "C:/Program Files (x86)/Grinding Gear Games/Path of Exile 2",
];

function log(...args) {
  console.log("[build-currency-effects-from-client]", ...args);
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

// フロント (currency-effects 参照側) と同じキー正規化: 小文字・英数のみ
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// `[Tag|表示]` → 表示、`[Tag]` → Tag。poe2db 由来の既存値はプレーンテキストなので揃える。
const stripMarkers = (s) => s.replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2").replace(/\[([^|\]]+)\]/g, "$1");

async function resolveSource() {
  const patch = argValue("--patch");
  if (patch) return { patch };
  const steamArg = argValue("--steam") || process.env.POE2_DIR;
  if (steamArg) {
    if (!(await exists(resolve(steamArg, "Bundles2")))) throw new Error(`Bundles2 が見当たりません: ${steamArg}`);
    return { steam: steamArg };
  }
  for (const c of STEAM_CANDIDATES) if (await exists(resolve(c, "Bundles2"))) return { steam: c };
  throw new Error("PoE2 のインストールが見つかりません。--steam <dir> / POE2_DIR / --patch <version> を指定してください。");
}

async function exportTables(source) {
  await mkdir(EXPORT_DIR, { recursive: true });
  const config = {
    ...source,
    translations: ["English", "Japanese"],
    tables: [
      { name: "CurrencyItems", columns: ["BaseItemType", "Description", "StackSize"] },
      { name: "BaseItemTypes", columns: ["Id", "Name"] },
      // ルーン / ソウルコア: 効果はカテゴリ (装備種別) ごとの stat + 値。文言は csd で描画する。
      { name: "SoulCores", columns: ["BaseItemType", "RequiredLevel"] },
      { name: "SoulCoreStats", columns: ["SoulCore", "StatCategory", "Stats", "StatsValues"] },
      { name: "SoulCoreStatCategories", columns: ["Id", "Display"] },
      { name: "Stats", columns: ["Id"] },
    ],
  };
  await writeFile(resolve(EXPORT_DIR, "config.json"), JSON.stringify(config, null, 2) + "\n", "utf8");
  const pkgPath = resolve(ROOT, "node_modules/pathofexile-dat/package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const binRel = typeof pkg.bin === "string" ? pkg.bin : Object.values(pkg.bin)[0];
  log(`source: ${source.patch ? "patch " + source.patch : source.steam}`);
  const r = spawnSync(process.execPath, [resolve(dirname(pkgPath), binRel)], { cwd: EXPORT_DIR, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`pathofexile-dat exited with ${r.status}`);
}

async function loadTable(lang, name) {
  const j = JSON.parse(await readFile(resolve(EXPORT_DIR, "tables", lang, `${name}.json`), "utf8"));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
}

async function main() {
  if (!process.argv.includes("--no-export")) await exportTables(await resolveSource());

  const [cEn, cJa, bEn] = await Promise.all([
    loadTable("English", "CurrencyItems"),
    loadTable("Japanese", "CurrencyItems"),
    loadTable("English", "BaseItemTypes"),
  ]);
  if (cEn.length !== cJa.length) throw new Error(`CurrencyItems row mismatch EN=${cEn.length} JA=${cJa.length}`);

  const fresh = {};
  let noName = 0;
  let noDesc = 0;
  for (let i = 0; i < cEn.length; i++) {
    const base = bEn[cEn[i].BaseItemType];
    const name = base && base.Name;
    if (!name) {
      noName++;
      continue;
    }
    const descJa = (cJa[i].Description || "").trim();
    if (!descJa) {
      noDesc++;
      continue;
    }
    const lines = stripMarkers(descJa)
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const entry = { e: lines };
    const stack = Number(cEn[i].StackSize) || 0;
    if (stack > 0) entry.s = `1 / ${stack}`;
    const key = norm(name);
    // 同じ名前が複数行に出る場合は説明行の多い方を採用 (既存スクレイパーと同じ規則)
    if (!fresh[key] || lines.length > fresh[key].e.length) fresh[key] = entry;
  }
  log(`CurrencyItems: ${cEn.length} rows -> ${Object.keys(fresh).length} entries with JA description (no name: ${noName}, no description: ${noDesc})`);

  // --- ルーン / ソウルコア: SoulCoreStats (カテゴリ × stat 値) を csd で日本語描画 ---
  // 出力行は poe2db 版と同じ「<装備種別>: <効果>」形式。RequiredLevel は "レベル N"。
  if (!(await exists(CSD_PATH))) {
    log(`WARN: ${CSD_PATH} が無いためルーン / ソウルコアの効果は生成せず既存を保持します (build-dicts-from-client.mjs を先に実行)`);
  } else {
    const [cores, coreStats, catEn, catJa, stats] = await Promise.all([
      loadTable("English", "SoulCores"),
      loadTable("English", "SoulCoreStats"),
      loadTable("English", "SoulCoreStatCategories"),
      loadTable("Japanese", "SoulCoreStatCategories"),
      loadTable("English", "Stats"),
    ]);
    const { byStat } = parseStatDescriptions(decodeCsd(await readFile(CSD_PATH)));
    const stackByBase = new Map();
    for (const r of cEn) if (r.BaseItemType != null && Number(r.StackSize) > 0) stackByBase.set(r.BaseItemType, Number(r.StackSize));
    const rowsByCore = new Map();
    for (const r of coreStats) {
      if (!rowsByCore.has(r.SoulCore)) rowsByCore.set(r.SoulCore, []);
      rowsByCore.get(r.SoulCore).push(r);
    }
    let coresOut = 0;
    let coresNoLines = 0;
    for (let i = 0; i < cores.length; i++) {
      const base = bEn[cores[i].BaseItemType];
      const name = base && base.Name;
      if (!name) continue;
      const lines = [];
      for (const row of rowsByCore.get(i) || []) {
        const cat = row.StatCategory;
        const label = stripMarkers(String(catJa[cat]?.Display || catEn[cat]?.Display || catEn[cat]?.Id || "").trim());
        const ids = (row.Stats || []).map((k) => stats[k]?.Id).filter(Boolean);
        const vals = row.StatsValues || [];
        const seen = new Set();
        const parts = [];
        for (const id of ids) {
          if (seen.has(id)) continue;
          const d = byStat.get(id);
          if (!d) {
            seen.add(id);
            continue;
          }
          for (const sid of d.stats) seen.add(sid);
          if (d.noDescription) continue;
          const values = d.stats.map((sid) => {
            const k = ids.indexOf(sid);
            const v = k >= 0 ? Number(vals[k]) || 0 : 0;
            return { min: v, max: v };
          });
          const text = renderDescriptor(d, "Japanese", values) ?? renderDescriptor(d, "English", values);
          if (text) parts.push(stripMarkers(text.trim()));
        }
        if (!parts.length) continue;
        lines.push(label ? `${label}: ${parts.join("、")}` : parts.join("、"));
      }
      if (!lines.length) {
        coresNoLines++;
        continue;
      }
      const entry = { e: lines };
      const stack = stackByBase.get(cores[i].BaseItemType);
      if (stack) entry.s = `1 / ${stack}`;
      const lv = Number(cores[i].RequiredLevel) || 0;
      if (lv > 0) entry.lv = `レベル ${lv}`;
      fresh[norm(name)] = entry;
      coresOut++;
    }
    log(`SoulCores: ${cores.length} rows -> ${coresOut} rune/soul-core entries (no renderable lines: ${coresNoLines})`);
  }

  let existing = {};
  if (await exists(OUT)) {
    try {
      const j = JSON.parse(await readFile(OUT, "utf8"));
      if (j && typeof j === "object" && !Array.isArray(j)) existing = j;
    } catch (e) {
      log(`WARN: existing ${OUT} unreadable (${e.message}) -> start empty`);
    }
  }
  const merged = { ...existing, ...fresh };
  const before = Object.keys(existing).length;
  const after = Object.keys(merged).length;
  let updated = 0;
  for (const k of Object.keys(fresh)) {
    if (existing[k] !== undefined && JSON.stringify(existing[k]) !== JSON.stringify(fresh[k])) updated++;
  }
  if (after < before) throw new Error(`currency-effects-ja would shrink ${before} -> ${after}; refusing to write`);
  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  await mkdir(dirname(OUT), { recursive: true });
  // 既存ファイルと同じく 1 行 JSON (build-currency-effects-ja.mjs と同じ書式)
  await writeFile(OUT, JSON.stringify(sorted, null, 0) + "\n", "utf8");
  log(`OUTPUT: ${OUT}`);
  log(`currency-effects-ja: ${before} -> ${after} (+${after - before} new, ${updated} existing entries updated from client)`);
}

main().catch((e) => {
  console.error("[build-currency-effects-from-client] FAILED:", e.message || e);
  process.exit(1);
});
