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
export function modTierWeight(mod: Mod, floor: number, cap: number, minIndex = 0): number {
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

export function familiesOf(mod: Mod): readonly string[] {
  const own = mod.families && mod.families.length > 0 ? mod.families : mod.family ? [mod.family] : [];
  // A CRAFTED modifier — Essence, Perfect Essence or Alloy — excludes only other crafted modifiers.
  // Real items carry a rolled and a crafted modifier of one family side by side: Steelmage's jacket
  // holds +28% Lightning Resistance rolled beside +34% crafted, his sandals two Fire Resistances, and
  // xthefarmerx's ring another pair (poe.ninja, 2026-09-15; none of the three corrupted).
  //
  // Namespacing the GROUP is what makes that legal everywhere at once, because every exclusion in the
  // engine is decided through this function: pool denominators, the lattice's blocked bits, both
  // pickers. Two crafted mods of one family still collide — untraced, so it stays refused.
  return CRAFTED_SOURCES.has(mod.source) ? own.map((f) => `crafted:${f}`) : own;
}

/**
 * The groups a mod OCCUPIES once it sits on the item. A crafted mod occupies its own namespaced groups AND
 * the plain ones: nothing rolled of that family can join it afterwards (ExileDesk 2026-10-11, owner: "the
 * same mod, of course it can't roll" — a bone reveal offered Critical Hit Chance beside an essence's). The
 * other order stays legal (a crafted mod onto a rolled one of its family — the poe.ninja items above).
 */
export function occupiedFamiliesOf(mod: Mod): readonly string[] {
  const own = familiesOf(mod);
  if (!CRAFTED_SOURCES.has(mod.source)) return own;
  const plain = mod.families && mod.families.length > 0 ? mod.families : mod.family ? [mod.family] : [];
  return [...own, ...plain];
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
    // A throwaway names no mod, so it has no family to contribute — and none is needed: the only step
    // that ever sees one adds a CRAFTED mod, whose groups no rolled family can share (see `Throwaway`).
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
