/**
 * ADR-004 の 3 段目から (2026-10-16): オーブ類 (変成・増強・王者・錬金・高貴・カオス・神・フラクチャー、上級・完全の段も) を
 * 説明文の分解 (spec/orb-specs.ts) で打った結果 = 今の applyCurrency の結果か。
 * いくつものベース × 状態 × アイテムレベル × お告げ × 種で打ち比べる。違いは docs/archive/2026-10-16-adr-004-orbs-diff.md に並べ、
 * どちらが正しいかを決めるまで「分かっている違い」としてここに置く (決まったら直して消す)
 */
import { describe, expect, it } from "vitest";
import { data, statesOf } from "./helpers/spec-parity";
import { mulberry32 } from "../src/services/htc/rng";
import { applyBySpec, ALL_OMEN_SPECS } from "../src/services/craft-stage/spec/run-spec";
import { ORB_OMEN_SPECS, ORB_SPECS } from "../src/services/craft-stage/spec/orb-specs";
import { OMEN_FOR, REMOVED_OMENS } from "../src/services/craft-stage/omens";
import { CURRENCY_FLOOR } from "../src/vendor/poe2htc/engine/types";
import HOVER_EN from "../src/i18n/currency-hover-en.json";
import HOVER_JA from "../src/i18n/currency-hover-ja.json";

describe("説明文はクライアントの写しと同じ (オーブ類)", () => {
  const en = HOVER_EN as Record<string, { e: string[] }>;
  const ja = HOVER_JA as Record<string, { e: string[] }>;
  it("オーブ (普通・上級・完全)", () => {
    for (const s of ORB_SPECS) {
      expect(en[s.key]?.e, s.key).toEqual(s.text.en);
      expect(ja[s.key]?.e, s.key).toEqual(s.text.ja);
    }
  });
  it("お告げ", () => {
    for (const o of ORB_OMEN_SPECS) {
      expect(en[o.hover]?.e, o.key).toEqual(o.text.en);
      expect(ja[o.hover]?.e, o.key).toEqual(o.text.ja);
    }
  });
  it("上級・完全の段の下限 = エンジンの CURRENCY_FLOOR (poe2db の Minimum Modifier Level)", () => {
    for (const [kind, t] of Object.entries(CURRENCY_FLOOR)) {
      for (const s of ["greater", "perfect"] as const) {
        const spec = ORB_SPECS.find((x) => x.stageKey === `${kind}_${s}`)!;
        expect(spec.limits, spec.stageKey).toContainEqual({ kind: "itemLevelAtLeast", level: t[s] });
      }
    }
  });
  it("お告げの掛かる手は今の棚 (OMEN_FOR) と同じ (今のゲームに無い物を除く)", () => {
    for (const kind of ["exalt", "chaos", "divine"]) {
      const mine = ALL_OMEN_SPECS.filter((o) => o.appliesTo === kind).map((o) => o.key).sort();
      const shelf = (OMEN_FOR[kind] ?? []).filter((o) => !REMOVED_OMENS.includes(o));
      expect(mine, kind).toEqual([...shelf].sort());
    }
  });
});

describe("聖別のお告げが掛かる神も説明文の分解で打つ (2026-10-17 ADR-004 の残り)", () => {
  it("applyBySpec で聖別になり、お告げを使う", () => {
    const item = statesOf("Gold Ring", 82)[3]![1];
    const r = applyBySpec(data, item, "divine", mulberry32(1), ["OmenofSanctification"]);
    expect(r?.applied, r?.reason).toBe(true);
    expect(r!.item.sanctified).toBe(true);
    expect(r!.omensUsed).toEqual(["OmenofSanctification"]);
  });
});
