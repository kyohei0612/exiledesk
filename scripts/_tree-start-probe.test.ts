/**
 * _tree-start-probe.test.ts — ツリーの始まりの形の始めのアイテムを並べる台本 (2026-10-22 シミュ部長 9 本目、10-23 17 本目に印の形へ)。
 *
 *   pnpm exec vitest run -c scripts/_tree-start-probe.config.ts
 *
 * 10-23 オーナー「スタートは印で決まる」: 印 0 = 白 (＋があればその MOD)、印 1 / 2 = 印のどれかが ✦ のレア + 外れ (＋の分だけ減る)。
 * 前の版 (fracture・始まりの MOD の ✦・乱数の数) の移し・見本の木・ルーン・何回か引いた時の ✦ の当たり方。並べるだけ (見張りではない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { mulberry32, type StageItem } from "../src/services/craft-stage/engine";
import { fractureMarks, migrateStart, newTree, startRarity, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { startItemOf } from "../src/services/simulator/tree/tree-sample";
import { treeSample } from "../src/services/simulator/tree/tree-samples";

const show = (it: StageItem): string =>
  `${it.rarity} / 前 ${it.prefixes.map((m) => `${m.modId}${m.fractured ? "(f)" : ""} ${m.tierName}`).join(", ")} / 後 ${it.suffixes.map((m) => `${m.modId}${m.fractured ? "(f)" : ""} ${m.tierName}`).join(", ")}${it.augments?.length ? ` / ルーン ${it.augments.map((a) => a.en).join(", ")} (ソケット ${it.sockets})` : ""}`;

const MS = { modId: "Boots_dex/MovementVelocity", tier: 1 }, FR = { modId: "Boots_dex/FireResistance", tier: 1 }, CR = { modId: "Boots_dex/ColdResistance", tier: 1 };

it("始まりの形", () => {
  const data = loadPatch();
  const run = (name: string, d: TreeDoc): void => {
    const r = startItemOf(data, d, mulberry32(1));
    console.log(`■ ${name} (${startRarity(d)}): ${r.note ? `作れない: ${r.note}` : show(r.item)}`);
  };
  const boots = (x: Partial<TreeDoc>): TreeDoc => { const d = { ...newTree("Drakeskin Boots", 82), ...x }; migrateStart(d); return d; };
  // 1) 印 0 = 白、＋ 1 つ = その MOD のレア
  run("印 0", boots({}));
  run("印 0 + ＋ 火耐性", boots({ memoAims: [FR], start: { rarity: "normal", mods: [FR] } }));
  // 2) 印 1・2 (外れ 3)、印 1 + ＋ 1 (外れ 2)
  run("印 1 移動", boots({ memoAims: [{ ...MS, fractured: true }, FR] }));
  run("印 2 移動・火耐性", boots({ memoAims: [{ ...MS, fractured: true }, { ...FR, fractured: true }] }));
  run("印 1 移動 + ＋ 冷気", boots({ memoAims: [{ ...MS, fractured: true }, CR], start: { rarity: "rare", mods: [CR] } }));
  // 3) 印 2 を 200 回引いて、どちらが ✦ になったか (等分のはず)
  const two = boots({ memoAims: [{ ...MS, fractured: true }, { ...FR, fractured: true }] }), rng = mulberry32(7), count: Record<string, number> = {};
  let n4 = 0;
  for (let i = 0; i < 200; i++) {
    const it = startItemOf(data, two, rng).item, f = [...it.prefixes, ...it.suffixes].find((m) => m.fractured);
    count[f?.modId ?? "なし"] = (count[f?.modId ?? "なし"] ?? 0) + 1;
    if (it.prefixes.length + it.suffixes.length === 4) n4++;
  }
  console.log("  印 2 を 200 回: ✦", JSON.stringify(count), "MOD 4 つ", n4);
  // 4) 前の版の移し (fracture + 乱数 1 → 印 1、乱数の数は消える)
  const old: TreeDoc = { ...newTree("Drakeskin Boots", 82), fracture: MS, startRandom: 1 };
  delete old.start;
  migrateStart(old);
  console.log("  前の版を移した形", JSON.stringify(old.start), "印", JSON.stringify(fractureMarks(old)), "startRandom" in old ? "乱数が残った" : "乱数は消えた");
  run("前の版を移した後", old);
  // 5) 見本の木
  for (const k of ["gold-ring-suffix", "robe-essence-split", "amulet-4aims"]) { const d = treeSample(k); if (d) run(`見本 ${k} 印 ${fractureMarks(d).length}`, d); else console.log("  見本が無い", k); }
  // 6) ルーンの MOD を印に (手袋の投射物 +2 = コルの狩りを先に差す)
  const PJ = { modId: "Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", tier: 2, fractured: true as const };
  const gloves = (runes: string[]): TreeDoc => { const d: TreeDoc = { ...newTree("Sirenscale Gloves", 82), memoAims: [PJ], start: { rarity: "rare", mods: [], runes } }; migrateStart(d); return d; };
  run("手袋 印 = 投射物 +2、コルの狩りを差す", gloves(["Kolr's Hunt"]));
  run("手袋 印 = 投射物 +2、ルーン無し", gloves([]));
});
