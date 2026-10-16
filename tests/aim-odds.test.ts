// エミュレーターの「狙う」(aim-odds.ts、2026-10-09): 今の状態から打った時に狙いが付く確率を打ち方ごとに
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { forceKey } from "../src/services/craft-stage/apply-force";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { aimChain, aimCombos, aimOdds, type AimTarget } from "../src/services/craft-stage/aim-odds";
import { mulberry32 } from "../src/services/htc/rng";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import type { StageItem } from "../src/services/craft-stage/types";

const data: PatchData = await loadPatch();
const idOf = (base: string, re: RegExp): string => [...data.mods.values()].find((m) => m.id.startsWith(`${base}/`) && m.source === "normal" && re.test(m.id))!.id;
const force = (it: StageItem, id: string, t: string): StageItem => applyCurrency(data, it, forceKey(id, t, "n"), mulberry32(1)).item;

describe("狙う確率", () => {
  // レアの指輪: プレにライフ、サフィに火耐性・冷気耐性。次にプレの最大マナを狙う
  const life = idOf("Rings", /IncreasedLife$/), mana = idOf("Rings", /IncreasedMana$/);
  let ring = freshItem(data, "Sapphire Ring", 82);
  ring = force(ring, life, "T2");
  ring = force(ring, idOf("Rings", /FireResistance$/), "T1");
  ring = force(ring, idOf("Rings", /ColdResistance$/), "T1");
  const t: AimTarget = { modId: mana, minTierIndex: 0 };
  const odds = (c: string, om: string[] = []) => aimOdds(data, ring, t, { currency: c, omens: om }, 1500, 11);

  it("左側の高揚のお告げを掛けた高貴は、掛けない高貴より付きやすい (プレしか付かない)", () => {
    expect(ring.rarity).toBe("rare");
    const plain = odds("exalt"), left = odds("exalt", ["OmenofSinistralExaltation"]), right = odds("exalt", ["OmenofDextralExaltation"]);
    expect(left).toBeGreaterThan(plain * 1.3);
    expect(right).toBe(0);
  });
  it("段の下限を上げると、強いカレンシーの方が付きやすくなることがある (完全高貴は低い段が出ない)", () => {
    const top = idOf("Rings", /IncreasedMana$/);
    const tiers = data.mods.get(top)!.tiers.length;
    const hi: AimTarget = { modId: top, minTierIndex: tiers - 2 };
    const base = aimOdds(data, ring, hi, { currency: "exalt", omens: [] }, 1500, 3);
    const perfect = aimOdds(data, ring, hi, { currency: "exalt_perfect", omens: [] }, 1500, 3);
    expect(perfect).toBeGreaterThan(base);
  });
  it("打ち方の一覧に冒涜 (反響込み) と、側のお告げの組み合わせが入る。打てない組み合わせは入らない", () => {
    const cs = aimCombos(data, ring, ["exalt", "exalt_perfect", "chaos", "desecrate", "transmute"]);
    expect(cs.some((c) => c.currency === "exalt" && c.omens.includes("OmenofSinistralExaltation"))).toBe(true);
    expect(cs.some((c) => c.currency === "desecrate" && c.omens.includes("OmenofAbyssalEchoes"))).toBe(true);
    expect(cs.some((c) => c.currency === "transmute")).toBe(false);
  });
  it("一覧を全部 300 回ずつ試しても数秒で終わる", () => {
    const cs = aimCombos(data, ring, ["exalt", "exalt_greater", "exalt_perfect", "chaos", "chaos_greater", "chaos_perfect", "desecrate", "desecrate_ancient"]);
    const t0 = performance.now();
    for (const c of cs) aimOdds(data, ring, t, c, 300, 5);
    expect(performance.now() - t0).toBeLessThan(8000);
  });
  it("当たるまで続けて回す: 今の MOD が消えたら外れ (カオスだけはカオススパムで、消えても揃えば当たり)、左の高貴は付く", () => {
    expect(aimChain(data, ring, [t], { currency: "chaos", omens: [] }, 800, 4)).toBeGreaterThan(0);
    const left = aimChain(data, ring, [t], { currency: "exalt", omens: ["OmenofSinistralExaltation"] }, 800, 4);
    expect(left).toBeGreaterThan(0);
    // プレの空きは 2 つ: 外れても空きが残る間は続けて打てるので、打った回数あたりでは 1 回だけの確率と同じくらい (崩れないので下がらない)
    expect(left).toBeGreaterThan(odds("exalt", ["OmenofSinistralExaltation"]) * 0.8);
  });
  it("2 つ同時に狙うと、どちらか 1 つより揃いにくい (全部揃って当たり)", () => {
    const fire = idOf("Rings", /LightningResistance$/);
    const one = aimOdds(data, ring, [t], { currency: "exalt", omens: [] }, 1500, 9);
    const two = aimOdds(data, ring, [t, { modId: fire, minTierIndex: 0 }], { currency: "exalt", omens: ["OmenofGreaterExaltation"] }, 1500, 9);
    expect(two).toBeLessThan(one);
    expect(two).toBeGreaterThan(0);
  });
});

