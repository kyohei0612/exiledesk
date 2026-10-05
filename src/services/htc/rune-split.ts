/**
 * rune-split.ts — 1 つにまとめられた特殊 MOD のルーンの MOD を、中身 (stat) ごとに分ける (2026-10-05)
 *
 * オーナー「コルの狩りで呪印レベル上がるやつあるけど、投射物もそこリロールされると出るよね。MOD で間違った情報ありそうだからチェックして」。
 * 同梱の MOD の表 (vendor/poe2htc/data/mods.json、上流の apply_runes) は、ゲームの MOD の系統 (Families = どちらか片方しか付かない) ごとに
 * 1 つの MOD にまとめている。系統が同じでも中身の違う MOD が同居していると、ティアごとに別の stat なのに文は 1 つ目のまま出ていた:
 *   - コルの狩り IncreaseSocketedGemLevel: 「全ての呪印スキルのレベル +1〜2 / +3〜4」と「全ての投射物スキルのレベル +1 / +2」
 *     (クライアント MarksmanInfluenceMarkSkillLevels / ProjectileSkills) が「呪印スキルのレベル」4 ティアになっていた
 *   - スルードの力 ElementalModifierEffect: 火・冷気・雷・元素ダメージの「明示モッドの効果」が「火」の 1 つに
 *   - メドヴェドの世話 BaseLocalDefencesAndLife: 防御 (アーマー / 回避 / ES と組み合わせ) × スピリット / 最大マナ が 1 つに
 * 読み込んだ後に、ルーンの MOD でティアの stat が揃っていない物を stat の組ごとの MOD に分ける。系統 (family) は同じのままなので
 * 「片方しか付かない」決まりは保つ。分けた MOD の英語の文は取引所の stat の文 (同じ stat を持つ他の MOD があればその文) から作る。
 * 重みは元の MOD と同じ仮の値 (公開データに無い)。上流の表は書き換えない (取り込み直しで消えないよう、読み込みのたびに直す)
 */
import type { ItemBase, Mod, PatchData, Tier } from "../../vendor/poe2htc/engine/types";

/** 取引所の stat の文に頼る時の、ゲームの stat id → 英語の文 (# は値)。表に無い物は他の MOD の文から引く */
const STAT_TEXT: Record<string, string> = {
  mark_skill_gem_level_: "+# to Level of all Mark Skills",
  projectile_skill_gem_level_: "+# to Level of all Projectile Skills",
  heist_enchantment_lightning_mod_effect_: "#% increased Explicit Lightning Modifier magnitudes",
  heist_enchantment_cold_mod_effect_: "#% increased Explicit Cold Modifier magnitudes",
  heist_enchantment_fire_mod_effect_: "#% increased Explicit Fire Modifier magnitudes",
  local_explicit_elemental_damage_mod_effect_: "#% increased Explicit Elemental Damage Modifier magnitudes",
  local_evasion_rating_: "#% increased Evasion Rating",
  local_energy_shield_: "#% increased Energy Shield",
  local_physical_damage_reduction_rating_: "#% increased Armour",
  local_evasion_and_energy_shield_: "#% increased Evasion and Energy Shield",
  local_armour_and_evasion_: "#% increased Armour and Evasion",
  local_armour_and_energy_shield_: "#% increased Armour and Energy Shield",
  base_spirit_from_equipment: "+# to Spirit",
  base_maximum_mana: "+# to maximum Mana",
  // 冒涜の同居 (2026-10-05 点検、取引所の stat の文)
  parried_magnitude_: "#% increased Parried Debuff Magnitude",
  parry_skill_effect_duration_: "#% increased Parried Debuff Duration",
  spell_damage_per_100_maximum_mana: "#% increased Spell Damage per 100 maximum Mana",
  spell_damage_per_100_max_life: "#% increased Spell Damage per 100 Maximum Life",
  spell_damage_with_spells_that_cost_life: "#% increased Spell Damage with Spells that cost Life",
  local_reload_speed_: "#% increased Reload Speed",
  _chance_for_crossbow_reload_to_be_instant: "#% chance when you Reload a Crossbow to be immediate",
};
/** stat id の + と % を _ にして、続いた _ を 1 つに (表の鍵) */
const norm = (s: string): string => s.replace(/[+%]/g, "_").replace(/_+/g, "_");

/** ティアの stat の組 (同梱の表は tiers[].stats を持つ。エンジンの型には無いので読むだけ) */
const sigOf = (t: Tier): string => ((t as Tier & { stats?: readonly string[] }).stats ?? []).join(",");

