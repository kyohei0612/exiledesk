#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const bundle = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"),
);

function classifyKind(m) {
  if (m.essence) return "essence";
  if (m.corrupt) return "corrupt";
  if (m.desecrated) return "desecrated";
  return "normal";
}

console.log("=== essence kind 全 44 件の spawn 内訳 ===");
let withSpawn = 0;
let noSpawn = 0;
let abyssJewelOnly = 0;
const sampleNoSpawn = [];
for (const [k, m] of Object.entries(bundle)) {
  if (!m.essence) continue;
  if (m.spawn && m.spawn.length > 0) {
    withSpawn++;
    if ((m.spawn ?? []).every((s) => /^historic_abyss_jewel/.test(s.t))) {
      abyssJewelOnly++;
    }
  } else {
    noSpawn++;
    if (sampleNoSpawn.length < 8) sampleNoSpawn.push(k);
  }
}
console.log(`  spawn を持つ: ${withSpawn} (うち historic_abyss_jewel only: ${abyssJewelOnly})`);
console.log(`  spawn 空: ${noSpawn}`);
console.log(`  spawn 空サンプル:`, sampleNoSpawn);

console.log("\n=== corrupt kind 120 件のうち spawn 空・default のみ ===");
let cWithItemTag = 0;
let cDefaultOnly = 0;
let cEmpty = 0;
const ITEM_TAGS = [
  "helmet", "body_armour", "gloves", "boots", "shield", "focus", "quiver",
  "belt", "amulet", "ring", "wand", "sword", "bow", "staff", "mace", "axe",
  "claw", "dagger", "sceptre", "spear", "flail", "crossbow", "warstaff",
  "trap", "fishing_rod", "talisman",
];
const ITEM_TAG_SET = new Set(ITEM_TAGS);
const cDefaultOnlySamples = [];
const cEmptySamples = [];
for (const [k, m] of Object.entries(bundle)) {
  if (!m.corrupt) continue;
  const positives = (m.spawn ?? []).filter((s) => s.w > 0);
  const hasItemTag = positives.some((s) => ITEM_TAG_SET.has(s.t));
  const hasDefault = positives.some((s) => s.t === "default");
  if (hasItemTag) cWithItemTag++;
  else if (hasDefault) {
    cDefaultOnly++;
    if (cDefaultOnlySamples.length < 5) cDefaultOnlySamples.push(k);
  } else {
    cEmpty++;
    if (cEmptySamples.length < 5) cEmptySamples.push(k);
  }
}
console.log(`  item tag を持つ: ${cWithItemTag}`);
console.log(`  default のみ:    ${cDefaultOnly}  e.g. ${cDefaultOnlySamples.join(", ")}`);
console.log(`  spawn 全空・他:  ${cEmpty}        e.g. ${cEmptySamples.join(", ")}`);

console.log("\n=== normal kind の中で key に 'Essence' を含むもの (essence-overlay 候補) ===");
let nNormalEssenceLike = 0;
for (const [k, m] of Object.entries(bundle)) {
  if (classifyKind(m) !== "normal") continue;
  if (/[Ee]ssence/.test(k)) nNormalEssenceLike++;
}
console.log(`  total: ${nNormalEssenceLike} (これを essence セクションに振り分けると、ゲーム内 essence サフィックス/プレフィックスに対応)`);

console.log("\n=== 試算: 修正後の各 kind 数 (ring slot の場合) ===");
function modCanSpawnOn(m, tag) {
  return (m.spawn ?? []).some((s) => s.t === tag && s.w > 0);
}
function effectiveKind(m) {
  if (m.essence) return "essence";
  if (m.corrupt) return "corrupt";
  if (m.desecrated) return "desecrated";
  if (/[Ee]ssence/.test(m.key)) return "essence_like_normal";
  return "normal";
}
const RING_COUNTS = { normal: 0, essence: 0, essence_like_normal: 0, corrupt: 0, desecrated: 0 };
for (const [k, m] of Object.entries(bundle)) {
  // 新ロジック: spawn match を必須とし、corrupt のみ default fallback、essence_like_normal も spawn match
  const canSpawn = modCanSpawnOn(m, "ring");
  const isCorruptDefault = m.corrupt && (m.spawn ?? []).some((s) => s.t === "default" && s.w > 0);
  if (!canSpawn && !isCorruptDefault) continue;
  const ek = effectiveKind({ ...m, key: k });
  RING_COUNTS[ek] = (RING_COUNTS[ek] || 0) + 1;
}
console.log("  ring slot 試算:");
for (const [k, v] of Object.entries(RING_COUNTS)) console.log(`    ${k.padEnd(22)} ${v}`);
