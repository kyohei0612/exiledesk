/**
 * 計算機: 自分でフラクチャーは固定無し・4 MOD の 1 本 (2026-10-04 オーナー「欲しい MOD 側とか関係なく 4 MOD で検索したら、ゆるいも厳しいも無い」)。
 * 反対側に深淵のエッセンス → 冒涜 (印を置き換え) で 普通 3 + 冒涜 1 → 固定 1/3
 */
import { describe, expect, it } from "vitest";
import { candidateOf } from "../src/services/htc/tree-decide";

const p = { orb: 10, annul: 3, bone: 0.5, necro: 1, exalt: 0.01, dextralExalt: 1, regal: 0.01, abyss: 2, crystal: 1 };
describe("固定無し・4 MOD の物", () => {
  it("深淵のエッセンス → 冒涜 → 固定 (1/3) がそのまま固定 (1/4) より安い", () => {
    const c = candidateOf({ source: "loose", price: 5, prefixes: 2, suffixes: 2 }, p)!;
    expect(c.how).toBe("abyss");
    expect(c.hit).toBeCloseTo(1 / 3);
    expect(c.perTry).toBeCloseTo(5 + 2 + 1 + 0.5 + 10);
  });
  it("深淵のエッセンスが相場に無ければ、今までの道 (そのまま固定 1/4 か、減らして冒涜)", () => {
    const c = candidateOf({ source: "loose", price: 5, prefixes: 3, suffixes: 1 }, { ...p, abyss: null })!;
    expect(c.how).not.toBe("abyss");
  });
});
