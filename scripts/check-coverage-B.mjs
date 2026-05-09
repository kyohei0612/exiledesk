#!/usr/bin/env node
/**
 * check-coverage-B.mjs
 * --------------------------------------------------------------
 * B 観点: 既知 affix キーワードでスポット網羅性チェック
 *
 * 主要 affix（life / mana / resistance / damage / attribute / movement /
 * accuracy / spell / critical / minion / projectile / chaos 等）を
 * EN テキストの正規表現でカウントし、
 *   - 上流 mods.en.json での件数
 *   - bundle で classify-候補となる件数
 *   - bundle に実採録された件数
 * を比較。「上流に存在＝採録ポリシー的に対象＝bundle 採録」が一致すべき。
 * 大幅な乖離があれば取りこぼしの示唆。
 * --------------------------------------------------------------
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const EN_PATH = resolve(ROOT, "data-cache/mods.en.json");
const BUNDLE_PATH = resolve(ROOT, "src/i18n/mods-bundle.json");

const ALLOWED_DOMAINS = new Set(["item", "misc", "flask", "jewel"]);
const NORMAL_GEN_TYPES = new Set(["prefix", "suffix"]);

function classify(v) {
  if (v.is_essence_only === true) return "essence";
  if (v.generation_type === "corrupted") return "corrupted";
  if (v.domain === "desecrated") return "desecrated";
  if (NORMAL_GEN_TYPES.has(v.generation_type) && ALLOWED_DOMAINS.has(v.domain)) {
    return "normal";
  }
  return null;
}

const en = JSON.parse(await readFile(EN_PATH, "utf-8"));
const bundle = JSON.parse(await readFile(BUNDLE_PATH, "utf-8"));
const bundleKeys = new Set(Object.keys(bundle));

const KEYWORDS = [
  ["maximum_life", /(maximum|to maximum) life/i],
  ["maximum_mana", /(maximum|to maximum) mana/i],
  ["maximum_es", /maximum energy shield/i],
  ["fire_resistance", /to fire resistance/i],
  ["cold_resistance", /to cold resistance/i],
  ["lightning_resistance", /to lightning resistance/i],
  ["chaos_resistance", /to chaos resistance/i],
  ["all_elemental_res", /to all elemental resistances/i],
  ["movement_speed", /movement speed/i],
  ["attack_speed", /attack speed/i],
  ["cast_speed", /cast speed/i],
  ["critical_hit", /critical hit/i],
  ["accuracy", /accuracy rating|accuracy with/i],
  ["strength", /^\+?\(?[\-\d–]+(?:[\)\-–\d]+)?\s*(?:to )?strength|increased strength|to strength/im],
  ["dexterity", /^\+?\(?[\-\d–]+(?:[\)\-–\d]+)?\s*(?:to )?dexterity|increased dexterity|to dexterity/im],
  ["intelligence", /^\+?\(?[\-\d–]+(?:[\)\-–\d]+)?\s*(?:to )?intelligence|increased intelligence|to intelligence/im],
  ["str_dex_hybrid", /strength and dexterity/i],
  ["str_int_hybrid", /strength and intelligence/i],
  ["dex_int_hybrid", /dexterity and intelligence/i],
  ["all_attributes", /to all attributes/i],
  ["physical_dmg_added", /adds .* physical damage/i],
  ["fire_dmg_added", /adds .* fire damage/i],
  ["cold_dmg_added", /adds .* cold damage/i],
  ["lightning_dmg_added", /adds .* lightning damage/i],
  ["chaos_dmg_added", /adds .* chaos damage/i],
  ["spell_damage", /increased spell damage|to spell damage/i],
  ["projectile_speed", /projectile speed/i],
  ["minion_life", /minion.* life|minions.* life/i],
  ["minion_damage", /minion.* damage|minions.* damage/i],
  ["mana_regen", /mana regeneration/i],
  ["life_regen", /life regeneration/i],
  ["chance_to_block", /chance to block/i],
  ["evasion_rating", /evasion rating/i],
  ["armour_rating", /(?:to|increased) armour/i],
  ["energy_shield_rating", /increased energy shield|to energy shield(?! recharge)/i],
  ["thorns", /thorns/i],
  ["rarity_of_items", /rarity of items/i],
  ["stun_threshold", /stun threshold/i],
  ["mana_cost_skills", /mana cost of (?:your )?skills/i],
  ["onslaught", /onslaught/i],
];

const rows = [];

for (const [name, re] of KEYWORDS) {
  let upstreamMatches = 0;
  let upstreamClassified = 0;
  let bundleMatches = 0;
  for (const [k, v] of Object.entries(en)) {
    const t = typeof v.text === "string" ? v.text : "";
    if (!re.test(t)) continue;
    upstreamMatches++;
    if (classify(v) !== null) upstreamClassified++;
    if (bundleKeys.has(k)) bundleMatches++;
  }
  rows.push({ name, upstreamMatches, upstreamClassified, bundleMatches });
}

console.log("===== Keyword coverage (upstream EN text vs bundle) =====");
console.log(
  "keyword".padEnd(24) +
    "ups".padStart(8) +
    "ups_cls".padStart(10) +
    "bundle".padStart(10) +
    "leak".padStart(8),
);
for (const r of rows) {
  const leak = r.upstreamClassified - r.bundleMatches;
  const flag = leak > 0 ? " *" : "";
  console.log(
    r.name.padEnd(24) +
      String(r.upstreamMatches).padStart(8) +
      String(r.upstreamClassified).padStart(10) +
      String(r.bundleMatches).padStart(10) +
      String(leak).padStart(8) +
      flag,
  );
}

// ---- Sample mods that pass classify() AND match keyword AND are NOT in bundle ----
console.log("\n===== Sample leaks (classify-OK keyword-match but missing from bundle) =====");
const leakSamples = {};
for (const [name, re] of KEYWORDS) {
  for (const [k, v] of Object.entries(en)) {
    if (bundleKeys.has(k)) continue;
    const t = typeof v.text === "string" ? v.text : "";
    if (!re.test(t)) continue;
    if (classify(v) === null) continue;
    leakSamples[name] = leakSamples[name] ?? [];
    if (leakSamples[name].length < 3) {
      leakSamples[name].push({ key: k, domain: v.domain, gt: v.generation_type, ess_only: !!v.is_essence_only, text: t.slice(0, 80) });
    }
  }
}
let totalLeak = 0;
for (const [name, list] of Object.entries(leakSamples)) {
  if (list.length === 0) continue;
  totalLeak += list.length;
  console.log(`  ${name}:`);
  for (const e of list) {
    console.log(`    ${e.key} | dom=${e.domain} gt=${e.gt} ess=${e.ess_only} | "${e.text}"`);
  }
}
if (totalLeak === 0) console.log("  (no leaks)");

// ---- 重要な POE2 メカニクス確認 ----
console.log("\n===== POE2-specific mechanic spot check =====");
const POE2_KEYS = [
  ["spirit", /spirit\b/i],
  ["pin", /\bpin\b/i],
  ["impact", /\bimpact\b/i],
  ["stun_buildup", /stun buildup/i],
  ["ailment_threshold", /ailment threshold/i],
  ["bow_arrows", /\barrows?\b/i],
  ["crossbow_bolts", /\bbolts?\b/i],
  ["frenzy_charge", /frenzy charge/i],
  ["power_charge", /power charge/i],
  ["endurance_charge", /endurance charge/i],
  ["rage", /\brage\b/i],
  ["culling_strike", /culling strike/i],
];
for (const [name, re] of POE2_KEYS) {
  let ups = 0;
  let upsCls = 0;
  let bun = 0;
  for (const [k, v] of Object.entries(en)) {
    const t = typeof v.text === "string" ? v.text : "";
    if (!re.test(t)) continue;
    ups++;
    if (classify(v) !== null) upsCls++;
    if (bundleKeys.has(k)) bun++;
  }
  console.log(`  ${name.padEnd(22)} upstream=${String(ups).padStart(4)} cls=${String(upsCls).padStart(4)} bundle=${String(bun).padStart(4)} leak=${upsCls - bun}`);
}

console.log("\n=== B coverage check done ===");
