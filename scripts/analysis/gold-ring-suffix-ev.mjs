/**
 * gold-ring-suffix-ev.mjs — 金の指輪 (動画 kQROcbbeR1M) のサフィックス 3 MOD を、オーナーの打ち方 (10-21) でエンジンに打たせて
 * 平均費用・完成率・回数の分布を出す (解析君、2026-10-21)。結果は docs/org/math/notes/2026-10-21-gold-ring-suffix-ev.md
 *
 *   [Q=40] [BUDGET=2000] [PROBE=1] node scripts/analysis/gold-ring-suffix-ev.mjs [N=50] [組み合わせ=all|<触媒の高貴の高貴>-<素の高貴>,...] [SEED=1]
 *   例: node scripts/analysis/gold-ring-suffix-ev.mjs 2000 greater-greater,perfect-greater
 *
 * 打つのは全部エンジンの入口 (applyCurrency)。台本が決めるのは「次にどの手を打つか」だけ (下の nextMove)。
 * 始め: 金の指輪 ilvl 82 のレア、プレフィックスに創生の樹のスペルダメージ (Glyphic) T2/8 をフラクチャー (動画の 30–34。重み 0 なので
 *   startFrom では付けられず、stage-core の makeStageMod で置いた) + 高貴 1 個の乱数の MOD = 動画 ④a の 2 MOD の形。始めの費用は 0。
 * 狙い (サフィックス): レアリティ (考古学の) T1・キャストスピード T2 以上・全ての元素耐性 T2 以上。
 * 打ち方 (状態だけで決まる。枝 2・3・4 はカオスで最初にどれが付いたかの違い):
 *   狙いが 1 つも無い → カオス / サフィックスが 3 つで未完成 → 消去 (お告げ無し)
 *   レアリティが無い (系統も空き) → 右側の高貴 + 素の高貴 (PLAIN)
 *   レアリティがある (か系統が外れの段で埋まっている) → 無い方を カタリスト 20% + 触媒の高貴 + 右側の高貴 + 高貴 (CAT)
 *     キャストスピード → 軽快のカタリスト、全耐性 → トゥルのカタリスト (全耐性は fire/cold/lightning のタグ。耐性だけのカタリストは無い。一番安い元素)
 *     その系統が外れの段で埋まっていればもう片方、両方埋まっていれば消去
 * 値段: 自分のサーバーの /boot.json (2026-10-20 16:00Z、Forbidden Rites、高貴建て。神 = 696.93)。
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_gold-ring-entry.ts");
const N = Number(process.argv[2] ?? 50);
const COMBOS = (process.argv[3] ?? "all") === "all"
  ? ["exalt", "exalt_greater", "exalt_perfect"].flatMap((c) => ["exalt", "exalt_greater"].map((p) => `${c}|${p}`))
  : process.argv[3].split(",").map((s) => s.split("-").map((x) => (x === "base" ? "exalt" : `exalt_${x}`)).join("|"));
const SEED = Number(process.argv[4] ?? 1);
const data = M.loadPatch();

const PRICES = {
  chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741, divine: 696.929,
  OmenofDextralExaltation: 35.576, OmenofCatalysingExaltation: 33.189, catalyst_speed: 152.338, catalyst_cold: 13.655,
  OmenofSinistralExaltation: 85.830, OmenofSinistralCrystallisation: 298.594, "essence:breach": 765.322,
};
const DIV = PRICES.divine;
const CAT_FOR = { C: "catalyst_speed", A: "catalyst_cold" };
const LIMIT = 20000; // 1 人の手の上限 (堂々巡りの見張り)
/** 1 人の打ち止め (神)。超えたら未完成 (オーナー 10-21「2000 神上限、現実的か知りたい」)。BUDGET=0 で無し */
const BUDGET = Number(process.env.BUDGET ?? 2000);
/**
 * 品質。Q=40 は動画 ④b の形: 触媒の高貴の前に「品質の最大値 +20%」が無ければ、非固定のプレフィックスが無い時は餌を 左側の高貴 + 高貴 (上級) で付け、
 * 左側の結晶化 + ブリーチのエッセンスで入れ替えてから 40% まで載せる (代金込み)。消去・カオスで消えたらまた入れる
 */
const Q40 = Number(process.env.Q ?? 20) === 40;
const MQ = "Rings/PerfectEssence_LocalMaximumQuality";
const hasMQ = (it) => it.prefixes.some((m) => m.modId === MQ);

