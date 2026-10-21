/**
 * cast-speed-weight-probe.mjs — 金の指輪 (ilvl 82) のキャストスピードの重みを変えた時、素の右側の高貴 + 上級で付く割合 (解析君、2026-10-22)
 * 結果は docs/org/math/notes/2026-10-22-cast-speed-weight.md
 *
 *   node scripts/analysis/cast-speed-weight-probe.mjs [K=20000] [W=1000,1,200]
 *
 * 始め = 前の金の指輪の PROBE と同じ: スペルダメージ T2 (F、makeStageMod) + レアリティ T1 (サフィックス)。そこに右側の高貴 + 上級を K 回。
 * 重みは読み込んだ PatchData の Rings/IncreasedCastSpeed の各段の weight を、この台本の中だけで書き換える (src は触らない)。
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const K = Number(process.argv[2] ?? 20000);
const WS = (process.argv[3] ?? "1000,1,200").split(",").map(Number);
const data = M.loadPatch();
const CS = data.mods.get("Rings/IncreasedCastSpeed");
const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
const R = data.mods.get("Rings/ItemFoundRarityIncrease");
console.log("エンジンの今の重み (段ごと、出始め ilvl/重み):", CS.tiers.map((t) => `${t.ilvl}/${t.weight}`).join(" "));
const orig = CS.tiers.map((t) => t.weight);
for (const W of WS) {
  CS.tiers.forEach((t) => { t.weight = W; });
  const rng = M.mulberry32(1);
  let hit2 = 0, any = 0;
  for (let i = 0; i < K; i++) {
    let it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, 1);
    it = M.withMod(it, { ...M.makeStageMod(SD, "prefix", 6, rng), fractured: true });
    it = M.withMod(it, M.makeStageMod(R, "suffix", R.tiers.length - 1, rng));
    const a = M.applyCurrency(data, it, "exalt_greater", rng, ["OmenofDextralExaltation"]).added[0];
    if (a.modId === CS.id) { any++; if (a.tierIndex >= CS.tiers.length - 2) hit2++; }
  }
  console.log(`重み ${W} (5 段とも): キャストスピード T2 以上 ${(100 * hit2 / K).toFixed(3)}%  どの段でも ${(100 * any / K).toFixed(3)}%`);
}
CS.tiers.forEach((t, i) => { t.weight = orig[i]; });
