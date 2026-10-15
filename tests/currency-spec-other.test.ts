/**
 * ADR-004 の 4 段目 (2026-10-16): 品質のカレンシー (砥石・端材・飾り玉・プリズム・彫刻針)・触媒 (普通・精製)・アーティフィサー・ルーンを
 * 説明文の分解 (spec/other-specs.ts) で打った結果 = 今の applyCurrency の結果か。
 * 違いは docs/reviews/2026-10-16-adr-004-orbs-diff.md の「品質・触媒・ルーン」
 */
import { describe, expect, it } from "vitest";
import { BASES, compare, data, moreStatesOf, reasonOnly, show, statesOf, type Diff } from "./helpers/spec-parity";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { mulberry32 } from "../src/services/htc/rng";
import { applyBySpec } from "../src/services/craft-stage/spec/run-spec";
import { ARTIFICER_SPEC, CATALYST_SPECS, QUALITY_SPECS, RUNE_SPEC } from "../src/services/craft-stage/spec/other-specs";
import { CATALYSTS } from "../src/services/htc/quality";
import { runeKeys } from "../src/services/craft-stage/stage-runes";
import { inGroup } from "../src/services/mods/item-classes";
import type { StageItem } from "../src/services/craft-stage/types";
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

/** 弾いた一言だけが違う組。docs/reviews/2026-10-16-adr-004-orbs-diff.md の「品質・触媒・ルーン」 */
const KNOWN_REASONS: readonly string[] = [];
/** 分かっている違い (一言以外も違う)。オーナーの確認待ち */
function knownDiff(key: string, item: StageItem): string | null {
  // アーティフィサーをセプターに: 今は使える (武器全部)、新しい作りは使えない (説明文「Martial Weapon, wand, staff or Armour」)
  if (key === "artificer" && inGroup(item.cls.category, "caster") && !inGroup(item.cls.category, "wandStaff")) return "アーティフィサー + セプター";
  // ルーンを予見のアイテムに: 今は予見が残る、新しい作りは消える (説明文「アイテムを変えると消える」)
  if (key.startsWith("rune:") && item.foreseen) return "ルーン + 予見";
  return null;
}

const SEEDS = [1, 20261016];
const QUALITY_KEYS = QUALITY_SPECS.map((s) => s.stageKey);
const CATALYST_KEYS = CATALYST_SPECS.map((s) => s.stageKey);
/** ルーンは段ごとに数個 + 傑作のルーン + ソケットの番号つき */
const RUNE_KEYS = [
  ...runeKeys("lesser").slice(0, 3), ...runeKeys("greater").slice(0, 2), ...runeKeys("special"), ...runeKeys(undefined, "soulcore").slice(0, 3), ...runeKeys(undefined, "talisman").slice(0, 2),
  "rune:Masterwork Rune", `${runeKeys("normal")[0]}@1`, `${runeKeys("normal")[0]}@3`,
];

function sweep(keys: readonly string[], oneCatalyst = false): { n: number; hit: number; diffs: Diff[]; reasons: Map<string, number>; known: Map<string, number> } {
  const diffs: Diff[] = [];
  const reasons = new Map<string, number>();
  const known = new Map<string, number>();
  let n = 0, hit = 0;
  const runes = keys.some((k) => k.startsWith("rune:"));
  for (const base of BASES) for (const [label, item] of [...statesOf(base, 82), ...moreStatesOf(base, 82)]) {
    // ルーンはソケットの無い状態ではどれも同じ理由で弾かれるので、ソケットのある状態と 1 つだけ
    if (runes && !item.sockets && label !== "レア 4 つ") continue;
    for (const key of keys) for (const seed of SEEDS) {
      const a = applyCurrency(data, item, key, mulberry32(seed), [], { oneCatalyst });
      const b = applyBySpec(data, item, key, mulberry32(seed), [], { oneCatalyst })!;
      n++;
      if (a.applied) hit++;
      const d: Diff[] = [];
      compare(`${base} ${label} ${key} 種 ${seed}`, a, b, d);
      if (!d.length) continue;
      const k = knownDiff(key, item);
      const r = k ? null : reasonOnly(d);
      if (k) known.set(k, (known.get(k) ?? 0) + 1);
      else if (r) reasons.set(r, (reasons.get(r) ?? 0) + 1);
      else diffs.push(...d);
    }
  }
  return { n, hit, diffs, reasons, known };
}

describe("打ち比べ: 新しい作り = applyCurrency (品質・触媒・アーティフィサー・ルーン)", () => {
  const cases: Array<[string, readonly string[], boolean]> = [
    ["品質", QUALITY_KEYS, false],
    ["触媒 (手で打つ = 上限まで)", CATALYST_KEYS, false],
    ["触媒 (手順の再生 = 1 個)", CATALYST_KEYS, true],
    ["アーティフィサー", ["artificer"], false],
    ["ルーン", RUNE_KEYS, false],
  ];
  for (const [name, keys, one] of cases) {
    it(name, () => {
      const r = sweep(keys, one);
      console.log(`${name}: ${r.n} 通り (打てた ${r.hit})、一言だけ違う ${JSON.stringify([...r.reasons])}、分かっている違い ${JSON.stringify([...r.known])}`);
      expect(r.diffs.length, show(r.diffs)).toBe(0);
      for (const k of r.reasons.keys()) expect(KNOWN_REASONS, `${name}: 一言だけ違う組が増えた`).toContain(k);
    });
  }
});

describe("分かっている違い (オーナーの確認待ち)", () => {
  it("アーティフィサーをセプターに: 今は使える、新しい作りは説明文どおり使えない", () => {
    const sceptre = BASES.find((b) => statesOf(b, 82)[0]![1].cls.category.startsWith("Sceptre"))!;
    const item = statesOf(sceptre, 82)[3]![1];
    expect(applyCurrency(data, item, "artificer", mulberry32(1)).applied).toBe(true);
    expect(applyBySpec(data, item, "artificer", mulberry32(1))!.applied).toBe(false);
  });
  it("ルーンを予見 (ヒネコラの髪束) のアイテムに: 今は予見が残る、新しい作りは消える", () => {
    const item = { ...statesOf("Gold Ring", 82)[3]![1], foreseen: true };
    const wand = moreStatesOf(BASES.find((b) => statesOf(b, 82)[0]![1].cls.category.startsWith("Wand"))!, 82).find(([l]) => l === "予見 + ソケット 1")![1];
    const key = runeKeys("lesser").find((k) => applyCurrency(data, wand, k, mulberry32(1)).applied)!;
    expect(applyCurrency(data, wand, key, mulberry32(1)).item.foreseen).toBe(true);
    expect(applyBySpec(data, wand, key, mulberry32(1))!.item.foreseen).toBe(false);
    void item;
  });
});
