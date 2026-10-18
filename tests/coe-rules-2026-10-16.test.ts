/**
 * Craft of Exile に合わせた決まり (2026-10-16、docs/reviews/2026-10-16-coe-rule-check.md の 1・2・5・10)。
 * 期待値は CoE beta の package_poe2.js (写し data-cache/coe-beta-package_poe2.js):
 *   1. poe2_desecrate: 両側が空いていれば randomNumber(0,2) で半々
 *   2. poe2_desecrate: 空きが無ければ annul() (固定以外の全部から等しく 1 つ) → 空いた側に付く
 *   4. 印がある時の骨: ネクロマンシーのお告げは使わない (オーナーの決め、2026-10-17)
 *   5. getRemovableModifiers: CoE は光と左右の消去が一緒に効くが、オーナーの決めで光を使う時は左右を使わない (2026-10-17)
 *   10. exaltedParams: 1 + 0.2 × 品質、20% を超えた分は 1% ごとに +0.12
 */
import { describe, expect, it } from "vitest";
import { loadPatch } from "./helpers/patch";
import { freshItem } from "../src/services/craft-stage/run-plan";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { allMods, room } from "../src/services/craft-stage/stage-core";
import { catalysingMultiplier } from "../src/services/htc/catalysing-multiplier";
import { mulberry32 } from "../src/services/htc/rng";
import type { StageItem } from "../src/services/craft-stage/types";

const data = loadPatch();
const ring = freshItem(data, "Gold Ring", 82);
/** 錬金で作ったレアのうち、条件に合う物を 1 つ */
function rareWhere(ok: (it: StageItem) => boolean): StageItem {
  for (let s = 1; s < 500; s++) {
    const it = applyCurrency(data, ring, "alchemy", mulberry32(s)).item;
    if (ok(it)) return it;
  }
  throw new Error("見つからない");
}
/** 高貴で枠いっぱいにする */
function full(it: StageItem): StageItem {
  let cur = it;
  for (let s = 1; s < 50 && (room(cur, "prefix") || room(cur, "suffix")); s++) cur = applyCurrency(data, cur, "exalt", mulberry32(1000 + s)).item;
  return cur;
}

