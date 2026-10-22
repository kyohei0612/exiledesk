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
 * (10-22 オーナー「サフィに 3 MOD 付いた時点で、そこから先は全て同じルート」)。プレフィックス (10-22 オーナー「先無駄高貴後エッセンス」「冒涜でレアリティ」):
 *   素の高貴 (無駄高貴、サフィは満杯なのでプレに付く) → 外れのプレならパーフェクトエッセンス (ルーンの守り) + 左側の結晶化 = 消せるプレは外れだけなので確定で入れ替わり、箱 1 つ →
 *   骨で冒涜 → 発現 (一般 MOD も候補に出る) でレアリティ (プレ T1) を選べたら完成。外れは光のお告げ + 消去で冒涜の MOD だけ消して打ち直す (結果は 1 通り)。
 *   無駄高貴でレアリティが付いた時は、もう一度無駄高貴 → エッセンスで外れが消えたら完成、レアリティが消えたら左側の消去で外れを消してルーンの守りの箱へ
 *
 * boots-res-split: ドレイクスキンブーツ ilvl 82、移動スピード T1 のフラクチャー済みから耐性 T1 × 2 (サフィックス) まで (10-22 オーナー OK「見本の靴を足す」)。
 *   解析君 scripts/analysis/boots-res-ev.mjs・docs/org/math/notes/2026-10-23-boots-res.md の道 (100 人 29.87 神) を白紙から組み直した木
 *   (シミュ部長 9 本目、100 人 seed 1 で完成 100%・30.51 神・止まり 0、台本 scripts/_tree-split-probe)。
 *   上級の高貴 → 耐性のどれかが付くまでカオス → 分かれ目: 狙い 2 つ = 完成 / 狙い 0 = カオスへ / サフィックスの外れ 2 つ以上 = 消去 / それ以外 = 右側の高貴のお告げ + 上級の高貴
 */
import { tidy, type Aim, type Hand, type TreeBox, type TreeDoc } from "./tree-model";

export const TREE_SAMPLES = ["gold-ring-suffix", "boots-res-split"] as const;

const hand = (currency: string, omens: string[] = [], extra: Partial<Hand> = {}): Hand => ({ currency, omens, catalyst: null, quality: 0, ...extra });
function make(base: string, fracture: Aim | null, startRandom: number, boxes: Record<string, Partial<TreeBox>>): TreeDoc {
  const b: Record<string, TreeBox> = {};
  for (const [id, x] of Object.entries(boxes)) b[id] = { id, x: 0, y: 0, out: "junk", aim: null, hand: null, outs: [], back: null, done: null, parent: null, ...x };
  const d: TreeDoc = { schema: "exiledesk-tree/0", base, itemLevel: 82, start: { rarity: "rare", mods: fracture ? [{ ...fracture, fractured: true }] : [] }, startRandom, boxes: b, seq: Object.keys(b).length };
  tidy(d);
  return d;
}

