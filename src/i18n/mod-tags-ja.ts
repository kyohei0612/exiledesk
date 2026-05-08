/**
 * POE2 mod タグの日本語ローカライズ
 * implicit_tags / adds_tags の値を JA ラベルに変換する
 */

const tagJaMap: Record<string, string> = {
  // 能力値
  attribute: "能力値",

  // ダメージ・属性
  damage: "ダメージ",
  physical: "物理",
  physical_damage: "物理D",
  elemental: "元素",
  elemental_damage: "元素D",
  fire: "火",
  cold: "冷気",
  lightning: "雷",
  chaos: "混沌",
  chaos_damage: "混沌D",
  caster_damage: "キャスターD",

  // 耐性・防御
  resistance: "耐性",
  defences: "防御",
  armour: "アーマー",
  evasion: "回避",
  energy_shield: "ES",
  block: "ブロック",

  // リソース
  resource: "リソース",
  life: "ライフ",
  mana: "マナ",
  flat_life_regen: "ライフ回復",

  // クラス/タイプ
  attack: "アタック",
  caster: "キャスター",
  minion: "ミニオン",
  gem: "ジェム",
  flask: "フラスコ",
  skill: "スキル",

  // 効果系
  speed: "スピード",
  critical: "クリティカル",
  ailment: "状態異常",
  poison: "毒",
  bleed: "出血",
  dot_multi: "DoT倍率",
  curse: "呪い",
  aura: "オーラ",
  drop: "ドロップ",

  // チャージ
  power_charge: "パワーチャージ",
  endurance_charge: "エンデュランス",
  frenzy_charge: "フレンジー",
};

export function jaTag(tag: string): string {
  return tagJaMap[tag] ?? tag;
}

/** タグの色分類（badge bg-color に使う） */
export function tagColor(tag: string): string {
  if (tag === "fire" || tag === "fire_damage") return "bg-red-700/40 text-red-200";
  if (tag === "cold") return "bg-cyan-700/40 text-cyan-200";
  if (tag === "lightning") return "bg-yellow-700/40 text-yellow-200";
  if (tag === "chaos" || tag === "chaos_damage") return "bg-purple-700/40 text-purple-200";
  if (tag === "physical" || tag === "physical_damage")
    return "bg-stone-600/40 text-stone-200";
  if (tag === "life") return "bg-rose-800/40 text-rose-200";
  if (tag === "mana") return "bg-blue-800/40 text-blue-200";
  if (tag === "energy_shield") return "bg-teal-800/40 text-teal-200";
  if (tag === "elemental" || tag === "elemental_damage")
    return "bg-fuchsia-800/40 text-fuchsia-200";
  if (tag === "attribute") return "bg-amber-800/40 text-amber-200";
  if (tag === "resistance") return "bg-green-800/40 text-green-200";
  if (tag === "attack") return "bg-orange-800/40 text-orange-200";
  if (tag === "caster" || tag === "caster_damage") return "bg-indigo-800/40 text-indigo-200";
  if (tag === "speed") return "bg-emerald-800/40 text-emerald-200";
  if (tag === "critical") return "bg-pink-800/40 text-pink-200";
  return "bg-stone-700/40 text-stone-300";
}
