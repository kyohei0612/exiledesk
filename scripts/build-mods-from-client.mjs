#!/usr/bin/env node
/**
 * build-mods-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   GGG クライアントの `Mods` テーブル (+ Stats / Tags / ModType / ModFamily) と
 *   `Data/StatDescriptions/stat_descriptions.csd` (全言語の文言) から、
 *   RePoE fork と同じ形式の `data-cache/mods.en.json` / `data-cache/mods.ja.json` を生成する。
 *
 *   RePoE の mods.json は元々この同じテーブルの写しで、2026-06-01 を最後に更新が
 *   止まった (日本語は 404)。写しをやめて原本から同じ形式を作ることで、下流の
 *   `extract-mods-bundle.mjs` → `mods-bundle.json` → `build-mod-tier-and-group.mjs`
 *   は無改造のまま最新 (新リーグの MOD 込み) になる。
 *
 * 入力 (すべて gitignore の data-cache 配下):
 *   data-cache/client-export-mods/tables/English/{Mods,Stats,Tags,ModType,ModFamily,ItemClasses}.json
 *       ← build-dicts-from-client.mjs と同じ要領で pathofexile-dat が書き出す (本スクリプトが実行する)
 *   data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd
 *       ← pathofexile-dat の `files` 指定で書き出したもの (パスの `/` は `@` に置換される)
 *
 * 出力: RePoE 形式 { [modId]: { name, required_level, domain, generation_type, type, groups,
 *        stats:[{id,min,max}], spawn_weights:[{tag,weight}], generation_weights, adds_tags,
 *        implicit_tags, is_essence_only, grants_effects, text, gold_value, ... } }
 *
 * 実装メモ (2026-09-07 実測):
 *   - 外部キー (Stat1, ModType, Families[], SpawnWeight_Tags[] ...) は参照先テーブルの
 *     行番号 (= 配列添字 = `_index`)。
 *   - `Stat1Value` は [min, max] の配列で書き出される (schema 上は i32 だが実データは対)。
 *   - Domain / GenerationType は enum 値。ラベルは RePoE (同じテーブル由来) との突合で確定。
 *   - 文言は stat ごとに csd の descriptor を引き、同じ descriptor に属する複数 stat
 *     (例: added damage の min/max) は 1 行にまとめる (PoB / RePoE と同じ)。
 *
 * Usage:
 *   node scripts/build-mods-from-client.mjs              # Steam 既定パス自動検出
 *   node scripts/build-mods-from-client.mjs --steam <dir> | --patch <ver>
 *   node scripts/build-mods-from-client.mjs --no-export  # 既存の書き出しを再利用 (開発用)
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
const EXPORT_DIR = resolve(ROOT, "data-cache/client-export-mods");
const CSD_PATH = resolve(ROOT, "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd");
const OUT_EN = resolve(ROOT, "data-cache/mods.en.json");
const OUT_JA = resolve(ROOT, "data-cache/mods.ja.json");

const STEAM_CANDIDATES = [
  "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2",
  "D:/SteamLibrary/steamapps/common/Path of Exile 2",
  "E:/SteamLibrary/steamapps/common/Path of Exile 2",
  "C:/Program Files (x86)/Grinding Gear Games/Path of Exile 2",
];

// enum ラベル (2026-09-07、クライアント Mods と RePoE mods.json を Id で突合して確定)
const DOMAIN = {
  1: "item", 2: "flask", 3: "monster", 4: "chest", 5: "strongbox", 6: "area", 8: "sanctum_relic",
  10: "crafted", 11: "misc", 12: "atlas", 13: "leaguestone", 15: "map_device", 16: "dummy",
  18: "delve_area", 19: "synthesis_a", 20: "synthesis_globals", 21: "synthesis_bonus",
  22: "affliction_jewel", 23: "heist_area", 24: "heist_npc", 25: "heist_trinket", 27: "veiled",
  28: "desecrated", 29: "expedition_relic", 31: "sentinel", 32: "memory_line", 34: "tablet",
  35: "ultimatum_key", 36: "vault_key", 37: "incursion_limb",
};
const GENERATION_TYPE = {
  1: "prefix", 2: "suffix", 3: "unique", 4: "nemesis", 5: "corrupted", 6: "bloodlines", 7: "torment",
  8: "tempest", 9: "talisman", 11: "essence", 13: "bestiary", 14: "delve_area", 15: "synthesis_a",
  16: "synthesis_globals", 17: "synthesis_bonus", 18: "blight", 20: "monster_affliction",
  23: "expedition_logbook", 26: "scourge_gimmick", 33: "instilled", 34: "azmeri_empowered_monster",
};

function log(...args) {
  console.log("[build-mods-from-client]", ...args);
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

// ---------------------------------------------------------------------------
// 1. テーブル書き出し
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
  throw new Error("PoE2 のインストールが見つかりません。--steam <dir> / POE2_DIR / --patch <version> を指定してください。");
}

async function exportTables(source) {
  await mkdir(EXPORT_DIR, { recursive: true });
  const config = {
    ...source,
    translations: ["English"],
    tables: [
      {
        name: "Mods",
        columns: [
          "Id", "Name", "Level", "MaxLevel", "ModType", "Domain", "GenerationType", "Families",
          "Stat1", "Stat2", "Stat3", "Stat4", "Stat5", "Stat6", "Stat7", "Stat8",
          "Stat1Value", "Stat2Value", "Stat3Value", "Stat4Value", "Stat5Value", "Stat6Value", "Stat7Value", "Stat8Value",
          "SpawnWeight_Tags", "SpawnWeight_Values", "GenerationWeight_Tags", "GenerationWeight_Values",
          "Tags", "ImplicitTags", "IsEssenceOnlyModifier", "CraftingItemClassRestrictions",
        ],
      },
      { name: "Stats", columns: ["Id"] },
      { name: "Tags", columns: ["Id", "DisplayString"] },
      { name: "ModType", columns: ["Name"] },
      { name: "ModFamily", columns: ["Id"] },
      { name: "ItemClasses", columns: ["Id", "Name"] },
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

async function loadTable(name) {
  const p = resolve(EXPORT_DIR, "tables", "English", `${name}.json`);
  const j = JSON.parse(await readFile(p, "utf8"));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
}

// ---------------------------------------------------------------------------
// 2. 変換
// ---------------------------------------------------------------------------
function pair(v) {
  // [min, max] / 単値 / null を {min,max} に正規化
  if (Array.isArray(v)) return { min: Number(v[0]) || 0, max: Number(v[1] ?? v[0]) || 0 };
  const n = Number(v) || 0;
  return { min: n, max: n };
}

/**
 * MOD の stats を csd の descriptor 単位で描画して行を返す。
 * 同じ descriptor に属する stat (例: added damage の min/max) は 1 行にまとめる。
 */
