// エッセンスで付けた MOD と同じ系統は、後から骨・高貴などで付かない (2026-10-11 要望 743781f1、オーナー「同じやつやろ、つくわけないやん」)。
// 逆 (普通の MOD があるところにエッセンス) は付く (poe.ninja の実物、エンジンの familiesOf の注)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadPatch } from "./helpers/patch";
import { applyCurrency } from "../src/services/craft-stage/apply-currency";
import { playPlan } from "../src/services/craft-stage/run-plan";
import { revealOffers } from "../src/services/craft-stage/apply-desecrate";
import { heldOdds } from "../src/services/craft-stage/held-odds";
import { mulberry32 } from "../src/services/htc/rng";

const data = loadPatch();
const plan = JSON.parse(readFileSync("tests/fixtures/plan-essence-crit-spear.json", "utf8"));
const { final } = playPlan(data, plan, {});
const CRIT = "CriticalStrikeChanceIncrease";
const famOf = (id: string) => { const m = data.mods.get(id); return m?.families ?? (m?.family ? [m.family] : []); };

describe("エッセンスの MOD は同じ系統を塞ぐ", () => {
  it("報告の槍: エッセンスのクリティカルヒット率がある", () => {
    expect([...final.prefixes, ...final.suffixes].some((m) => m.modId.includes("Essence_CriticalStrikeChanceIncrease"))).toBe(true);
  });
  it("発現の候補にクリティカルヒット率の系統が出ない", () => {
    for (let s = 1; s <= 300; s++) for (const o of revealOffers(data, final, mulberry32(s)).first) expect(famOf(o.modId)).not.toContain(CRIT);
  });
  it("確率表にも出ない", () => {
    const pre = { ...final, suffixes: final.suffixes.filter((m) => !m.unrevealed) };
    const h = heldOdds(data, pre, "desecrate", []);
    for (const id of h?.byMod.keys() ?? []) expect(famOf(id)).not.toContain(CRIT);
  });
  it("高貴でも付かない", () => {
    const pre = { ...final, suffixes: final.suffixes.filter((m) => !m.unrevealed) };
    for (let s = 1; s <= 200; s++) {
      const r = applyCurrency(data, pre, "exalt", mulberry32(s), []);
      for (const m of r.added ?? []) expect(famOf(m.modId)).not.toContain(CRIT);
    }
  });
});
