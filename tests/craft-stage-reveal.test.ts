/**
 * クラフトステージの発現 (POE2Tube 要望 ㉕、2026-10-03): 言葉は「発現 / 未発現」、結果 JSON に候補 3 つ (reveal_offers)、
 * 無限のパーフェクトエッセンスの文は付いた 1 つ
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { runPlan, stepJa, freshItem } from "../src/services/craft-stage/run-plan";
import { makeStageMod } from "../src/services/craft-stage/stage-core";
import { mulberry32 } from "../src/services/htc/rng";
import type { CraftStagePlan } from "../src/services/craft-stage/contract";

const data = loadPatch();
const meta = { prices: {}, exiledeskVersion: "test", patch: "0.5.0", league: null, generatedAt: "2026-10-03T00:00:00Z" };
/** 要望 ㉕ の本編の手順 (POE2Tube data/briefs/end_craft_materials_2.json の plan と同じ) */
const plan = (reveal: string) => ({
  schema: "craft-stage-plan/1", base: "Amber Amulet", item_level: 82, seed: 20261003,
  start: { rarity: "rare", mods: [{ mod: "Amulets/IncreasedLife", tier: "T2" }, { mod: "Amulets/IncreasedMana", tier: "T3" }, { mod: "Amulets/AllResistances", tier: "T2" }, { mod: "Amulets/Strength", tier: "T3" }] },
  steps: [
    { currency: "exalt_perfect", omen: "OmenofSinistralExaltation" },
    { currency: "desecrate", omen: "OmenofDextralNecromancy" },
    // アビスの反響は発現の手に掛ける
    reveal.endsWith(":reroll") ? { currency: reveal, omen: "OmenofAbyssalEchoes" } : { currency: reveal },
  ],
}) as unknown as CraftStagePlan;
type Offers = { chosen: number; rerolled: boolean; first: Array<{ mod_id: string; text_ja: string }>; after_reroll: Array<{ mod_id: string }> | null };

describe("発現", () => {
  it("手の名前・未発現の札は「発現」(開示と言わない)", () => {
    const r = runPlan(data, plan("reveal:1"), meta);
    const s = JSON.stringify(r);
    expect(s).not.toContain("開示");
    expect(r.steps[2]!.currency_ja).toBe("発現 (1 番目)");
    expect(JSON.stringify(r.steps[1]!.after)).toContain("未発現の冒涜 MOD (サフィックス)");
    expect(stepJa("reveal:2:reroll", freshItem(data, "Amber Amulet", 82))).toBe("発現 (引き直して 2 番目)");
  });
  it("結果 JSON の発現の手に候補 3 つと選んだ番号。選んだ物は付いた MOD と同じ", () => {
    const r = runPlan(data, plan("reveal:2"), meta);
    const st = r.steps[2] as unknown as { applied: boolean; reveal_offers: Offers; changed: { added: Array<{ mod_id: string }> } };
    expect(st.applied).toBe(true);
    expect(st.reveal_offers.first.length).toBe(3);
    expect(st.reveal_offers).toMatchObject({ chosen: 2, rerolled: false, after_reroll: null });
    expect(st.reveal_offers.first[1]!.mod_id).toBe(st.changed.added[0]!.mod_id);
  });
  it("アビスの反響の引き直しは、前の 3 つと後の 3 つ。選ぶのは後の方", () => {
    const r = runPlan(data, plan("reveal:1:reroll"), meta);
    const st = r.steps[2] as unknown as { applied: boolean; reveal_offers: Offers; changed: { added: Array<{ mod_id: string }> } };
    expect(st.applied).toBe(true);
    expect(st.reveal_offers.rerolled).toBe(true);
    expect(st.reveal_offers.after_reroll!.length).toBe(3);
    expect(st.reveal_offers.after_reroll![0]!.mod_id).toBe(st.changed.added[0]!.mod_id);
  });
});

describe("無限のパーフェクトエッセンス", () => {
  it("付いた 1 つの文 (筋力が7%増加する)。説明文の「筋力、器用さまたは知性」にしない", () => {
    const m = data.mods.get("Amulets/PerfectEssence_PercentageStrength")!;
    const sm = makeStageMod(m, "suffix", 0, mulberry32(1));
    expect(sm.textEn).toMatch(/^\d+% increased Strength$/);
    expect(sm.textJa).toMatch(/^筋力が\d+%増加する$/);
    expect(makeStageMod(data.mods.get("Amulets/PerfectEssence_PercentageIntelligence")!, "suffix", 0, mulberry32(1)).textJa).toMatch(/^知性が/);
  });
});
