/**
 * 計算機の冒涜に勢力のお告げ (黒血 = クルガル / リージュ = アマナム / 君主 = ウラマン) (2026-10-03、SaVeQ 0.5.5 の動画を読んで)
 *
 * 候補をその勢力の冒涜の MOD だけにし、MOD ごとに等しく引く (クラフトステージ・エンジンの desecrationBossProbability と同じ)。
 * 武器・装飾品だけで、防具には効かない
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { itemBaseFor } from "../src/services/htc/bridge";
import { simulateTree, type SimNode, type SimState } from "../src/services/htc/sim-route";
import { FACTION_TAG } from "../src/services/htc/omens";
import { bossOmenAllowed, desecrationOmenForMod } from "../src/vendor/poe2htc/engine/probability";
import type { Prices } from "../src/vendor/poe2htc/optimizer/cost";

const data = loadPatch();
const cls = itemBaseFor(data, "Absent Amulet")!;
const kurgal = cls.pools.desecrated.suffixes.filter((id) => data.mods.get(id)?.tags.includes(FACTION_TAG.blackblooded));
const target = kurgal[0]!;

function run(faction: boolean, runs = 6000) {
  const prices = {
    currency: { divine: 1000, desecrate: 1, annul: 0, exalt: 1 },
    omens: { OmenofDextralNecromancy: 0, OmenoftheBlackblooded: 0, OmenofLight: 0, OmenofAbyssalEchoes: 0 },
  } as unknown as Prices;
  const ctx = { data, cls, prices, itemLevel: 82, limits: { prefix: 3, suffix: 3 }, catalystOk: () => false };
  const start: SimState = { breach: false, slots: [] };
  const nodes: SimNode[] = [
    { id: "d", action: { kind: "desecrate", side: "suffix", bone: "desecrate", echoes: false, ...(faction ? { faction: "blackblooded" as const } : {}) }, targets: [{ modId: target, minTier: 0 }], keep: [], clean: false, onHit: "done", onMiss: "l" },
    { id: "l", action: { kind: "light" }, targets: [], keep: [], clean: false, onHit: "d", onMiss: "d" },
  ];
  return simulateTree({ ctx, start, nodes, runs });
}

describe("勢力のお告げ", () => {
  it("不在のアミュレットのサフィにクルガルの冒涜 MOD がある (動画の「全スキルの品質」の勢力)", () => {
    expect(kurgal.length).toBeGreaterThan(0);
    expect(desecrationOmenForMod(data.mods.get(target)!)).toBe("blackblooded");
  });
  it("黒血のお告げ付きは 1 回で当たる確率 = min(3, N) / N (骨 1 個 = 1 高貴、ほかは 0 で回数を数える)", () => {
    const n = kurgal.filter((id) => (data.mods.get(id)!.tiers.some((t) => t.ilvl <= 82 && t.weight > 0))).length;
    const r = run(true);
    expect(r.pDone).toBe(1);
    expect(r.perDone).toBeGreaterThan((n / Math.min(3, n)) * 0.9);
    expect(r.perDone).toBeLessThan((n / Math.min(3, n)) * 1.1);
  });
  it("お告げ無し (普通の MOD も混ざる) より回数がずっと少ない", () => {
    expect(run(false, 1500).perDone).toBeGreaterThan(run(true, 1500).perDone * 3);
  });
  it("防具 (肋骨) には効かない、武器・装飾品は効く", () => {
    expect(bossOmenAllowed("Gloves")).toBe(false);
    expect(bossOmenAllowed("Amulets")).toBe(true);
    expect(bossOmenAllowed("Spears")).toBe(true);
  });
});
