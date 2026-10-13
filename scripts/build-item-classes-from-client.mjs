#!/usr/bin/env node
/**
 * 部位の対応表をクライアントの表から作る (2026-10-13 オーナー「タグ精査絶対やらないと、新しい武器が出たらまた骨の設定しないといけないのは作りが違う」)。
 *
 * 入力 (data-cache/client-export-classes、`npx pathofexile-dat` で書き出し):
 *   ItemClasses (区分・フラクチャー / コラプト / レアにできるか)、CraftingItemClassCategories (武器・マーシャル武器・キャスター武器・盾の仲間 など)、
 *   EssenceTargetItemCategories (エッセンスの部位の区分)、SoulCoreStatCategories (ルーン・ソウルコアの部位の区分)、Chanceableitemclasses、BaseItemTypes
 * 出力: src/services/mods/item-classes.json
 *   classes[クライアントの部位 Id] = { kind (置き場の道から: weapon / armour / jewellery / quiver / jewel / flask / charm / gem), hands, crafting[], essence[], soulCore[], chanceable, fracture, corrupt, rarity }
 *   engine[エンジンの部位 (Talismans など)] = クライアントの部位 Id (ベースの名前で突き合わせる。新しい部位もベースがあれば自動で入る)
 * 使い方: node scripts/build-item-classes-from-client.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "data-cache/client-export-classes/tables/English");
const read = (f) => JSON.parse(readFileSync(resolve(SRC, `${f}.json`), "utf8"));
const IC = read("ItemClasses");
const CIC = read("CraftingItemClassCategories");
const ETC = read("EssenceTargetItemCategories");
const SCC = read("SoulCoreStatCategories");
const CH = read("Chanceableitemclasses");
const BIT = read("BaseItemTypes");

const idOf = (i) => IC[i]?.Id;
const groupsBy = (rows, col) => {
  const m = new Map();
  for (const r of rows) for (const i of r[col] ?? []) { const c = idOf(i); if (c) m.set(c, [...(m.get(c) ?? []), r.Id]); }
  return m;
};
const crafting = groupsBy(CIC, "ItemClasses");
const essence = groupsBy(ETC, "ItemClasses");
const soulCore = groupsBy(SCC, "TargetItemClasses");
const chanceable = new Set(CH.map((r) => idOf(r.ItemClass)));

/** 置き場の道 (Metadata/Items/<ここ>/...) → 種別 */
function kindOfPath(id) {
  const p = id.split("/");
  const top = p[2] ?? "";
  if (top === "Weapons") return { kind: "weapon", hands: /TwoHand/.test(p[3] ?? "") ? 2 : 1 };
  if (top === "Armours") return { kind: "armour" };
  if (top === "Rings" || top === "Amulets" || top === "Belts") return { kind: "jewellery" };
  if (top === "Quivers") return { kind: "quiver" };
  if (top === "Jewels") return { kind: "jewel" };
  if (top === "Flasks") return { kind: /Charm/.test(p[3] ?? "") ? "charm" : "flask" };
  if (top === "Gems" || top === "Gem") return { kind: "gem" };
  return null;
}

// 部位ごとの種別 (ベースの道の多数決。HiddenItem などは捨てる)
const kinds = new Map();
for (const b of BIT) {
  if (!b.Name) continue;
  const c = idOf(b.ItemClass);
  const k = kindOfPath(b.Id);
  if (!c || !k || c === "HiddenItem") continue;
  const key = JSON.stringify(k);
  const m = kinds.get(c) ?? new Map();
  m.set(key, (m.get(key) ?? 0) + 1);
  kinds.set(c, m);
}
const classes = {};
for (const [c, m] of [...kinds].sort((a, b) => a[0].localeCompare(b[0]))) {
  const [best] = [...m].sort((a, b) => b[1] - a[1])[0];
  const row = IC.find((r) => r.Id === c);
  classes[c] = {
    ...JSON.parse(best),
    crafting: crafting.get(c) ?? [],
    essence: essence.get(c) ?? [],
    soulCore: soulCore.get(c) ?? [],
    chanceable: chanceable.has(c),
    fracture: !!row?.CanBeFractured,
    corrupt: !!row?.CanBeCorrupted,
    rarity: !!row?.CanUpgradeRarity,
  };
}

// エンジンの部位 → クライアントの部位 (ベースの名前で突き合わせる)
const classByName = new Map(BIT.filter((b) => b.Name).map((b) => [b.Name, idOf(b.ItemClass)]));
const engine = {};
const conflict = [];
const add = (cat, name) => {
  const c = classByName.get(name);
  if (!c || !classes[c]) return;
  if (engine[cat] && engine[cat] !== c) conflict.push(`${cat}: ${engine[cat]} / ${c} (${name})`);
  else engine[cat] = c;
};
const rows = JSON.parse(readFileSync(resolve(ROOT, "src/services/htc/base-rows.json"), "utf8"));
for (const [name, cls] of Object.entries(rows)) add(String(cls).replace(/_(str|dex|int|str_dex|str_int|dex_int|str_dex_int|fire|cold|lightning|chaos|physical|cannon)$/, ""), name);
const jewels = JSON.parse(readFileSync(resolve(ROOT, "src/services/htc/jewel-bases.json"), "utf8"));
for (const it of jewels.items ?? []) for (const n of it.bases ?? []) add(it.category, n);
// エンジンが作る部位 (フラスコ・スキルジェム、stage-bases.ts)
for (const [cat, c] of [["LifeFlask", "LifeFlask"], ["ManaFlask", "ManaFlask"], ["SkillGem", "Active Skill Gem"]]) if (classes[c]) engine[cat] = c;
if (conflict.length) { console.error("部位が 2 つに割れた:\n" + conflict.join("\n")); process.exit(1); }

const out = { generated: new Date().toISOString().slice(0, 10), source: "client ItemClasses / CraftingItemClassCategories / EssenceTargetItemCategories / SoulCoreStatCategories / Chanceableitemclasses / BaseItemTypes", classes, engine };
writeFileSync(resolve(ROOT, "src/services/mods/item-classes.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`部位 ${Object.keys(classes).length}、エンジンの部位 ${Object.keys(engine).length}`);
for (const [cat, c] of Object.entries(engine)) console.log(`  ${cat.padEnd(16)} → ${c.padEnd(16)} ${classes[c].kind}${classes[c].hands ? classes[c].hands + "h" : ""}  ${classes[c].crafting.join(",")}`);
