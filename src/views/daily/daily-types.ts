/**
 * daily-types.ts — 型の辞書 (D-80)。1 行 = ベース・ビルドの系統・必須 MOD・候補 MOD。MOD は行の名前 (エンジンの行の id の / の後ろ)。
 * 下の 20 個は部長の仮の見本。オーナーが poe.ninja を人の手で見て足す。機械では読まない。
 * heavy = オーナーの「この型は重い」の印 (難しい曜日にだけ出す)、off = 止める
 */
export type DailyType = { id: string; base: string; ilvl: number; ja: string; en: string; must: string[]; pool: string[]; heavy?: true; off?: true };

const ELE = ["FireResistance", "ColdResistance", "LightningResistance"];
const ATTR = ["Strength", "Dexterity", "Intelligence"];

export const DAILY_TYPES: readonly DailyType[] = [
  { id: "ring-res", base: "Gold Ring", ilvl: 82, ja: "耐性の指輪", en: "Resist ring", must: ["IncreasedLife"], pool: [...ELE, "ChaosResistance", "AllResistances", "Strength"] },
  { id: "ring-attack", base: "Ruby Ring", ilvl: 82, ja: "物理アタックの指輪", en: "Attack ring", must: ["PhysicalDamage"], pool: ["FireDamage", "IncreasedAccuracy", "IncreasedLife", ...ELE, "Dexterity", "LifeLeechPermyriad"] },
  { id: "ring-cast", base: "Sapphire Ring", ilvl: 82, ja: "キャスターの指輪", en: "Caster ring", must: ["IncreasedCastSpeed"], pool: ["IncreasedMana", "IncreasedLife", "ColdDamagePercentage", "LightningDamagePercentage", "Intelligence", "ManaRegeneration", ...ELE] },
  { id: "ring-chaos", base: "Amethyst Ring", ilvl: 82, ja: "混沌の指輪", en: "Chaos ring", must: ["IncreasedChaosDamage"], pool: ["IncreasedCastSpeed", "IncreasedLife", "ChaosResistance", "Intelligence", "ColdResistance", "LightningResistance"] },
  { id: "amu-spirit", base: "Gold Amulet", ilvl: 82, ja: "スピリットのアミュレット", en: "Spirit amulet", must: ["BaseSpirit"], pool: ["IncreasedLife", "MaximumLifeIncreasePercent", ...ELE, "AllAttributes", "ChaosResistance"], heavy: true },
  { id: "amu-crit", base: "Crimson Amulet", ilvl: 82, ja: "クリティカルのアミュレット", en: "Crit amulet", must: ["CriticalStrikeMultiplier"], pool: ["CriticalStrikeChance", "IncreasedLife", "IncreasedAccuracy", "AllAttributes", ...ELE] },
  { id: "amu-spell", base: "Azure Amulet", ilvl: 82, ja: "スペルのアミュレット", en: "Spell amulet", must: ["SpellDamage"], pool: ["GlobalIncreaseSpellSkillGemLevel", "IncreasedCastSpeed", "IncreasedMana", "ManaRegeneration", "Intelligence", ...ELE], heavy: true },
  { id: "amu-es", base: "Lapis Amulet", ilvl: 82, ja: "エナジーシールドのアミュレット", en: "Energy shield amulet", must: ["EnergyShield"], pool: ["GlobalEnergyShieldPercent", "Intelligence", "AllResistances", "ChaosResistance", ...ELE] },
  { id: "belt-life", base: "Heavy Belt", ilvl: 82, ja: "ライフのベルト", en: "Life belt", must: ["IncreasedLife"], pool: ["PhysicalDamageReductionRating", "Strength", "StunThreshold", "LifeRegeneration", ...ELE, "ChaosResistance"] },
  { id: "belt-charm", base: "Long Belt", ilvl: 82, ja: "チャームのベルト", en: "Charm belt", must: ["BeltIncreasedCharmDuration"], pool: ["IncreasedLife", "BeltIncreasedCharmChargesGained", "BeltReducedCharmChargesUsed", ...ELE] },
  { id: "belt-flask", base: "Linen Belt", ilvl: 82, ja: "フラスコのベルト", en: "Flask belt", must: ["BeltFlaskLifeRecoveryRate"], pool: ["IncreasedLife", "BeltIncreasedFlaskChargesGained", "BeltReducedFlaskChargesUsed", "ChaosResistance", ...ELE] },
  { id: "boots-dex", base: "Bound Boots", ilvl: 82, ja: "移動の回避ブーツ", en: "Evasion boots", must: ["MovementVelocity"], pool: ["IncreasedLife", "LocalEvasionRatingIncreasePercent", "Dexterity", ...ELE, "ChaosResistance"] },
  { id: "boots-str", base: "Bronze Greaves", ilvl: 82, ja: "移動のアーマーブーツ", en: "Armour boots", must: ["MovementVelocity"], pool: ["IncreasedLife", "LocalPhysicalDamageReductionRatingPercent", "Strength", ...ELE, "StunThreshold"] },
  { id: "gloves-attack", base: "Barbed Bracers", ilvl: 82, ja: "アタックの手袋", en: "Attack gloves", must: ["IncreasedAttackSpeed"], pool: ["PhysicalDamage", "IncreasedAccuracy", "CriticalStrikeMultiplier", "IncreasedLife", "LifeLeechPermyriad", ...ELE] },
  { id: "gloves-melee", base: "Barbed Bracers", ilvl: 82, ja: "近接スキルの手袋", en: "Melee gloves", must: ["GlobalIncreaseMeleeSkillGemLevel"], pool: ["IncreasedAttackSpeed", "IncreasedLife", "Dexterity", ...ELE], heavy: true },
  { id: "gloves-es", base: "Adherent Cuffs", ilvl: 82, ja: "防御の手袋", en: "Hybrid gloves", must: ["LocalArmourAndEnergyShield"], pool: ["IncreasedLife", "IncreasedMana", ...ATTR, ...ELE] },
  { id: "helm-es", base: "Ancestral Tiara", ilvl: 82, ja: "エナジーシールドの兜", en: "Energy shield helmet", must: ["LocalEnergyShieldPercent"], pool: ["IncreasedLife", "LocalEnergyShield", "Intelligence", "CriticalStrikeChance", ...ELE] },
  { id: "helm-minion", base: "Ancestral Tiara", ilvl: 82, ja: "ミニオンの兜", en: "Minion helmet", must: ["GlobalIncreaseMinionSpellSkillGemLevel"], pool: ["IncreasedLife", "IncreasedMana", "LocalEnergyShieldPercent", ...ELE], heavy: true },
  { id: "body-spirit", base: "Armoured Vest", ilvl: 82, ja: "スピリットの回避鎧", en: "Spirit armour", must: ["BaseSpirit"], pool: ["IncreasedLife", "LocalEvasionRatingIncreasePercent", "Dexterity", ...ELE, "ChaosResistance"], heavy: true },
  { id: "body-life", base: "Armoured Vest", ilvl: 82, ja: "ライフの回避鎧", en: "Life armour", must: ["IncreasedLife"], pool: ["LocalIncreasedEvasionAndLife", "LocalEvasionRatingIncreasePercent", "StunThreshold", "LifeRegeneration", ...ELE] },
];
