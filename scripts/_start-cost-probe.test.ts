/**
 * _start-cost-probe.test.ts — ③ ベースの値段の計算 (use-sim-calc の calc) を見本の形で出して JSON に書く台本 (2026-10-22 シミュ部長 9 本目、
 * 計算を純粋な関数 start-cost.ts に出す整理の前後で数が同じかを比べる)。
 *
 *   OUT=<書き出す JSON> pnpm exec vitest run -c scripts/_start-cost-probe.config.ts
 *
 * 通貨の値段は node では相場が空なので 0。白のベース 5 神・4 MOD 20 神を入れて、確率・回数・白と 4 MOD から出る数を比べる。並べるだけ (見張りではない)
 */
import fs from "node:fs";
import { computed, ref } from "vue";
import { it } from "vitest";
import { loadPatch } from "../tests/helpers/patch";
import { freshItem, type PatchData } from "../src/services/craft-stage/engine";
import { craftStage as s } from "../src/state/craft-stage";
import { useSimCalc } from "../src/views/simulator/use-sim-calc";
import type { SimTargetIn } from "../src/services/simulator/quiz-build";
import type { SimTargetsCtx } from "../src/views/simulator/use-sim-targets";

/** T n の minTierIndex (Mod.tiers は下の段から、T1 = 最後) */
const tierIx = (d: PatchData, modId: string, tier: number): number => (d.mods.get(modId)?.tiers.length ?? 1) - tier;
interface Case { name: string; base: string; frac: Array<{ modId: string; tier: number }>; others: Array<{ modId: string; tier: number; method: SimTargetIn["method"] }> }
const CASES: Case[] = [
  { name: "靴 移動スピード T1 だけ", base: "Drakeskin Boots", frac: [{ modId: "Boots_dex/MovementVelocity", tier: 1 }], others: [] },
  { name: "靴 移動スピード T1 + 火耐性 T1", base: "Drakeskin Boots", frac: [{ modId: "Boots_dex/MovementVelocity", tier: 1 }], others: [{ modId: "Boots_dex/FireResistance", tier: 1, method: "chaos" }] },
  { name: "手袋 投射物 +2 (コルの狩り)", base: "Sirenscale Gloves", frac: [{ modId: "Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level", tier: 1 }], others: [] },
  { name: "手袋 知性 T1 + ES% T2 (グレーター候補)", base: "Sirenscale Gloves", frac: [{ modId: "Gloves_int/Intelligence", tier: 1 }], others: [{ modId: "Gloves_int/LocalIncreasedEnergyShieldPercent", tier: 2, method: "essence" }] },
];

it("③ の calc", () => {
  const d = loadPatch();
  s.data.value = d;
  const out: Record<string, unknown> = {};
  for (const c of CASES) {
    s.itemLevel.value = 82;
    s.item.value = freshItem(d, c.base, 82, "normal");
    s.simTargets.value = [...c.frac.map((f) => ({ modId: f.modId, minTierIndex: tierIx(d, f.modId, f.tier), method: "fracture" as const })), ...c.others.map((o) => ({ modId: o.modId, minTierIndex: tierIx(d, o.modId, o.tier), method: o.method }))];
    const fracMembers = computed(() => c.frac.map((f) => ({ modId: f.modId, minTierIndex: tierIx(d, f.modId, f.tier), text: f.modId, rank: `T${f.tier}`, side: "", tone: "" })));
    const ctx = { fracMembers, fractureRow: computed(() => ({ modId: c.frac[0]!.modId })), wholeRoute: ref(false), whiteDivine: ref(5), fourDivine: ref(20), num: (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null) } as unknown as SimTargetsCtx;
    const simIn = (): SimTargetIn[] => s.simTargets.value.map((t) => ({ modId: t.modId, minTierIndex: t.minTierIndex, method: t.method as SimTargetIn["method"] }));
    const { calc } = useSimCalc(ctx, simIn);
    out[c.name] = calc.value;
    const v = calc.value;
    console.log(`■ ${c.name}: ${v ? `pHit ${v.pHit.toFixed(4)} fracP ${v.fracP.toFixed(4)} total ${v.total.toFixed(3)} four ${v.fourTotal?.toFixed(3) ?? "—"} 等級 ${v.grade} グレーター ${v.greater ? "あり" : "無し"} keep ${v.keep ? `${v.keep.host} 一緒 ${v.keep.together.toFixed(3)} カオス ${v.keep.chaos.toFixed(3)}` : "無し"}` : "null"}`);
  }
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, (_k, x) => (typeof x === "number" && !Number.isFinite(x) ? String(x) : x), 1));
});
