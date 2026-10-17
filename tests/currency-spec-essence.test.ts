/**
 * ADR-004 の 4 段目 (2026-10-16): エッセンス (レッサー / 普通 / グレーター・パーフェクト・ブリーチ・深淵・ヒステリーなど) を
 * 説明文の分解 (spec/essence-specs.ts) で打った結果 = 今の applyCurrency の結果か。
 * 説明文は全部のエッセンスの鍵 (essence-key-table) で、クライアントの currency-hover の文と同じか確かめる。
 * 違いは docs/archive/2026-10-16-adr-004-orbs-diff.md の「エッセンス」
 */
import { describe, expect, it } from "vitest";
import { BASES, data, statesOf } from "./helpers/spec-parity";
import { mulberry32 } from "../src/services/htc/rng";
import { applyBySpec, ALL_OMEN_SPECS } from "../src/services/craft-stage/spec/run-spec";
import { ALLOY_SPEC, ESSENCE_OMEN_SPECS, ESSENCE_SPEC, essenceLevelOfKey, isAlloyKey, PERFECT_ESSENCE_SPEC } from "../src/services/craft-stage/spec/essence-specs";
import { ESSENCE_KEYS } from "../src/services/htc/essence-key-table";
import { essenceShelf } from "../src/state/craft-stage-shelf";
import { OMEN_FOR } from "../src/services/craft-stage/omens";
import HOVER_EN from "../src/i18n/currency-hover-en.json";
import HOVER_JA from "../src/i18n/currency-hover-ja.json";

const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

describe("説明文はクライアントの写しと同じ (エッセンス)", () => {
  const en = HOVER_EN as Record<string, { e?: string[] }>;
  const ja = HOVER_JA as Record<string, { e?: string[] }>;
  it("全部のエッセンスの鍵: 段で選んだ説明文 = そのエッセンスの説明文", () => {
    let n = 0;
    const missing = new Set<string>();
    for (const [key, name] of Object.entries(ESSENCE_KEYS)) {
      const h = squash(name.en);
      if (!en[h]) { missing.add(name.en); continue; }
      const spec = essenceLevelOfKey(key) !== "perfect" ? ESSENCE_SPEC : isAlloyKey(key) ? ALLOY_SPEC : PERFECT_ESSENCE_SPEC;
      expect(en[h]!.e, `${key} ${name.en}`).toEqual(spec.text.en);
      expect(ja[h]!.e, `${key} ${name.en}`).toEqual(spec.text.ja);
      n++;
    }
    expect(n).toBeGreaterThan(1000);
    expect([...missing]).toEqual([]);
  });
  it("ブリーチ・深淵のエッセンスもパーフェクトと同じ文", () => {
    for (const k of ["essenceofthebreach", "essenceoftheabyss"]) expect(en[k]!.e, k).toEqual(PERFECT_ESSENCE_SPEC.text.en);
  });
  it("結晶化のお告げ", () => {
    for (const o of ESSENCE_OMEN_SPECS) {
      expect(en[o.hover]?.e, o.key).toEqual(o.text.en);
      expect(ja[o.hover]?.e, o.key).toEqual(o.text.ja);
    }
    const mine = ALL_OMEN_SPECS.filter((o) => o.appliesTo === "essence_perfect").map((o) => o.key).sort();
    expect(mine).toEqual([...(OMEN_FOR.essence_perfect ?? [])].sort());
  });
});

describe("合金に結晶化のお告げ (2026-10-16 オーナーがゲームで確認: お告げは減る)", () => {
  it("新しい作りでも掛かって食う", () => {
    let seen = 0;
    for (const base of BASES) {
      const item = statesOf(base, 82).find(([l]) => l === "レア 満杯")?.[1];
      if (!item) continue;
      for (const key of essenceShelf(data, item).flatMap((g) => g.keys).filter(isAlloyKey)) {
        const b = applyBySpec(data, item, key, mulberry32(1), ["OmenofSinistralCrystallisation"])!;
        if (b.applied) expect(b.omensUsed).toEqual(["OmenofSinistralCrystallisation"]);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
