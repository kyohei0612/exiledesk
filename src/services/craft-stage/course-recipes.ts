/**
 * course-recipes.ts — 入門〜中級のクラフトのコースのレシピ (2026-10-17 オーナー「入門・中級は付いたら 100% 狙いの MOD が付くように」)。
 *
 * 使うのは必ず狙いが付く手だけ:
 *   - エッセンス (マジック → レア + 決まった MOD)
 *   - 勢力のお告げ + 側のお告げの冒涜 → 発現 (その部位・その側の勢力の冒涜 MOD が 3 種類以下なら、候補 3 つに必ず全部入る。2026-10-17 総当たりで確認)
 *   - パーフェクトエッセンス / 合金 (消える物が外れ 1 つしか無い時。側の結晶化のお告げで外れの側を指す)
 *   - 「何でも良い」枠の高貴
 * テスト (tests/craft-courses.test.ts) で、200 人とも同じ手数・ベース 1 個で完成する (運で外れる手が無い) ことを確かめる。
 * 元の動画の狙いのうち、必ずは付かない物 (普通の MOD のハイブリッドなど) は、必ず付く物に替えた (assumed に書く)
 */
import type { QuizRecipe, QuizSlot } from "../simulator/quiz-recipe";
import type { JaEn } from "./quiz-tutorials";

const slot = (id: string, side: QuizSlot["side"], mods: string[], kind: QuizSlot["kind"] = "normal"): QuizSlot =>
  ({ id, side, mods: mods.map((modId) => ({ modId, minTierIndex: 0 })), kind });
const any = (ids: string[], side: QuizSlot["side"]): QuizSlot[] => ids.map((id) => slot(id, side, []));

/** レシピと、手ごとの説明 (並びは rules と同じ) */
export interface CourseRecipe { recipe: QuizRecipe; why: JaEn[]; assumed: JaEn[] }

const EMPTY_MAGIC: Array<[QuizRecipe["routes"][number]["rules"][number], JaEn]> = [
  [{ when: { r: "n" }, do: { use: "transmute" } }, ["変成のオーブでマジックにする (付く MOD は何でも良い)", "Make it magic with an Orb of Transmutation (any mod is fine)"]],
  [{ when: { r: "m", n: 1 }, do: { use: "annul" } }, ["付いた MOD は消去のオーブで消しておく (マジックのまま)。後のエッセンスや骨と同じ系統がぶつかって打てなくなるのを防ぐ", "Annul the mod it added (it stays magic). This keeps a same-group mod from blocking the essence or the bone later"]],
];
/** 残りの「何でも」を高貴で埋める (空きが 2 つ以上なら偉大なる高貴のお告げで 2 つまとめて) */
const FILL = (free2: Record<string, number | number[] | string>, free1: Record<string, number | number[] | string>): Array<[QuizRecipe["routes"][number]["rules"][number], JaEn]> => [
  [{ when: free2, do: { use: "exalt_greater", omens: ["OmenofGreaterExaltation"] } }, ["残りは何でも良い。偉大なる高貴なお告げを掛けた上級の高貴で 2 つまとめて埋める", "The rest can be anything: a Greater Exalted Orb with Omen of Greater Exaltation adds 2 at once"]],
  [{ when: free1, do: { use: "exalt" } }, ["最後の 1 つは普通の高貴で", "A plain Exalted Orb for the last one"]],
];
function build(base: string, start: QuizRecipe["start"], goal: QuizSlot[], pairs: Array<[QuizRecipe["routes"][number]["rules"][number], JaEn]>, assumed: JaEn[]): CourseRecipe {
  return { recipe: { v: 3, name: base, base, itemLevel: 82, start, routes: [{ id: "main", goal, rules: pairs.map((x) => x[0]) }] }, why: pairs.map((x) => x[1]), assumed };
}

