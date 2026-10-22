/**
 * _tree-start-probe.test.ts — ツリーの始まりの形 (レアリティ + 始まりの MOD、2026-10-22 シミュ部長 9 本目) の始めのアイテムを並べる台本。
 *
 *   pnpm exec vitest run -c scripts/_tree-start-probe.config.ts
 *
 * 前の版の fracture だけの木の移し・マジック 2 MOD・レア + フラクチャー + 乱数・ルーンの MOD (コルの狩りを差して付くか)・作れない形の理由。並べるだけ (見張りではない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { mulberry32, type StageItem } from "../src/services/craft-stage/engine";
import { migrateStart, newTree, startOf, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { startItemOf } from "../src/services/simulator/tree/tree-sample";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

const show = (it: StageItem): string =>
  `${it.rarity} / 前 ${it.prefixes.map((m) => `${m.modId}${m.fractured ? "(f)" : ""} ${m.tierName}`).join(", ")} / 後 ${it.suffixes.map((m) => `${m.modId}${m.fractured ? "(f)" : ""} ${m.tierName}`).join(", ")}${it.augments?.length ? ` / ルーン ${it.augments.map((a) => a.en).join(", ")} (ソケット ${it.sockets})` : ""}`;

it("始まりの形", () => {
  const data = loadPatch();
  const run = (name: string, d: TreeDoc): void => {
    const r = startItemOf(data, d, mulberry32(1));
    console.log(`■ ${name}: ${r.note ? `作れない: ${r.note}` : show(r.item)}`);
  };
  // 1) 前の版 (fracture だけ) は読む時に移す。移す前後で同じ物
  const old: TreeDoc = { ...newTree("Drakeskin Boots", 82), fracture: { modId: "Boots_dex/MovementVelocity", tier: 1 }, startRandom: 1 };
  delete old.start;
  run("前の版のまま", old);
  const moved = JSON.parse(JSON.stringify(old)) as TreeDoc;
  migrateStart(moved);
  console.log("  移した形", JSON.stringify(moved.start), "fracture" in moved ? "fracture が残った" : "fracture は消えた");
  run("移した後", moved);
  // 2) 見本の木 (前と同じ始まりか)
  const ring = treeSample("gold-ring-suffix")!;
  console.log("  見本の始まり", JSON.stringify(startOf(ring)), "乱数", ring.startRandom);
  run("見本の金の指輪", ring);
  // 3) マジック 2 MOD (プレ 1・サフィ 1)
  run("マジック 移動スピード T1 + 火耐性 T1", { ...newTree("Drakeskin Boots", 82), start: { rarity: "magic", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1 }, { modId: "Boots_dex/FireResistance", tier: 1 }] } });
  run("マジック 移動スピード T1 + 乱数 1 (増強)", { ...newTree("Drakeskin Boots", 82), start: { rarity: "magic", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1 }] }, startRandom: 1 });
  run("マジック 火・冷気 (サフィ 2 = 作れない)", { ...newTree("Drakeskin Boots", 82), start: { rarity: "magic", mods: [{ modId: "Boots_dex/FireResistance", tier: 1 }, { modId: "Boots_dex/ColdResistance", tier: 1 }] } });
  // 4) マジックでもフラクチャーがあればレア
  run("マジック指定 + フラクチャー", { ...newTree("Drakeskin Boots", 82), start: { rarity: "magic", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }, { modId: "Boots_dex/FireResistance", tier: 2 }] } });
  run("レア フラクチャー + 火 T2 + 乱数 2", { ...newTree("Drakeskin Boots", 82), start: { rarity: "rare", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }, { modId: "Boots_dex/FireResistance", tier: 2 }] }, startRandom: 2 });
  // 5) ルーンの MOD (コルの狩りの投射物スキルのレベル、解析君の ES 手袋の始まり)
  run("手袋 投射物 +2 フラクチャー (ルーン)", { ...newTree("Sirenscale Gloves", 82), start: { rarity: "rare", mods: [{ modId: "Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", tier: 2, fractured: true }] }, startRandom: 1 });
  // 6) 選んだルーン (セールの凱旋 = サフィックス +1、手袋はソケット 1 つ) と、ルーンの MOD との兼ね合い
  run("手袋 セールの凱旋 + 投射物 +2 (ソケット足りない)", { ...newTree("Sirenscale Gloves", 82), start: { rarity: "rare", mods: [{ modId: "Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", tier: 2, fractured: true }], runes: ["Serle's Triumph"] } });
  run("手袋 コルの狩りを選んで + 投射物 +2", { ...newTree("Sirenscale Gloves", 82), start: { rarity: "rare", mods: [{ modId: "Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", tier: 2, fractured: true }], runes: ["Kolr's Hunt"] } });
  run("靴 フラクチャー + エッセンスの火耐性 (グレーター後)", { ...newTree("Drakeskin Boots", 82), start: { rarity: "rare", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }, { modId: "Boots_dex/Essence_FireResistance", tier: 2 }] }, startRandom: 1 });
  run("靴 セールの凱旋 + フラクチャー + 乱数 4", { ...newTree("Drakeskin Boots", 82), start: { rarity: "rare", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }], runes: ["Serle's Triumph"] }, startRandom: 4 });
});
