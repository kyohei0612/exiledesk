/**
 * 火力の内訳 (services/pob-check/breakdown.ts): 式の鎖を掛け合わせると summary の数字になるか (2026-10-03 オーナー「出した数字を辿ればその数字になればクリア」)。
 * fixtures はヘッドレス PoB (src-tauri: cargo run --example pob_eval -- build.xml check.lua) で PCK.summary と PCK.breakdown を取った物
 * (自分 = オーナーの Stormweaver、相手 = タイの人。どちらも主スキルはライトニングワープ、2 つ目はアーク)。PoB そのものはここでは呼ばない
 */
import { describe, expect, it } from "vitest";
import { buildChain, modCondText, modStatText, modValueText, near, pobRound, sortMods, typeChain, type BreakdownRaw, type ModRow } from "../src/services/pob-check/breakdown";
import { pairSkills } from "../src/services/pob-check/build-diff";
import type { GameNumbers, SkillView } from "../src/services/pob-check/api";
import mine from "./fixtures/pob-breakdown-mine.json";
import thai from "./fixtures/pob-breakdown-thai.json";

interface Fixture {
  skills: Array<{ i: number; k: number; name: string; game: GameNumbers; pobDps: number; breakdown: BreakdownRaw }>;
}
const FIX: Array<[string, Fixture]> = [
  ["自分 (Stormweaver)", mine as unknown as Fixture],
  ["相手 (タイの人)", thai as unknown as Fixture],
];

describe("火力の内訳: 辿った掛け算が表の数字になる", () => {
  for (const [who, fix] of FIX) {
    for (const s of fix.skills) {
      it(`${who} / ${s.name}: 種類ごとの 1 発 → 平均の 1 発 → ヒットの DPS → 行の DPS`, () => {
        const c = buildChain(s.breakdown);
        expect(c.skill).toBe(s.name);
        // 種類ごと: 基礎 × (1 + 増加) × 増し (× その他) を本家と同じ丸めで → PoB の StoredHitAvg
        for (const h of c.hands) {
          for (const t of h.types) expect(t.ok, `${t.type}: ${t.value} vs ${t.pobValue}`).toBe(true);
          // 1 発 (非クリ) の和 = summary の hit、クリ = summary の crit
          expect(near(h.hit, s.game.hit, 0.001)).toBe(true);
          expect(near(h.crit, s.game.crit, 0.001)).toBe(true);
          expect(near(h.avg, s.game.avg, 0.001)).toBe(true);
          expect(h.speedChain.ok, `速さ ${h.speedChain.derived} vs ${h.speedChain.speed}`).toBe(true);
          expect(h.critChain.ok, `クリ率 ${h.critChain.raw} vs ${h.critChain.pre}`).toBe(true);
          expect(h.critMultChain.ok, `クリ倍率 ${h.critMultChain.derived} vs ${h.critMultChain.value}`).toBe(true);
        }
        // ヒットの DPS (ゲーム内の表記 = 敵側の倍率を入れない) と 行の DPS
        expect(c.okHit, `hit ${c.hitDps} vs ${c.hitDpsSummary}`).toBe(true);
        expect(c.okDps, `dps ${c.dps} vs ${c.dpsSummary}`).toBe(true);
        expect(c.mismatches).toEqual([]);
        // 敵込み (PoB の TotalDPS) は別に持つ。敵側の倍率が 1 でないので表の値より小さい
        expect(c.pobDps).toBe(s.pobDps);
        expect(c.pobDps).toBeLessThan(c.hitDps);
      });
    }
  }

  it("種類ごとの式は本家 calcDamage と同じ丸め (round してから allMult)。運の良いヒットは 1/3・2/3", () => {
    const base = {
      type: "Lightning", srcMin: 10, srcMax: 100, srcIsWeapon: false, bonusMin: 0, bonusMax: 0, addedMin: 0, addedMax: 0, addedMult: 1, baseMultiplier: 1,
      baseMin: 10, baseMax: 100, convMult: 1, summedMin: 10.4, summedMax: 100.6, inc: 50, more: 1.3, moreMin: 1, moreMax: 1, allMult: 1.2, lucky: 0, critLucky: 0,
      storedHit: 0, storedCrit: 0, hitAvg: 0, critAvg: 0, effMult: 1, incMods: [], moreMods: [], addedMods: [],
    };
    // min = round(10.4 × 1.5 × 1.3) × 1.2 = 20 × 1.2 = 24、max = round(100.6 × 1.95) × 1.2 = 196 × 1.2 = 235.2 → 平均 129.6
    const t = typeChain({ ...base, storedHit: 129.6 });
    expect(t.value).toBeCloseTo(129.6, 6);
    expect(t.ok).toBe(true);
    // 運の良いヒット: 24/3 + 2 × 235.2/3 = 164.8
    expect(typeChain({ ...base, lucky: 1 }).value).toBeCloseTo(164.8, 6);
    expect(pobRound(2.345, 2)).toBe(2.35);
  });

  it("MOD の行の日本語: 値 / 何に効くか / 条件", () => {
    const inc: ModRow = { value: 141, type: "INC", name: "Damage", flags: ["Spell"], source: "Item:9:x", src: { kind: "item", label: "x" }, tags: [] };
    expect(modValueText(inc)).toBe("+141%");
    expect(modStatText(inc)).toBe("スペルダメージ");
    const more: ModRow = { value: 30, type: "MORE", name: "Damage", flags: ["Hit"], source: "Skill:Support", src: { kind: "gem", label: "Execute III" }, tags: [{ t: "Condition", v: "LowLife" }] };
    expect(modValueText(more)).toBe("×1.30 (+30%)");
    expect(modStatText(more)).toBe("ダメージ");
    expect(modCondText(more)).toEqual(["低ライフ"]);
    const pc: ModRow = { value: 54, type: "MORE", name: "Damage", flags: [], source: "Skill:Pinnacle", src: { kind: "gem", label: "Pinnacle of Power" }, tags: [{ t: "Multiplier", v: "RemovablePowerCharge" }], pc: true };
    expect(modCondText(pc)).toEqual(["パワーチャージ 1 つごと"]);
    const ele: ModRow = { value: -10, type: "INC", name: "ElementalDamage", flags: ["Attack", "Wand"], source: "Tree:1", src: { kind: "tree", label: "n" }, tags: [] };
    expect(modValueText(ele)).toBe("−10%");
    expect(modStatText(ele)).toBe("アタックの元素ダメージ (ワンド)");
    const added: ModRow = { value: 5, type: "BASE", name: "FireMin", flags: [], source: "Item:1:x", src: { kind: "item", label: "x" }, tags: [], min: 5, max: 12 };
    expect(modValueText(added)).toBe("+5〜12");
    expect(modStatText(added)).toBe("火ダメージを追加");
    // 効きの大きい順
    expect(sortMods([inc, more, ele, pc]).map((m) => m.value)).toEqual([141, 54, 30, -10]);
  });

  it("実物の MOD の行に出所が付いている (ノード / ジェム / 装備の行)", () => {
    const b = (thai as unknown as Fixture).skills[0]!.breakdown;
    const rows = b.hands[0]!.types[0]!.incMods;
    expect(rows.some((m) => m.src.kind === "tree" && m.src.alloc)).toBe(true);
    const more = b.hands[0]!.types[0]!.moreMods;
    // Execute III はその組のサポート (オフにできる)、ピナクルオブパワーはパワーチャージの数で変わる
    expect(more.find((m) => m.src.label === "Execute III")).toMatchObject({ src: { kind: "gem", support: true, gj: expect.any(Number) } });
    expect(more.find((m) => m.src.label === "Pinnacle of Power")).toMatchObject({ pc: true });
    const speedRows = (mine as unknown as Fixture).skills[1]!.breakdown.hands[0]!.speed.incMods;
    expect(speedRows.find((m) => m.src.kind === "item")).toMatchObject({ line: "13% increased Cast Speed", src: { slot: expect.any(String) } });
  });
});

