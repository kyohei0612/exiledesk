/**
 * エンジンの決まりの歯止め (設計図 docs/spec/engine.md の番号をテストの名前の頭に書く。G-29b の「決まり → 見張り」の表 = pnpm check:spec-guards が拾う)。
 * 決まりを壊したら落ちる見張りで、合格の材料ではない (G-22。外の正解は設計図の各項目の欄)。
 * ほかのファイルにある分: E-11c = craft-stage-floor、E-32・E-72 = coe-rules-2026-10-16、E-41 = desecrated-fracture
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { forceKey } from "../src/services/craft-stage/apply-force";
import { allMods, room } from "../src/services/craft-stage/stage-core";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { infiniteChoices, isInfiniteEssence } from "../src/services/craft-stage/apply-essence";
import { SANCTIFY_MAX, SANCTIFY_MIN, sanctifyChanceAtLeast } from "../src/services/craft-stage/apply-vaal";
import { factionCandidates } from "../src/services/craft-stage/spec/parts-unrevealed";
import { FACTION_TAG, omenFor } from "../src/services/craft-stage/spec/omen-layer";
import { OMEN_KEY } from "../src/services/craft-stage/spec/omen-keys";
import { ESSENCE_KEYS } from "../src/services/htc/essence-key-table";
import { mulberry32 } from "../src/services/htc/rng";
import baseRows from "../src/services/htc/base-rows.json";
import type { StageItem, StageSide } from "../src/services/craft-stage/types";

const data = loadPatch();
const A = (item: StageItem, key: string, seed: number, omens: string[] = []) => applyCurrency(data, item, key, mulberry32(seed), omens);
const ring = freshItem(data, "Gold Ring", 82);
/** 錬金で作ったレアの指輪のうち、条件に合う物を 1 つ */
function rareRing(ok: (it: StageItem) => boolean): StageItem {
  for (let s = 1; s < 500; s++) {
    const it = A(ring, "alchemy", s).item;
    if (ok(it)) return it;
  }
  throw new Error("見つからない");
}
const SIDES: StageSide[] = ["prefix", "suffix"];

