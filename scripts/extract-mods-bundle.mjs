#!/usr/bin/env node
/**
 * extract-mods-bundle.mjs
 * --------------------------------------------------------------
 * RePoE fork (poe2) の mods.json から ExileDesk 用の mods-bundle を生成する。
 *
 * Sources:
 *   - English: https://raw.githubusercontent.com/repoe-fork/poe2/master/data/mods.json
 *   - Japanese: (廃止) repoe-fork/poe2 は 2026-06 までに日本語ローカライズを全廃
 *       (data/Japanese 消滅, stat_translations の Japanese 全 null)。
 *       JA は cache (data-cache/mods.ja.json) を温存し、未取得 MOD は EN fallback。
 *       恒久的な別 JA 源の選定は TODO (notes/2026-06-01-decisions.md)。
 *   - License: MIT (RePoE) / data owned by Grinding Gear Games (per ToS)
 *
 * Output:
 *   - src/i18n/mods-bundle.json   ({ [key: string]: BundledMod })
 *
 * Usage:
 *   node scripts/extract-mods-bundle.mjs                  # use cached files in data-cache/
 *   node scripts/extract-mods-bundle.mjs --refresh        # re-download from upstream
 *
 * Categorization rule (kind flag in output):
 *   - essence    : is_essence_only === true
 *   - corrupted  : generation_type === "corrupted"  (Vaal Orb)
 *   - desecrated : domain === "desecrated"          (Abyss / Ulaman / Kurgal / Amanamu)
 *   - normal     : everything else that is prefix/suffix on item/misc/flask/jewel domain
 *
 * Each mod gets its appropriate flag (essence/corrupt/desecrated) set to 1,
 * and `tags` is taken from `implicit_tags + adds_tags`.
 * --------------------------------------------------------------
 */

import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CACHE_DIR = resolve(ROOT, "data-cache");
const OUT_FILE = resolve(ROOT, "src/i18n/mods-bundle.json");

const SOURCES = {
  en: "https://raw.githubusercontent.com/repoe-fork/poe2/master/data/mods.json",
  ja: "https://raw.githubusercontent.com/repoe-fork/poe2/master/data/Japanese/mods.json",
};

/** Domains we keep (corrupted/desecrated/essence are handled by other gates). */
const ALLOWED_DOMAINS = new Set(["item", "misc", "flask", "jewel"]);
/** generation_types we keep for "normal" pool. */
const NORMAL_GEN_TYPES = new Set(["prefix", "suffix"]);

/* ---------------- helpers ---------------- */

