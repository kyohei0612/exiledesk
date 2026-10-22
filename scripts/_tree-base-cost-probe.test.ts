/**
 * _tree-base-cost-probe.test.ts — ツリーの始まりの箱のベースの値段 (tree-base-cost.ts、始め方を ③ の計算で比べる) を見本で並べる台本 (2026-10-22 シミュ部長 9 本目)。
 *
 *   pnpm exec vitest run -c scripts/_tree-base-cost-probe.config.ts
 *
 * 値段は解析君の台本と同じ表 (高貴建て、check-sim-start.mjs の PRICES + 神 696.93)。ベースの値段は白 0.07 神・4 MOD 3 神・フラクチャー済み 30 神 (仮)。
 * 解析君の数字合わせの見本: 靴 (移動スピード T1 だけ / + 火耐性 T1)・手袋 (投射物スキル +2、コルの狩り)。並べるだけ (見張りではない)
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { newTree, type TreeDoc } from "../src/services/simulator/tree/tree-model";
import { treeBaseCost } from "../src/services/simulator/tree/tree-base-cost";

const PRICES: Record<string, number> = { divine: 696.93, chaos: 71.892, "essence:greater:Boots_dex/Essence_FireResistance": 150, "essence:normal:Boots_dex/Essence_FireResistance": 30, white: 50, transmute_perfect: 40, augment_perfect: 60, annul: 316.796, regal: 1.387, exalt: 1, desecrate: 131.981, fracture: 8166.06, "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48 };
const price = (k: string): number => PRICES[k] ?? 0;
const PRICE_IN = { white: 0.07, four: 3, fractured: 30 };

it("ベースの値段", () => {
  const data = loadPatch();
  const show = (name: string, d: TreeDoc): void => {
    const r = treeBaseCost(data, d, d.start?.prices ?? PRICE_IN, price, (k) => k);
    console.log(`■ ${name}: 一番安い ${r.best ? `${r.best.label} ${r.best.cost.toFixed(2)} 神` : "無し"}${r.note ? ` (${r.note})` : ""}`);
    for (const k of r.kinds) console.log(`    ${k.label.padEnd(20)} ${k.cost != null ? `${k.cost.toFixed(2)} 神` : ""}${k.why ? ` (${k.why})` : ""}`);
  };
  const boots = (mods: NonNullable<TreeDoc["start"]>["mods"]): TreeDoc => ({ ...newTree("Drakeskin Boots", 82), start: { rarity: "rare", mods } });
  show("靴 移動スピード T1 だけ", boots([{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }]));
  show("靴 移動スピード T1 + 火耐性 T1", boots([{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }, { modId: "Boots_dex/FireResistance", tier: 1 }]));
  show("手袋 投射物スキル +2 (コルの狩り)", { ...newTree("Sirenscale Gloves", 82), start: { rarity: "rare", mods: [{ modId: "Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", tier: 1, fractured: true }] } });
  show("靴 移動スピード T1 + エッセンスの火耐性 (グレーターの道)", boots([{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }, { modId: "Boots_dex/Essence_FireResistance", tier: 2 }]));
  show("靴 ✦ 無し", boots([{ modId: "Boots_dex/MovementVelocity", tier: 1 }]));
  show("靴 反対側 2 つ", boots([{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }, { modId: "Boots_dex/FireResistance", tier: 1 }, { modId: "Boots_dex/ColdResistance", tier: 1 }]));
  show("靴 値段無し", { ...boots([{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }]), start: { rarity: "rare", mods: [{ modId: "Boots_dex/MovementVelocity", tier: 1, fractured: true }], prices: {} } });
});
