#!/usr/bin/env node
/**
 * verify-mods-bundle.mjs
 * --------------------------------------------------------------
 * Validate the generated mods-bundle.json:
 *   - per-kind / per-type counts
 *   - per-item-tag spawn counts
 *   - JA / EN text coverage
 *   - sanity-check key mods (筋力および器用さ etc.)
 * --------------------------------------------------------------
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUNDLE_PATH = resolve(ROOT, "src/i18n/mods-bundle.json");

const ITEM_TAGS = [
  "helmet",
  "body_armour",
  "gloves",
  "boots",
  "str_armour",
  "dex_armour",
  "int_armour",
  "str_dex_armour",
  "str_int_armour",
  "dex_int_armour",
  "str_dex_int_armour",
  "shield",
  "focus",
  "quiver",
  "ring",
  "amulet",
  "belt",
  "talisman",
  "claw",
  "dagger",
  "wand",
  "sword",
  "mace",
  "axe",
  "sceptre",
  "spear",
  "flail",
  "bow",
  "crossbow",
  "staff",
  "warstaff",
  "fishing_rod",
  "trap",
];

function classify(m) {
  if (m.essence) return "essence";
  if (m.corrupt) return "corrupted";
  if (m.desecrated) return "desecrated";
  return "normal";
}

async function main() {
  const raw = JSON.parse(await readFile(BUNDLE_PATH, "utf-8"));

  const counts = {
    total: 0,
    prefix: 0,
    suffix: 0,
    byKind: { normal: 0, essence: 0, corrupted: 0, desecrated: 0 },
    nullJa: 0,
    nullEn: 0,
    emptyJa: 0,
    emptyEn: 0,
  };

  // per-tag per-kind counts
  const perTag = {};
  for (const t of ITEM_TAGS)
    perTag[t] = { normal: 0, essence: 0, corrupted: 0, desecrated: 0 };

  for (const [, m] of Object.entries(raw)) {
    counts.total++;
    if (m.type === "prefix") counts.prefix++;
    if (m.type === "suffix") counts.suffix++;
    const kind = classify(m);
    counts.byKind[kind]++;

    if (m.text_ja == null) counts.nullJa++;
    if (m.text_en == null) counts.nullEn++;
    if (m.text_ja === "") counts.emptyJa++;
    if (m.text_en === "") counts.emptyEn++;

    for (const sw of m.spawn ?? []) {
      if (perTag[sw.t] && sw.w > 0) {
        perTag[sw.t][kind]++;
      }
    }
  }

  console.log("===== bundle stats =====");
  console.log(JSON.stringify(counts, null, 2));

  console.log("\n===== per-item-tag (spawnable, w>0) =====");
  console.log(
    "tag".padEnd(22) +
      "normal".padStart(8) +
      "essence".padStart(10) +
      "corrupt".padStart(10) +
      "desecr".padStart(10),
  );
  for (const t of ITEM_TAGS) {
    const c = perTag[t];
    console.log(
      t.padEnd(22) +
        String(c.normal).padStart(8) +
        String(c.essence).padStart(10) +
        String(c.corrupted).padStart(10) +
        String(c.desecrated).padStart(10),
    );
  }

  // Sanity check: 筋力および器用さ hybrid
  console.log("\n===== 筋力および器用さ hybrid mods =====");
  let hybridCount = 0;
  for (const [k, m] of Object.entries(raw)) {
    const ja = m.text_ja ?? "";
    if (ja.includes("筋力") && ja.includes("器用さ")) {
      hybridCount++;
      const kinds = classify(m);
      console.log(
        `  ${k} | ${m.type} | ${kinds} | spawn=[${(m.spawn ?? []).map((s) => s.t).join(",")}] | ja="${ja.slice(0, 60)}"`,
      );
    }
  }
  console.log(`  total: ${hybridCount}`);

  // Spot check: ring spawnable mods
  console.log("\n===== ring (normal) sample =====");
  let ringCount = 0;
  for (const [k, m] of Object.entries(raw)) {
    if (classify(m) !== "normal") continue;
    if (!(m.spawn ?? []).some((s) => s.t === "ring" && s.w > 0)) continue;
    ringCount++;
    if (ringCount <= 5) {
      console.log(`  ${k} | ${m.type} | ja="${(m.text_ja ?? "").slice(0, 70)}"`);
    }
  }
  console.log(`  ring normal total: ${ringCount}`);

  // Hard fail conditions
  const fail = [];
  if (counts.nullJa > 0) fail.push(`nullJa=${counts.nullJa}`);
  if (counts.nullEn > 0) fail.push(`nullEn=${counts.nullEn}`);
  if (counts.byKind.essence < 5)
    fail.push(`essence too few: ${counts.byKind.essence}`);
  if (counts.byKind.corrupted < 100)
    fail.push(`corrupted too few: ${counts.byKind.corrupted}`);
  if (counts.byKind.desecrated < 300)
    fail.push(`desecrated too few: ${counts.byKind.desecrated}`);

  if (fail.length > 0) {
    console.error("\nVERIFICATION FAILED:");
    for (const f of fail) console.error("  -", f);
    process.exit(1);
  }
  console.log("\nverification OK");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