/** 入門: 決闘のワンド (SaVeQ qdyfBnzqBLo)。スペルダメージ (エッセンス) と元素ダメージ (アマナムの冒涜) */
export function wandCourse(): CourseRecipe {
  const W = "Wands/";
  return build("Dueling Wand", { kind: "white", price: 1 }, [
    slot("E", "prefix", [W + "Essence_WeaponCasterDamagePrefix"], "essence"),
    slot("C", "prefix", [W + "Desecrated_WeaponDamageTypePrefix"], "desecrated"),
    ...any(["P"], "prefix"), ...any(["S1", "S2", "S3"], "suffix"),
  ], [
    ...EMPTY_MAGIC,
    [{ when: { r: "m", n: 0 }, do: { use: "essence:greater:" + W + "Essence_WeaponCasterDamagePrefix" } }, ["空のマジックに魔法のグレーターエッセンス。スペルダメージが必ず付いてレアになる", "A Greater Essence of Sorcery on the empty magic wand: Spell Damage for sure, and it turns rare"]],
    [{ when: { r: "r", E: 2, C: 0, "p.hid": 0, "p.bad": 0 }, do: { use: "desecrate", omens: ["OmenofSinistralNecromancy", "OmenoftheLiege"] } }, ["元素ダメージはアマナムの冒涜のプレフィックス。骨に左手のネクロマンシー (プレフィックスに) と君主のお告げ (アマナムだけに) を掛ける。ワンドのプレフィックスのアマナムは 3 種類なので、候補 3 つに必ず入る", "Elemental Damage is an Amanamu desecrated prefix: Sinistral Necromancy + Omen of the Liege on the bone. Wands have only 3 Amanamu prefixes, so it is always among the 3 options"]],
    [{ when: { "p.hid": 1 }, do: { reveal: { echoes: false } } }, ["発現して元素ダメージを選ぶ", "Reveal and pick Elemental Damage"]],
    [{ when: { "p.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } }, ["(選び間違えた時) 光のお告げ + 消去で冒涜だけ消して、骨からやり直す", "(If you picked the wrong one) Omen of Light + Annulment removes only the desecrated mod; desecrate again"]],
    ...FILL({ C: 2, n: [2, 3, 4] }, { C: 2, n: 5 }),
  ], [["動画は冷気スペルのレベル付きのマジックを買っている。ここでは白から、必ず付く手だけで", "The video buys a magic wand with Cold Spell level; here you start from white with sure moves only"]]);
}

/** 初級: 鋼頭の槍 (出血の槍 7V0WBMOGbPg)。物理ダメージ (擦傷のエッセンス) と近接ダメージ (クルガルの冒涜) */
export function spearCourse(): CourseRecipe {
  const S = "Spears/";
  return build("Steelhead Spear", { kind: "white", price: 1 }, [
    slot("E", "prefix", [S + "Essence_PhysicalDamage"], "essence"),
    slot("C", "prefix", [S + "Desecrated_MeleeDamage"], "desecrated"),
    ...any(["P"], "prefix"), ...any(["S1", "S2", "S3"], "suffix"),
  ], [
    ...EMPTY_MAGIC,
    [{ when: { r: "m", n: 0 }, do: { use: "essence:greater:" + S + "Essence_PhysicalDamage" } }, ["空のマジックに擦傷のグレーターエッセンス。物理ダメージが必ず付いてレアになる", "A Greater Essence of Abrasion on the empty magic spear: physical damage for sure, and it turns rare"]],
    [{ when: { r: "r", E: 2, C: 0, "p.hid": 0, "p.bad": 0 }, do: { use: "desecrate", omens: ["OmenofSinistralNecromancy", "OmenoftheBlackblooded"] } }, ["近接ダメージはクルガルの冒涜のプレフィックス。骨に左手のネクロマンシーとブラックブラッドのお告げ (クルガルだけに) を掛ける。槍のプレフィックスのクルガルは 3 種類なので、候補 3 つに必ず入る", "Melee Damage is a Kurgal desecrated prefix: Sinistral Necromancy + Omen of the Blackblooded on the bone. Spears have only 3 Kurgal prefixes, so it is always among the 3 options"]],
    [{ when: { "p.hid": 1 }, do: { reveal: { echoes: false } } }, ["発現して近接ダメージを選ぶ", "Reveal and pick Melee Damage"]],
    [{ when: { "p.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } }, ["(選び間違えた時) 光のお告げ + 消去で冒涜だけ消して、骨からやり直す", "(If you picked the wrong one) Omen of Light + Annulment removes only the desecrated mod; desecrate again"]],
    ...FILL({ C: 2, n: [2, 3, 4] }, { C: 2, n: 5 }),
  ], [["動画は冒涜で物理と命中のハイブリッド (普通の MOD で必ずは出ない) を狙う。ここでは必ず出るクルガルの近接ダメージに替えた", "The video aims for a physical + accuracy hybrid (a normal mod, not guaranteed); here it is Kurgal Melee Damage, which always shows up"]]);
}

/** 中級: 金のアミュレット。外れ 1 つだけをパーフェクトエッセンスで置き換える小技 + クルガルの冒涜 */
export function amuletCourse(): CourseRecipe {
  const A = "Amulets/";
  return build("Gold Amulet", { kind: "white", price: 1 }, [
    slot("E", "prefix", [A + "PerfectEssence_AllDefences"], "essence"),
    slot("C", "prefix", [A + "Desecrated_MaximumEnergyShieldFromBodyArmour"], "desecrated"),
    ...any(["P"], "prefix"), ...any(["S1", "S2", "S3"], "suffix"),
  ], [
    ...EMPTY_MAGIC,
    [{ when: { r: "m", n: 0 }, do: { use: "regal" } }, ["王者のオーブでレアに (付く MOD は何でも良い。次のエッセンスで消える)", "A Regal Orb makes it rare (any mod; the next essence removes it)"]],
    [{ when: { r: "r", E: 0, n: 1 }, do: { use: "essence:perfect:" + A + "PerfectEssence_AllDefences" } }, ["パーフェクトエッセンスは MOD を 1 つ消してから付ける。MOD が 1 つだけなら消えるのはそれ。グローバル防御が必ず付く", "A Perfect Essence removes a mod before adding its own. With only one mod, that one goes. Global Defences for sure"]],
    [{ when: { E: 2, C: 0, "p.hid": 0, "p.bad": 0 }, do: { use: "desecrate", omens: ["OmenofSinistralNecromancy", "OmenoftheBlackblooded"] } }, ["アミュレットのプレフィックスのクルガルは 3 種類なので、左手のネクロマンシーとブラックブラッドのお告げで、狙いが候補 3 つに必ず入る", "Amulets have only 3 Kurgal prefixes, so with Sinistral Necromancy + Omen of the Blackblooded the target is always among the 3"]],
    [{ when: { "p.hid": 1 }, do: { reveal: { echoes: false } } }, ["発現して「ボディアーマーの最大エナジーシールド」を選ぶ", "Reveal and pick the Energy Shield from Body Armour mod"]],
    [{ when: { "p.bad": 1 }, do: { use: "annul", omens: ["OmenofLight"] } }, ["(選び間違えた時) 光のお告げ + 消去で冒涜だけ消す", "(If you picked the wrong one) Omen of Light + Annulment removes only the desecrated mod"]],
    ...FILL({ C: 2, n: [2, 3, 4] }, { C: 2, n: 5 }),
  ], [["見本の形 (動画ではない)。必ず付く手だけで組んだ", "An example build (not from a video), made of sure moves only"]]);
}

/** 中級: 手袋。アストリッドでエッセンス 2 つ・左の結晶化で「外れ 1 つだけ」を消す */
export function glovesCourse(): CourseRecipe {
  const G = "Gloves_dex_int/";
  const CRIT = "essence:perfect:" + G + "PerfectEssence_CriticalStrikeMultiplier";
  const SPEED = "essence:perfect:" + G + "PerfectEssence_IncreasedAttackSpeed";
  return build("Secured Wraps", { kind: "white", price: 1, sockets: 2 }, [
    slot("E", "suffix", [G + "PerfectEssence_CriticalStrikeMultiplier"], "essence"),
    slot("F", "suffix", [G + "PerfectEssence_IncreasedAttackSpeed"], "essence"),
    ...any(["P1", "P2", "P3"], "prefix"), ...any(["S"], "suffix"),
  ], [
    ...EMPTY_MAGIC,
    [{ when: { r: "m", n: 0 }, do: { use: "regal" } }, ["王者のオーブでレアに (付く MOD は何でも良い。次のエッセンスで消える)", "A Regal Orb makes it rare (any mod; the next essence removes it)"]],
    [{ when: { r: "r", E: 0, n: 1 }, do: { use: CRIT } }, ["MOD が 1 つだけのレアにヒステリーのエッセンス。消えるのはその 1 つで、クリティカルダメージが必ず付く", "Essence of Hysteria on a rare with only one mod: that mod goes and Critical Damage is added for sure"]],
    [{ when: { E: 2, aug: 0 }, do: { use: "rune:Astrid's Creativity" } }, ["アストリッドの創造性を空いたソケットに。エッセンス・合金の MOD (クラフトモッド) を 2 つ持てる", "Socket Astrid's Creativity: you can now have 2 crafted mods (essences, alloys)"]],
    [{ when: { E: 2, aug: 1, F: 0, "p.n": 0 }, do: { use: "exalt", omens: ["OmenofSinistralExaltation"] } }, ["左の高貴のお告げで、消される用の外れのプレフィックスを 1 つ足す", "Add one throwaway prefix with Omen of Sinistral Exaltation"]],
    [{ when: { E: 2, aug: 1, F: 0, "p.n": 1 }, do: { use: SPEED, omens: ["OmenofSinistralCrystallisation"] } }, ["適応の合金 + 左の結晶化のお告げ。消えるのはプレフィックスの外れ (それしか無い) で、攻撃速度がサフィックスに必ず付く", "Adaptive Alloy + Omen of Sinistral Crystallisation: the only prefix (the throwaway) goes, and Attack Speed is added as a suffix for sure"]],
    ...FILL({ E: 2, F: 2, n: [2, 3, 4] }, { E: 2, F: 2, n: 5 }),
  ], [["動画 (SaVeQ の手袋) のエッセンス 2 つの小技だけを、必ず付く手で。フラクチャーとフラットダメージは上級で", "Only the two-essence trick from SaVeQ's gloves, with sure moves. The fracture and flat damage are for the advanced course"]]);
}

/** 中級: 靴。絢爛のエッセンスでレアに・アストリッド・左の神秘の合金と結晶化でスピリット */
export function bootsCourse(): CourseRecipe {
  const B = "Boots_str/";
  return build("Vaal Greaves", { kind: "white", price: 1, sockets: 2 }, [
    slot("E", "suffix", [B + "Essence_ItemFoundRarityIncrease"], "essence"),
    slot("F", "suffix", [B + "PerfectEssence_BaseSpirit"], "essence"),
    ...any(["P1", "P2", "P3"], "prefix"), ...any(["S"], "suffix"),
  ], [
    ...EMPTY_MAGIC,
    [{ when: { r: "m", n: 0 }, do: { use: "essence:greater:" + B + "Essence_ItemFoundRarityIncrease" } }, ["空のマジックに絢爛のグレーターエッセンス。アイテムのレアリティが必ず付いてレアになる", "A Greater Essence of Opulence on the empty magic boots: Item Rarity for sure, and they turn rare"]],
    [{ when: { E: 2, aug: 0 }, do: { use: "rune:Astrid's Creativity" } }, ["アストリッドの創造性を空いたソケットに。エッセンス・合金の MOD (クラフトモッド) を 2 つ持てる", "Socket Astrid's Creativity: you can now have 2 essence mods"]],
    [{ when: { E: 2, aug: 1, F: 0, "p.n": 0 }, do: { use: "exalt", omens: ["OmenofSinistralExaltation"] } }, ["左の高貴のお告げで、消される用の外れのプレフィックスを 1 つ足す", "Add one throwaway prefix with Omen of Sinistral Exaltation"]],
    [{ when: { E: 2, aug: 1, F: 0, "p.n": 1 }, do: { use: "essence:perfect:" + B + "PerfectEssence_BaseSpirit", omens: ["OmenofSinistralCrystallisation"] } }, ["神秘の合金 + 左の結晶化のお告げ。消えるのはプレフィックスの外れ (それしか無い) で、スピリットが必ず付く", "Mystic Alloy + Omen of Sinistral Crystallisation: the only prefix (the throwaway) goes, and Spirit is added for sure"]],
    ...FILL({ E: 2, F: 2, n: [2, 3, 4] }, { E: 2, F: 2, n: 5 }),
  ], [["動画 (時間術の靴) の絢爛のエッセンスとスピリットだけを、必ず付く手で。移動速度のフラクチャーとドッジロールは上級で", "Only the Opulence essence and Spirit from the chronomancy boots video, with sure moves. The movement speed fracture and dodge roll are for the advanced course"]]);
}
