#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EN = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.en.json"), "utf-8"));
const JA = JSON.parse(await readFile(resolve(ROOT, "data-cache/mods.ja.json"), "utf-8"));
const BUNDLE = JSON.parse(await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"));

console.log("===== All keys starting with 'Essence' (upstream) =====");
const essKeys = Object.keys(EN).filter((k) => k.startsWith("Essence"));
console.log(`Total: ${essKeys.length}`);
const inB = essKeys.filter((k) => k in BUNDLE).length;
console.log(`In bundle: ${inB}`);
console.log(`Missing from bundle: ${essKeys.length - inB}`);

const byPattern = {};
for (const k of essKeys) {
  const v = EN[k];
  const pat = `${v.domain}/${v.generation_type}/ess_only=${!!v.is_essence_only}`;
  byPattern[pat] = byPattern[pat] ?? { count: 0, samples: [] };
  byPattern[pat].count++;
  if (byPattern[pat].samples.length < 3) {
    byPattern[pat].samples.push({ key: k, ja: (JA[k]?.text ?? "").slice(0, 60), inB: k in BUNDLE });
  }
}
console.log("\n--- by pattern ---");
for (const [p, info] of Object.entries(byPattern).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`  ${p}  count=${info.count}`);
  for (const s of info.samples) {
    console.log(`    ${s.inB ? "[B]" : "[ ]"} ${s.key} | ja="${s.ja}"`);
  }
}

console.log("\n===== Essence-related key prefixes (deeper scan) =====");
const families = {};
for (const k of essKeys) {
  // Get prefix until first digit or end
  const m = k.match(/^Essence([A-Z][a-zA-Z]*)/);
  const fam = m ? m[1] : "(other)";
  families[fam] = (families[fam] ?? 0) + 1;
}
for (const [f, n] of Object.entries(families).sort((a, b) => b[1] - a[1])) {
  const example = essKeys.find((k) => k.startsWith(`Essence${f}`));
  console.log(`  ${f.padEnd(30)} ${String(n).padStart(4)}   e.g. ${example}`);
}

console.log("\n===== EssenceDisplayXxx group breakdown =====");
const displayKeys = essKeys.filter((k) => k.startsWith("EssenceDisplay"));
for (const k of displayKeys) {
  const v = EN[k];
  const ja = JA[k]?.text ?? "";
  console.log(`  ${k in BUNDLE ? "[B]" : "[ ]"} ${k} | dom=${v.domain} gt=${v.generation_type}`);
  console.log(`     EN: "${(v.text ?? "").slice(0, 70)}"`);
  console.log(`     JA: "${ja.slice(0, 70)}"`);
}

console.log("\n===== EssenceDisplay 系 with stats but no text =====");
let noTextWithStats = 0;
for (const k of displayKeys) {
  const v = EN[k];
  const hasText = typeof v.text === "string" && v.text.trim().length > 0;
  const hasStats = Array.isArray(v.stats) && v.stats.length > 0;
  if (!hasText) {
    console.log(`  ${k} | hasText=${hasText} hasStats=${hasStats} stats=${v.stats?.length ?? 0}`);
  }
}
