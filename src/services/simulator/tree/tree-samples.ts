/**
 * tree-samples.ts — ツリーの見本 (2026-10-23 オーナー「シミュはサフィックスを全部付けるまでの手順で表示してみて」)。
 * ?page=sim-tree&sample=<名前> で開く (SimTreePage)。計算はまだ繋がない (数字は「—」)。
 *
 * gold-ring-suffix: 金の指輪 ilvl 82 の完成品まで 1 本 (名前は前のまま、10-22 にプレフィックスをつないだ。オーナー「このままプレフィックスだね」)。
 * サフィックス 3 MOD (レアリティ T1・キャストスピード T2 以上・全耐性 T2 以上):
 *   解析君の docs/org/math/notes/2026-10-21-gold-ring-suffix-ev.md の打ち方 C (外れはすぐ消去) = scripts/analysis/check-tree-run.mjs の ringTree と同じ道。
 *   始まり = プレフィックスにスペルダメージ T2 のフラクチャー + 乱数の MOD 1 つ → 狙いのどれかが付くまでカオス →
 *   レアリティが無い間は右側の高貴のお告げ + 上級の高貴、ある時は無い方を カタリストの手 (品質を最大まで、札 1 枚) → 触媒の高貴のお告げ + 右側の高貴のお告げ + 完全の高貴
 *   (10-22 オーナーの案 A: カタリストはいつも別の札)。
 *   外れたらすぐ消去。外れが消えたら外れの前の当たりの箱へ戻る (カタリストの手の上の箱 = 入れ直す所。人が選ぶのと同じ具体的な箱、10-22 オーナー
 *   「続きからって選択肢選べんでしょ」)、2 つ目の当たりは同じ組の箱へ (レアリティ → キャスト = rc など)。狙いが消えたら始めに戻る (始まりのカオスを
 *   当たるまで。10-22 オーナー「狙いが消えたらカオススパムだろ」「選択肢として初めに戻るでいいのでは」)。狙いが 2 つあった時は残った狙い + 外れで戻るので、
 *   カオスで付いた箱の形と実物が違えば続きから (tree-run の settle。無いと 100 人中 23 人がサフィックス満杯で止まった)
 * サフィックスの完成 3 箱は同じ形 (300 人で完成の時点のプレフィックス・空きが全員同じ、scripts/_tree-done-shape-probe) なので d1 に合流し、その下にプレフィックス 1 本
 * (10-22 オーナー「サフィに 3 MOD 付いた時点で、そこから先は全て同じルート」):
 *   P2 = レアリティのプレフィックス T1 (解析君 docs/org/math/notes/2026-10-22-gold-ring-prefix.md の案 3・追記 2、オーナー 10-22 OK、1 個 466〜472 神・完成 99%):
 *   素の高貴 → 外れたら 左側の結晶化のお告げ + アビスのエッセンス で外れを深淵の王の印 (MOD レベル 1) の餌に替え →
 *   削減のお告げ + 完全のカオス (削減は必ず餌を消す) → 当たり / 外れたらまた餌を付けてから削減。
 *   解析君の台本は「新しい外れがサフィックスより低い MOD レベルならそのまま餌にする」が、ツリーは MOD レベルで分けられないので毎回餌を付け直す。
 *   P3 = 冒涜専用のクルガルの「エナジーシールドが満タンの間スペルダメージ (15–25)% 増加」(Kurgal's、MOD レベル 65、poe2db /us/Desecrated_Modifiers):
 *   保存された鎖骨 + 黒き血のお告げ (クルガルの MOD が必ず候補に) → 発現で選ぶ (tree-sample の reveal)。外れは光のお告げ + 消去で冒涜の MOD だけ消して打ち直す (結果は外れが消えた 1 通り)
 *   (10-22 オーナー「冒涜は冒涜で付与かな」)
 */