describe("スキルごとの比較 (相手との差)", () => {
  const game = (dps: number): GameNumbers => ({ hit: dps / 10, crit: dps / 5, critChance: 10, speed: 1, hitChance: 100, avg: dps / 8, dps, hitDps: dps, dot: 0, dotPob: 0, other: 0, cull: 0, minion: 0, enemyRatio: 1, parts: [], dualWield: false });
  const sv = (name: string, dps: number): SkillView => ({ k: 1, name, level: 20, triggered: false, game: game(dps), pobDps: dps });
  it("名前で突き合わせて 1 つの表に。片方だけのスキルも行に、高い順", () => {
    const mine = [{ key: "a|Arc", s: sv("Arc", 100) }, { key: "b|Spark", s: sv("Spark", 50) }, { key: "c|Blink", s: sv("Blink", 5) }];
    const target = [{ s: sv("Spark", 300) }, { s: sv("Arc", 80) }, { s: sv("Firestorm", 20) }];
    const rows = pairSkills(mine, target);
    expect(rows.map((r) => [r.name, r.mine?.key ?? null, r.target?.game.dps ?? null])).toEqual([
      ["Spark", "b|Spark", 300],
      ["Arc", "a|Arc", 80],
      ["Firestorm", null, 20],
      ["Blink", "c|Blink", null],
    ]);
  });
  it("同じ名前が 2 つ (CoEA のアーク×2 など) は順に合わせる", () => {
    const mine = [{ key: "a|Arc", s: sv("Arc", 100) }, { key: "a|Arc#2", s: sv("Arc", 90) }];
    const target = [{ s: sv("Arc", 300) }];
    const rows = pairSkills(mine, target);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ mine: { key: "a|Arc" }, target: { game: { dps: 300 } } });
    expect(rows[1]).toMatchObject({ mine: { key: "a|Arc#2" }, target: null });
  });
});
