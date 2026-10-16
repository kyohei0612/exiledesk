/**
 * ADR-004 の 3 段目から (2026-10-16): オーブ類 (変成・増強・王者・錬金・高貴・カオス・神・フラクチャー、上級・完全の段も) を
 * 説明文の分解 (spec/orb-specs.ts) で打った結果 = 今の applyCurrency の結果か。
 * いくつものベース × 状態 × アイテムレベル × お告げ × 種で打ち比べる。違いは docs/reviews/2026-10-16-adr-004-orbs-diff.md に並べ、
 * どちらが正しいかを決めるまで「分かっている違い」としてここに置く (決まったら直して消す)
 */
import { describe, expect, it } from "vitest";
import { BASES, compare, data, moreStatesOf, reasonOnly, show, statesOf, type Diff } from "./helpers/spec-parity";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import { applyBySpec, ALL_OMEN_SPECS } from "../src/services/craft-stage/spec/run-spec";
import { ORB_OMEN_SPECS, ORB_SPECS } from "../src/services/craft-stage/spec/orb-specs";
import { OMEN_FOR, REMOVED_OMENS } from "../src/services/craft-stage/omens";
import { CURRENCY_FLOOR } from "../src/vendor/poe2htc/engine/types";
import HOVER_EN from "../src/i18n/currency-hover-en.json";
import HOVER_JA from "../src/i18n/currency-hover-ja.json";
import type { StageItem } from "../src/services/craft-stage/types";

/** 手の種類ごとに掛けるお告げの組 (今のゲームに無い物・関係の無い物も混ぜる) */
const OMENS_FOR: Record<string, string[][]> = {
  transmute: [[], ["OmenofLight"]],
  augment: [[]],
  regal: [[], ["OmenofSinistralCoronation"]],
  alchemy: [[], ["OmenofDextralAlchemy"]],
  exalt: [[], ["OmenofSinistralExaltation"], ["OmenofDextralExaltation"], ["OmenofGreaterExaltation"], ["OmenofCatalysingExaltation"], ["OmenofGreaterExaltation", "OmenofSinistralExaltation"], ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], ["OmenofWhittling"]],
  chaos: [[], ["OmenofWhittling"], ["OmenofSinistralErasure"], ["OmenofDextralErasure"], ["OmenofWhittling", "OmenofDextralErasure"], ["OmenofSinistralExaltation"]],
  divine: [[], ["OmenoftheBlessed"]],
  fracture: [[]],
};
const ILVLS = [35, 82];
const SEEDS = [1, 20261016];

/**
 * 弾いた一言だけが違う組 (どちらも打てない。決まりを見る順か、一言の詳しさだけ)。docs/reviews/2026-10-16-adr-004-orbs-diff.md の「一言だけ違う」
 */
const KNOWN_REASONS: readonly string[] = [
  // 1. 段の下限のアイテムレベルとレアリティの両方で打てない時: 今は下限が先、新しい作りは対象 (レアリティ) が先 (骨と同じ順)
  "アイテムレベルが 44 未満には使えない → ノーマルのアイテムにだけ使える",
  "アイテムレベルが 70 未満には使えない → ノーマルのアイテムにだけ使える",
  "アイテムレベルが 44 未満には使えない → マジックのアイテムにだけ使える",
  "アイテムレベルが 70 未満には使えない → マジックのアイテムにだけ使える",
  "アイテムレベルが 50 未満には使えない → マジックのアイテムにだけ使える",
  "アイテムレベルが 50 未満には使えない → レアのアイテムにだけ使える",
  // 2. 抹消のお告げの側に消せる物が無い: 今のカオスは共通の文、新しい作りは消去と同じくお告げの側と言う
  "外せる MOD が無い → お告げの側に外せる MOD が無い",
];

/** 分かっている違い (一言以外も違う)。どれもオーナーの確認待ち。ラベルを返す */
function knownDiff(_key: string, _item: StageItem, _omens: readonly string[], _d: readonly Diff[]): string | null {
  return null;
}

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
  it("お告げの掛かる手は今の棚 (OMEN_FOR) と同じ (今のゲームに無い物と聖別を除く)", () => {
    for (const kind of ["exalt", "chaos", "divine"]) {
      const mine = ALL_OMEN_SPECS.filter((o) => o.appliesTo === kind).map((o) => o.key).sort();
      const shelf = (OMEN_FOR[kind] ?? []).filter((o) => !REMOVED_OMENS.includes(o) && o !== "OmenofSanctification");
      expect(mine, kind).toEqual([...shelf].sort());
    }
  });
});

/** 1 種類のオーブを全部の状態で打ち比べ、違いをまとめる */
function sweep(kind: string): { n: number; hit: number; diffs: Diff[]; reasons: Map<string, number>; known: Map<string, number> } {
  const diffs: Diff[] = [];
  const reasons = new Map<string, number>();
  const known = new Map<string, number>();
  let n = 0, hit = 0;
  const keys = ORB_SPECS.filter((s) => s.kind === kind).map((s) => s.stageKey);
  for (const base of BASES) for (const ilvl of ILVLS) for (const [label, item] of [...statesOf(base, ilvl), ...moreStatesOf(base, ilvl)]) {
    for (const key of keys) for (const omens of OMENS_FOR[kind]!) for (const seed of SEEDS) {
      const a = applyCurrency(data, item, key, mulberry32(seed), omens, { legacy: true });
      const b = applyBySpec(data, item, key, mulberry32(seed), omens)!;
      n++;
      if (a.applied) hit++;
      const d: Diff[] = [];
      compare(`${base} Lv${ilvl} ${label} ${key} [${omens.join("+")}] 種 ${seed}`, a, b, d);
      if (!d.length) continue;
      const r = reasonOnly(d);
      if (r) { reasons.set(r, (reasons.get(r) ?? 0) + 1); continue; }
      const k = knownDiff(key, item, omens, d);
      if (k) known.set(k, (known.get(k) ?? 0) + 1);
      else diffs.push(...d);
    }
  }
  return { n, hit, diffs, reasons, known };
}

describe("打ち比べ: オーブ類の新しい作り = applyCurrency", () => {
  for (const kind of Object.keys(OMENS_FOR)) {
    it(kind, () => {
      const r = sweep(kind);
      console.log(`${kind}: ${r.n} 通り (打てた ${r.hit})、一言だけ違う ${JSON.stringify([...r.reasons])}、分かっている違い ${JSON.stringify([...r.known])}`);
      expect(r.diffs.length, show(r.diffs)).toBe(0);
      for (const k of r.reasons.keys()) expect(KNOWN_REASONS, `${kind}: 一言だけ違う組が増えた`).toContain(k);
    });
  }
});

describe("聖別のお告げが掛かる神は移していない (今の関数で打つ)", () => {
  it("applyBySpec は null", () => {
    const item = statesOf("Gold Ring", 82)[3]![1];
    expect(applyBySpec(data, item, "divine", mulberry32(1), ["OmenofSanctification"])).toBeNull();
  });
});
