// 棚のボタンの付く MOD の短い名前 (2026-10-05 オーナー「マナ自動回復ならマナ自動とかで、火耐性とかそういう系で」)
import { describe, expect, it } from "vitest";
import { shortMod } from "../src/state/craft-stage-help";

describe("shortMod", () => {
  it("数値と「増加する」を外す", () => {
    expect(shortMod("火耐性 (31-35)%")).toBe("火耐性");
    expect(shortMod("マナ自動回復レートが(30-35)%増加する")).toBe("マナ自動回復");
    expect(shortMod("最大ライフ (90-104)")).toBe("最大ライフ");
    expect(shortMod("(35-44)から(56-71)の火ダメージを追加する")).toBe("追加火ダメージ");
    expect(shortMod("ダメージの#%を追加冷気ダメージとして獲得する")).toBe("冷気ダメージ獲得");
    expect(shortMod("命中力 # / アタックスピードが#%増加する")).toBe("命中力 / アタックスピード");
    expect(shortMod("ヒットによる物理ダメージの#%を混沌ダメージとして受ける")).toBe("ヒットによる物理ダメージを混沌ダメージとして受ける");
    expect(shortMod("プレイヤーに対する減速のデバフのポテンシャルが#%減少する")).toBe("減速のデバフのポテンシャル");
  });
});

describe("エッセンスのティア (普通の MOD の何段に当たるか)", () => {
  it("耐性・ライフのエッセンスに段が出る", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { freshItem } = await import("../src/services/craft-stage/run-plan");
    const { stageAdds } = await import("../src/state/craft-stage-help");
    const data = await loadPatch();
    const ring = freshItem(data, "Gold Ring", 82, "magic");
    const out: string[] = [];
    for (const lv of ["lesser", "normal", "greater"]) {
      const a = stageAdds(`essence:${lv}:Rings/Essence_LightningResistance`, data, ring);
      out.push(`${lv}: ${a?.lines.join(" ")} → ${a?.tier}`);
      expect(a?.tier).toMatch(/^普通の MOD の T\d/);
    }
  });
});

describe("値の幅が無いエッセンス", () => {
  it("ブリーチの品質の最大値に数字が入る", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { freshItem } = await import("../src/services/craft-stage/run-plan");
    const { stageAdds } = await import("../src/state/craft-stage-help");
    const data = await loadPatch();
    const a = stageAdds("essence:breach", data, freshItem(data, "Gold Ring", 82, "rare"));
    expect(a?.lines.join("")).not.toContain("#");
    expect(a?.lines.join("")).toContain("20");
  });
});

describe("説明と動作の突き合わせ (2026-10-05)", () => {
  it("錬金術はマジックにも使えて、MOD は 4 つになる。腐食のお告げは単体で使われる", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { freshItem } = await import("../src/services/craft-stage/run-plan");
    const { applyCurrency, omensFor } = await import("../src/services/craft-stage/apply-currency");
    const { mulberry32 } = await import("../src/services/htc/rng");
    const data = await loadPatch();
    const magic = applyCurrency(data, freshItem(data, "Ironclad Vestments", 82), "transmute", mulberry32(1)).item;
    const r = applyCurrency(data, magic, "alchemy", mulberry32(2));
    expect(r.applied).toBe(true);
    expect(r.item.rarity).toBe("rare");
    expect(r.item.prefixes.length + r.item.suffixes.length).toBe(4);
    expect(omensFor("desecrate", ["OmenoftheSovereign", "OmenofPutrefaction", "OmenofSinistralNecromancy"])).toEqual(["OmenofPutrefaction"]);
  });
});

describe("祝福・可能性・古代人のお告げ (2026-10-05)", () => {
  it("可能性のお告げは外れても壊れない、古代人は同じ種類のユニークから、祝福は明示 MOD を変えない", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { freshItem } = await import("../src/services/craft-stage/run-plan");
    const { applyCurrency } = await import("../src/services/craft-stage/apply-currency");
    const { uniquesForBase, uniquesOfClassForBase } = await import("../src/services/craft-stage/stage-bases");
    const { mulberry32 } = await import("../src/services/htc/rng");
    const data = await loadPatch();
    const ring = freshItem(data, "Gold Ring", 82);
    const miss = applyCurrency(data, ring, "chance", mulberry32(1), ["OmenofChance"], { outcome: "destroyed" });
    expect(miss.applied).toBe(true);
    expect(miss.item.destroyed).toBeFalsy();
    expect(miss.omensUsed).toContain("OmenofChance");
    expect(applyCurrency(data, ring, "chance", mulberry32(1), [], { outcome: "destroyed" }).item.destroyed).toBe(true);
    expect(uniquesOfClassForBase("Gold Ring").length).toBeGreaterThan(uniquesForBase("Gold Ring").length);
    const anc = applyCurrency(data, ring, "chance", mulberry32(3), ["OmenoftheAncients"], { outcome: "unique" });
    expect(anc.item.rarity).toBe("unique");
    const rare = applyCurrency(data, ring, "alchemy", mulberry32(4)).item;
    const bl = applyCurrency(data, rare, "divine", mulberry32(5), ["OmenoftheBlessed"]);
    expect(bl.applied).toBe(true);
    expect(bl.item.prefixes).toEqual(rare.prefixes);
    expect(bl.omensUsed).toContain("OmenoftheBlessed");
  });
});

describe("手順のカタリストは 1 手 = 1 個 (要望 ㉜ の 2)", () => {
  it("手順の再生では品質 +1% ずつ、手で打つ (hint 無し) は上限まで", async () => {
    const { loadPatch } = await import("./helpers/patch");
    const { freshItem } = await import("../src/services/craft-stage/run-plan");
    const { applyCurrency } = await import("../src/services/craft-stage/apply-currency");
    const { mulberry32 } = await import("../src/services/htc/rng");
    const data = await loadPatch();
    const it0 = freshItem(data, "Gold Ring", 82);
    const one = applyCurrency(data, it0, "catalyst_life", mulberry32(1), [], { oneCatalyst: true });
    expect(one.applied).toBe(true);
    expect(one.item.quality).toBe(1);
    const all = applyCurrency(data, it0, "catalyst_life", mulberry32(1));
    expect(all.item.quality).toBe(20);
  });
});
