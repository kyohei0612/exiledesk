#!/usr/bin/env node
/**
 * CraftHelper の partitionBySpecialKind と同じロジックで、各 slot × kind の
 * 「実際に UI 上で表示される group 行数」を計算する。
 * ユーザー画像（指輪エッセンスサフィックス 9 group 等）と一致するかを検証。
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const bundle = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"),
);
const essenceModsBySlot = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/essence-mods.json"), "utf-8"),
);
const ESSENCE_MOD_KEYS = new Set(Object.keys(essenceModsBySlot));

function modCanSpawnOn(m, tag) {
  return (m.spawn ?? []).some((s) => s.t === tag && s.w > 0);
}
function essenceKeysForSlot(slot) {
  const out = new Set();
  for (const [k, tags] of Object.entries(essenceModsBySlot)) {
    if (tags.includes(slot)) out.add(k);
  }
  return out;
}
function tierKindsForSlot(m, key, slotEssenceKeys) {
  if (m.essence) return ["essence"];
  if (m.corrupt) return ["corrupt"];
  if (m.desecrated) return ["desecrated"];
  if (/[Ee]ssence/.test(key)) return ["essence"];
  if (slotEssenceKeys.has(key)) return ["normal", "essence"];
  return ["normal"];
}

const SLOTS = [
  "helmet", "body_armour", "gloves", "boots", "shield", "focus", "quiver",
  "belt", "amulet", "ring", "wand", "sword", "bow", "staff", "mace", "axe",
];

console.log("各 slot × 各 kind に表示される group 数（partition 後の sub-group 数）");
console.log("slot".padEnd(14) + "normal".padStart(8) + "essence".padStart(10) + "corrupt".padStart(10) + "desecr".padStart(10));

for (const slot of SLOTS) {
  const essenceKeys = essenceKeysForSlot(slot);
  // partition と同じロジック: group 内 tier を kind 別に分割
  const groupsByKind = { normal: new Set(), essence: new Set(), corrupt: new Set(), desecrated: new Set() };
  for (const [k, m] of Object.entries(bundle)) {
    let canShow = false;
    if (modCanSpawnOn(m, slot)) canShow = true;
    else if (m.corrupt && (m.spawn ?? []).some((s) => s.t === "default" && s.w > 0))
      canShow = true;
    else if (essenceKeys.has(k)) canShow = true;
    if (!canShow) continue;
    const groupId = (m.groups ?? [])[0];
    if (!groupId) continue;
    const ks = tierKindsForSlot(m, k, essenceKeys);
    for (const kk of ks) groupsByKind[kk].add(groupId);
  }
  console.log(
    slot.padEnd(14) +
      String(groupsByKind.normal.size).padStart(8) +
      String(groupsByKind.essence.size).padStart(10) +
      String(groupsByKind.corrupt.size).padStart(10) +
      String(groupsByKind.desecrated.size).padStart(10),
  );
}

console.log("\n=== 指輪 (ring) で essence section に出る group 一覧 ===");
const ringEssenceKeys = essenceKeysForSlot("ring");
// Map key: `${type}:${groupId}` で type 別に分離（CraftHelper の prefixGroups/suffixGroups と同じ扱い）
const ringEssenceGroups = new Map();
for (const [k, m] of Object.entries(bundle)) {
  let canShow = false;
  if (modCanSpawnOn(m, "ring")) canShow = true;
  else if (ringEssenceKeys.has(k)) canShow = true;
  if (!canShow) continue;
  const ks = tierKindsForSlot(m, k, ringEssenceKeys);
  if (!ks.includes("essence")) continue;
  const gid = (m.groups ?? [])[0];
  if (!gid) continue;
  const compositeKey = `${m.type}:${gid}`;
  if (!ringEssenceGroups.has(compositeKey))
    ringEssenceGroups.set(compositeKey, { type: m.type, gid, samples: [] });
  ringEssenceGroups.get(compositeKey).samples.push({ key: k, text: m.text_ja });
}
console.log(`\nessence prefix groups (${[...ringEssenceGroups.entries()].filter(([_, v]) => v.type === "prefix").length}):`);
for (const [, info] of ringEssenceGroups.entries()) {
  if (info.type !== "prefix") continue;
  console.log(`  [${info.gid}] ${info.samples[0].text} (${info.samples.length} tier)`);
}
console.log(`\nessence suffix groups (${[...ringEssenceGroups.entries()].filter(([_, v]) => v.type === "suffix").length}):`);
for (const [, info] of ringEssenceGroups.entries()) {
  if (info.type !== "suffix") continue;
  console.log(`  [${info.gid}] ${info.samples[0].text} (${info.samples.length} tier)`);
}
