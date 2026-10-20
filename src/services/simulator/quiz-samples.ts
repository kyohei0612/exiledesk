/**
 * quiz-samples.ts — 動画のクラフトをクイズのレシピに書いた見本 (ADR-003、2026-10-12)。
 * テスト (tests/simulator/quiz-recipes.test.ts) で、どれも答えの無い状況に来ずに最後まで回ることを確かめる。
 * 値段は仮 (画面で入れ直す)。
 */
import type { QuizRecipe, QuizSlot } from "./quiz-recipe";

const slot = (id: string, side: QuizSlot["side"], mods: string[], kind: QuizSlot["kind"] = "normal", temp = false, minTierIndex = 0): QuizSlot =>
  ({ id, side, mods: mods.map((modId) => ({ modId, minTierIndex })), kind, ...(temp ? { temp } : {}) });

const CONTEMPT = "emotion:Potent Liquid Contempt";
const FEROCITY = "emotion:Potent Liquid Ferocity";

/**
 * 日本語のジュエル動画 (1svgFNDsOXM): エメラルド。クリ率をフラクチャー → クリダメ → 高貴 1 回 → 侮蔑 → 冒涜 (右手のネクロマンシー + 反響)
 * → 左の消去で侮蔑を外す → 高貴で埋めてカオスでアタックダメージ → 獰猛
 */