/** 同じ stat の組を持つ、ルーンでない MOD の文 (あれば) */
function textIndex(mods: ReadonlyMap<string, Mod>): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of mods.values()) {
    if (!m.text) continue;
    const sigs = new Set(m.tiers.map(sigOf));
    if (sigs.size !== 1) continue;
    const s = [...sigs][0]!;
    if (s && !out.has(s)) out.set(s, m.text);
  }
  return out;
}

function textFor(sig: string, byStats: Map<string, string>): string | null {
  const hit = byStats.get(sig);
  if (hit) return hit;
  // stat の表 (取引所の文) を先に。norm は + と % を _ にする
  const parts = sig.split(",").map((s) => STAT_TEXT[norm(s)] ?? STAT_TEXT[s] ?? null);
  return parts.every(Boolean) ? parts.join("\n") : null;
}

/**
 * ティアの stat が揃っていない MOD を分ける。分けた数を返す (検算用)。
 * ルーン以外にも同じまとめ方の物があった (2026-10-05 点検: クライアントから足した 3 属性の防具の「基礎防御」= アーマー / 回避 / ES の組み合わせ違い、
 * 「状態異常の時間短縮」= 出血・発火・毒 / 凍結・感電・チル、冒涜のパリィ・ライフを消費するスペル・クロスボウのリロード) ので全部の MOD に掛ける。
 * 置き場は普通・冒涜・エッセンス・ルーンのどれも差し替える
 */
export function splitMixedRuneMods(data: PatchData, statTags: Readonly<Record<string, readonly string[]>> = {}): { data: PatchData; split: number } {
  const mods = new Map(data.mods);
  const replace = new Map<string, string[]>();
  let byStats: Map<string, string> | null = null;
  for (const m of data.mods.values()) {
    const groups = new Map<string, Tier[]>();
    for (const t of m.tiers) {
      const s = sigOf(t);
      if (!s) continue;
      groups.set(s, [...(groups.get(s) ?? []), t]);
    }
    if (groups.size < 2) continue;
    byStats ??= textIndex(data.mods);
    const ids: string[] = [];
    for (const [sig, tiers] of groups) {
      // stat の組全部で名前を作る (防御 × スピリット / 最大マナ は 1 つ目の stat だけだとぶつかる)
      const key = sig.replace(/[^A-Za-z0-9]+/g, "_").replace(/_+$/, "");
      const id = `${m.id}__${key}`;
      // 画面用のタグは分けた行の stat の組から引き直す (元の行のは和なので別物のタグが混ざる。2026-10-05 点検: 120 件)。勢力は元の tags の物
      const own = statTags[sig];
      const displayTags = own ? [...new Set([...own, ...m.tags.filter((t) => /^(ulaman|amanamu|kurgal)_mod$/.test(t))])] : m.displayTags;
      const next: Mod = { ...m, id, text: textFor(sig, byStats) ?? m.text, tiers: [...tiers].sort((a, b) => a.ilvl - b.ilvl), ...(displayTags ? { displayTags } : {}) };
      mods.set(id, next);
      ids.push(id);
    }
    mods.delete(m.id);
    replace.set(m.id, ids);
  }
  if (!replace.size) return { data, split: 0 };
  const swap = (xs: readonly string[]): string[] => xs.flatMap((id) => replace.get(id) ?? [id]);
  const bases = new Map<string, ItemBase>();
  const swapPool = <P extends { prefixes: readonly string[]; suffixes: readonly string[] }>(p: P): P => ({ ...p, prefixes: swap(p.prefixes), suffixes: swap(p.suffixes) });
  for (const [k, b] of data.bases) {
    const pools = { ...b.pools } as Record<string, unknown>;
    for (const [name, p] of Object.entries(b.pools)) {
      if (!p || typeof p !== "object") continue;
      if (name === "rune") {
        const next: Record<string, { prefixes: readonly string[]; suffixes: readonly string[] }> = {};
        for (const [rid, rp] of Object.entries(p as Record<string, { prefixes: readonly string[]; suffixes: readonly string[] }>)) next[rid] = swapPool(rp);
        pools[name] = next;
      } else if ("prefixes" in (p as object)) {
        pools[name] = swapPool(p as { prefixes: readonly string[]; suffixes: readonly string[] });
      }
    }
    bases.set(k, { ...b, pools: pools as unknown as ItemBase["pools"] });
  }
  return { data: { ...data, mods, bases }, split: replace.size };
}
