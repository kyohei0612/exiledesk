#!/usr/bin/env node
/**
 * CraftHelper の filter (modCanSpawnOn = spawn.weight > 0 of itemTag) で
 * essence/corrupted/desecrated mod が UI に何件出ているか確認。
 * data/mods.ts の getModGroupsForItem と同じロジックで再現。
 */

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

function modCanSpawnOn(m, tag) {
  return (m.spawn ?? []).some((s) => s.t === tag && s.w > 0);
}

const SLOTS = [
  "helmet",
  "body_armour",
  "gloves",
  "boots",
  "shield",
  "focus",
  "quiver",
  "belt",
  "amulet",
  "ring",
  "wand",
  "sword",
  "bow",
  "staff",
];

console.log("=== CraftHelper UI 上で見えてる件数（modCanSpawnOn 通過） ===");
console.log(
  "slot".padEnd(14) +
    "normal".padStart(8) +
    "essence".padStart(10) +
    "corrupt".padStart(10) +
    "desecr".padStart(10),
);
for (const slot of SLOTS) {
  const counts = { normal: 0, essence: 0, corrupt: 0, desecrated: 0 };
  for (const m of Object.values(bundle)) {
    if (!modCanSpawnOn(m, slot)) continue;
    counts[classifyKind(m)]++;
  }
  console.log(
    slot.padEnd(14) +
      String(counts.normal).padStart(8) +
      String(counts.essence).padStart(10) +
      String(counts.corrupt).padStart(10) +
      String(counts.desecrated).padStart(10),
  );
}

console.log("\n=== 各 kind の mod が持つ spawn tag 全種 ===");
for (const kind of ["essence", "corrupt", "desecrated"]) {
  const tagCounts = {};
  let modCount = 0;
  for (const m of Object.values(bundle)) {
    if (classifyKind(m) !== kind) continue;
    modCount++;
    for (const s of m.spawn ?? []) {
      tagCounts[s.t] = (tagCounts[s.t] ?? 0) + 1;
    }
  }
  console.log(`\n[${kind}] kind=${kind} の mod 総数: ${modCount}`);
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  for (const [tag, n] of sorted.slice(0, 15)) {
    console.log(`  spawn tag '${tag}' を持つ mod: ${n}`);
  }
  if (sorted.length === 0) {
    console.log("  (spawn tag を持つ mod なし)");
  }
}

console.log("\n=== UI に絶対出ない mod の件数 ===");
let invisibleEssence = 0;
let invisibleCorrupt = 0;
let invisibleDesec = 0;
const allItemTags = new Set(SLOTS);
for (const m of Object.values(bundle)) {
  const kind = classifyKind(m);
  if (kind === "normal") continue;
  const hasItemTagSpawn = (m.spawn ?? []).some(
    (s) => allItemTags.has(s.t) && s.w > 0,
  );
  if (!hasItemTagSpawn) {
    if (kind === "essence") invisibleEssence++;
    else if (kind === "corrupt") invisibleCorrupt++;
    else if (kind === "desecrated") invisibleDesec++;
  }
}
console.log(`UI から消えてる essence:    ${invisibleEssence} / 46`);
console.log(`UI から消えてる corrupt:    ${invisibleCorrupt} / 120`);
console.log(`UI から消えてる desecrated: ${invisibleDesec} / 369`);