function renderModText(modStats, byStat, lang) {
  const byId = new Map(modStats.map((s) => [s.id, s]));
  const consumed = new Set();
  const lines = [];
  let missing = 0;
  for (const s of modStats) {
    if (consumed.has(s.id)) continue;
    const d = byStat.get(s.id);
    if (!d) {
      consumed.add(s.id);
      missing++;
      continue;
    }
    for (const sid of d.stats) consumed.add(sid);
    if (d.noDescription) continue;
    const values = d.stats.map((sid) => {
      const v = byId.get(sid);
      return v ? { min: v.min, max: v.max } : { min: 0, max: 0 };
    });
    const line = renderDescriptor(d, lang, values);
    if (line && line.trim()) lines.push(line.trim());
  }
  return { text: lines.join("\n"), missing };
}

async function main() {
  const noExport = process.argv.includes("--no-export");
  if (!noExport) {
    const source = await resolveSource();
    await exportTables(source);
  } else {
    log("--no-export: reusing existing tables in " + EXPORT_DIR);
  }

  if (!(await exists(CSD_PATH))) {
    throw new Error(
      `stat_descriptions.csd が無い: ${CSD_PATH}\n` +
        "data-cache/client-export/config.json に \"files\": [\"Data/StatDescriptions/stat_descriptions.csd\"] を入れて npx pathofexile-dat を実行してください。",
    );
  }

  const [mods, stats, tags, types, fams, classes] = await Promise.all(
    ["Mods", "Stats", "Tags", "ModType", "ModFamily", "ItemClasses"].map(loadTable),
  );
  log(`tables: Mods=${mods.length} Stats=${stats.length} Tags=${tags.length} ModType=${types.length} ModFamily=${fams.length} ItemClasses=${classes.length}`);

  const csdText = decodeCsd(await readFile(CSD_PATH));
  const { descriptors, byStat } = parseStatDescriptions(csdText);
  log(`stat descriptions: ${descriptors.length} descriptors, ${byStat.size} stat ids`);

  const tagId = (i) => (i != null && tags[i] ? tags[i].Id : null);
  const outEn = {};
  const outJa = {};
  const missingStatIds = new Map();
  let withEn = 0;
  let withJa = 0;
  let jaFallback = 0;
  let unknownDomain = 0;
  let unknownGen = 0;

  for (const m of mods) {
    if (!m.Id) continue;
    const modStats = [];
    for (let k = 1; k <= 8; k++) {
      const ref = m[`Stat${k}`];
      if (ref == null || !stats[ref]) continue;
      const { min, max } = pair(m[`Stat${k}Value`]);
      modStats.push({ id: stats[ref].Id, min, max });
    }
    const zip = (keys, vals) =>
      (keys || []).map((t, i) => ({ tag: tagId(t), weight: Number((vals || [])[i]) || 0 })).filter((x) => x.tag);

    const domain = DOMAIN[m.Domain];
    const gen = GENERATION_TYPE[m.GenerationType];
    if (!domain) unknownDomain++;
    if (!gen) unknownGen++;

    const base = {
      adds_tags: (m.Tags || []).map(tagId).filter(Boolean),
      domain: domain ?? `unknown_${m.Domain}`,
      generation_type: gen ?? `unknown_${m.GenerationType}`,
      generation_weights: zip(m.GenerationWeight_Tags, m.GenerationWeight_Values),
      grants_effects: [],
      groups: (m.Families || []).map((i) => fams[i]?.Id).filter(Boolean),
      implicit_tags: (m.ImplicitTags || []).map(tagId).filter(Boolean),
      is_essence_only: !!m.IsEssenceOnlyModifier,
      name: m.Name ?? "",
      required_level: Number(m.Level) || 0,
      spawn_weights: zip(m.SpawnWeight_Tags, m.SpawnWeight_Values),
      stats: modStats,
      type: types[m.ModType]?.Name ?? "",
      gold_value: null,
      // 以下はクライアント由来の追加情報 (RePoE 形式には無いが下流は無視する)
      max_level: Number(m.MaxLevel) || 0,
      crafting_item_class_restrictions: (m.CraftingItemClassRestrictions || []).map((i) => classes[i]?.Id).filter(Boolean),
    };

    const en = renderModText(modStats, byStat, "English");
    const ja = renderModText(modStats, byStat, "Japanese");
    for (const s of modStats) if (!byStat.has(s.id)) missingStatIds.set(s.id, (missingStatIds.get(s.id) || 0) + 1);
    if (en.text) withEn++;
    let jaText = ja.text;
    if (!jaText && en.text) {
      jaText = en.text;
      jaFallback++;
    } else if (jaText) {
      withJa++;
    }
    outEn[m.Id] = { ...base, text: en.text };
    outJa[m.Id] = { ...base, text: jaText };
  }

  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  await mkdir(dirname(OUT_EN), { recursive: true });
  await writeFile(OUT_EN, JSON.stringify(sortObj(outEn), null, 1) + "\n", "utf8");
  await writeFile(OUT_JA, JSON.stringify(sortObj(outJa), null, 1) + "\n", "utf8");

  log("─".repeat(60));
  log(`OUTPUT: ${OUT_EN}`);
  log(`OUTPUT: ${OUT_JA}`);
  log(`mods: ${Object.keys(outEn).length} (with EN text ${withEn}, with JA text ${withJa}, JA fallback→EN ${jaFallback})`);
  log(`unknown enum values: domain=${unknownDomain} generation_type=${unknownGen}`);
  if (missingStatIds.size) {
    const top = [...missingStatIds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    log(`stat ids without descriptor: ${missingStatIds.size} (top: ${top.map(([k, v]) => `${k}×${v}`).join(", ")})`);
  }
}

main().catch((e) => {
  console.error("[build-mods-from-client] FAILED:", e.message || e);
  process.exit(1);
});
