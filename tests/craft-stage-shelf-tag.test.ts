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