describe("Craft of Exile に合わせた決まり (2026-10-16)", () => {
  it("1. 両側が空いている時、骨はプレ / サフィに半々", () => {
    const it = rareWhere((x) => room(x, "prefix") && room(x, "suffix"));
    let pre = 0;
    const N = 4000;
    for (let s = 0; s < N; s++) {
      const r = applyCurrency(data, it, "desecrate", mulberry32(s));
      expect(r.applied).toBe(true);
      if (r.added[0]!.side === "prefix") pre++;
    }
    expect(Math.abs(pre / N - 0.5)).toBeLessThan(0.03);
  });

  it("2. 両側が埋まったレアの骨は、固定以外の全部から等しく 1 つ消して、その側に付く", () => {
    const it = full(rareWhere(() => true));
    expect(room(it, "prefix") || room(it, "suffix")).toBe(false);
    const mods = allMods(it);
    const hits = new Map<string, number>();
    const N = 6000;
    for (let s = 0; s < N; s++) {
      const r = applyCurrency(data, it, "desecrate", mulberry32(s));
      expect(r.applied).toBe(true);
      const gone = r.removed[0]!;
      expect(r.added[0]!.side).toBe(gone.side);
      hits.set(gone.modId, (hits.get(gone.modId) ?? 0) + 1);
    }
    for (const m of mods) expect(Math.abs((hits.get(m.modId) ?? 0) / N - 1 / mods.length)).toBeLessThan(0.03);
  });

  it("5. 光のお告げを使う時、左右の消去のお告げは使わない (効かず、減らない。2026-10-17 オーナーが CoE と違う方に決めた)", () => {
    const it = rareWhere((x) => room(x, "suffix"));
    const bone = applyCurrency(data, it, "desecrate", mulberry32(1), ["OmenofDextralNecromancy"]);
    expect(bone.added[0]!.side).toBe("suffix");
    const left = applyCurrency(data, bone.item, "annul", mulberry32(2), ["OmenofLight", "OmenofSinistralAnnulment"]);
    expect(left.applied).toBe(true);
    expect(left.removed[0]!.desecrated).toBe(true);
    expect(left.omensUsed).toEqual(["OmenofLight"]);
  });

  it("4. 深淵の王の印がある時の骨は印と入れ替わり、左右のネクロマンシーのお告げは使わない (減らない。2026-10-17 オーナー)", async () => {
    const { essenceShelf } = await import("../src/state/craft-stage-shelf");
    const it = rareWhere((x) => room(x, "prefix") && room(x, "suffix"));
    const key = essenceShelf(data, it).find((g) => g.kind === "the Abyss")!.keys.find((k) => k.startsWith("essence:perfect:"))!;
    const marked = applyCurrency(data, it, key, mulberry32(3));
    expect(marked.applied, marked.reason).toBe(true);
    const mark = allMods(marked.item).find((m) => m.abyssMark)!;
    const other = mark.side === "prefix" ? "OmenofDextralNecromancy" : "OmenofSinistralNecromancy";
    const bone = applyCurrency(data, marked.item, "desecrate", mulberry32(4), [other]);
    expect(bone.applied, bone.reason).toBe(true);
    expect(bone.added[0]!.side).toBe(mark.side);
    expect(bone.omensUsed ?? []).not.toContain(other);
  });

  it("14. アルダーのルーンはクライアントの変換表 (耐性以外の行) の MOD だけを変える", async () => {
    const table = (await import("../src/data/element-conversions.json")).default as { rows: Array<{ res: boolean; fire?: { name: string; level: number } | null; cold?: { name: string; level: number } | null; lightning?: { name: string; level: number } | null }> };
    const fireTiers = new Set(table.rows.filter((r) => !r.res && r.fire).map((r) => `${r.fire!.name}|${r.fire!.level}`));
    const wand = freshItem(data, "Withered Wand", 82);
    let hits = 0;
    for (let s = 1; s < 300 && hits < 5; s++) {
      const rare = { ...applyCurrency(data, wand, "alchemy", mulberry32(s)).item, sockets: 1 };
      const r = applyCurrency(data, rare, "rune:Passion of Aldur", mulberry32(1));
      if (!r.applied) continue;
      hits++;
      for (const m of r.added) {
        const t = data.mods.get(m.modId)!.tiers[m.tierIndex]!;
        expect(fireTiers.has(`${t.name}|${t.ilvl}`)).toBe(true);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it("14 の続き: 表に無い耐性 (エッセンスで付けた物・ラップ専用の行) も、同じ数値の普通の MOD と同じに変わる (2026-10-17 オーナー「耐性は全部変わる、普通の MOD と同じ挙動」)", async () => {
    const { applyForce, forceKey } = await import("../src/services/craft-stage/apply-force");
    const amu = { ...freshItem(data, "Gold Amulet", 82), rarity: "rare" as const };
    const ess = applyForce(data, amu, forceKey("Amulets/Essence_FireResistance", null, "e"), () => 0.5);
    expect(ess.applied, ess.reason).toBe(true);
    const r = applyCurrency(data, ess.item, "flux_cold", mulberry32(1));
    expect(r.applied, r.reason).toBe(true);
    const cold = allMods(r.item).find((m) => /ColdResistance/.test(m.modId));
    expect(cold, "火耐性 (エッセンス) が冷気耐性に").toBeTruthy();
    expect(allMods(r.item).some((m) => /FireResistance/.test(m.modId))).toBe(false);
    // ラップ専用の火耐性 (Gloves_dex_int/Special_hand_wraps_FireResistance)
    const wf = applyForce(data, { ...freshItem(data, "Secured Wraps", 82), rarity: "rare" as const }, forceKey("Gloves_dex_int/Special_hand_wraps_FireResistance", null, "n"), () => 0.5);
    expect(wf.applied, wf.reason).toBe(true);
    const w = applyCurrency(data, wf.item, "flux_lightning", mulberry32(1));
    expect(w.applied, w.reason).toBe(true);
    expect(allMods(w.item).some((m) => /LightningResistance/.test(m.modId))).toBe(true);
  });

  // 2026-10-18 オーナー: 切り捨てに戻す (ゲームでは宝飾品のスキルレベル +3 が品質 34% でちょうど +4 になる = 33% では 3。四捨五入だと 17% で 4 になってしまう)。
  // 10-16 の「CoE 仕様 (Math.round)」のうち品質の丸めだけを上書き
  it("13. 品質で伸びた整数の値は切り捨て (スキルレベル +3 は品質 34% が境目で +4)", async () => {
    const { displayedValue, rawValue } = await import("../src/services/htc/quality");
    expect(displayedValue(3, 33)).toBe(3);
    expect(displayedValue(3, 34)).toBe(4);
    expect(displayedValue(3, 17)).toBe(3);
    expect(displayedValue(8, 20)).toBe(9);
    expect(displayedValue(10, 20)).toBe(12);
    expect(rawValue(4, 34)).toBe(3);
    expect(rawValue(12, 20)).toBe(10);
  });

  it("15. 深淵のエッセンスは未発現の冒涜 MOD があれば打てて印に入れ替わり、発現済みだと打てない (2026-10-16 オーナーがゲームで確認)", async () => {
    const { essenceShelf } = await import("../src/state/craft-stage-shelf");
    const { resolveEssence, ABYSS_ESSENCE_SPEC } = await import("../src/services/craft-stage/spec/essence-specs");
    const it = rareWhere((x) => room(x, "suffix"));
    const key = essenceShelf(data, it).flatMap((g) => g.keys).find((k) => resolveEssence(data, it, k)?.spec === ABYSS_ESSENCE_SPEC);
    expect(key).toBeTruthy();
    const bone = applyCurrency(data, it, "desecrate", mulberry32(1), ["OmenofDextralNecromancy"]);
    expect(allMods(bone.item).some((m) => m.desecrated)).toBe(true);
    const ess = applyCurrency(data, bone.item, key!, mulberry32(3));
    expect(ess.applied).toBe(true);
    expect(ess.removed.map((m) => m.modId)).toEqual(["unrevealed"]);
    expect(ess.added[0]!.side).toBe("suffix");
    const revealed = applyCurrency(data, bone.item, "reveal:1", mulberry32(4)).item;
    expect(allMods(revealed).some((m) => m.desecrated && !m.unrevealed)).toBe(true);
    expect(applyCurrency(data, revealed, key!, mulberry32(3)).applied).toBe(false);
  });

  it("10. 触媒の高貴の倍率は 1 + 0.2 × 品質、20% を超えた分は 1% ごとに +0.12", () => {
    expect(catalysingMultiplier(0)).toBe(1);
    expect(catalysingMultiplier(10)).toBeCloseTo(3);
    expect(catalysingMultiplier(20)).toBeCloseTo(5);
    expect(catalysingMultiplier(40)).toBeCloseTo(7.4);
  });
});
