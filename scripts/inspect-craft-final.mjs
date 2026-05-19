#!/usr/bin/env node
/**
 * 最終確認: 各 slot × 各 kind の表示件数（CraftHelper の現実）
 *
 * 新ロジック:
 *  - normal:     spawn match の通常 prefix/suffix（key に Essence 含むものは除く）
 *  - essence:    key に Essence を含む normal mod (spawn match) — partition で振り分け
 *  - corrupt:    spawn match の corrupt + default tag corrupt
 *  - desecrated: spawn match の desecrated
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const bundle = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"),
);

function modCanSpawnOn(m, tag) {
  return (m.spawn ?? []).some((s) => s.t === tag && s.w > 0);
}
const ESSENCE_MOD_KEYS = new Set(
  Object.keys(
    JSON.parse(
      await readFile(resolve(ROOT, "src/i18n/essence-mods.json"), "utf-8"),
    ),
  ),
);

function tierKinds(m, key) {
  if (m.essence) return ["essence"];
  if (m.corrupt) return ["corrupt"];
  if (m.desecrated) return ["desecrated"];
  if (/[Ee]ssence/.test(key)) return ["essence"];
  return ["normal"];
}

const SLOTS = [
  "helmet", "body_armour", "gloves", "boots", "shield", "focus", "quiver",
  "belt", "amulet", "ring", "wand", "sword", "bow", "staff", "mace", "axe",
];

console.log(
  "slot".padEnd(14) +
    "normal".padStart(8) +
    "essence".padStart(10) +
    "corrupt".padStart(10) +
    "desecr".padStart(10),
);
// PoB Essence.lua から該当 slot で焼ける mod 配列も含めて availableGroups を再現
const essenceModsBySlot = JSON.parse(
  await readFile(resolve(ROOT, "src/i18n/essence-mods.json"), "utf-8"),
);
function essenceKeysForSlot(slot) {
  const out = new Set();
  for (const [k, tags] of Object.entries(essenceModsBySlot)) {
    if (tags.includes(slot)) out.add(k);
  }
  return out;
}

for (const slot of SLOTS) {
  const counts = { normal: 0, essence: 0, corrupt: 0, desecrated: 0 };
  const essenceKeys = essenceKeysForSlot(slot);
  for (const [k, m] of Object.entries(bundle)) {
    // availableGroups の取得条件
    let canShow = false;
    if (modCanSpawnOn(m, slot)) canShow = true;
    else if (m.corrupt && (m.spawn ?? []).some((s) => s.t === "default" && s.w > 0))
      canShow = true;
    else if (essenceKeys.has(k)) canShow = true; // essence-mods.json 該当 mod
    if (!canShow) continue;
    const ks = tierKinds(m, k);
    for (const kk of ks) counts[kk]++;
  }
  console.log(
    slot.padEnd(14) +
      String(counts.normal).padStart(8) +
      String(counts.essence).padStart(10) +
      String(counts.corrupt).padStart(10) +
      String(counts.desecrated).padStart(10),
  );
}

// 指輪の essence 内訳
console.log("\n=== 指輪 (ring) で essence section に出る mod 一覧 ===");
const ringEssence = [];
for (const [k, m] of Object.entries(bundle)) {
  if (!modCanSpawnOn(m, "ring")) continue;
  if (m.essence || m.corrupt || m.desecrated) continue;
  if (!/[Ee]ssence/.test(k)) continue;
  ringEssence.push({ key: k, ja: m.text_ja, type: m.type });
}
console.log(`合計: ${ringEssence.length}`);
for (const e of ringEssence.slice(0, 20)) {
  console.log(`  [${e.type}] ${e.key}: "${(e.ja ?? "").slice(0, 60)}"`);
}
if (ringEssence.length > 20) console.log(`  ... +${ringEssence.length - 20} more`);
