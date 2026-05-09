#!/usr/bin/env node
/**
 * check-coverage-A.mjs
 * --------------------------------------------------------------
 * A 観点: 統計・分布カバレッジチェック
 *
 * 上流 RePoE mods.en.json と現行 bundle.json を突き合わせ、
 *   - 上流の domain × generation_type の全分布
 *   - bundle に採録された分布
 *   - 採録されなかった分布の内訳（理由：domain/generation_type ガード、no text & no stats）
 *   - 漏れ候補（採録条件に該当するのに bundle に無い key）
 * を出力する。
 * --------------------------------------------------------------
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EN_PATH = resolve(ROOT, "data-cache/mods.en.json");
const JA_PATH = resolve(ROOT, "data-cache/mods.ja.json");
const BUNDLE_PATH = resolve(ROOT, "src/i18n/mods-bundle.json");

const ALLOWED_DOMAINS = new Set(["item", "misc", "flask", "jewel"]);
const NORMAL_GEN_TYPES = new Set(["prefix", "suffix"]);

function classify(v, key) {
  if (v.is_essence_only === true) return "essence";
  if (key.startsWith("EssenceDisplay") && v.domain === "item" && v.generation_type === "unique") {
    return "essence";
  }
  if (v.generation_type === "corrupted") return "corrupted";
  if (v.domain === "desecrated") return "desecrated";
  if (NORMAL_GEN_TYPES.has(v.generation_type) && ALLOWED_DOMAINS.has(v.domain)) {
    return "normal";
  }
  return null;
}

const en = JSON.parse(await readFile(EN_PATH, "utf-8"));
const ja = JSON.parse(await readFile(JA_PATH, "utf-8"));
const bundle = JSON.parse(await readFile(BUNDLE_PATH, "utf-8"));

const enKeys = Object.keys(en);
const jaKeys = Object.keys(ja);
const bundleKeys = new Set(Object.keys(bundle));

console.log("===== Source size =====");
console.log(`  upstream EN entries: ${enKeys.length}`);
console.log(`  upstream JA entries: ${jaKeys.length}`);
console.log(`  bundle entries:      ${bundleKeys.size}`);
console.log(`  upstream EN ∩ JA:    ${enKeys.filter((k) => k in ja).length}`);
console.log(`  upstream EN \\ JA:   ${enKeys.filter((k) => !(k in ja)).length}`);

// ---- Distribution of upstream by domain × generation_type ----
const dist = {}; // domain -> gen_type -> count
const distClass = { normal: 0, essence: 0, corrupted: 0, desecrated: 0, null: 0 };

for (const [k, v] of Object.entries(en)) {
  const d = v.domain ?? "(undef)";
  const g = v.generation_type ?? "(undef)";
  dist[d] = dist[d] ?? {};
  dist[d][g] = (dist[d][g] ?? 0) + 1;

  const cls = classify(v, k);
  distClass[cls ?? "null"]++;
}

console.log("\n===== Upstream distribution: domain × generation_type =====");
const allDomains = Object.keys(dist).sort();
const allGens = new Set();
for (const d of allDomains) for (const g of Object.keys(dist[d])) allGens.add(g);
const gensSorted = [...allGens].sort();

const padCol = 14;
process.stdout.write("domain".padEnd(20));
for (const g of gensSorted) process.stdout.write(g.padStart(padCol));
process.stdout.write("\n");
for (const d of allDomains) {
  process.stdout.write(d.padEnd(20));
  for (const g of gensSorted) {
    const n = dist[d][g] ?? 0;
    process.stdout.write(String(n || ".").padStart(padCol));
  }
  process.stdout.write("\n");
}

console.log("\n===== Upstream classify() result =====");
for (const [k, n] of Object.entries(distClass).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${String(n).padStart(6)}`);
}

// ---- Why-skipped breakdown for classified entries ----
const skipReason = {
  not_classified: 0,
  no_text_no_stats: 0,
  in_bundle: 0,
  missing_from_bundle: 0,
};
const missingClassified = []; // entries that classify() accepts but absent from bundle

for (const [k, v] of Object.entries(en)) {
  const cls = classify(v, k);
  if (cls === null) {
    skipReason.not_classified++;
    continue;
  }
  const hasText = typeof v.text === "string" && v.text.trim().length > 0;
  const hasStats = Array.isArray(v.stats) && v.stats.length > 0;
  if (!hasText && !hasStats) {
    skipReason.no_text_no_stats++;
    continue;
  }
  if (bundleKeys.has(k)) {
    skipReason.in_bundle++;
  } else {
    skipReason.missing_from_bundle++;
    missingClassified.push({ key: k, cls, domain: v.domain, gt: v.generation_type, text: v.text });
  }
}

console.log("\n===== Why-skipped breakdown (vs upstream) =====");
for (const [k, n] of Object.entries(skipReason)) {
  console.log(`  ${k.padEnd(20)} ${String(n).padStart(6)}`);
}

if (missingClassified.length > 0) {
  console.log("\n===== ALERT: classify() accepts but missing from bundle =====");
  for (const m of missingClassified.slice(0, 50)) {
    console.log(`  ${m.key} | ${m.cls} | dom=${m.domain} gt=${m.gt} | text="${(m.text ?? "").slice(0, 60)}"`);
  }
  if (missingClassified.length > 50) {
    console.log(`  ... and ${missingClassified.length - 50} more`);
  }
}

// ---- Per-domain coverage (upstream vs bundle) ----
console.log("\n===== Per-domain coverage =====");
const domCov = {}; // domain -> { upstream, classified, bundled, no_text }
for (const [k, v] of Object.entries(en)) {
  const d = v.domain ?? "(undef)";
  domCov[d] = domCov[d] ?? { upstream: 0, classified: 0, bundled: 0, no_text: 0 };
  domCov[d].upstream++;
  const cls = classify(v, k);
  if (cls !== null) {
    domCov[d].classified++;
    if (bundleKeys.has(k)) domCov[d].bundled++;
    const hasText = typeof v.text === "string" && v.text.trim().length > 0;
    const hasStats = Array.isArray(v.stats) && v.stats.length > 0;
    if (!hasText && !hasStats) domCov[d].no_text++;
  }
}

console.log("domain".padEnd(20) + "upstream".padStart(10) + "classified".padStart(12) + "bundled".padStart(10) + "no_text".padStart(10));
for (const [d, c] of Object.entries(domCov).sort((a, b) => b[1].upstream - a[1].upstream)) {
  console.log(d.padEnd(20) + String(c.upstream).padStart(10) + String(c.classified).padStart(12) + String(c.bundled).padStart(10) + String(c.no_text).padStart(10));
}

// ---- generation_type が prefix/suffix なのに採録されなかった上流 mod の domain 内訳 ----
console.log("\n===== Upstream mods with prefix/suffix gen_type but NOT bundled (by domain) =====");
const lostGen = {};
for (const [k, v] of Object.entries(en)) {
  if (!NORMAL_GEN_TYPES.has(v.generation_type)) continue;
  if (bundleKeys.has(k)) continue;
  const d = v.domain ?? "(undef)";
  lostGen[d] = lostGen[d] ?? { count: 0, samples: [] };
  lostGen[d].count++;
  if (lostGen[d].samples.length < 3) {
    lostGen[d].samples.push({ key: k, text: (v.text ?? "").slice(0, 60), is_essence_only: !!v.is_essence_only });
  }
}
for (const [d, info] of Object.entries(lostGen).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${d.padEnd(20)} ${String(info.count).padStart(6)}`);
  for (const s of info.samples) {
    console.log(`     - ${s.key} | essence_only=${s.is_essence_only} | "${s.text}"`);
  }
}

// ---- text empty bundle entries: 何の domain か ----
console.log("\n===== Bundle entries with empty text_ja/text_en (44件) =====");
const emptyByDomain = {};
const emptyDetailed = [];
for (const [k, m] of Object.entries(bundle)) {
  if (m.text_ja === "" && m.text_en === "") {
    const v = en[k];
    const d = v?.domain ?? "(unknown)";
    emptyByDomain[d] = (emptyByDomain[d] ?? 0) + 1;
    if (emptyDetailed.length < 10) {
      emptyDetailed.push({ key: k, domain: v?.domain, gt: v?.generation_type, ess_only: !!v?.is_essence_only, statsN: (v?.stats ?? []).length });
    }
  }
}
console.log("by domain:");
for (const [d, n] of Object.entries(emptyByDomain).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${d.padEnd(20)} ${String(n).padStart(6)}`);
}
console.log("samples:");
for (const e of emptyDetailed) {
  console.log(`  ${e.key} | dom=${e.domain} gt=${e.gt} ess_only=${e.ess_only} statsN=${e.statsN}`);
}

console.log("\n=== A coverage check done ===");
