/**
 * es-gloves-ev.mjs — ES の手袋 (知性、ilvl 82) のプレフィックス 3 つを、金の指輪の打ち方 C を左右逆にした形でエンジンに打たせる (解析君、2026-10-21)。
 * 結果は docs/org/math/notes/2026-10-21-es-gloves-ev.md
 *
 *   [ORB=exalt|exalt_greater|exalt_perfect] [RUNE="Serle's Triumph,Kolr's Hunt"] [BUDGET=2000] node scripts/analysis/es-gloves-ev.mjs [N=300] [SEED=1]
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本は次の手を決めるだけ (nextMove)。
 * ベース: サイレーンスケイルの手袋 (Sirenscale Gloves、ES 54・レベル 80、知性の手袋で ilvl 82 の一番上の ES)。
 * 始め: サフィックスに投射物スキルのレベル +2 (Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level の 2 段目、レベル 65) をフラクチャー
 *   (普通の置き場に無く startFrom が断るので makeStageMod で置く) + 上級の高貴 1 個の乱数の MOD (費用 0)。
 * 狙い (プレフィックス): 最大 ES (ローカル固定) T2+ / ES 増加 % (ローカル) T2+ / 最大マナ T2+。サフィックスは何でもよい。
 * 打ち方: 狙いが無い → カオス。狙いがあって外れのプレフィックス (狙いの系統の低い段も) がある → 消去 (お告げ無し)。
 *   足りない狙い → 左側の高貴 + ORB (カタリストは指輪・アミュレットだけなので手袋では打てない。触媒の高貴も品質が無いので打てない)
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 300);
const SEED = Number(process.argv[3] ?? 1);
const ORB = process.env.ORB ?? "exalt_greater";
const BUDGET = Number(process.env.BUDGET ?? 2000);
/**
 * RUNE="Serle's Triumph,Kolr's Hunt" など (カンマ区切り): 始めにソケットをルーンの数だけ + ルーンを差す (サム 10-21)。ルーン代は費用に入れない (値段を別に書く)。
 * コルの狩りを差すとマークスマン MOD が置き場に入るので、投射物 +2 は startFrom でフラクチャー済みに付けられる (無い時は makeStageMod で置く)
 */
const RUNES = process.env.RUNE ? process.env.RUNE.split(",") : [];
const RUNE = RUNES.join(" + ") || null;
const LIMIT = 20000;
const data = M.loadPatch();

// 自分のサーバーの /boot.json (2026-10-20 16:00Z、Forbidden Rites、高貴建て。神 = 696.93)
const PRICES = { chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, divine: 696.929, OmenofSinistralExaltation: 85.830 };
const DIV = PRICES.divine;
const BASE = "Sirenscale Gloves";
const PROJ = data.mods.get("Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level");
const T = { F: "Gloves_int/LocalEnergyShield", P: "Gloves_int/LocalEnergyShieldPercent", M: "Gloves_int/IncreasedMana" };
const KEYS = Object.keys(T);
const need = (k, m) => m.modId === T[k] && m.tierIndex >= data.mods.get(m.modId).tiers.length - 2;
const isTarget = (m) => KEYS.some((k) => need(k, m));
const has = (it, k) => it.prefixes.some((m) => need(k, m));

function start(rng) {
  const kolr = RUNES.includes("Kolr's Hunt");
  let it = M.startFrom(data, BASE, 82, { rarity: "rare", ...(RUNES.length ? { sockets: RUNES.length, runes: RUNES } : {}), ...(kolr ? { mods: [{ mod: PROJ.id, tier: "T1", fractured: true }] } : {}) }, Math.floor(rng() * 2 ** 31));
  if (!kolr) it = M.withMod(it, { ...M.makeStageMod(PROJ, "suffix", 1, rng), fractured: true });
  return M.applyCurrency(data, it, "exalt_greater", rng).item;
}

function nextMove(it) {
  const got = KEYS.filter((k) => has(it, k));
  if (got.length === KEYS.length) return null;
  if (!got.length) return { kind: "chaos" };
  if (it.prefixes.some((m) => !m.fractured && !isTarget(m))) return { kind: "annul" };
  return { kind: "exalt" };
}

function costOf(n) {
  return Object.entries(n).reduce((a, [k, v]) => a + (PRICES[k] ?? 0) * v, 0) / DIV;
}

function runOne(rng) {
  let it = start(rng);
  const n = {};
  let steps = 0, lostAll = 0, wasted = 0;
  const use = (cur, omens = []) => {
    const r = M.applyCurrency(data, it, cur, rng, omens);
    if (!r.applied) throw new Error(`${cur} が打てない: ${r.reason}`);
    n[cur] = (n[cur] ?? 0) + 1;
    for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
    it = r.item;
    return r;
  };
  for (let mv = nextMove(it); mv; mv = nextMove(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, lostAll, wasted };
    const before = KEYS.filter((k) => has(it, k)).length;
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") {
      const r = use("annul");
      // 消去がサフィックス (カオスの時に付いた物) に当たって外れのプレフィックスが残った回数
      if (r.removed?.every((m) => m.side === "suffix")) wasted++;
    } else use(ORB, ["OmenofSinistralExaltation"]);
    const after = KEYS.filter((k) => has(it, k)).length;
    if (before > 0 && after === 0) lostAll++;
  }
  return { done: true, n, lostAll, wasted, suffixes: it.suffixes.length };
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const t0 = Date.now();
const rng = M.mulberry32(SEED);
const rs = Array.from({ length: N }, () => runOne(rng));
const done = rs.filter((r) => r.done);
const costs = done.map((r) => costOf(r.n)).sort((a, b) => a - b);
const spent = rs.reduce((a, r) => a + costOf(r.n), 0);
const m = mean(costs), se = Math.sqrt(mean(costs.map((c) => (c - m) ** 2)) / (costs.length || 1));
console.log(`=== ES の手袋 / 左側の高貴 + ${ORB}${RUNE ? ` / ルーン ${RUNE}` : ""} (${N} 人, ${((Date.now() - t0) / 1000).toFixed(0)} 秒, 打ち止め ${BUDGET} 神)`);
console.log(`完成 ${(100 * done.length / N).toFixed(1)}%  1 個あたり ${(spent / (done.length || NaN)).toFixed(2)} 神  完成した人の平均 ${m.toFixed(2)} (±${(1.96 * se).toFixed(2)})  中央 ${q(costs, 0.5).toFixed(1)}  90% ${q(costs, 0.9).toFixed(1)}`);
for (const k of ["chaos", "annul", ORB, "OmenofSinistralExaltation"]) {
  const c = mean(done.map((r) => r.n[k] ?? 0));
  console.log(`  ${k.padEnd(28)} ${c.toFixed(2).padStart(9)} 個  ${(c * PRICES[k] / DIV).toFixed(2).padStart(8)} 神`);
}
console.log(`  狙いが全部消えた ${mean(done.map((r) => r.lostAll)).toFixed(2)} 回  消去がサフィックスに当たった ${mean(done.map((r) => r.wasted)).toFixed(2)} 回  完成時の非固定のサフィックス ${mean(done.map((r) => r.suffixes - 1)).toFixed(2)} 個`);