import { tidy, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";

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
  const A = {
    R: { modId: "Rings/ItemFoundRarityIncrease", tier: 1 }, C: { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: { modId: "Rings/AllResistances", tier: 2 },
    PR: { modId: "Rings/ItemFoundRarityIncreasePrefix", tier: 1 }, PD: { modId: "Rings/Desecrated_IncreasedSpellDamageOnFullEnergyShield", tier: 1 },
  };
  const PLAIN = hand("exalt_greater", ["OmenofDextralExaltation"]);
  /** 触媒の高貴 (前のカタリストの手で入れた品質を使う) */
  const CAT = hand("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]);
  const SPAM = hand("chaos", [], { repeat: { until: "hit", max: null } });
  // 外れの箱 (id) は消去を打ち、結果の 2 箱: id_g = 外れが消えた → back (外れの前の箱)、id_l = 狙いが消えた → 始めに戻る
  const J = (parent: string, id: string, back: string, remove: Hand = hand("annul")): Record<string, Partial<TreeBox>> => ({
    [id]: { out: "junk", parent, hand: remove, outs: [`${id}_g`, `${id}_l`] },
    [`${id}_g`]: { out: "junkGone", parent: id, back },
    [`${id}_l`]: { out: "lost", parent: id, back: "start" },
  });
  // カタリストの手 (id → 通り抜け id_q) の後に触媒の高貴を打つ箱。outs は触媒の高貴の結果
  const Q = (id: string, box: Partial<TreeBox>, cat: string, outs: string[]): Record<string, Partial<TreeBox>> => ({
    [id]: { ...box, hand: hand(cat), outs: [`${id}_q`] },
    [`${id}_q`]: { out: "pass", parent: id, hand: CAT, outs },
  });
  return make("Gold Ring", { modId: "Rings/Special_genesis_tree_caster_SpellDamage", tier: 2 }, 1, {
    start: { out: "start", hand: SPAM, outs: ["sR", "sC", "sA"] },
    ...Q("sR", { out: "hit", aim: A.R, parent: "start" }, "catalyst_speed", ["rc", "ra", "jR"]),
    sC: { out: "hit", aim: A.C, parent: "start", hand: PLAIN, outs: ["cr", "ca", "jC"] },
    sA: { out: "hit", aim: A.A, parent: "start", hand: PLAIN, outs: ["ar", "ac", "jA"] },
    ...Q("rc", { out: "hit", aim: A.C, parent: "sR_q" }, "catalyst_cold", ["d1", "jRC"]),
    ...Q("ra", { out: "hit", aim: A.A, parent: "sR_q" }, "catalyst_speed", ["d2", "jRA"]),
    ca: { out: "hit", aim: A.A, parent: "sC", hand: PLAIN, outs: ["d3", "jCA"] },
    cr: { out: "hit", aim: A.R, parent: "sC", back: "rc" },
    ar: { out: "hit", aim: A.R, parent: "sA", back: "ra" },
    ac: { out: "hit", aim: A.C, parent: "sA", back: "ca" },
    // サフィックスの完成 = d1 に合流 (d2・d3 は同じ形)。d1 からプレフィックス
    d1: { out: "hit", aim: A.A, parent: "rc_q", hand: hand("exalt"), outs: ["pR", "pJ"] },
    d2: { out: "hit", aim: A.C, parent: "ra_q", back: "d1" },
    d3: { out: "hit", aim: A.R, parent: "ca", back: "d1" },
    ...J("sR_q", "jR", "sR"), ...J("sC", "jC", "sC"), ...J("sA", "jA", "sA"), ...J("rc_q", "jRC", "rc"), ...J("ra_q", "jRA", "ra"), ...J("ca", "jCA", "ca"),
    pR: { out: "hit", aim: A.PR, parent: "d1", hand: hand("desecrate", ["OmenoftheBlackblooded"]), outs: ["pD", "pX"] },
    // 外れ → 餌 (狙い無しの手: 外れを印に替えるだけ) → 削減 + 完全のカオス。外れたら餌の箱へ戻って付け直す
    pJ: { out: "junk", parent: "d1", hand: hand("essence:perfect:Rings/PerfectEssence_EssenceAbyss", ["OmenofSinistralCrystallisation"], { free: true }), outs: ["pB"] },
    pB: { out: "any", parent: "pJ", hand: hand("chaos_perfect", ["OmenofWhittling"]), outs: ["pR2", "pBl", "pBj"] },
    pR2: { out: "hit", aim: A.PR, parent: "pB", back: "pR" },
    pBl: { out: "lost", parent: "pB", back: "start" },
    pBj: { out: "junk", parent: "pB", back: "pJ" },
    pD: { out: "hit", aim: A.PD, parent: "pR", done: "main" },
    // 光のお告げ + 消去は冒涜の MOD だけを消すので結果は「外れが消えた」1 通り (10-22 オーナー、tree-sample の singleOutOf)
    pX: { out: "junk", parent: "pR", hand: hand("annul", ["OmenofLight"]), outs: ["pX_g"] },
    pX_g: { out: "junkGone", parent: "pX", back: "pR" },
  });
}

export function treeSample(name: string): TreeDoc | null {
  return name === "gold-ring-suffix" ? goldRingSuffix() : null;
}