const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
const ID = { R: "Rings/ItemFoundRarityIncrease", C: "Rings/IncreasedCastSpeed", A: "Rings/AllResistances" };
const len = (k) => data.mods.get(ID[k]).tiers.length;
const MIN = { R: len("R") - 1, C: len("C") - 2, A: len("A") - 2 }; // T1 / T2 以上 (tierIndex は低い段が 0)
const has = (item, k) => item.suffixes.some((m) => m.modId === ID[k] && m.tierIndex >= MIN[k]);
const blocked = (item, k) => item.suffixes.some((m) => m.modId === ID[k] && m.tierIndex < MIN[k]);

function start(rng) {
  let it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  it = M.withMod(it, { ...M.makeStageMod(SD, "prefix", 6, rng), fractured: true });
  return M.applyCurrency(data, it, "exalt", rng).item;
}

/** 次の手: { kind, aim? } */
function nextMove(it) {
  const got = ["R", "C", "A"].filter((k) => has(it, k));
  if (got.length === 3) return null;
  if (!got.length) return { kind: "chaos" };
  if (it.suffixes.length >= 3) return { kind: "annul" };
  if (!has(it, "R") && !blocked(it, "R")) return { kind: "plain" };
  const open = ["C", "A"].filter((k) => !has(it, k) && !blocked(it, k));
  if (!open.length) return { kind: "annul" };
  return { kind: "cat", aim: open[0] };
}

function runOne(rng, catOrb, plainOrb) {
  let it = start(rng);
  const n = { chaos: 0, annul: 0, [catOrb]: 0, [plainOrb]: 0, OmenofDextralExaltation: 0, OmenofCatalysingExaltation: 0, catalyst_speed: 0, catalyst_cold: 0 };
  const plainN = { n: 0 }, catN = { n: 0 };
  let branch = null, lostAll = 0, steps = 0;
  const use = (cur, omens = [], hint = {}) => {
    const r = M.applyCurrency(data, it, cur, rng, omens, hint);
    if (!r.applied) throw new Error(`${cur} が打てない: ${r.reason}`);
    n[cur] = (n[cur] ?? 0) + 1;
    for (const o of r.omensUsed ?? []) n[o] = (n[o] ?? 0) + 1;
    it = r.item;
  };
  for (let mv = nextMove(it); mv; mv = nextMove(it)) {
    if (++steps > LIMIT || (BUDGET > 0 && costOf(n) > BUDGET)) return { done: false, n, branch, lostAll, plainN: plainN.n, catN: catN.n };
    const before = ["R", "C", "A"].filter((k) => has(it, k)).length;
    if (mv.kind === "chaos") use("chaos");
    else if (mv.kind === "annul") use("annul");
    else if (mv.kind === "plain") { use(plainOrb, ["OmenofDextralExaltation"]); plainN.n++; }
    else {
      const cat = CAT_FOR[mv.aim];
      if (Q40 && !hasMQ(it) && it.prefixes.length < 3) {
        if (!it.prefixes.some((m) => !m.fractured)) use("exalt_greater", ["OmenofSinistralExaltation"]);
        use("essence:breach", ["OmenofSinistralCrystallisation"]);
        if (!hasMQ(it)) throw new Error("ブリーチのエッセンスで品質の最大値が入らない");
      }
      const QT = hasMQ(it) ? 40 : 20;
      while (!(it.qualityTag === cat.slice(9) && it.quality >= QT)) use(cat, [], { oneCatalyst: true });
      use(catOrb, ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]);
      catN.n++;
    }
    const got = ["R", "C", "A"].filter((k) => has(it, k));
    if (!branch && got.length) branch = got.length === 1 ? got[0] : "multi";
    if (before > 0 && got.length === 0) lostAll++;
  }
  return { done: true, n, branch, lostAll, plainN: plainN.n, catN: catN.n };
}

const costOf = (n) => Object.entries(n).reduce((a, [k, v]) => a + (PRICES[k] ?? 0) * v, 0) / DIV;
const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const BR = { R: "2 (レアリティ先)", C: "3 (キャストスピード先)", A: "4 (全耐性先)" };

/** PROBE=1: 1 手の当たりの割合 (同じ状態から同じ手を K 回打つ)。R の狙いは SD(F) + キャストスピード T1、C・A の狙いは SD(F) + レアリティ T1 から */
if (process.env.PROBE) {
  const K = N, rng = M.mulberry32(SEED);
  const base = (k) => { const it = start(rng); return M.withMod({ ...it, prefixes: it.prefixes.filter((m) => m.fractured), suffixes: [] }, M.makeStageMod(data.mods.get(ID[k]), "suffix", data.mods.get(ID[k]).tiers.length - 1, rng)); };
  const rate = (from, aim, cur, omens, cat) => {
    let hit = 0;
    for (let i = 0; i < K; i++) {
      let it = base(from);
      if (cat) for (let j = 0; j < 20; j++) it = M.applyCurrency(data, it, cat, rng, [], { oneCatalyst: true }).item;
      const r = M.applyCurrency(data, it, cur, rng, omens);
      if (!r.applied) throw new Error(r.reason);
      if (has(r.item, aim)) hit++;
    }
    return `${(100 * hit / K).toFixed(2)}%`;
  };
  for (const cur of ["exalt", "exalt_greater", "exalt_perfect"]) {
    console.log(`${cur}: 右側の高貴でレアリティ T1 ${rate("C", "R", cur, ["OmenofDextralExaltation"])}  ` +
      `軽快 20% + 触媒の高貴でキャストスピード T2+ ${rate("R", "C", cur, ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], "catalyst_speed")} (触媒なし ${rate("R", "C", cur, ["OmenofDextralExaltation"])})  ` +
      `トゥル 20% + 触媒の高貴で全耐性 T2+ ${rate("R", "A", cur, ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], "catalyst_cold")} (触媒なし ${rate("R", "A", cur, ["OmenofDextralExaltation"])})`);
  }
  process.exit(0);
}