export function jewelJp(): QuizRecipe {
  const J = "Jewels_dex/";
  return {
    v: 3, name: "エメラルド (1svgFNDsOXM)", base: "Emerald", itemLevel: 82,
    start: { kind: "bought", mods: [{ mod: J + "JewelAttackCriticalChance" }], fill: { prefix: 2, suffix: 2 }, price: 1 },
    routes: [{
      id: "main",
      goal: [
        slot("A", "suffix", [J + "JewelAttackCriticalChance"], "fractured"),
        slot("B", "suffix", [J + "JewelAttackCriticalDamage"]),
        slot("C", "suffix", ["JewelAttackSpeed", "JewelMovementSpeed", "JewelRadiusSpearCriticalDamage", "JewelRadiusSpearAttackSpeed", "JewelBowSpeed"].map((x) => J + x), "desecrated"),
        slot("D", "prefix", [J + "JewelAttackDamage"]),
        slot("E", "prefix", [J + "Emotion_CraftedJewelSuffixEffect"], "crafted"),
        slot("T", "prefix", [J + "Emotion_CraftedJewelAdditionalSuffixAllowed"], "crafted", true),
        slot("X", "suffix", [J + "Emotion_CraftedJewelAdditionalPrefixAllowed"], "crafted", true),
      ],
      rules: [
        // 土台: クリ率をフラクチャー。他が固定されたら次の土台
        { when: { A: 2, fx: 0 }, do: { use: "fracture" } },
        { when: { A: [0, 1, 2] }, do: { restart: true } },
        // 侮蔑の外れ (サフィに「プレフィックス +1」) は消去
        { when: { A: 3, X: 2, B: [0, 2] }, do: { use: "annul" } },
        // クリダメが無い: 固定だけなら高貴、1 つ足したらカオス、多ければ消去
        { when: { A: 3, B: 0, n: 1 }, do: { use: "exalt" } },
        { when: { A: 3, B: 0, n: 2 }, do: { use: "chaos" } },
        { when: { A: 3, B: 0, n: [3, 4, 5] }, do: { use: "annul" } },
        // 侮蔑の前: プレ 1 つにして侮蔑
        { when: { A: 3, B: 2, T: 0, X: 0, "s.free": 0, "p.n": 0 }, do: { use: "exalt" } },
        { when: { A: 3, B: 2, T: 0, X: 0, "s.free": 0, "p.n": 1 }, do: { use: CONTEMPT } },
        { when: { A: 3, B: 2, T: 0, X: 0, "s.free": 0, "p.n": 2 }, do: { use: "annul", omens: ["OmenofSinistralAnnulment"] } },
        // 侮蔑の後: 冒涜 → 発現 → 外れは光のお告げ、当たりなら左の消去で侮蔑を外す
        { when: { T: 2, "s.n": 2, "s.hid": 0 }, do: { use: "desecrate", omens: ["OmenofDextralNecromancy"] } },
        { when: { T: 2, "s.hid": 1 }, do: { reveal: { echoes: true } } },
        { when: { T: 2, "s.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } },
        { when: { T: 2, C: 2, "s.n": 3 }, do: { use: "annul", omens: ["OmenofSinistralAnnulment"] } },
        // 侮蔑を外した後 (サフィ 3 つ): 高貴で埋めて、カオスでアタックダメージ → 獰猛
        { when: { "s.free": -1, "p.n": [0, 1] }, do: { use: "exalt" } },
        { when: { "s.free": -1, "p.n": 2, D: 0 }, do: { use: "chaos" } },
        { when: { "s.free": -1, "p.n": 2, D: 2, E: 0 }, do: { use: FEROCITY } },
      ],
    }],
  };
}

/**
 * 英語のジュエル動画: サファイア 2/2 (クリ率・クリダメ) を買う → 侮蔑 (外れたら買い直し) → 冒涜 + 反響 (外れは光のお告げ)
 * → 左の消去で侮蔑を外す → 高貴 → カオスで最大 ES → 獰猛
 */
export function jewelEn(): QuizRecipe {
  const J = "Jewels_int/";
  return {
    v: 3, name: "Sapphire (EN jewel)", base: "Sapphire", itemLevel: 82,
    start: { kind: "bought", mods: [{ mod: J + "JewelCriticalChance" }, { mod: J + "JewelCriticalDamage" }], fill: { prefix: 2 }, price: 1 },
    routes: [{
      id: "main",
      goal: [
        slot("A", "suffix", [J + "JewelCriticalChance"]),
        slot("B", "suffix", [J + "JewelCriticalDamage"]),
        slot("C", "suffix", [J + "JewelIncreasedDuration", J + "JewelManaRegeneration"], "desecrated"),
        slot("D", "prefix", [J + "JewelEnergyShield"]),
        slot("E", "prefix", [J + "Emotion_CraftedJewelSuffixEffect"], "crafted"),
        slot("T", "prefix", [J + "Emotion_CraftedJewelAdditionalSuffixAllowed"], "crafted", true),
      ],
      rules: [
        // 買ったまま: 侮蔑。外れ (侮蔑がプレに付かない) は買い直し
        { when: { A: 2, B: 2, T: 0, "s.free": 0, "p.n": 2, "s.n": 2 }, do: { use: CONTEMPT } },
        { when: { T: 0, "s.free": [0, 1] }, do: { restart: true } },
        { when: { T: 2, "s.n": 2, "s.hid": 0 }, do: { use: "desecrate" } },
        { when: { T: 2, "s.hid": 1 }, do: { reveal: { echoes: true } } },
        { when: { T: 2, "s.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } },
        { when: { T: 2, C: 2, "s.n": 3 }, do: { use: "annul", omens: ["OmenofSinistralAnnulment"] } },
        { when: { "s.free": -1, "p.n": [0, 1] }, do: { use: "exalt" } },
        { when: { "s.free": -1, "p.n": 2, D: 0 }, do: { use: "chaos" } },
        { when: { "s.free": -1, "p.n": 2, D: 2, E: 0 }, do: { use: FEROCITY } },
      ],
    }],
  };
}

/**
 * 出血の槍 (7V0WBMOGbPg): 物理 % (T3 以上) とメレーのスキルレベル (T2 以上) のマジックを買う → 研磨のグレーターエッセンス
 * → 左手のネクロマンシーで冒涜 → 大いなる高貴 + 偉大の高貴のお告げでサフィ 2 つ → 発現 (反響)、物理 % と命中のハイブリッドでなければ光のお告げ
 */
export function spearBleed(): QuizRecipe {
  const S = "Spears/";
  return {
    v: 3, name: "Spear (7V0WBMOGbPg)", base: "Steelhead Spear", itemLevel: 82,
    start: { kind: "bought", mods: [{ mod: S + "LocalPhysicalDamagePercent", tier: "T3" }, { mod: S + "GlobalIncreaseMeleeSkillGemLevel", tier: "T2" }], price: 1 },
    routes: [{
      id: "main",
      goal: [
        slot("A", "prefix", [S + "LocalPhysicalDamagePercent"], "normal", false, 5),
        slot("B", "suffix", [S + "GlobalIncreaseMeleeSkillGemLevel"], "normal", false, 2),
        slot("E", "prefix", [S + "Essence_PhysicalDamage"], "essence"),
        slot("C", "prefix", [S + "LocalIncreasedPhysicalDamagePercentAndAccuracyRating"], "desecrated"),
        slot("F", "suffix", []),
        slot("G", "suffix", []),
      ],
      rules: [
        { when: { r: "m", A: 2, B: 2 }, do: { use: "essence:greater:" + S + "Essence_PhysicalDamage" } },
        { when: { r: "r", A: 2, B: 2, E: 2, C: 0, "p.hid": 0, "p.bad": 0, "p.n": 2 }, do: { use: "desecrate", omens: ["OmenofSinistralNecromancy"] } },
        { when: { "p.hid": 1, "s.n": 1 }, do: { use: "exalt_greater", omens: ["OmenofGreaterExaltation"] } },
        { when: { "p.hid": 1, "s.n": 3 }, do: { reveal: { echoes: true } } },
        { when: { "p.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } },
      ],
    }],
  };
}

/**
 * 靴 (S-7YHuq3-P4): ウートレッドのルーンを差した 2 ソケットの白 → 完全な変成・増強で移動速度 (時間術) と T1 耐性のマジック
 * → 豊穣のグレーターエッセンス → 左手のネクロマンシーで冒涜 → フラクチャー (移動速度でなければ買い直し) → アストリッドの創造性
 * → 神秘の合金 (左の結晶化で冒涜を消す) → 完全な高貴 → 古びた骨 → 発現 (ドッジロール、外れは光のお告げ)
 */
export function bootsChrono(): QuizRecipe {
  const B = "Boots_str/";
  const RARITY = "essence:greater:" + B + "Essence_ItemFoundRarityIncrease";
  const SPIRIT = "essence:perfect:" + B + "PerfectEssence_BaseSpirit";
  return {
    v: 3, name: "Boots (S-7YHuq3-P4)", base: "Vaal Greaves", itemLevel: 82,
    start: { kind: "white", price: 1, sockets: 2, runes: ["Uhtred's Sidereus"] },
    routes: [{
      id: "main",
      goal: [
        slot("A", "prefix", [B + "Rune_chronomancy_MovementVelocity"], "fractured", false, 2),
        slot("C", "prefix", [B + "Rune_chronomancy_DodgeRoll"], "desecrated"),
        slot("G", "prefix", []),
        slot("R", "suffix", ["LightningResistance", "FireResistance", "ColdResistance"].map((x) => B + x), "normal", false, 7),
        slot("E", "suffix", [B + "Essence_ItemFoundRarityIncrease"], "essence"),
        slot("F", "suffix", [B + "PerfectEssence_BaseSpirit"], "essence"),
      ],
      rules: [
        // マジック: 移動速度と T1 耐性が揃うまで完全な増強、外れは消去
        { when: { r: "n" }, do: { use: "transmute_perfect" } },
        { when: { r: "m", n: 0 }, do: { use: "augment_perfect" } },
        { when: { r: "m", A: 2, R: 0, "s.n": 0 }, do: { use: "augment_perfect" } },
        { when: { r: "m", A: 0, R: 2, "p.n": 0 }, do: { use: "augment_perfect" } },
        { when: { r: "m", A: 0, "p.n": 1 }, do: { use: "annul" } },
        { when: { r: "m", R: 0, "s.n": 1 }, do: { use: "annul" } },
        { when: { r: "m", A: 1 }, do: { use: "annul" } },
        { when: { r: "m", R: 1 }, do: { use: "annul" } },
        { when: { r: "m", A: 2, R: 2 }, do: { use: RARITY } },
        // レア: 冒涜の壁 → フラクチャー
        { when: { r: "r", fx: 0, n: 3, "p.hid": 0 }, do: { use: "desecrate", omens: ["OmenofSinistralNecromancy"] } },
        { when: { r: "r", fx: 0, n: 4 }, do: { use: "fracture" } },
        { when: { fx: 1, A: [0, 1, 2] }, do: { restart: true } },
        // 移動速度が固定できた: アストリッド → 神秘の合金で冒涜を消す → 高貴 → 古びた骨 → 発現
        { when: { A: 3, aug: 1 }, do: { use: "rune:Astrid's Creativity" } },
        { when: { A: 3, aug: 2, "p.hid": 1, F: 0 }, do: { use: SPIRIT, omens: ["OmenofSinistralCrystallisation"] } },
        { when: { A: 3, F: 2, "p.n": 1 }, do: { use: "exalt_perfect" } },
        // 高貴でドッジロールが付いた (普通の MOD として) 時は、残りのプレも高貴で
        { when: { A: 3, F: 2, "p.n": 2, C: 2, G: 0 }, do: { use: "exalt_perfect" } },
        { when: { A: 3, F: 2, "p.n": 2, "p.hid": 0, "p.bad": 0, C: 0 }, do: { use: "desecrate_ancient" } },
        { when: { A: 3, F: 2, "p.hid": 1 }, do: { reveal: { echoes: true } } },
        { when: { "p.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } },
      ],
    }],
  };
}

export const QUIZ_SAMPLES: Array<{ id: string; make: () => QuizRecipe }> = [
  { id: "jewel-jp", make: jewelJp },
  { id: "jewel-en", make: jewelEn },
  { id: "spear-bleed", make: spearBleed },
  { id: "boots-chrono", make: bootsChrono },
];
