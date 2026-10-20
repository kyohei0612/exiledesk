/**
 * check-auto-nan.mjs — ④ の solveOrder が NaN・Infinity を返す順番が無いか (解析君、2026-10-20)
 *
 *   node scripts/analysis/check-auto-nan.mjs
 *
 * 見本の手袋 (check-auto-order.mjs と同じ狙い・値段) の並べる行 5 = 120 通りを、画面と同じくルーンの行を先頭に付けた順番と付けない順番で
 * 値だけ solveOrder し、cost・finish・perFinish が有限でない物を数える。画面の順 (ルーン先頭) と台本の順 (ルーン無し) で行き先の表の作られ方が変わるので両方
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_auto-order-entry.ts");
const data = M.loadPatch();
const PRICES = {
  exalt: 1, exalt_greater: 17.759, exalt_perfect: 2167.68, chaos: 73.097, chaos_greater: 215.018, chaos_perfect: 5420.49, annul: 316.796,
  OmenofSinistralExaltation: 67.472, OmenofDextralExaltation: 32.287, OmenofGreaterExaltation: 10.088, OmenofSinistralErasure: 14334.5, OmenofDextralErasure: 9624.24,
  OmenofWhittling: 9467.96, OmenofSinistralAnnulment: 15105.1, OmenofDextralAnnulment: 9748.28, OmenofSinistralCrystallisation: 282.44, OmenofDextralCrystallisation: 269.06,
  desecrate: 131.981, desecrate_ancient: 6757.19, OmenofAbyssalEchoes: 51.247, OmenofLight: 6667.94, OmenofSinistralNecromancy: 3.219, OmenofDextralNecromancy: 5.116,
  fracture: 8166.06, regal: 1.387, reveal: 0, divine: 718.434,
  "rune:Kolr's Hunt": 838.48, "rune:Uhtred's Sidereus": 838.48,
  "essence:perfect:Gloves_int/PerfectEssence_CriticalStrikeMultiplier": 998.84, "essence:perfect:Gloves_int/PerfectEssence_SoulCore": 1219.68,
};
const price = (k) => PRICES[k] ?? 0;
const top = (id) => data.mods.get(id).tiers.length - 1;
const ID = (s) => `Gloves_int/${s}`;
const MN = ID("IncreasedMana"), ES = ID("LocalEnergyShield"), SPD = ID("Rune_marksman_ProjectileSpeed"), PROJ = ID("Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level");
const CRIT = ID("CriticalStrikeMultiplier"), AS = ID("IncreasedAttackSpeed");
const t3 = (id) => Math.max(0, top(id) - 2);
const targets = [
  { modId: MN, minTierIndex: top(MN), method: "fracture" },
  { modId: SPD, minTierIndex: 0, method: "desecrate" },
  { modId: ES, minTierIndex: t3(ES), method: "exalt" },
  { modId: PROJ, minTierIndex: t3(PROJ), method: "chaos" },
  { modId: CRIT, minTierIndex: t3(CRIT), method: "chaos" },
  { modId: AS, minTierIndex: t3(AS), method: "chaos" },
];
const sim = { data, base: "Intricate Gloves", itemLevel: 82, targets, start: "fractured", startPrice: 69.1391642842024 * price("divine"), sockets: 2, runePrice: (en) => price(`rune:${en}`) };
const perms = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r])));
const runes = ["rune:Kolr's Hunt", "rune:Uhtred's Sidereus"];
const fin = (r) => Number.isFinite(r.cost) && Number.isFinite(r.finish) && Number.isFinite(r.perFinish);

for (const withRune of [true, false]) {
  const tb = Date.now();
  const b = M.buildAutoModel({ sim, price });
  if (b.ok) console.log(`  build ${Date.now() - tb} ms、表の形 ${Object.keys(b.model.eng).length} (代表が組めず空 ${Object.values(b.model.eng).filter((e) => !Object.keys(e).length).length})`);
  if (!b.ok) throw new Error(b.reason.ja);
  const model = b.model;
  let bad = 0, inf = 0, n = 0, lastMiss = 0;
  const all = [], t0 = Date.now();
  for (const o of perms(model.keys)) {
    const order = withRune ? [...runes, ...o] : o;
    const d = M.orderDetail(model, order);
    const r = d.result;
    lastMiss = d.size.miss;
    n++;
    all.push({ o, v: r.perFinish, f: r.finish });
    if (!fin(r)) {
      if (Number.isNaN(r.cost) || Number.isNaN(r.perFinish)) bad++; else inf++;
      console.log(`  ${withRune ? "ルーン先頭" : "ルーン無し"} ${o.map((k) => k.split("/")[1].slice(0, 14)).join(" → ")}: cost ${r.cost} finish ${r.finish} perFinish ${r.perFinish} stuck ${d.stuck} bad ${d.bad}`);
    }
  }
  all.sort((a, b) => a.v - b.v);
  const name = (o) => o.map((k) => k.split("/")[1].replace("Rune_marksman_", "").slice(0, 12)).join(" → ");
  for (const i of [0, 1, 2, 60, 117, 118, 119]) console.log(`  #${i + 1} ${name(all[i].o)}: ${(all[i].v / price("divine")).toFixed(1)} 神・完成 ${(all[i].f * 100).toFixed(2)}%`);
  console.log(`  ${Date.now() - t0} ms、表に無い形 ${lastMiss}`);
  console.log(`${withRune ? "ルーン先頭" : "ルーン無し"}: ${n} 通り、NaN ${bad}・Infinity ${inf}`);
}