const t0 = Date.now();
for (const combo of COMBOS) {
  const [catOrb, plainOrb] = combo.split("|");
  const rng = M.mulberry32(SEED);
  const rs = Array.from({ length: N }, () => runOne(rng, catOrb, plainOrb));
  const done = rs.filter((r) => r.done);
  const costs = done.map((r) => costOf(r.n)).sort((a, b) => a - b);
  const spentAll = rs.reduce((a, r) => a + costOf(r.n), 0);
  const m = mean(costs), se = Math.sqrt(mean(costs.map((c) => (c - m) ** 2)) / (costs.length || 1));
  console.log(`\n=== 品質 ${Q40 ? "40% (ブリーチ)" : "20%"} / 触媒の高貴に ${catOrb} / 素の右側の高貴に ${plainOrb}  (${N} 人, ${((Date.now() - t0) / 1000).toFixed(0)} 秒)`);
  console.log(`完成 ${(100 * done.length / N).toFixed(1)}%  平均 ${m.toFixed(2)} 神 (±${(1.96 * se).toFixed(2)}, ${(196 * se / m).toFixed(1)}%)  中央 ${q(costs, 0.5).toFixed(1)}  90% ${q(costs, 0.9).toFixed(1)}  99% ${q(costs, 0.99).toFixed(1)}`);
  console.log(`打ち止め ${BUDGET || "無し"} 神: 全員の平均 ${(spentAll / N).toFixed(2)} 神 (未完成は使った分)・完成 1 個あたり ${(spentAll / (done.length || NaN)).toFixed(2)} 神`);
  const avg = (k) => mean(done.map((r) => r.n[k] ?? 0));
  console.log(`平均の個数: カオス ${avg("chaos").toFixed(1)}  消去 ${avg("annul").toFixed(2)}  ${catOrb === plainOrb ? `${catOrb} ${avg(catOrb).toFixed(2)}` : `${catOrb} ${avg(catOrb).toFixed(2)} / ${plainOrb} ${avg(plainOrb).toFixed(2)}`}  (触媒あり ${mean(done.map((r) => r.catN)).toFixed(2)} 回・素 ${mean(done.map((r) => r.plainN)).toFixed(2)} 回)  右側の高貴 ${avg("OmenofDextralExaltation").toFixed(2)}  触媒の高貴 ${avg("OmenofCatalysingExaltation").toFixed(2)}  軽快 ${avg("catalyst_speed").toFixed(1)}  トゥル ${avg("catalyst_cold").toFixed(1)}  全部消えてカオスに戻る ${mean(done.map((r) => r.lostAll)).toFixed(2)} 回`);
  const cOnly = done.map((r) => (PRICES.chaos * r.n.chaos) / DIV);
  console.log(`  うちカオスの代金 ${mean(cOnly).toFixed(2)} 神`);
  for (const b of ["R", "C", "A"]) {
    const g = done.filter((r) => r.branch === b);
    if (!g.length) continue;
    const gc = g.map((r) => costOf(r.n));
    const gm = mean(gc), gse = Math.sqrt(mean(gc.map((c) => (c - gm) ** 2)) / g.length);
    const after = mean(g.map((r) => costOf({ ...r.n, chaos: 0 })));
    console.log(`  枝 ${BR[b]}: ${(100 * g.length / done.length).toFixed(1)}%  平均 ${gm.toFixed(2)} 神 (±${(1.96 * gse).toFixed(2)})  カオス以外 ${after.toFixed(2)} 神  カオス ${mean(g.map((r) => r.n.chaos)).toFixed(1)}  高貴 (触媒あり ${mean(g.map((r) => r.catN)).toFixed(2)}・素 ${mean(g.map((r) => r.plainN)).toFixed(2)})  消去 ${mean(g.map((r) => r.n.annul)).toFixed(2)}`);
  }
}
