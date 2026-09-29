/**
 * tag-ja.ts — MOD のタグの日本語と色はここだけ (2026-09-29 統一)
 *
 * 前は計算機のカード (item-card-data の TAG_JA) とクラフトステージの MOD 一覧 (mod-list の TAG_STYLE) が別々に持っていて、
 * attribute が「属性」と「能力値」で割れていた。言い回しはクライアント由来の辞書に合わせる
 * (元素 496 件 vs エレメント 6 件、アタック 1224 vs 攻撃 45。2026-09-26 オーナー「タグの日本語訳をチェック」)。
 * short = 札に出す短い名前、cls = 札の色 (無いタグは札に出さない)
 */
const TAGS: Record<string, { ja: string; short?: string; cls?: string }> = {
  mana: { ja: "マナ", cls: "bg-blue-500/20 text-blue-200" },
  life: { ja: "ライフ", cls: "bg-rose-500/20 text-rose-200" },
  caster: { ja: "キャスター", cls: "bg-violet-500/20 text-violet-200" },
  attack: { ja: "アタック", cls: "bg-amber-600/20 text-amber-200" },
  speed: { ja: "スピード", cls: "bg-green-500/20 text-green-200" },
  elemental: { ja: "元素", cls: "bg-teal-500/20 text-teal-200" },
  fire: { ja: "火", cls: "bg-red-600/25 text-red-200" },
  cold: { ja: "冷気", cls: "bg-sky-500/25 text-sky-200" },
  lightning: { ja: "雷", cls: "bg-yellow-400/25 text-yellow-100" },
  chaos: { ja: "混沌", cls: "bg-fuchsia-600/25 text-fuchsia-200" },
  physical: { ja: "物理", cls: "bg-zinc-400/20 text-zinc-200" },
  resistance: { ja: "耐性", cls: "bg-emerald-500/20 text-emerald-200" },
  defences: { ja: "防御", cls: "bg-slate-400/20 text-slate-200" },
  armour: { ja: "アーマー", cls: "bg-stone-400/20 text-stone-200" },
  evasion: { ja: "回避", cls: "bg-lime-500/20 text-lime-200" },
  energy_shield: { ja: "エナジーシールド", short: "ES", cls: "bg-cyan-500/20 text-cyan-200" },
  minion: { ja: "ミニオン", cls: "bg-indigo-400/20 text-indigo-200" },
  critical: { ja: "クリティカル", cls: "bg-pink-500/20 text-pink-200" },
  damage: { ja: "ダメージ", cls: "bg-orange-500/20 text-orange-200" },
  attribute: { ja: "能力値", cls: "bg-amber-400/20 text-amber-100" },
  resource: { ja: "リソース" },
  gem: { ja: "ジェム", cls: "bg-sky-400/20 text-sky-100" },
  curse: { ja: "呪い", cls: "bg-purple-600/20 text-purple-200" },
  aura: { ja: "オーラ", cls: "bg-yellow-600/20 text-yellow-100" },
  ailment: { ja: "状態異常", cls: "bg-purple-400/20 text-purple-200" },
  bleed: { ja: "出血" },
  poison: { ja: "毒" },
  block: { ja: "ブロック", cls: "bg-stone-500/20 text-stone-200" },
  flask: { ja: "フラスコ", cls: "bg-red-400/20 text-red-100" },
  charm: { ja: "チャーム", cls: "bg-red-300/20 text-red-100" },
  drop: { ja: "ドロップ", cls: "bg-yellow-500/15 text-yellow-100" },
  elemental_damage: { ja: "元素ダメージ" },
  physical_damage: { ja: "物理ダメージ" },
  chaos_damage: { ja: "混沌ダメージ" },
  caster_damage: { ja: "キャスターダメージ" },
  caster_speed: { ja: "キャストスピード" },
  caster_critical: { ja: "スペルクリティカル" },
  fire_resistance: { ja: "火耐性" },
  cold_resistance: { ja: "冷気耐性" },
  lightning_resistance: { ja: "雷耐性" },
  elemental_resistance: { ja: "元素耐性" },
  chaos_resistance: { ja: "混沌耐性" },
  flat_life_regen: { ja: "ライフ再生" },
  ulaman_mod: { ja: "ウラマン", cls: "bg-rose-700/30 text-rose-200" },
  amanamu_mod: { ja: "アマナム", cls: "bg-rose-700/30 text-rose-200" },
  kurgal_mod: { ja: "クルガル", cls: "bg-rose-700/30 text-rose-200" },
};

/** タグの日本語 (無ければ英語のまま) */
export const tagJa = (t: string): string => TAGS[t]?.ja ?? t;

/** 札に出すタグの名前と色 (クラフトステージの MOD 一覧・動画) */
export const TAG_STYLE: Record<string, { ja: string; cls: string }> = Object.fromEntries(
  Object.entries(TAGS).flatMap(([k, v]) => (v.cls ? [[k, { ja: v.short ?? v.ja, cls: v.cls }]] : [])),
);