describe("エンジンの決まり (設計図の番号)", () => {
  it("E-11b: 段のレベルがアイテムレベルを超える一般 MOD は付かない (ジュエル以外の全部の行 × アイテムレベル 3 つ、錬金で付く MOD)", () => {
    const firstBase = new Map<string, string>();
    for (const [name, row] of Object.entries(baseRows as Record<string, string>)) if (!firstBase.has(row)) firstBase.set(row, name);
    let checked = 0;
    const rows = new Set<string>();
    for (const [row, base] of firstBase) {
      // 例外: ジュエルはアイテムレベルを見ない (E-11b の例外の行)
      if (/^Jewels/.test(row)) continue;
      for (const ilvl of [12, 45, 70]) {
        const it0 = freshItem(data, base, ilvl);
        for (let s = 1; s <= 6; s++) {
          const r = A(it0, "alchemy", s);
          if (!r.applied) continue;
          for (const m of allMods(r.item)) {
            expect(m.modLevel, `${base} (${row}) アイテムレベル ${ilvl}: ${m.modId}`).toBeLessThanOrEqual(ilvl);
            checked++;
          }
          rows.add(row);
        }
      }
    }
    // 回らなかったのに通った、を良いと数えない
    expect(rows.size).toBeGreaterThan(40);
    expect(checked).toBeGreaterThan(2000);
  });

  it("E-31: 大いなる高貴のお告げは 2 つ付ける。空きが 1 つなら 1 つだけ、空きが無ければ打てない", () => {
    const open = (it: StageItem): number => 6 - allMods(it).length;
    const two = rareRing((x) => open(x) === 2);
    let one = two;
    for (let s = 1; s < 50 && open(one) !== 1; s++) one = A(two, "exalt", s).item;
    let none = one;
    for (let s = 1; s < 50 && open(none) !== 0; s++) none = A(one, "exalt", s).item;
    expect([open(two), open(one), open(none)]).toEqual([2, 1, 0]);
    for (let s = 1; s <= 40; s++) {
      const r2 = A(two, "exalt", s, [OMEN_KEY.greater]);
      expect(r2.applied).toBe(true);
      expect(r2.added).toHaveLength(2);
      const r1 = A(one, "exalt", s, [OMEN_KEY.greater]);
      expect(r1.applied).toBe(true);
      expect(r1.added).toHaveLength(1);
    }
    expect(A(none, "exalt", 1, [OMEN_KEY.greater]).applied).toBe(false);
  });

  it("E-35: 聖別の倍率は 0.78〜1.22 の 0.01 刻み 45 段、× 1.10 以上は 13/45", () => {
    expect([SANCTIFY_MIN, SANCTIFY_MAX]).toEqual([78, 122]);
    expect(sanctifyChanceAtLeast(0.78)).toBe(1);
    expect(sanctifyChanceAtLeast(1.1)).toBeCloseTo(13 / 45, 10);
    expect(sanctifyChanceAtLeast(1.22)).toBeCloseTo(1 / 45, 10);
    expect(sanctifyChanceAtLeast(1.23)).toBe(0);
  });

  it("E-11g: 左のお告げはプレフィックス、右のお告げはサフィックスに、その手の側を決める (高貴・消去・抹消・ネクロマンシー)", () => {
    const it0 = rareRing((x) => x.prefixes.length === 2 && x.suffixes.length === 2);
    const kinds = [
      { kind: "exalt", key: "exalt", sideOf: (r: ReturnType<typeof A>) => r.added[0]!.side },
      { kind: "annul", key: "annul", sideOf: (r: ReturnType<typeof A>) => r.removed[0]!.side },
      { kind: "chaos", key: "chaos", sideOf: (r: ReturnType<typeof A>) => r.removed[0]!.side },
      { kind: "desecrate", key: "desecrate", sideOf: (r: ReturnType<typeof A>) => r.added[0]!.side },
    ];
    for (const k of kinds) for (const side of SIDES) {
      const omen = omenFor(k.kind, side);
      expect(omen, `${k.kind} の ${side} のお告げ`).toBeTruthy();
      let hit = 0;
      for (let s = 1; s <= 40; s++) {
        const r = A(it0, k.key, s, [omen!]);
        if (!r.applied) continue;
        expect(k.sideOf(r), `${omen} seed ${s}`).toBe(side);
        hit++;
      }
      expect(hit, `${omen} が 1 回も打てていない`).toBeGreaterThan(20);
    }
  });

  it("E-50: 無限のエッセンスは筋力・器用さ・知性のうち付いていない系統から等しく 1 つ。全部付いていれば候補なし", () => {
    const amu = { ...freshItem(data, "Gold Amulet", 82), rarity: "magic" as const };
    const key = Object.keys(ESSENCE_KEYS).find((k) => k.startsWith("essence:greater:Amulets/") && isInfiniteEssence(k))!;
    expect(key).toBeTruthy();
    const three = infiniteChoices(data, amu, key);
    expect(three).toHaveLength(3);
    // 等しく: 打った結果が 3 つにほぼ 1/3 ずつ
    const got = new Map<string, number>();
    const N = 900;
    for (let s = 1; s <= N; s++) {
      const r = A(amu, key, s);
      expect(r.applied, r.reason).toBe(true);
      const id = r.added[0]!.modId;
      got.set(id, (got.get(id) ?? 0) + 1);
    }
    expect([...got.keys()].sort()).toEqual(three.map((c) => c.mod.id).sort());
    for (const n of got.values()) expect(Math.abs(n / N - 1 / 3)).toBeLessThan(0.06);
    // 付いている系統は候補から外れる (どの付け方で付いた物も数える = 普通の MOD で塞ぐ)
    const normalOf = (family: string): string => [...data.mods.values()].find((m) => m.id.startsWith("Amulets/") && m.source === "normal" && m.family === family)!.id;
    const fams = three.map((c) => c.mod.family);
    const withOne = A(freshItem(data, "Gold Amulet", 82), forceKey(normalOf(fams[0]!), null, "n"), 1);
    expect(withOne.applied, withOne.reason).toBe(true);
    const two = infiniteChoices(data, withOne.item, key);
    expect(two.map((c) => c.mod.family).sort()).toEqual(fams.slice(1).sort());
    let all: StageItem = { ...withOne.item, rarity: "rare" };
    for (const f of fams.slice(1)) { const r = A(all, forceKey(normalOf(f), null, "n"), 1); expect(r.applied, r.reason).toBe(true); all = r.item; }
    expect(infiniteChoices(data, all, key)).toHaveLength(0);
  });

  it("E-66: 勢力のお告げを掛けた骨の発現は、候補 3 つとも勢力の MOD (足りない分だけ一般 MOD)", () => {
    const it0 = rareRing((x) => room(x, "prefix") && room(x, "suffix"));
    expect(Object.keys(FACTION_TAG)).toHaveLength(3);
    for (const [omen, tag] of Object.entries(FACTION_TAG)) {
      let seen = 0;
      for (let s = 1; s <= 200; s++) {
        const bone = A(it0, "desecrate", s, [omen]);
        expect(bone.applied, bone.reason).toBe(true);
        const hidden = allMods(bone.item).find((m) => m.unrevealed)!;
        // その側に出うる勢力の MOD の数 (発現の候補と同じ置き場)
        const can = factionCandidates(data, bone.item, tag).filter((c) => c.side === hidden.side).length;
        const offers = revealOffers(data, bone.item, mulberry32(1000 + s)).first;
        expect(offers).toHaveLength(3);
        const fac = offers.filter((m) => data.mods.get(m.modId)!.tags.includes(tag)).length;
        expect(fac, `${omen} seed ${s} (${hidden.side}、勢力の MOD ${can} 個)`).toBe(Math.min(3, can));
        if (can >= 3) seen++;
      }
      expect(seen, `${omen}: 勢力の MOD が 3 つ以上ある側で 1 回も試せていない`).toBeGreaterThan(0);
    }
  });
});
