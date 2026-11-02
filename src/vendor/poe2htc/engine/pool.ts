import type { ItemState, Mod, PatchData, Tier } from './types.ts';

export function resolveMod(data: PatchData, id: string): Mod {
  const m = data.mods.get(id);
  if (!m) throw new Error(`unknown mod id: ${id}`);
  return m;
}

/**
 * Sum of tier weights of a mod within [floor, cap] ilvl, from tier index `minIndex` upward.
 * - `floor` = currency-strength minimum ilvl (base 0 / greater 35 / perfect 50).
 * - `cap`   = item level (a tier can only roll if its ilvl <= item level).
 * - `minIndex` = only count this tier and better ones (higher ilvl); default 0 = any tier.
 *
 * Mirrors ExaltAndRegalProbability.NormalCompute's weight accumulation.
 */
export function modTierWeight(mod: Mod, floor: number, cap: number, minIndex = 0): number { // E-11・E-11b 段の重み (アイテムレベル以下の段だけ)
  let w = 0;
  for (const t of modTierWeights(mod, floor, cap)) if (t.index >= minIndex) w += t.w;
  return w;
}

/**
 * The tiers that can roll within [floor, cap] ilvl, with their weights (weight > 0 only) — the one
 * formula behind `modTierWeight` and the emulator's candidates (craft-stage/stage-core.ts).
 */
export function modTierWeights(mod: Mod, floor: number, cap: number): Array<{ index: number; w: number }> {
  const keep = floorKeepIndex(mod, floor, cap);
  const out: Array<{ index: number; w: number }> = [];
  for (let i = 0; i < mod.tiers.length; i++) {
    const t: Tier = mod.tiers[i]!;
    if ((t.ilvl >= floor || i === keep) && t.ilvl <= cap && t.weight > 0) out.push({ index: i, w: t.weight });
  }
  return out;
}

/**
 * The game's Minimum Modifier Level exception (KeywordPopups BetterCurrencyMinimumLevel): "Added random
 * Modifiers are at least this level or higher, except if a specific Modifier type would be excluded
 * entirely". When no tier of the mod reaches `floor` (within `cap`), its highest tier under the cap stays
 * in. Returns that tier's index, or -1 when the floor excludes nothing whole (2026-10-06, POE2Tube ㉝-2).
 */
export function floorKeepIndex(mod: Mod, floor: number, cap: number): number {
  if (floor <= 0) return -1;
  let best = -1;
  for (let i = 0; i < mod.tiers.length; i++) {
    const t: Tier = mod.tiers[i]!;
    if (t.ilvl > cap || !(t.weight > 0)) continue;
    if (t.ilvl >= floor) return -1;
    if (best < 0 || t.ilvl > mod.tiers[best]!.ilvl) best = i;
  }
  return best;
}

/**
 * Total weight of a pool (list of mod ids) within [floor, cap] ilvl.
 * With `exclude`, mods whose family is already on the item are dropped — the real game can't roll a
 * family it already carries, so the denominator shrinks as the item fills (family exclusion, D6).
 * Omit `exclude` for the Java-parity denominator (Crafting_Item.get_Base_Affixes_Total_Weight_By_Tier,
 * which does NOT exclude).
 */
export function poolTotalWeight(
  data: PatchData, modIds: readonly string[], floor: number, cap: number, exclude?: ReadonlySet<string>,
  boost?: WeightBoost,
): number {
  let total = 0;
  for (const id of modIds) {
    const mod = resolveMod(data, id);
    if (exclude && excluded(mod, exclude)) continue;
    total += modTierWeight(mod, floor, cap) * (boost ? boost(mod) : 1);
  }
  return total;
}

/**
 * A per-mod weight multiplier, for a currency that tilts the pool rather than filtering it.
 *
 * Only the Omen of Catalysing Exaltation does this today: it eats the item's catalyst quality and
 * multiplies the weight of the mods carrying that catalyst's tag. Handed in as a function because the
 * tag membership lives in ExileDesk's client-derived data, not in the shipped patch — the engine must
 * not need to know what a catalyst is to do the arithmetic.
 *
 * Returns 1 for "untouched". It must be applied to the NUMERATOR and the DENOMINATOR alike, or the
 * distribution stops summing to 1.
 */
export type WeightBoost = (mod: Mod) => number;

/**
 * EVERY exclusion group a mod belongs to. Usually one, but some mods legitimately span several — a
 * desecrated "+Str +Int" rolls in both the Strength and Intelligence groups and must be blocked by,
 * and block, mods in either. `families` carries the full list when there's more than one; `family`
 * stays the primary (it keys the poe2db weight join and is what the UI labels).
 *
 * An empty family means "no exclusion group" and yields none, so unrelated blank-family mods can
 * never collide.
 */
export const CRAFTED_SOURCES: ReadonlySet<Mod['source']> = new Set(['essence', 'perfect_essence']);

/**
 * One family rule for every way a mod lands (ExileDesk 2026-11-02, owner: "ファミリーで被るはないな"):
 * a family is on an item at most once — rolled, Essence / Perfect Essence / Alloy, desecrated reveal alike.
 * There is no crafted namespace any more. Until 11-02 crafted mods excluded only each other (`crafted:<family>`),
 * after poe.ninja items with a crafted and a desecrated resistance of one family (2026-09-15); the owner ruled
 * those out as not craftable now. Craft of Exile refuses an Essence whose modgroups are on the item, before the
 * Perfect Essence removal ("Similar modifier already present!", CoE beta 11-02).
 */
export function familiesOf(mod: Mod): readonly string[] { // E-11a 同じ系統は 1 品に 1 つ (判定はここ 1 か所)
  return mod.families && mod.families.length > 0 ? mod.families : mod.family ? [mod.family] : [];
}

/** The groups a mod occupies once it sits on the item — the same as `familiesOf` (one rule, no crafted exception). */
export function occupiedFamiliesOf(mod: Mod): readonly string[] { // E-11a・E-17
  return familiesOf(mod);
}

/**
 * Does `mod` collide with a set of already-occupied families? True if ANY of its groups is taken.
 * This is the single place exclusion is decided — call it rather than testing `.family` directly,
 * or multi-family mods silently lose the groups beyond the first.
 */
export function excluded(mod: Mod, occupied: ReadonlySet<string>): boolean {
  return familiesOf(mod).some((f) => occupied.has(f));
}

/** Families currently present on the item (used for family-exclusion). A mod with no family has no
 * exclusion group and contributes none; a multi-family mod contributes all of its groups. */
export function itemFamilies(data: PatchData, item: ItemState): Set<string> {
  const fams = new Set<string>();
  for (const p of [...item.prefixes, ...item.suffixes]) {
    // A throwaway names no mod, so it has no family to contribute. The only step that sees one is a Perfect
    // Essence / Alloy; the small chance the throwaway shares its family (which refuses it in the game since
    // 2026-11-02's one family rule) is not counted — see `Throwaway`.
    if (p.throwaway) continue;
    for (const f of occupiedFamiliesOf(resolveMod(data, p.modId))) fams.add(f);
  }
  return fams;
}

/** True if `mod` may still be added to `item` (none of its families is already present). A mod with
 * no family has no exclusion group and is always available. */
export function familyAvailable(data: PatchData, item: ItemState, mod: Mod): boolean {
  return !excluded(mod, itemFamilies(data, item));
}