describe("効かないお告げは狙う一覧に出さない (要望 0c542dae)", () => {
  // プレが 3 つ埋まった指輪: 骨はお告げ無しでもサフィにしか付かない
  let full = freshItem(data, "Sapphire Ring", 82);
  full = force(full, idOf("Rings", /IncreasedLife$/), "T2");
  full = force(full, idOf("Rings", /IncreasedMana$/), "T2");
  const fams = new Set(full.prefixes.map((m) => data.mods.get(m.modId)!.family));
  const third = [...data.mods.values()].find((m) => m.id.startsWith("Rings/") && m.source === "normal" && m.type === "prefix" && !fams.has(m.family) && m.tiers.length > 1)!;
  full = force(full, third.id, "T1");

  it("プレが埋まっていれば、右手のネクロマンシー (サフィ) と右の高揚は出ない", () => {
    expect(full.prefixes.length).toBe(3);
    const cs = aimCombos(data, full, ["exalt", "desecrate"]);
    expect(cs.some((c) => c.currency === "desecrate" && c.omens.includes("OmenofDextralNecromancy"))).toBe(false);
    expect(cs.some((c) => c.currency === "exalt" && c.omens.includes("OmenofDextralExaltation"))).toBe(false);
    expect(cs.some((c) => c.currency === "desecrate" && c.omens.length === 1)).toBe(true);
  });
  it("空いている側が 1 つなら側の抽選をしない: 同じ種でお告げ無しの骨と右手のネクロマンシーの骨は同じ結果", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const a = applyCurrency(data, full, "desecrate", mulberry32(seed), []);
      const b = applyCurrency(data, full, "desecrate", mulberry32(seed), ["OmenofDextralNecromancy"]);
      expect(JSON.stringify(b.item.suffixes)).toBe(JSON.stringify(a.item.suffixes));
    }
  });
});

describe("カオスも狙う一覧に出す (要望 63f6d901)", () => {
  // 要望の不在のアミュレット: レアでサフィに「毎秒のライフ自動回復」だけ。カオスは必ずその MOD を消す
  const regen = idOf("Amulets", /LifeRegeneration$/);
  let amu = freshItem(data, "Absent Amulet", 82);
  amu = force(amu, regen, "T5");
  amu = force(amu, idOf("Amulets", /Strength$/), "T1");
  amu = applyCurrency(data, amu, "annul", mulberry32(3)).item;
  it("MOD が 1 つのレアでも、カオスは今の MOD が消えても狙いが付けば当たりとして数える", () => {
    const rest = [...amu.prefixes, ...amu.suffixes];
    expect(amu.rarity).toBe("rare");
    expect(rest.length).toBe(1);
    const target: AimTarget = { modId: idOf("Amulets", /Dexterity$/), minTierIndex: 0 };
    expect(aimCombos(data, amu, ["chaos"]).some((c) => c.currency === "chaos")).toBe(true);
    expect(aimChain(data, amu, [target], { currency: "chaos", omens: [] }, 1500, 5)).toBeGreaterThan(0);
  });
});