function log(...args) {
  console.log("[extract-mods]", ...args);
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
 * @param {string} url   取得元
 * @param {string} dest  保存先
 * @param {boolean} refresh  true なら cache があっても再取得
 * @param {boolean} [optional=false]  true なら取得失敗を致命扱いせず、
 *   既存 cache があればそれを使い、無ければ何もせず false を返す（呼出側で fallback）。
 * @returns {Promise<boolean>}  最新データを取得/保持できたか
 */
async function downloadIfMissing(url, dest, refresh, optional = false) {
  if (!refresh && (await exists(dest))) {
    log(`cached: ${dest}`);
    return true;
  }
  log(`fetching ${url}`);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    res = { ok: false, status: `network error: ${e?.message ?? e}` };
  }
  if (!res.ok) {
    if (optional) {
      const haveCache = await exists(dest);
      log(
        `⚠ optional source 取得失敗 (HTTP ${res.status}): ${url}` +
          (haveCache
            ? ` → 既存 cache (${dest}) で続行`
            : ` → cache も無し。fallback で続行`),
      );
      return haveCache;
    }
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  log(`wrote ${dest} (${buf.length.toLocaleString()} bytes)`);
  return true;
}

/**
 * @param {object} v RePoE raw mod
 * @param {string} key RePoE key (used to detect EssenceDisplay* OR-typed essence mods)
 * @returns {"essence"|"corrupted"|"desecrated"|"normal"|null}
 */
function classify(v, key) {
  if (v.is_essence_only === true) return "essence";
  // POE2 essence の OR タイプ mod (RePoE では gt=unique でモデリング)
  // 例: EssenceDisplayAttributes1-5 (筋力、器用さまたは知性), EssenceDisplayDefences1-4 (アーマー、回避力またはエナジーシールド)
  if (
    key.startsWith("EssenceDisplay") &&
    v.domain === "item" &&
    v.generation_type === "unique"
  ) {
    return "essence";
  }
  // SpecialCorrupted (新 Vaal Orb mod、helmet 用 8 種)。
  // RePoE では gt=unique でモデリングされ通常 corrupted パスをすり抜ける。
  if (
    key.startsWith("SpecialCorruption") &&
    v.domain === "item" &&
    v.generation_type === "unique"
  ) {
    return "corrupted";
  }
  if (v.generation_type === "corrupted") return "corrupted";
  if (v.domain === "desecrated") return "desecrated";
  if (
    NORMAL_GEN_TYPES.has(v.generation_type) &&
    ALLOWED_DOMAINS.has(v.domain)
  ) {
    return "normal";
  }
  return null;
}

/**
 * Map RePoE's generation_type to our bundle's `type`.
 * For corrupted/desecrated, we still expose prefix vs suffix so callers can
 * filter by slot. RePoE uses "prefix"/"suffix" even within these domains.
 * For mods with non-standard gen_type (rare), default to "suffix".
 */
function bundleType(v) {
  const g = v.generation_type;
  if (g === "prefix") return "prefix";
  if (g === "suffix") return "suffix";
  // corrupted/essence/etc. — fallback inference: name presence
  // Most corrupted mods are suffix-style (e.g. "of Corruption"), but some are
  // prefix. Use the first group's casing as a hint, fallback to suffix.
  return "suffix";
}

/**
 * Reduce spawn_weights to the ones we expose: all positive weights, plus
 * informative zero entries for "default" so consumers can detect explicit
 * blocks. Remove `default` zero (the implicit catch-all) since it's noise.
 */
function reduceSpawn(weights) {
  if (!Array.isArray(weights) || weights.length === 0) return [];
  const out = [];
  for (const w of weights) {
    const tag = w.tag;
    const weight = Number(w.weight ?? 0) | 0;
    if (!tag) continue;
    // Drop the implicit catch-all "default" with weight 0 (noise).
    if (tag === "default" && weight === 0) continue;
    out.push({ t: tag, w: weight });
  }
  return out;
}

function reduceStats(stats) {
  if (!Array.isArray(stats)) return [];
  return stats.map((s) => {
    const out = { id: s.id };
    if (typeof s.min === "number") out.min = s.min;
    if (typeof s.max === "number") out.max = s.max;
    return out;
  });
}

function mergeTags(v) {
  const out = new Set();
  for (const t of v.implicit_tags ?? []) out.add(t);
  for (const t of v.adds_tags ?? []) out.add(t);
  return Array.from(out);
}

/* ---------------- main extract ---------------- */

/**
 * JA 補完辞書 (build-mod-text-ja.py が公式トレードスタッツから生成) と突合する共通正規化。
 * Python 側 common_norm と完全一致させること: [Tag|表示]→表示、ダッシュ→-、
 * (a-b)/(n)/裸数値 → #、空白圧縮。
 */
function commonNorm(text) {
  let s = text;
  s = s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2");
  s = s.replace(/\[([^\]]+)\]/g, "$1");
  s = s.replace(/[—–]/g, "-");
  s = s.replace(/\([+-]?\d+(?:\.\d+)?\s*-\s*[+-]?\d+(?:\.\d+)?\)/g, "#");
  s = s.replace(/\([+-]?\d+(?:\.\d+)?\)/g, "#");
  s = s.replace(/(?<![\w#])[-+]?\d+(?:\.\d+)?/g, "#");
  s = s.replace(/#(\s*-\s*#)+/g, "#");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

async function main() {
  const argv = process.argv.slice(2);
  const refresh = argv.includes("--refresh");

  await mkdir(CACHE_DIR, { recursive: true });

  const enPath = resolve(CACHE_DIR, "mods.en.json");
  const jaPath = resolve(CACHE_DIR, "mods.ja.json");

  await downloadIfMissing(SOURCES.en, enPath, refresh);
  // JA は optional: 2026-06-01 時点で上流 repoe-fork/poe2 が日本語 mods.json を
  // 廃止 (data/Japanese 消滅, stat_translations の Japanese も全 null)。
  // 取得失敗しても旧 cache → EN fallback と縮退して EN 追従を止めない。
  // 恒久対応 (別 JA 源) は TODO: notes/2026-06-01-decisions.md 参照。
  await downloadIfMissing(SOURCES.ja, jaPath, refresh, true);

  log("loading EN mods…");
  const enRaw = JSON.parse(await readFile(enPath, "utf-8"));
  log("loading JA mods…");
  const jaRaw = (await exists(jaPath))
    ? JSON.parse(await readFile(jaPath, "utf-8"))
    : {};
  if (Object.keys(jaRaw).length === 0) {
    log("⚠ JA mods が空: 全 MOD が EN fallback 表示になります");
  }

  // JA 補完辞書 (RePoE JA廃止分を埋める / scripts/build-mod-text-ja.py が公式トレード
  // スタッツ jp realm から生成)。{ common_norm(EN): JA text }
  const modTextJaPath = resolve(ROOT, "src/i18n/mod-text-ja.json");
  const modTextJa = (await exists(modTextJaPath))
    ? JSON.parse(await readFile(modTextJaPath, "utf-8"))
    : {};
  log(`JA 補完辞書(トレード由来): ${Object.keys(modTextJa).length} entries`);

  log(
    `source counts: EN=${Object.keys(enRaw).length}, JA=${Object.keys(jaRaw).length}`,
  );

  const out = {};
  const stats = {
    total: 0,
    byKind: { normal: 0, essence: 0, corrupted: 0, desecrated: 0 },
    byDomain: {},
    skippedNoText: 0,
    missingJa: 0,
    jaOverlaid: 0,
  };

  for (const [key, v] of Object.entries(enRaw)) {
    const kind = classify(v, key);
    if (kind === null) continue;

    // Skip mods with no display text AND no stats — these are pure metadata
    // shells (e.g. EssenceGrantedPassive). Keep ones that have either text or
    // stats for downstream tooling.
    const hasText = typeof v.text === "string" && v.text.trim().length > 0;
    const hasStats = Array.isArray(v.stats) && v.stats.length > 0;
    if (!hasText && !hasStats) {
      stats.skippedNoText++;
      continue;
    }

    const ja = jaRaw[key];
    if (!ja) stats.missingJa++;

    const bundled = {
      name_en: v.name ?? "",
      name_ja: ja?.name ?? v.name ?? "",
      text_en: v.text ?? "",
      text_ja: ja?.text ?? v.text ?? "",
      type: bundleType(v),
      groups: Array.isArray(v.groups) ? [...v.groups] : [],
      level: Number(v.required_level ?? 1) | 0,
      stats: reduceStats(v.stats ?? []),
      spawn: reduceSpawn(v.spawn_weights ?? []),
      tags: mergeTags(v),
    };

    // JA 補完: RePoE JA 廃止で未訳 (text_ja === text_en) のものを公式トレード由来で上書き。
    if (bundled.text_ja === bundled.text_en && bundled.text_en) {
      const ov = modTextJa[commonNorm(bundled.text_en)];
      if (ov) {
        bundled.text_ja = ov;
        stats.jaOverlaid++;
      }
    }

    if (kind === "essence") bundled.essence = 1;
    else if (kind === "corrupted") bundled.corrupt = 1;
    else if (kind === "desecrated") bundled.desecrated = 1;
    // normal: no flag

    out[key] = bundled;
    stats.total++;
    stats.byKind[kind]++;
    stats.byDomain[v.domain] = (stats.byDomain[v.domain] ?? 0) + 1;
  }

  // Always write a stable, deterministic key order (sorted) so diffs are clean.
  const sorted = {};
  for (const key of Object.keys(out).sort()) sorted[key] = out[key];

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(sorted, null, 0));
  const sizeBytes = (await stat(OUT_FILE)).size;

  log("==== bundle written ====");
  log(`output: ${OUT_FILE}`);
  log(`size: ${(sizeBytes / 1024).toFixed(1)} KB`);
  log(`total mods: ${stats.total}`);
  log(`by kind:`);
  for (const [k, n] of Object.entries(stats.byKind)) log(`  ${k}: ${n}`);
  log(`by domain:`);
  for (const [d, n] of Object.entries(stats.byDomain).sort(
    (a, b) => b[1] - a[1],
  )) {
    log(`  ${d}: ${n}`);
  }
  log(`skipped (no text & no stats): ${stats.skippedNoText}`);
  log(`missing JA translation: ${stats.missingJa}`);
  log(`JA 補完で埋めた(トレード由来): ${stats.jaOverlaid}`);

  // Sanity guards — fail loudly on regressions
  const guardrails = {
    minTotal: 2000,
    minDesecrated: 300,
    minCorrupted: 100,
    minEssence: 5,
    minNormal: 1500,
  };
  const failures = [];
  if (stats.total < guardrails.minTotal)
    failures.push(`total ${stats.total} < ${guardrails.minTotal}`);
  if (stats.byKind.desecrated < guardrails.minDesecrated)
    failures.push(
      `desecrated ${stats.byKind.desecrated} < ${guardrails.minDesecrated}`,
    );
  if (stats.byKind.corrupted < guardrails.minCorrupted)
    failures.push(
      `corrupted ${stats.byKind.corrupted} < ${guardrails.minCorrupted}`,
    );
  if (stats.byKind.essence < guardrails.minEssence)
    failures.push(
      `essence ${stats.byKind.essence} < ${guardrails.minEssence}`,
    );
  if (stats.byKind.normal < guardrails.minNormal)
    failures.push(`normal ${stats.byKind.normal} < ${guardrails.minNormal}`);

  if (failures.length > 0) {
    console.error("[extract-mods] GUARDRAIL FAILURE:");
    for (const f of failures) console.error("  -", f);
    process.exit(2);
  }
  log("guardrails OK");
}

main().catch((err) => {
  console.error("[extract-mods] FATAL:", err);
  process.exit(1);
});
