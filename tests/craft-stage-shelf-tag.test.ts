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
