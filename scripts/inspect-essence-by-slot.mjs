#!/usr/bin/env node
/**
 * 宝飾品 4 種 (ring, amulet, belt) の essence section を slot 別に詳細表示。
 * POE2DB のテキスト確認用.txt との照合に使う。
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

function clean(text) {
  return (text ?? "").replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2");
}

const SLOTS = ["ring", "amulet", "belt"];

for (const slot of SLOTS) {
  const ek = essenceKeysForSlot(slot);
  const groups = new Map();
  for (const [k, m] of Object.entries(bundle)) {
    let canShow = false;
    if (modCanSpawnOn(m, slot)) canShow = true;
    else if (ek.has(k)) canShow = true;
    if (!canShow) continue;
    const ks = tierKindsForSlot(m, k, ek);
    if (!ks.includes("essence")) continue;
    const gid = (m.groups ?? [])[0];
    if (!gid) continue;
    const compositeKey = `${m.type}:${gid}`;
    if (!groups.has(compositeKey))
      groups.set(compositeKey, { type: m.type, gid, samples: [] });
    groups.get(compositeKey).samples.push({ key: k, text: clean(m.text_ja), level: m.level });
  }

  const prefixes = [...groups.values()].filter((g) => g.type === "prefix");
  const suffixes = [...groups.values()].filter((g) => g.type === "suffix");

  console.log(`\n━━━ ${slot} ━━━`);
  console.log(`essence prefix groups (${prefixes.length}):`);
  for (const g of prefixes) {
    const s = g.samples[0];
    console.log(`  [${g.gid}] lv${s.level} "${s.text.slice(0, 60)}" (${g.samples.length} tier)`);
  }
  console.log(`essence suffix groups (${suffixes.length}):`);
  for (const g of suffixes) {
    const s = g.samples[0];
    console.log(`  [${g.gid}] lv${s.level} "${s.text.slice(0, 60)}" (${g.samples.length} tier)`);
  }
}
