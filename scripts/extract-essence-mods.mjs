#!/usr/bin/env node
/**
 * PoB の Data/Essence.lua から「essence → slot → mod key」のテーブルを抽出し、
 * 逆引き「modKey → 該当 slot 配列」JSON を生成する。
 *
 * これによって CraftHelper で「指輪のエッセンスサフィックス」等が slot 別に正しく表示できる。
 *
 * 出力: src/i18n/essence-mods.json
 *   { "<modKey>": ["<itemTag1>", "<itemTag2>", ...], ... }
 *
 * itemTag: ITEM_TAGS (data/mods.ts と同じ snake_case の slot 名)
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ESSENCE_LUA = resolve(
  ROOT,
  "vendor/PathOfBuilding-PoE2/src/Data/Essence.lua",
);

// PoB slot 名 → item tag (mods.ts ITEM_TAGS と一致)
const SLOT_TO_ITEM_TAG = {
  Helmet: "helmet",
  "Body Armour": "body_armour",
  Gloves: "gloves",
  Boots: "boots",
  Shield: "shield",
  Buckler: "shield", // buckler は shield の一種
  Focus: "focus",
  Quiver: "quiver",
  Belt: "belt",
  Amulet: "amulet",
  Ring: "ring",
  Talisman: "talisman",
  // 武器
  "One Hand Sword": "sword",
  "Two Hand Sword": "sword",
  "One Hand Axe": "axe",
  "Two Hand Axe": "axe",
  "One Hand Mace": "mace",
  "Two Hand Mace": "mace",
  Sceptre: "sceptre",
  Wand: "wand",
  Staff: "staff",
  Warstaff: "warstaff",
  Bow: "bow",
  Crossbow: "crossbow",
  Spear: "spear",
  Flail: "flail",
  Dagger: "dagger",
};

const luaText = await readFile(ESSENCE_LUA, "utf-8");

// 各エッセンス entry から mods table を抽出
// Pattern: mods = { ["Helmet"] = "ModKey", ["Body Armour"] = "ModKey", ... }
const MODS_TABLE_RE = /mods\s*=\s*{\s*([^}]*)\s*}/g;
// 中の単独 entry: ["SlotName"] = "ModKey"
const ENTRY_RE = /\["([^"]+)"\]\s*=\s*"([^"]+)"/g;

// modKey → Set<itemTag>
const modToTags = new Map();
let totalEntries = 0;

let m;
while ((m = MODS_TABLE_RE.exec(luaText)) !== null) {
  const inner = m[1];
  let e;
  ENTRY_RE.lastIndex = 0;
  while ((e = ENTRY_RE.exec(inner)) !== null) {
    const slotName = e[1];
    const modKey = e[2];
    const tag = SLOT_TO_ITEM_TAG[slotName];
    if (!tag) {
      // 想定外の slot 名
      console.warn(`[warn] unknown slot name: ${slotName} (mod: ${modKey})`);
      continue;
    }
    if (!modToTags.has(modKey)) modToTags.set(modKey, new Set());
    modToTags.get(modKey).add(tag);
    totalEntries++;
  }
}

// 手動 patch を読み込んで merge（manual-patches.json）
let patches = {};
try {
  const patchTxt = await readFile(
    resolve(ROOT, "src/i18n/manual-patches.json"),
    "utf-8",
  );
  patches = JSON.parse(patchTxt);
} catch (e) {
  console.warn("[warn] manual-patches.json 読込失敗、patch 適用スキップ:", e.message);
}

// extra_slots: PoB に未登録の slot を追加
for (const [modKey, slots] of Object.entries(patches.essence_extra_slots ?? {})) {
  if (modKey.startsWith("$")) continue;
  if (!modToTags.has(modKey)) modToTags.set(modKey, new Set());
  for (const slot of slots) modToTags.get(modKey).add(slot);
}
// remove_slots: PoB の登録から特定 slot を除外
for (const [modKey, slots] of Object.entries(patches.essence_remove_slots ?? {})) {
  if (modKey.startsWith("$")) continue;
  if (!modToTags.has(modKey)) continue;
  for (const slot of slots) modToTags.get(modKey).delete(slot);
}

const out = {};
for (const [modKey, tags] of modToTags.entries()) {
  if (tags.size === 0) continue;
  out[modKey] = Array.from(tags).sort();
}

const outPath = resolve(ROOT, "src/i18n/essence-mods.json");
await writeFile(outPath, JSON.stringify(out, null, 0));

console.log(`Total essence-table entries: ${totalEntries}`);
console.log(`Unique mod keys: ${Object.keys(out).length}`);
console.log(`Sample (first 8):`);
for (const [k, v] of Object.entries(out).slice(0, 8)) {
  console.log(`  ${k}: ${v.join(", ")}`);
}
console.log(`\nOutput: ${outPath}`);

// ring 用のリスト
const ringMods = Object.entries(out).filter(([_, tags]) => tags.includes("ring"));
console.log(`\nring に乗る essence mod: ${ringMods.length}`);
for (const [k, v] of ringMods.slice(0, 10)) {
  console.log(`  ${k}`);
}
