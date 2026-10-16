/**
 * ADR-004 の 4 段目 (2026-10-16): エッセンス (レッサー / 普通 / グレーター・パーフェクト・ブリーチ・深淵・ヒステリーなど) を
 * 説明文の分解 (spec/essence-specs.ts) で打った結果 = 今の applyCurrency の結果か。
 * 説明文は全部のエッセンスの鍵 (essence-key-table) で、クライアントの currency-hover の文と同じか確かめる。
 * 違いは docs/reviews/2026-10-16-adr-004-orbs-diff.md の「エッセンス」
 */
import { describe, expect, it } from "vitest";
import { BASES, compare, data, moreStatesOf, reasonOnly, show, statesOf, type Diff } from "./helpers/spec-parity";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
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

/** 弾いた一言だけが違う組。docs/reviews/2026-10-16-adr-004-orbs-diff.md の「エッセンス」 */
const KNOWN_REASONS: readonly string[] = [
  // 1. クラフト MOD が埋まっていてレアリティも合わない: 今はクラフト MOD が先、新しい作りは対象 (レアリティ) が先
  "エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で増える) → マジックのアイテムにだけ使える (レアにはパーフェクト)",
  // 2. 結晶化のお告げの側に消せる物が無い: 今は共通の文、新しい作りは消去・カオスと同じくお告げの側と言う
  "外せる MOD が無い → お告げの側に外せる MOD が無い",
];
/** 分かっている違い (一言以外も違う)。オーナーの確認待ち */
function knownDiff(key: string, omens: readonly string[]): string | null {
  // 合金に結晶化のお告げ: 今は掛かる (お告げを食って側を絞る)、新しい作りは掛からない (説明文「Perfect or Corrupted Essence」)
  if (isAlloyKey(key) && omens.some((o) => /Crystallisation$/.test(o))) return "合金 + 結晶化のお告げ";
  return null;
}

const PERFECT_OMENS: string[][] = [[], ["OmenofSinistralCrystallisation"], ["OmenofDextralCrystallisation"], ["OmenofLight"]];
const NORMAL_OMENS: string[][] = [[], ["OmenofDextralCrystallisation"]];
const SEEDS = [1, 20261016];
/** 別の部位のエッセンス (このベースには付かない) も混ぜる */
const OTHER_KEYS = ["essence:breach", "essence:greater:Bows/Essence_PhysicalDamage", "essence:perfect:Bows/PerfectEssence_MartialWeaponGainedDamage"];

describe("打ち比べ: エッセンスの新しい作り = applyCurrency", () => {
  for (const group of ["普通", "パーフェクト"] as const) {
    it(group, () => {
      const diffs: Diff[] = [];
      const reasons = new Map<string, number>();
      const known = new Map<string, number>();
      let n = 0, hit = 0;
      for (const base of BASES) for (const ilvl of [82]) for (const [label, item] of [...statesOf(base, ilvl), ...moreStatesOf(base, ilvl)]) {
        const keys = [...new Set([...essenceShelf(data, item).flatMap((g) => g.keys), ...OTHER_KEYS])]
          .filter((k) => (essenceLevelOfKey(k) === "perfect") === (group === "パーフェクト"));
        for (const key of keys) for (const omens of group === "パーフェクト" ? PERFECT_OMENS : NORMAL_OMENS) for (const seed of SEEDS) {
          const a = applyCurrency(data, item, key, mulberry32(seed), omens, { legacy: true });
          const b = applyBySpec(data, item, key, mulberry32(seed), omens)!;
          n++;
          if (a.applied) hit++;
          const d: Diff[] = [];
          compare(`${base} ${label} ${key} [${omens.join("+")}] 種 ${seed}`, a, b, d);
          if (!d.length) continue;
          const k = knownDiff(key, omens);
          const r = k ? null : reasonOnly(d);
          if (k) known.set(k, (known.get(k) ?? 0) + 1);
          else if (r) reasons.set(r, (reasons.get(r) ?? 0) + 1);
          else diffs.push(...d);
        }
      }
      console.log(`エッセンス (${group}): ${n} 通り (打てた ${hit})、一言だけ違う ${JSON.stringify([...reasons])}、分かっている違い ${JSON.stringify([...known])}`);
      expect(diffs.length, show(diffs)).toBe(0);
      for (const k of reasons.keys()) expect(KNOWN_REASONS, `一言だけ違う組が増えた`).toContain(k);
    });
  }
});

describe("分かっている違い (オーナーの確認待ち)", () => {
  it("合金に結晶化のお告げ: 今は掛かって食う、新しい作りは掛からない (説明文「Perfect or Corrupted Essence」)", () => {
    let seen = 0;
    for (const base of BASES) {
      const item = statesOf(base, 82).find(([l]) => l === "レア 満杯")?.[1];
      if (!item) continue;
      for (const key of essenceShelf(data, item).flatMap((g) => g.keys).filter(isAlloyKey)) {
        const a = applyCurrency(data, item, key, mulberry32(1), ["OmenofSinistralCrystallisation"], { legacy: true });
        const b = applyBySpec(data, item, key, mulberry32(1), ["OmenofSinistralCrystallisation"])!;
        if (a.applied) expect(a.omensUsed).toEqual(["OmenofSinistralCrystallisation"]);
        if (b.applied) expect(b.omensUsed).toEqual([]);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
});
