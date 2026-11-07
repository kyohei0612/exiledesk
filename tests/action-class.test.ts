// 手の種類 (spec/action-class.ts) の見張り (2026-11-07 ジン jin-base)。鍵だけの種類 (actionClassOfKey、シミュの木が使う) が、品のある時の種類 (actionClassOf、お告げ無し) と
// 棚の全カレンシーで同じか。外の正解ではない (G-22): 種類の決まりは engine.md の E-20a
import { describe, expect, it } from "vitest";
import { actionClassOf, actionClassOfKey } from "../src/services/craft-stage/spec/action-class";
import { emotionKeysFor } from "../src/services/craft-stage/apply-emotion";
import { BONES, CATALYSTS, ORBS, essenceShelf } from "../src/state/for-share/craft-stage-shelf";
import { BASES, data, statesOf } from "./helpers/spec-parity";

describe("手の種類", () => {
  it("鍵だけの種類 = 品のある時の種類 (棚の全カレンシー × 部位)", () => {
    const bad: string[] = [];
    let n = 0;
    for (const base of BASES.filter((b) => !/Flask$/.test(b))) {
      const item = statesOf(base, 82).find(([l]) => l === "レア 4 つ")?.[1];
      if (!item) continue;
      const keys = [...ORBS.flatMap((g) => g.keys), ...BONES, ...CATALYSTS, ...emotionKeysFor(item), "reveal:1", ...essenceShelf(data, item).flatMap((g) => g.keys)];
      for (const key of keys) {
        const withItem = actionClassOf(data, item, key);
        if (!withItem.cls) continue;
        n++;
        const byKey = actionClassOfKey(key);
        if (byKey.cls !== withItem.cls || byKey.parts.join() !== withItem.parts.join()) bad.push(`${base} ${key}: 鍵だけ ${byKey.cls} [${byKey.parts}] / 品あり ${withItem.cls} [${withItem.parts}]`);
      }
    }
    expect(n).toBeGreaterThan(1000);
    expect(bad, bad.slice(0, 20).join("\n")).toEqual([]);
  }, 600_000);
  it("鍵の例 (付ける・消す・入れ替える・性質・値)", () => {
    expect(actionClassOfKey("exalt").cls).toBe("add");
    expect(actionClassOfKey("annul").cls).toBe("remove");
    expect(actionClassOfKey("chaos_perfect").cls).toBe("replace");
    expect(actionClassOfKey("reveal:1").cls).toBe("replace");
    expect(actionClassOfKey("desecrate_ancient").cls).toBe("add");
    expect(actionClassOfKey("fracture").cls).toBe("property");
    expect(actionClassOfKey("divine").cls).toBe("values");
    expect(actionClassOfKey("force:Rings/FireResistance|T1|n").cls).toBe(null);
  });
});
