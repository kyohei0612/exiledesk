#!/usr/bin/env node
/**
 * build-defence-data.mjs — 防御の画面 (POE2Tube 要望 ㉒-B) の数字の表を作る (2026-09-30)
 *
 *   node scripts/build-defence-data.mjs   → src/services/craft-stage/defence-data.json
 *
 * 数字の優先順位 (要望 ㉒): ゲームのデータ > 公式パッチノート > PoB > 攻略サイト。出どころは各値の横 (sources) に書く。
 *   - ゲームのデータ: data-cache/client-export-constants (GameConstants)、client-export-keywords (KeywordPopups の説明文)、
 *     client-export-defences (ArmourTypes / BaseItemTypes、EN と JA は行で対応)
 *   - PoB (vendor): クライアントに値が無い物だけ (アーマーの係数 10、受け流しの上限 95、敵の命中力・一撃の表)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const gc = Object.fromEntries(read("data-cache/client-export-constants/tables/English/GameConstants.json").map((r) => [r.Id.trim(), r.Value / (r.Divisor || 1)]));
const misc = readFileSync(join(root, "vendor/PathOfBuilding-PoE2/src/Data/Misc.lua"), "utf8");
const table = (name) => (new RegExp(`data\\.${name} = \\{([^}]*)\\}`).exec(misc)?.[1] ?? "").split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
const charConst = (key) => Number(new RegExp(`\\["${key.replace(/[%]/g, "\\$&")}"\\] = (\\d+)`).exec(misc)?.[1]);

const need = (k) => {
  if (gc[k] == null) throw new Error(`GameConstants に ${k} が無い (クライアントの書き出しを取り直す)`);
  return gc[k];
};
const constants = {
  evadeCap: need("DefaultMaxEvadeChancePercent"),
  deflectPct: need("BasePercentDamageDeflected"),
  esDelay: need("BaseShieldRegenCooldownTimeMs") / 1000,
  esRatePct: charConst("energy_shield_recharge_rate_per_minute_%") / 60,
  shockPct: need("BaseShockMagnitude"),
  freezePlayer: need("FreezeDurationPlayer"),
  chillPlayer: need("BaseChillDurationPlayer"),
  shockPlayer: need("BaseShockDurationPlayer"),
  wardRegenPct: need("BaseWardRegenerationPercentPerMinute") / 60,
  // クライアントに無い物 (PoB の手書き)
  armourRatio: 10,
  armourCap: charConst("maximum_physical_damage_reduction_%"),
  deflectCap: 95,
  resistCap: charConst("base_maximum_all_resistances_%"),
  chaosEsMult: 2,
};
const sources = {
  evadeCap: "ゲーム (GameConstants.DefaultMaxEvadeChancePercent)",
  deflectPct: "ゲーム (GameConstants.BasePercentDamageDeflected、説明文も 40%)",
  esDelay: "ゲーム (GameConstants.BaseShieldRegenCooldownTimeMs、説明文も 4 秒)",
  esRatePct: "ゲームの説明文 (毎秒 12.5%) = PoB (energy_shield_recharge_rate_per_minute_% 750)",
  shockPct: "ゲーム (GameConstants.BaseShockMagnitude、説明文も 20%)",
  freezePlayer: "ゲーム (GameConstants.FreezeDurationPlayer。説明文の 4 秒はプレイヤー以外の既定 FreezeDuration)",
  wardRegenPct: "ゲーム (GameConstants.BaseWardRegenerationPercentPerMinute、説明文も毎秒 5%)",
  armourRatio: "PoB の手書き (Data.lua ArmourRatio)。クライアントに値が無い。poe2wiki も 10",
  armourCap: "PoB (characterConstants maximum_physical_damage_reduction_%)",
  deflectCap: "PoB の手書き (Data.lua、「maybe a gameConstant?」)。クライアントに値が無い",
  resistCap: "PoB (characterConstants base_maximum_all_resistances_%)",
  chaosEsMult: "ゲームの説明文 (混沌は 2 倍の ES を取り除く)",
  monsterAccuracy: "PoB (Data/Misc.lua monsterAccuracyTable)",
  monsterDamage: "PoB (Data/Misc.lua monsterDamageTable)",
  bases: "ゲーム (ArmourTypes / BaseItemTypes)",
};

// 防具のベース (胴・兜・手袋・靴・盾・フォーカス)。名前は EN / JA の行対応、レベルは DropLevel
const at = read("data-cache/client-export-defences/tables/English/ArmourTypes.json");
const bt = read("data-cache/client-export-defences/tables/English/BaseItemTypes.json");
const btJa = read("data-cache/client-export-defences/tables/Japanese/BaseItemTypes.json");
// 今のゲームにあるベースだけ (計算機のベースの表。クライアントには廃止品も残る)
const live = new Set(read("src/vendor/poe2htc/data/base_items.json").items.flatMap((i) => i.bases));
const SLOT = [["BodyArmours", "body"], ["Helmets", "helmet"], ["Gloves", "gloves"], ["Boots", "boots"], ["Shields", "shield"], ["Focus", "focus"]];
const bases = [];
for (const r of at) {
  const b = bt[r.BaseItemType];
  // 同じ名前の行が複数ある (別の見た目の行)。表の先の物だけ
  if (!b?.Name || !live.has(b.Name) || bases.some((x) => x.en === b.Name)) continue;
  const slot = SLOT.find(([k]) => b.Id.includes(`/${k}/`))?.[1];
  if (!slot || !(r.Armour || r.Evasion || r.EnergyShield)) continue;
  bases.push({ en: b.Name, ja: btJa[r.BaseItemType]?.Name ?? b.Name, slot, lvl: b.DropLevel ?? 1, ar: r.Armour, ev: r.Evasion, es: r.EnergyShield });
}
bases.sort((a, b) => a.slot.localeCompare(b.slot) || a.lvl - b.lvl || a.en.localeCompare(b.en));

const out = {
  generated: new Date().toISOString().slice(0, 10),
  constants,
  sources,
  monsterAccuracy: table("monsterAccuracyTable"),
  monsterDamage: table("monsterDamageTable"),
  bases,
};
writeFileSync(join(root, "src/services/craft-stage/defence-data.json"), JSON.stringify(out) + "\n");
console.log(`防御の表: 定数 ${Object.keys(constants).length}、ベース ${bases.length}、敵の表 ${out.monsterAccuracy.length} 段`);
console.log(JSON.stringify(constants));
