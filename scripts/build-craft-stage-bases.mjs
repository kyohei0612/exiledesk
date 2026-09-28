#!/usr/bin/env node
/**
 * build-craft-stage-bases.mjs — クラフトステージ用のベースの数値 (2026-09-28、POE2Tube 要望 ⑧)
 *
 * 品質で変わる数値 (防具の防御力・武器の物理ダメージ) と、計算機 (HTC) のデータに無いフラスコを、アイテム枠に出すため。
 *   in : data-cache/base_items.json (クライアント原本から作った RePoE 形式、build-mods-from-client.mjs 系)
 *   out: src/services/craft-stage/stage-bases.json
 * 出典はクライアントの BaseItemTypes / ArmourTypes / WeaponTypes / Flasks (RePoE 形式の properties)。
 *   node scripts/build-craft-stage-bases.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = JSON.parse(readFileSync(resolve(ROOT, "data-cache/base_items.json"), "utf8"));
const WANT = /^(Body Armour|Helmet|Gloves|Boots|Shield|Buckler|Focus|Spear|One Hand Mace|Two Hand Mace|Warstaff|Bow|Crossbow|Talisman|One Hand Sword|Two Hand Sword|Dagger|One Hand Axe|Two Hand Axe|Flail|Claw|Staff|Sceptre|Wand|Quiver|Ring|Amulet|Belt|LifeFlask|ManaFlask)$/;
const out = {};
for (const v of Object.values(base)) {
  if (v.release_state === "unreleased" || !v.name || !WANT.test(v.item_class)) continue;
  const p = v.properties ?? {};
  const r = (x) => (x ? (x.min === x.max ? x.min : [x.min, x.max]) : undefined);
  const e = {
    cls: v.item_class,
    lvl: v.drop_level,
    armour: r(p.armour),
    evasion: r(p.evasion),
    es: r(p.energy_shield),
    block: p.block ?? undefined,
    phys: p.physical_damage_max ? [p.physical_damage_min, p.physical_damage_max] : undefined,
    // 攻撃時間 (ms) → 1 秒あたりの回数、クリティカル (1 万分率) → %
    aps: p.attack_time ? Math.round((1000 / p.attack_time) * 100) / 100 : undefined,
    crit: p.critical_strike_chance ? p.critical_strike_chance / 100 : undefined,
    life: p.life_per_use ?? undefined,
    mana: p.mana_per_use ?? undefined,
    duration: p.duration ?? undefined,
    charges: p.charges_max ? [p.charges_per_use, p.charges_max] : undefined,
  };
  for (const k of Object.keys(e)) if (e[k] === undefined || e[k] === null) delete e[k];
  if (!out[v.name]) out[v.name] = e;
}
const file = resolve(ROOT, "src/services/craft-stage/stage-bases.json");
writeFileSync(file, JSON.stringify({ source: "data-cache/base_items.json (クライアント原本)", generated: new Date().toISOString().slice(0, 10), bases: out }) + "\n");
console.log(`${Object.keys(out).length} ベース -> ${file}`);
