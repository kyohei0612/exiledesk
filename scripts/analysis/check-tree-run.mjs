/**
 * check-tree-run.mjs — tree-run.ts (ツリーの n 人回し) を、前の台本と同じ打ち方のツリーで回して数字を並べる (解析君、2026-10-23)
 *
 *   node scripts/analysis/check-tree-run.mjs [es|ring|all] [N=300] [SEED=1]
 *
 * es   = ES 手袋のプレフィックス 3 つ (es-gloves-ev.mjs の ORB=exalt_greater、ルーン無し): 300 人で 1 個 105.14 神・完成 100%
 * ring = 金の指輪のサフィックス C (gold-ring-suffix-ev.mjs の POLICY=C perfect-greater): 300 人で 1 個 219.76 神・完成 100%
 * 始めのアイテムは前の台本と同じ (フラクチャー + 上級の高貴 1 個の乱数の MOD、費用 0)。乱数の引き方は違うので同じ人にはならない (比べるのは平均)
 */
import { bundleEntry } from "../_bundle-ts.mjs";

const M = await bundleEntry("scripts/analysis/_tree-run-entry.ts");
const which = process.argv[2] ?? "all";
const N = Number(process.argv[3] ?? 300);
const SEED = Number(process.argv[4] ?? 1);
const data = M.loadPatch();

// 自分のサーバーの /boot.json (2026-10-20 16:00Z、高貴建て、神 = 696.93)。前の台本と同じ値
const EX = {
  chaos: 71.892, annul: 313.204, exalt: 1, exalt_greater: 13.383, exalt_perfect: 2045.741,
  OmenofDextralExaltation: 35.576, OmenofSinistralExaltation: 85.830, OmenofCatalysingExaltation: 33.189,
  catalyst_speed: 152.338, catalyst_cold: 13.655,
};
const price = (k) => (EX[k] ?? 0) / 696.929;

/** 箱を作る小さな道具 */
function doc(base, boxes) {
  const b = {};
  for (const [id, x] of Object.entries(boxes)) b[id] = { id, x: 0, y: 0, out: "junk", aim: null, hand: null, outs: [], back: null, done: null, parent: null, ...x };
  return { schema: "exiledesk-tree/0", base, itemLevel: 82, fracture: null, boxes: b, seq: 0 };
}
const hand = (currency, omens = [], extra = {}) => ({ currency, omens, catalyst: null, quality: 0, ...extra });
const SPAM = { repeat: { until: "hit", max: null } };

