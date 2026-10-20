/**
 * _sim-formula-probe.test.ts — ③ の式 (手 4) の 1 手の確率を、前 (自前の modTierWeight・× 3) と後 (エンジンの入口、sim-odds.ts) と
 * エンジンで実際に打った結果 (applyCurrency を N 回) で並べる台本 (2026-10-20 シミュ部長)。
 *
 *   pnpm exec vitest run -c scripts/_sim-probe.config.ts
 *
 * 見本は scripts/analysis/check-auto-order.mjs と同じ手袋 (やふやふ、マナ T1 固定) と靴 (移動速度を固定)。
 */
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { applyCurrency, freshItem, CURRENCY_FLOOR, modTierWeight, withRunes, effectiveCls, mulberry32, type StageItem, type StageMod } from "../src/services/craft-stage/engine";
import { keepCompare } from "../src/services/simulator/keep-compare";
import { methodOfTarget, type SimTargetIn } from "../src/services/simulator/quiz-build";
import { runeEnForId } from "../src/services/simulator/pattern";
import * as SO from "../src/services/simulator/sim-odds";

const N = Number(process.env.N ?? 20000);
const data = loadPatch();
const top = (id: string): number => data.mods.get(id)!.tiers.length - 1;
const PRICES: Record<string, number> = { exalt: 1, chaos: 73.097, chaos_greater: 215.018, chaos_perfect: 5420.49, annul: 316.796, augment: 1, augment_greater: 5, augment_perfect: 60, fracture: 8166.06 };
const price = (k: string): number => PRICES[k] ?? 0;

function gloves() {
  const ID = (s: string) => `Gloves_int/${s}`;
  const MN = ID("IncreasedMana"), ES = ID("LocalEnergyShield"), SPD = ID("Rune_marksman_ProjectileSpeed"), PROJ = ID("Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level");
  const CRIT = ID("CriticalStrikeMultiplier"), AS = ID("IncreasedAttackSpeed");
  const t3 = (id: string) => Math.max(0, top(id) - 2);
  const targets: SimTargetIn[] = [
    { modId: MN, minTierIndex: top(MN), method: "fracture" }, { modId: SPD, minTierIndex: 0, method: "desecrate" },
    { modId: ES, minTierIndex: t3(ES), method: "exalt" }, { modId: PROJ, minTierIndex: t3(PROJ), method: "chaos" },
    { modId: CRIT, minTierIndex: t3(CRIT), method: "chaos" }, { modId: AS, minTierIndex: t3(AS), method: "chaos" },
  ];
  return { name: "手袋 Intricate Gloves", base: "Intricate Gloves", targets };
}
function boots() {
  const B = (s: string) => `Boots_str/${s}`;
  const MS = B("Rune_chronomancy_MovementVelocity"), DODGE = B("Rune_chronomancy_DodgeRoll"), SPIRIT = B("PerfectEssence_BaseSpirit");
  const RES = ["LightningResistance", "FireResistance", "ColdResistance"].map(B);
  const targets: SimTargetIn[] = [
    { modId: MS, minTierIndex: 2, method: "fracture" },
    { modId: RES[0]!, minTierIndex: top(RES[0]!), method: "chaos", alts: RES.slice(1).map((id) => ({ modId: id, minTierIndex: top(id) })), need: 2 },
    { modId: SPIRIT, minTierIndex: 0, method: "essence" }, { modId: DODGE, minTierIndex: 0, method: "desecrate" },
  ];
  return { name: "靴 Vaal Greaves", base: "Vaal Greaves", targets };
}

