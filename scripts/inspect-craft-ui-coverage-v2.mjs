#!/usr/bin/env node
/**
 * mods.ts の getModGroupsByKindForItem 新ロジックを使った場合の
 * CraftHelper UI で見える件数を再集計。
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

// mods.ts と同じロジックを再現
function modCanAppearAsKindOnSlot(mod, kind, itemTag) {
  if (modCanSpawnOn(mod, itemTag)) return true;
  if (kind === "essence") {
    const isAbyssJewelOnly = (mod.spawn ?? []).some((s) =>
      /^historic_abyss_jewel/.test(s.t),
    );
    if (isAbyssJewelOnly) return false;
    return true;
  }
  if (kind === "corrupt") {
    if ((mod.spawn ?? []).some((s) => s.t === "default" && s.w > 0)) return true;
    return false;
  }
  if (kind === "desecrated") {
    // spawn weight が item tag に対して直接ある必要 (boss tag だけでは不十分)
    return false;
  }
  return false;
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

console.log("=== 旧 vs 新 ロジック比較（kind 別 / slot 別 件数）===");
console.log(
  "slot".padEnd(12) +
    "essence旧→新".padStart(16) +
    "corrupt旧→新".padStart(16) +
    "desecr旧→新".padStart(16),
);
for (const slot of SLOTS) {
  const oldCounts = { essence: 0, corrupt: 0, desecrated: 0 };
  const newCounts = { essence: 0, corrupt: 0, desecrated: 0 };
  for (const m of Object.values(bundle)) {
    const kind = classifyKind(m);
    if (kind === "normal") continue;
    if (modCanSpawnOn(m, slot)) oldCounts[kind]++;
    if (modCanAppearAsKindOnSlot(m, kind, slot)) newCounts[kind]++;
  }
  console.log(
    slot.padEnd(12) +
      `${oldCounts.essence}→${newCounts.essence}`.padStart(16) +
      `${oldCounts.corrupt}→${newCounts.corrupt}`.padStart(16) +
      `${oldCounts.desecrated}→${newCounts.desecrated}`.padStart(16),
  );
}