/** ES 手袋: 狙い F/P/M (T2 以上)。始まり = カオスを当たるまで → 1 つ → 左側の高貴 + 上級 → 外れは消去 */
function esTree() {
  const A = { F: { modId: "Gloves_int/LocalEnergyShield", tier: 2 }, P: { modId: "Gloves_int/LocalEnergyShieldPercent", tier: 2 }, M: { modId: "Gloves_int/IncreasedMana", tier: 2 } };
  const SG = hand("exalt_greater", ["OmenofSinistralExaltation"]);
  return doc("Sirenscale Gloves", {
    start: { out: "start", hand: hand("chaos", [], SPAM), outs: ["s_F", "s_P", "s_M"] },
    // 狙い 1 つ (どれでも同じ手なので s_F に寄せる)
    s_F: { out: "hit", aim: A.F, hand: SG, outs: ["k_F", "k_P", "k_M", "j1"] },
    s_P: { out: "hit", aim: A.P, back: "s_F" },
    s_M: { out: "hit", aim: A.M, back: "s_F" },
    j1: { out: "junk", hand: hand("annul"), outs: ["j1g", "j1l"] },
    j1g: { out: "junkGone", back: "s_F" },
    j1l: { out: "lost", back: "start" },
    // 狙い 2 つ
    k_P: { out: "hit", aim: A.P, hand: SG, outs: ["d_F", "d_P", "d_M", "j2"] },
    k_F: { out: "hit", aim: A.F, back: "k_P" },
    k_M: { out: "hit", aim: A.M, back: "k_P" },
    j2: { out: "junk", hand: hand("annul"), outs: ["j2g", "j2l"] },
    j2g: { out: "junkGone", back: "k_P" },
    j2l: { out: "lost", back: "j1" },
    d_F: { out: "hit", aim: A.F, done: "main" },
    d_P: { out: "hit", aim: A.P, done: "main" },
    d_M: { out: "hit", aim: A.M, done: "main" },
  });
}
function esStart(rng) {
  const P = data.mods.get("Gloves_int/Rune_marksman_IncreaseSocketedGemLevel__projectile_skill_gem_level");
  let it = M.startFrom(data, "Sirenscale Gloves", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  it = M.withMod(it, { ...M.makeStageMod(P, "suffix", 1, rng), fractured: true });
  return M.applyCurrency(data, it, "exalt_greater", rng).item;
}

/**
 * 金の指輪のサフィックス C: 狙い R (レアリティ T1)・C (キャストスピード T2+)・A (全耐性 T2+)。
 * レアリティが無い間は右側の高貴 + 上級、ある時は無い方 (C → A) をカタリスト 20% + 触媒の高貴 + 右側の高貴 + 完全。外れはすぐ消去、消去の後は形の合う箱へ (match)
 */
function ringTree() {
  const A = { R: { modId: "Rings/ItemFoundRarityIncrease", tier: 1 }, C: { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: { modId: "Rings/AllResistances", tier: 2 } };
  const PLAIN = hand("exalt_greater", ["OmenofDextralExaltation"]);
  const CAT = (cat) => hand("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], { catalyst: cat, quality: 20 });
  const J = (parent) => ({ out: "junk", parent, hand: hand("annul"), outs: [`${parent}_g`, `${parent}_l`] });
  const back = (out, parent) => ({ out, parent, back: "match" });
  return doc("Gold Ring", {
    start: { out: "start", hand: hand("chaos", [], SPAM), outs: ["sR", "sC", "sA"] },
    sR: { out: "hit", aim: A.R, parent: "start", hand: CAT("catalyst_speed"), outs: ["rc", "ra", "jR"] },
    sC: { out: "hit", aim: A.C, parent: "start", hand: PLAIN, outs: ["cr", "ca", "jC"] },
    sA: { out: "hit", aim: A.A, parent: "start", hand: PLAIN, outs: ["ar", "ac", "jA"] },
    rc: { out: "hit", aim: A.C, parent: "sR", hand: CAT("catalyst_cold"), outs: ["d1", "jRC"] },
    ra: { out: "hit", aim: A.A, parent: "sR", hand: CAT("catalyst_speed"), outs: ["d2", "jRA"] },
    ca: { out: "hit", aim: A.A, parent: "sC", hand: PLAIN, outs: ["d3", "jCA"] },
    cr: { out: "hit", aim: A.R, parent: "sC", back: "match" },
    ar: { out: "hit", aim: A.R, parent: "sA", back: "match" },
    ac: { out: "hit", aim: A.C, parent: "sA", back: "match" },
    d1: { out: "hit", aim: A.A, parent: "rc", done: "main" },
    d2: { out: "hit", aim: A.C, parent: "ra", done: "main" },
    d3: { out: "hit", aim: A.R, parent: "ca", done: "main" },
    jR: J("sR"), jC: J("sC"), jA: J("sA"), jRC: J("rc"), jRA: J("ra"), jCA: J("ca"),
    ...Object.fromEntries(["sR", "sC", "sA", "rc", "ra", "ca"].flatMap((p) => [[`${p}_g`, back("junkGone", p)], [`${p}_l`, back("lost", p)]])),
  });
}
function ringStart(rng) {
  const SD = data.mods.get("Rings/Special_genesis_tree_caster_SpellDamage");
  let it = M.startFrom(data, "Gold Ring", 82, { rarity: "rare" }, Math.floor(rng() * 2 ** 31));
  it = M.withMod(it, { ...M.makeStageMod(SD, "prefix", 6, rng), fractured: true });
  return M.applyCurrency(data, it, "exalt", rng).item;
}

function show(name, want, r) {
  const d = (r.perItem / want - 1) * 100;
  console.log(`\n=== ${name}: ツリー ${r.n} 人`);
  console.log(`完成 ${(100 * r.finished / r.n).toFixed(1)}%  1 個あたり ${r.perItem.toFixed(2)} 神 (前の台本 ${want} 神、${d >= 0 ? "+" : ""}${d.toFixed(1)}%)  完成した人の平均 ${r.meanFinished.toFixed(2)}  中央 ${r.median.toFixed(1)}  90% ${r.p90.toFixed(1)}  打ち止め ${r.capped}  止まり ${r.stuck} ${JSON.stringify(r.stuckAt)}`);
  console.log("1 人あたり:", Object.entries(r.uses).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  "));
  for (const [id, b] of Object.entries(r.boxes)) if (b.visits) console.log(`  ${id.padEnd(6)} 通った ${String(b.reach).padStart(3)} 人 (1 人 ${(b.visits / b.reach).toFixed(1)} 回)  ここまで ${b.costIn.toFixed(1)}  ここから ${b.remain.toFixed(1)}${b.warn ? "  ⚠" : ""}`);
}

const t0 = Date.now();
if (which === "es" || which === "all") {
  const r = M.runTree(data, esTree(), { n: N, seed: SEED, price, start: esStart });
  show("ES 手袋のプレフィックス 3 つ (左側の高貴 + 上級)", 105.14, r);
}
// 作り直しの数え方: ES 手袋で「狙いが全部消えたら作り直し」(j1l → restart)。始めの費用 0 なら前と同じくらい、
// 10 神なら 1 個あたりが「10 × (1 + 1 人あたりの作り直し) ÷ 完成の割合」だけ増えるはず
if (which === "restart" || which === "all") {
  for (const startCost of [0, 10]) {
    const d = esTree();
    d.boxes.j1l.back = "restart";
    const r = M.runTree(data, d, { n: N, seed: SEED, price, start: esStart, startCost });
    const expect = 105.14 + startCost * (1 + r.restarts) / (r.finished / r.n);
    console.log(`\n=== 作り直し (始めの費用 ${startCost} 神): 1 個あたり ${r.perItem.toFixed(2)} 神・完成 ${(100 * r.finished / r.n).toFixed(1)}%・1 人の作り直し ${r.restarts.toFixed(2)} 回 (見込み ${expect.toFixed(2)} 神 = 105.14 + ${startCost} × (1 + ${r.restarts.toFixed(2)}))`);
  }
}
if (which === "ring" || which === "all") {
  const r = M.runTree(data, ringTree(), { n: N, seed: SEED, price, start: ringStart });
  show("金の指輪のサフィックス C (外れはすぐ消去、触媒に完全・素の右側に上級)", 219.76, r);
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
