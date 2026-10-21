/**
 * tree-samples.ts — ツリーの見本 (2026-10-23 オーナー「シミュはサフィックスを全部付けるまでの手順で表示してみて」)。
 * ?page=sim-tree&sample=<名前> で開く (SimTreePage)。計算はまだ繋がない (数字は「—」)。
 *
 * gold-ring-suffix: 金の指輪 ilvl 82 のサフィックス 3 MOD (レアリティ T1・キャストスピード T2 以上・全耐性 T2 以上)。
 *   解析君の docs/org/math/notes/2026-10-21-gold-ring-suffix-ev.md の打ち方 C (外れはすぐ消去) = scripts/analysis/check-tree-run.mjs の ringTree と同じ道。
 *   始まり = プレフィックスにスペルダメージ T2 のフラクチャー + 乱数の MOD 1 つ → 狙いのどれかが付くまでカオス →
 *   レアリティが無い間は右側の高貴のお告げ + 上級の高貴、ある時は無い方をカタリスト + 触媒の高貴のお告げ + 右側の高貴のお告げ + 完全の高貴。
 *   外れたらすぐ消去、消去の後は形の合う箱へ (match)
 */
import { tidy, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";
import { MATCH } from "./tree-run";

export const TREE_SAMPLES = ["gold-ring-suffix"] as const;

const hand = (currency: string, omens: string[] = [], extra: Partial<Hand> = {}): Hand => ({ currency, omens, catalyst: null, quality: 0, ...extra });
function make(base: string, fracture: Aim | null, startRandom: number, boxes: Record<string, Partial<TreeBox>>): TreeDoc {
  const b: Record<string, TreeBox> = {};
  for (const [id, x] of Object.entries(boxes)) b[id] = { id, x: 0, y: 0, out: "junk", aim: null, hand: null, outs: [], back: null, done: null, parent: null, ...x };
  const d: TreeDoc = { schema: "exiledesk-tree/0", base, itemLevel: 82, fracture, startRandom, boxes: b, seq: Object.keys(b).length };
  tidy(d);
  return d;
}

function goldRingSuffix(): TreeDoc {
  const A = { R: { modId: "Rings/ItemFoundRarityIncrease", tier: 1 }, C: { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: { modId: "Rings/AllResistances", tier: 2 } };
  const PLAIN = hand("exalt_greater", ["OmenofDextralExaltation"]);
  const CAT = (cat: string): Hand => hand("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"], { catalyst: cat, quality: 20 });
  // 外れの箱 (id) は消去を打ち、結果の 2 箱 (id_g = 外れが消えた・id_l = 狙いが消えた) は形の合う箱へ
  const J = (parent: string, id: string): Record<string, Partial<TreeBox>> => ({
    [id]: { out: "junk", parent, hand: hand("annul"), outs: [`${id}_g`, `${id}_l`] },
    [`${id}_g`]: { out: "junkGone", parent: id, back: MATCH },
    [`${id}_l`]: { out: "lost", parent: id, back: MATCH },
  });
  return make("Gold Ring", { modId: "Rings/Special_genesis_tree_caster_SpellDamage", tier: 2 }, 1, {
    start: { out: "start", hand: hand("chaos", [], { repeat: { until: "hit", max: null } }), outs: ["sR", "sC", "sA"] },
    sR: { out: "hit", aim: A.R, parent: "start", hand: CAT("catalyst_speed"), outs: ["rc", "ra", "jR"] },
    sC: { out: "hit", aim: A.C, parent: "start", hand: PLAIN, outs: ["cr", "ca", "jC"] },
    sA: { out: "hit", aim: A.A, parent: "start", hand: PLAIN, outs: ["ar", "ac", "jA"] },
    rc: { out: "hit", aim: A.C, parent: "sR", hand: CAT("catalyst_cold"), outs: ["d1", "jRC"] },
    ra: { out: "hit", aim: A.A, parent: "sR", hand: CAT("catalyst_speed"), outs: ["d2", "jRA"] },
    ca: { out: "hit", aim: A.A, parent: "sC", hand: PLAIN, outs: ["d3", "jCA"] },
    cr: { out: "hit", aim: A.R, parent: "sC", back: MATCH },
    ar: { out: "hit", aim: A.R, parent: "sA", back: MATCH },
    ac: { out: "hit", aim: A.C, parent: "sA", back: MATCH },
    d1: { out: "hit", aim: A.A, parent: "rc", done: "main" },
    d2: { out: "hit", aim: A.C, parent: "ra", done: "main" },
    d3: { out: "hit", aim: A.R, parent: "ca", done: "main" },
    ...J("sR", "jR"), ...J("sC", "jC"), ...J("sA", "jA"), ...J("rc", "jRC"), ...J("ra", "jRA"), ...J("ca", "jCA"),
  });
}

export function treeSample(name: string): TreeDoc | null {
  return name === "gold-ring-suffix" ? goldRingSuffix() : null;
}