function goldRingSuffix(): TreeDoc {
  const A = {
    R: { modId: "Rings/ItemFoundRarityIncrease", tier: 1 }, C: { modId: "Rings/IncreasedCastSpeed", tier: 2 }, A: { modId: "Rings/AllResistances", tier: 2 },
    PR: { modId: "Rings/ItemFoundRarityIncreasePrefix", tier: 1 }, W: { modId: "Rings/PerfectEssence_BaseRunicWard", tier: 1 },
  };
  /** パーフェクトエッセンス (ルーンの守り) + 左側の結晶化 (プレだけ消す) */
  const ESS = hand("essence:perfect:Rings/PerfectEssence_BaseRunicWard", ["OmenofSinistralCrystallisation"]);
  const PLAIN = hand("exalt_greater", ["OmenofDextralExaltation"]);
  /** 触媒の高貴 (前のカタリストの手で入れた品質を使う) */
  const CAT = hand("exalt_perfect", ["OmenofCatalysingExaltation", "OmenofDextralExaltation"]);
  const SPAM = hand("chaos", [], { repeat: { until: "hit", max: null } });
  // 外れの箱 (id) は消去を打ち、結果の 2 箱: id_g = 外れが消えた → back (外れの前の箱)、id_l = 狙いが消えた → lost。
  // lost は狙いが全部消えた時だけ始めに戻る。狙い 2 つ + 外れで 1 つ消えたら、残った狙い 1 つ + 外れの箱 (もう一度消去) へ
  // (残ったのが別の狙いなら tree-run の settle が形の合う箱へ。10-22 オーナー「2 MOD 狙い・1 外れの時、初めから戻ってる」、解析君の ringTree の match と同じ行き先)。
  // 狙い 2 つ + 外れ (満杯) の手は素の消去が一番安いか同じ (解析君 10-22 scripts/analysis/gold-ring-midway-ev.mjs: 始めに戻るは +1〜5 神、右側の消去のお告げは +13 神。
  // 外れの MOD レベルが 40 未満なら削減 + カオスが安い時もあるが、ツリーは MOD レベルで分けられない)
  const J = (parent: string, id: string, back: string, lost = "start", remove: Hand = hand("annul")): Record<string, Partial<TreeBox>> => ({
    [id]: { out: "junk", parent, hand: remove, outs: [`${id}_g`, `${id}_l`] },
    [`${id}_g`]: { out: "junkGone", parent: id, back },
    [`${id}_l`]: { out: "lost", parent: id, back: lost },
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
    // サフィックスの完成 = d1 に合流 (d2・d3 は同じ形)。d1 からプレフィックス (10-22 オーナー「先無駄高貴後エッセンス」「冒涜でレアリティ」)。サフィは満杯なので高貴・骨はお告げ無しでプレに付く:
    // 素の高貴 (無駄高貴) → 外れのプレならパーフェクトエッセンス (ルーンの守り) + 左側の結晶化 = 消せるプレは外れだけなので確定で入れ替わり、箱 1 つ (pE)
    d1: { out: "hit", aim: A.A, parent: "rc_q", hand: hand("exalt"), outs: ["pW", "pRx"] },
    d2: { out: "hit", aim: A.C, parent: "ra_q", back: "d1" },
    d3: { out: "hit", aim: A.R, parent: "ca", back: "d1" },
    ...J("sR_q", "jR", "sR"), ...J("sC", "jC", "sC"), ...J("sA", "jA", "sA"), ...J("rc_q", "jRC", "rc", "jR"), ...J("ra_q", "jRA", "ra", "jR"), ...J("ca", "jCA", "ca", "jC"),
    pW: { out: "junk", parent: "d1", hand: ESS, outs: ["pE"] },
    pE: { out: "hit", aim: A.W, parent: "pW", hand: hand("desecrate"), outs: ["pD", "pX"] },
    // 冒涜の発現は一般 MOD も候補に出る (オーナー 10-22「冒涜は一般モッドもでる」) → レアリティを選べたら完成。外れは光のお告げ + 消去で冒涜の MOD だけ消して打ち直す (結果は 1 通り)
    pD: { out: "hit", aim: A.PR, parent: "pE", done: "main" },
    pX: { out: "junk", parent: "pE", hand: hand("annul", ["OmenofLight"]), outs: ["pX_g"] },
    pX_g: { out: "junkGone", parent: "pX", back: "pE" },
    // 無駄高貴でレアリティが付いた時: もう一度無駄高貴 (空きは 1 つで外れが確定) → エッセンスは外れかレアリティのどちらかを消す
    pRx: { out: "hit", aim: A.PR, parent: "d1", hand: hand("exalt"), outs: ["pRxJ"] },
    pRxJ: { out: "junk", parent: "pRx", hand: ESS, outs: ["pRxW", "pRxL"] },
    pRxW: { out: "hit", aim: A.W, parent: "pRxJ", done: "main" },
    // レアリティが消えた = 無駄高貴の外れが残る → 左側の消去で外れを消してルーンの守りの箱へ (ルーンの守りが消えたらサフィ完成の d1 へ)
    pRxL: { out: "lost", parent: "pRxJ", hand: hand("annul", ["OmenofSinistralAnnulment"]), outs: ["pRxL_g", "pRxL_l"] },
    pRxL_g: { out: "junkGone", parent: "pRxL", back: "pE" },
    pRxL_l: { out: "lost", parent: "pRxL", back: "d1" },
  });
}

function bootsResSplit(): TreeDoc {
  const F = { modId: "Boots_dex/FireResistance", tier: 1 }, C = { modId: "Boots_dex/ColdResistance", tier: 1 }, L = { modId: "Boots_dex/LightningResistance", tier: 1 };
  return make("Drakeskin Boots", { modId: "Boots_dex/MovementVelocity", tier: 1 }, 0, {
    start: { out: "start", hand: hand("exalt_greater", [], { free: true }), outs: ["b1"] },
    b1: { out: "any", parent: "start", hand: hand("chaos", [], { repeat: { until: "hit", max: null } }), outs: ["b2", "b3", "b4"] },
    // 耐性のどれが付いても同じ組の箱 (b2) へ。b2 は打たずに分ける
    b2: { out: "hit", aim: F, parent: "b1", outs: ["b16", "b17", "b18", "b15"],
      split: [{ when: { heldCount: [2, 99] }, to: "b16" }, { when: { heldCount: [0, 0] }, to: "b17" }, { when: { junk: { suffix: [2, 99] } }, to: "b18" }, { when: {}, to: "b15" }] },
    b3: { out: "hit", aim: C, parent: "b1", back: "b2" },
    b4: { out: "hit", aim: L, parent: "b1", back: "b2" },
    b16: { out: "branch", parent: "b2", done: "main" },
    b17: { out: "branch", parent: "b2", back: "b1" },
    b18: { out: "branch", parent: "b2", hand: hand("annul"), outs: ["b19", "b20"] },
    b19: { out: "junkGone", parent: "b18", back: "b2" },
    b20: { out: "lost", parent: "b18", back: "b2" },
    b15: { out: "branch", parent: "b2", hand: hand("exalt_greater", ["OmenofDextralExaltation"]), outs: ["b21", "b22", "b23", "b24"] },
    b21: { out: "hit", aim: F, parent: "b15", back: "b2" },
    b22: { out: "hit", aim: C, parent: "b15", back: "b2" },
    b23: { out: "hit", aim: L, parent: "b15", back: "b2" },
    b24: { out: "junk", parent: "b15", back: "b2" },
  });
}

export function treeSample(name: string): TreeDoc | null {
  return name === "gold-ring-suffix" ? goldRingSuffix() : name === "boots-res-split" ? bootsResSplit() : null;
}