const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : String(x));
const membersOf = (t: SimTargetIn) => [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
const sideOf = (id: string) => (data.mods.get(id)?.type === "suffix" ? "suffix" : "prefix") as "prefix" | "suffix";
const hits = (m: StageMod, ts: ReadonlyArray<{ modId: string; minTierIndex: number }>) => ts.some((t) => t.modId === m.modId && m.tierIndex >= t.minTierIndex);
const allOf = (x: StageItem) => [...x.prefixes, ...x.suffixes];

it("③ の式の 1 手の確率: 前 / 後 / エンジン", () => {
  const rng = mulberry32(20261020);
  for (const s of [gloves(), boots()]) {
    const IL = 82;
    const it0 = freshItem(data, s.base, IL);
    const frac = s.targets.filter((t) => methodOfTarget(data, t) === "fracture").flatMap(membersOf);
    const fracSide = sideOf(frac[0]!.modId), otherSide = fracSide === "prefix" ? "suffix" : "prefix";
    const allT = s.targets.flatMap(membersOf);
    console.log(`\n==== ${s.name} (ilvl ${IL}) フラクチャーの狙い ${frac.map((f) => f.modId).join(",")} (${fracSide})`);
    // 前: 自前の重み
    const runeIds = [...new Set(allT.map((t) => data.mods.get(t.modId)?.rune).filter((r): r is string => !!r))];
    const pools = (runeIds.length ? withRunes(effectiveCls(it0), runeIds) : it0.cls).pools.normal;
    const wAt = (id: string, minIdx: number, floor: number) => { const m = data.mods.get(id); return m ? modTierWeight(m, floor, IL, minIdx) : 0; };
    const totalAt = (k: "prefixes" | "suffixes", floor: number) => [...new Set(pools[k])].reduce((a, id) => a + wAt(id, 0, floor), 0);
    const keepT = s.targets.filter((t) => { const m = methodOfTarget(data, t); return (m === "exalt" || m === "chaos") && membersOf(t).every((x) => sideOf(x.modId) === otherSide); });
    const blank = SO.blankWith(data, it0, IL, "magic", allT);
    for (const [aug, floor] of [["augment_perfect", CURRENCY_FLOOR.augment.perfect], ["augment_greater", CURRENCY_FLOOR.augment.greater], ["augment", CURRENCY_FLOOR.augment.base]] as const) {
      const own = fracSide === "prefix" ? "prefixes" : "suffixes", oth = fracSide === "prefix" ? "suffixes" : "prefixes";
      const ownT = totalAt(own, floor), othT = totalAt(oth, floor);
      const pB = Math.min(1, frac.reduce((a, c) => a + wAt(c.modId, c.minTierIndex, floor), 0) / ownT);
      const shareB = ownT / (ownT + othT);
      const o = SO.magicAugOdds(data, blank, aug);
      const pA = o.hit(fracSide, frac), shareA = o.share[fracSide];
      // エンジン: MOD の無いマジックに増強を N 回
      let onOwn = 0, hitOwn = 0; const kq = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const r = applyCurrency(data, blank, aug, rng);
        const m = r.added[0]; if (!m) continue;
        if (m.side === fracSide) { onOwn++; if (hits(m, frac)) hitOwn++; }
        else for (const t of keepT) if (hits(m, membersOf(t))) kq.set(t.modId, (kq.get(t.modId) ?? 0) + 1);
      }
      console.log(`[${aug}] 候補の側に付く割合 share: 前 ${f3(shareB)} / 後 ${f3(shareA)} / エンジン ${f3(onOwn / N)}`);
      console.log(`[${aug}] 候補の側で当たる p: 前 ${f3(pB)} / 後 ${f3(pA)} / エンジン ${f3(onOwn ? hitOwn / onOwn : 0)} (${hitOwn}/${onOwn})`);
      for (const t of keepT) {
        const qB = Math.min(1, membersOf(t).reduce((a, x) => a + wAt(x.modId, x.minTierIndex, floor), 0) / othT);
        const qA = o.hit(otherSide, membersOf(t));
        console.log(`[${aug}]   反対側 ${t.modId} q: 前 ${f3(qB)} / 後 ${f3(qA)} / エンジン ${f3((kq.get(t.modId) ?? 0) / (N - onOwn))}`);
      }
    }
    // カオス (固定 + 外れ 1 つのレア)
    for (const t of keepT) for (const [key, floor] of [["chaos", CURRENCY_FLOOR.exalt.base], ["chaos_greater", CURRENCY_FLOOR.exalt.greater], ["chaos_perfect", CURRENCY_FLOOR.exalt.perfect]] as const) {
      const all = totalAt("prefixes", floor) + totalAt("suffixes", floor);
      const pxB = membersOf(t).reduce((a, x) => a + wAt(x.modId, x.minTierIndex, floor), 0) / all;
      const pxA = SO.chaosAfterFix(data, blank, key, frac[0]!, membersOf(t));
      // エンジン: 固定した狙い + 反対側の本物の外れ 1 つ
      const fx = { ...applyMod(frac[0]!.modId, frac[0]!.minTierIndex), fractured: true };
      const junkId = [...new Set(pools[otherSide === "prefix" ? "prefixes" : "suffixes"])].find((id) => !membersOf(t).some((x) => x.modId === id) && wAt(id, 0, floor) > 0)!;
      const junk = applyMod(junkId, 0);
      const item: StageItem = { ...blank, rarity: "rare", prefixes: [fx, junk].filter((m) => m.side === "prefix"), suffixes: [fx, junk].filter((m) => m.side === "suffix") };
      let h = 0;
      for (let i = 0; i < N; i++) { const r = applyCurrency(data, item, key, rng); if (r.added.some((m) => hits(m, membersOf(t)))) h++; }
      console.log(`[${key}] 固定の後のカオス ${t.modId}: 前 ${f3(pxB)} / 後 ${f3(pxA)} / エンジン ${f3(h / N)}`);
    }
    // フラクチャー: 前 1/3、後 fractureOdds、エンジン = レアに高貴 3 回 → 骨 (冒涜) → フラクチャー。狙いが付いていた本の中で狙いが固定された割合
    let had = 0, fixed = 0, nofrac = 0;
    const rare0: StageItem = { ...blank, rarity: "rare" };
    for (let i = 0; i < N; i++) {
      let x = rare0;
      for (const k of ["exalt", "exalt", "exalt", "desecrate", "fracture"]) x = applyCurrency(data, x, k, rng).item;
      if (!allOf(x).some((m) => hits(m, frac))) continue;
      if (!allOf(x).some((m) => m.fractured)) { nofrac++; continue; }
      had++;
      if (allOf(x).some((m) => m.fractured && hits(m, frac))) fixed++;
    }
    console.log(`フラクチャーの当たり: 前 ${f3(1 / 3)} / 後 ${f3(SO.fractureOdds(data, blank, frac))} / エンジン ${f3(had ? fixed / had : 0)} (${fixed}/${had}、打てなかった本 ${nofrac})`);
    // keep-compare の出口 (前後で同じ台本を回して比べる)
    for (const k of keepCompare({ data, item: it0, itemLevel: IL, targets: s.targets, price })) {
      console.log(`keepCompare ${k.host}: together ${k.together.toFixed(1)} chaos ${k.chaos?.toFixed(1)} (${k.chaosKey}, ${k.chaosN?.toFixed(2)} 回) best ${k.best} detail p ${f3(k.detail.p)} q ${f3(k.detail.q)} share ${f3(k.detail.share)}`);
    }
  }
});

/** 本物の MOD 1 つ (段の値は見ない、確率の台本だけ) */
function applyMod(modId: string, tierIndex: number): StageMod {
  const m = data.mods.get(modId)!;
  return { modId, family: m.family, side: sideOf(modId), tierIndex, tierName: "", affix: "", modLevel: 0, values: [], ranges: [], textJa: "", textEn: "", ...(m.rune ? { rune: m.rune } : {}) };
}
void runeEnForId;
