#!/usr/bin/env node
/**
 * build-essences-from-client.mjs
 * --------------------------------------------------------------
 * 目的:
 *   クラフト収支 (装備 + エッセンス → 完成品) のために、GGG クライアントの
 *   Essences / EssenceMods / EssenceTargetItemCategories から
 *   「エッセンス → 装備種別ごとの保証モッド」を辞書化する。
 *
 * 入力: data-cache/client-export/ (build-dicts-from-client.mjs が書き出す)
 *   Essences:                    BaseItemType (→ BaseItemTypes 行), Tier (0=Lesser 1=通常 2=Greater), Perfect
 *   EssenceMods:                 Essence (→ Essences 行), TargetItemCategory (→ 種別行), Mod (→ Mods 行),
 *                                OutcomeMods/OutcomeModWeights (複数候補からランダムのとき)
 *   EssenceTargetItemCategories: Id, ItemClasses (→ ItemClasses 行の配列)
 *   BaseItemTypes:               Id, Name, ItemClass (→ ItemClasses 行), DropLevel
 *
 * 出力:
 *   src/i18n/essences.json
 *     { essences: [ { id, nameEn, nameJa, tier, perfect,
 *                     targets: [ { category, itemClasses: [..], modId, outcomes?: [ { modId, weight } ] } ] } ] }
 *   src/i18n/base-item-classes.json
 *     { "<EN ベース名>": { cls: "Ring", lvl: 40 } }   … 装備 / ジュエル系クラスのみ
 *
 * modId は mods-bundle.json のキー (= Mods.Id) と一致する。文言 / ティア / stat はそちらから引く。
 *
 * Usage: node scripts/build-essences-from-client.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, loadPair, loadTable } from "./client-export-config.mjs";

const OUT_ESSENCES = resolve(ROOT, "src/i18n/essences.json");
const OUT_CLASSES = resolve(ROOT, "src/i18n/base-item-classes.json");
const BUNDLE = resolve(ROOT, "src/i18n/mods-bundle.json");

/** 装備として扱う ItemClasses.Id (ベース → 種別辞書に入れる範囲) */
const EQUIP_CLASSES = new Set([
  "Ring", "Amulet", "Belt", "Helmet", "Body Armour", "Gloves", "Boots", "Shield", "Buckler", "Focus", "Quiver",
  "Bow", "Crossbow", "Wand", "Staff", "Warstaff", "Sceptre", "One Hand Mace", "Two Hand Mace", "Spear", "Flail",
  "Claw", "Dagger", "One Hand Sword", "Two Hand Sword", "One Hand Axe", "Two Hand Axe", "Talisman", "Charm",
  "Jewel", "Life Flask", "Mana Flask", "Trap Tool", "Fishing Rod",
]);

function log(...a) {
  console.log("[essences]", ...a);
}

async function main() {
  const ess = await loadTable("English", "Essences");
  const essMods = await loadTable("English", "EssenceMods");
  const cats = await loadTable("English", "EssenceTargetItemCategories");
  const classes = await loadTable("English", "ItemClasses");
  const mods = await loadTable("English", "Mods");
  const { en: baseEn, ja: baseJa } = await loadPair("BaseItemTypes");
  const bundle = JSON.parse(await readFile(BUNDLE, "utf8"));

  const clsId = (i) => (typeof i === "number" && classes[i] ? classes[i].Id : null);
  const modId = (i) => (typeof i === "number" && mods[i] ? mods[i].Id : null);

  // --- ベース → 装備種別 ---
  const baseClasses = {};
  for (const row of baseEn) {
    const cls = clsId(row.ItemClass);
    if (!cls || !EQUIP_CLASSES.has(cls) || !row.Name) continue;
    baseClasses[row.Name] = { cls, lvl: row.DropLevel ?? 0 };
  }

  // --- エッセンス ---
  const byEssence = new Map();
  let missingInBundle = new Set();
  for (const r of essMods) {
    const e = ess[r.Essence];
    if (!e) continue;
    const cat = cats[r.TargetItemCategory];
    const target = {
      category: cat?.Id ?? "?",
      itemClasses: (cat?.ItemClasses ?? []).map(clsId).filter(Boolean),
      modId: modId(r.Mod),
    };
    if (Array.isArray(r.OutcomeMods) && r.OutcomeMods.length > 0) {
      target.outcomes = r.OutcomeMods.map((m, i) => ({ modId: modId(m), weight: r.OutcomeModWeights?.[i] ?? 1 }));
    }
    if (target.modId && !bundle[target.modId]) missingInBundle.add(target.modId);
    for (const o of target.outcomes ?? []) if (o.modId && !bundle[o.modId]) missingInBundle.add(o.modId);
    if (!byEssence.has(r.Essence)) byEssence.set(r.Essence, []);
    byEssence.get(r.Essence).push(target);
  }

  const essences = [];
  for (let i = 0; i < ess.length; i++) {
    const e = ess[i];
    const base = baseEn[e.BaseItemType];
    if (!base?.Name) continue;
    essences.push({
      id: base.Id,
      nameEn: base.Name,
      nameJa: baseJa[e.BaseItemType]?.Name || base.Name,
      tier: e.Tier,
      perfect: !!e.Perfect,
      targets: byEssence.get(i) ?? [],
    });
  }
  essences.sort((a, b) => a.tier - b.tier || Number(a.perfect) - Number(b.perfect) || a.nameEn.localeCompare(b.nameEn));

  await writeFile(OUT_ESSENCES, JSON.stringify({ essences }, null, 2) + "\n", "utf8");
  await writeFile(OUT_CLASSES, JSON.stringify(baseClasses, null, 2) + "\n", "utf8");
  const withTargets = essences.filter((e) => e.targets.length > 0).length;
  log(`essences: ${essences.length} (targets あり ${withTargets}) → ${OUT_ESSENCES}`);
  log(`base-item-classes: ${Object.keys(baseClasses).length} → ${OUT_CLASSES}`);
  if (missingInBundle.size) {
    log(`WARN: mods-bundle に無い保証モッド ${missingInBundle.size} 件: ${[...missingInBundle].slice(0, 10).join(", ")}${missingInBundle.size > 10 ? " …" : ""}`);
  }
}

main().catch((e) => {
  console.error("[essences] FAILED:", e);
  process.exit(1);
});
