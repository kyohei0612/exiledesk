/**
 * ADR-004 の 4 段目 (2026-10-16): 品質のカレンシー (砥石・端材・飾り玉・プリズム・彫刻針)・触媒 (普通・精製)・アーティフィサー・ルーンを
 * 説明文の分解 (spec/other-specs.ts) で打った結果 = 今の applyCurrency の結果か。
 * 違いは docs/archive/2026-10-16-adr-004-orbs-diff.md の「品質・触媒・ルーン」
 */
import { describe, expect, it } from "vitest";
import { BASES, data, moreStatesOf, statesOf } from "./helpers/spec-parity";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import { applyBySpec } from "../src/services/craft-stage/spec/run-spec";
import { ARTIFICER_SPEC, CATALYST_SPECS, QUALITY_SPECS, RUNE_SPEC } from "../src/services/craft-stage/spec/other-specs";
import { CATALYSTS } from "../src/services/htc/quality";
import { runeKeys } from "../src/services/craft-stage/stage-runes";
import HOVER_EN from "../src/i18n/currency-hover-en.json";
import HOVER_JA from "../src/i18n/currency-hover-ja.json";
import KW_EN from "../src/i18n/keywords-en.json";
import KW_JA from "../src/i18n/keywords-ja.json";

describe("説明文はクライアントの写しと同じ (品質・触媒・アーティフィサー・ルーン)", () => {
  const en = HOVER_EN as Record<string, { e?: string[] }>;
  const ja = HOVER_JA as Record<string, { e?: string[] }>;
  it("品質・触媒・アーティフィサー", () => {
    for (const s of [...QUALITY_SPECS, ...CATALYST_SPECS, ARTIFICER_SPEC]) {
      expect(en[s.key]?.e, s.key).toEqual(s.text.en);
      expect(ja[s.key]?.e, s.key).toEqual(s.text.ja);
    }
  });
  it("触媒はクライアントにある種類で全部 (普通 13・精製 13)", () => {
    expect(CATALYST_SPECS.length).toBe(CATALYSTS.length * 2);
  });
  it("ルーン: 用語集 Augment", () => {
    expect((KW_EN as Record<string, { d: string }>).Augment!.d).toContain(RUNE_SPEC.text.en[0]);
    expect((KW_JA as Record<string, { d: string }>).Augment!.d).toContain(RUNE_SPEC.text.ja[0]);
  });
});

describe("説明文どおり (2026-10-16 に切り替えた時に変わった所)", () => {
  it("アーティフィサーをセプターに: 今は使える、新しい作りは説明文どおり使えない", () => {
    const sceptre = BASES.find((b) => statesOf(b, 82)[0]![1].cls.category.startsWith("Sceptre"))!;
    const item = statesOf(sceptre, 82)[3]![1];
    expect(applyCurrency(data, item, "artificer", mulberry32(1)).applied).toBe(false);
    expect(applyBySpec(data, item, "artificer", mulberry32(1))!.applied).toBe(false);
  });
  it("ルーンを予見 (ヒネコラの髪束) のアイテムに: 今は予見が残る、新しい作りは消える", () => {
    const item = { ...statesOf("Gold Ring", 82)[3]![1], foreseen: true };
    const wand = moreStatesOf(BASES.find((b) => statesOf(b, 82)[0]![1].cls.category.startsWith("Wand"))!, 82).find(([l]) => l === "予見 + ソケット 1")![1];
    const key = runeKeys("lesser").find((k) => applyCurrency(data, wand, k, mulberry32(1)).applied)!;
    expect(applyCurrency(data, wand, key, mulberry32(1)).item.foreseen).toBe(false);
    expect(applyBySpec(data, wand, key, mulberry32(1))!.item.foreseen).toBe(false);
    void item;
  });
});
