---
title: PoE2 Breach Ring Crafting: 40% Quality Resists Hit 57-63%
description: A PoE2 Breach Ring takes quality to 40%, pushing T1 resists to 57-63% (Gold Ring max 54%). Crafting cost was about the same; T2 targets: 59 div avg.
date: 2026-11-12
tags: Breach Ring, ring, quality, Catalyst, resistances
craft: /?base=Breach%20Ring
ready: true
draft: true
---
The PoE2 Breach Ring's implicit raises maximum quality by 20%, so **its quality goes up to 40%**. In our engine numbers, a T1 Fire, Cold or Lightning Resistance reaches **57-63%** at 40% quality. A Gold Ring at 20% quality tops out at 54%, so no tier on it gets there. The Breach Ring rolls the same mods as a Gold Ring, and crafting cost was about the same.

:::zundamon normal
The Breach Ring can take quality up to 40%.
:::

:::metan normal
Right. Quality raises mod values, so it can show bigger numbers than a normal ring.
:::

:::zundamon troubled
But I don't know how much bigger, or whether it's more expensive to craft.
:::

:::metan happy
We counted both the value table and the crafting cost in the engine.
:::

:::summary What you'll learn
- At 40% quality, T1 resists become **57-63%** and T1 Life **140-166**
- A **T2** at 40% quality is about the same as a **T1** on a Gold Ring at 20%
- Quality only boosts **mods matching the Catalyst type**. With two resists and Life, only one gets boosted
- Crafting cost is about the same as a Gold Ring. With T2 targets it averaged **59.1 div**
:::

:::tip New to this? Words used here
- **Quality**: on rings and amulets, you raise it with Catalysts. It boosts the values of mods whose tags match the Catalyst type
- **Catalyst**: +1% or +2% quality per use. Switching types resets quality to 0
- **Omen of Catalysing Exaltation**: makes mods matching the quality type more likely. In ExileDesk, using it resets quality to 0
:::

## What Is the Breach Ring?

| | Breach Ring | Refined Breach Ring | Gold Ring (our comparison) |
|---|---|---|---|
| Implicit | +20% to Maximum Quality | +25% to Maximum Quality | Item Rarity |
| Max quality | **40%** | 45% | 20% |
| Mod pool, weights, slots | Same | Same | Same |

All three have the same mods, tiers, weights and affix slots. Only the quality cap differs.

## What Do Values Look Like at 40% Quality?

Quality-boosted values round down. Ranges are tier minimum to maximum.

| Mod | Tier | 0% quality | 20% (Gold Ring cap) | 40% (Breach Ring) |
|---|---|---|---|---|
| Fire / Cold / Lightning Resistance | T1 | 41-45 | 49-54 | **57-63** |
| Fire / Cold / Lightning Resistance | T2 | 36-40 | 43-48 | **50-56** |
| Chaos Resistance | T1 | 24-27 | 28-32 | **33-37** |
| Maximum Life | T1 | 100-119 | 120-142 | **140-166** |
| Maximum Life | T2 | 85-99 | 102-118 | **119-138** |
| Item Rarity | T1 | 15-18 | 15-18 | 15-18 (not boosted) |

:::zundamon surprised
A T2 at 40% is about the same as a Gold Ring's T1!
:::

:::metan normal
For resists it's 50-56 vs 49-54, and for Life 119-138 vs 120-142. Even one tier down, you about match the Gold Ring's best.
:::

No Catalyst boosted Item Rarity.

## Only One Mod Gets Boosted

A ring holds only one quality type. Switching types resets quality to 0.

| Mod | Catalyst that boosts it |
|---|---|
| Fire Resistance | Xoph's Catalyst |
| Cold Resistance | Tul's Catalyst |
| Lightning Resistance | Esh's Catalyst |
| Chaos Resistance | Chayula's Catalyst |
| All Elemental Resistances | Any of Xoph's, Tul's or Esh's (engine behaviour) |
| Maximum Life | Flesh Catalyst |

:::zundamon troubled
So with two resists, only one gets the 40% boost?
:::

:::metan normal
Yes. There's no "resistance" Catalyst, only one per element. On a ring with two resists and Life, you can boost one of the three.
:::

Raising quality from 0 to 40% took 26.9 Catalysts on average (about 0.57 div with Xoph's). A Gold Ring's 20% took 13.5 (about 0.29 div).

## Crafting Cost Is About the Same as a Gold Ring

We crafted two T1 resists and T1 Life using Omen of Catalysing Exaltation (10,000 runs each). Prices are ExileDesk's market data from 2026-10-22 (Forbidden Rites).

| Targets | Breach Ring | Gold Ring | How to read it |
|---|---:|---:|---|
| T1 resist x2 + T1 Life | 360.1 div | 384.1 div | Only 6% apart |
| T2+ resist x2 + T2+ Life | **59.1 div** | 60.3 div | About 1/6 of the T1 targets |

The Breach Ring's higher quality multiplier meant 30% fewer Annulments, but it needed 1.45x the Catalysts. Counting Catalysts as +1% each, the gap disappears (446.6 vs 446.5 div).

:::zundamon surprised
Only 59 div with T2 targets.
:::

:::metan happy
And the boosted resist at 40% averaged 56.3, higher than the 51.2 average on a Gold Ring crafted for T1 (384 div). The other resist and Life come out a bit lower (40.5 vs 43.0, and 100.8 vs 109.5).
:::

On a rare with no suffixes, one Greater Exalted Orb with Omen of Dextral Exaltation and Omen of Catalysing Exaltation (Xoph's quality) hit Fire Resistance T1 6.75% of the time at 20% quality and 7.88% at 40% (100,000 tries each). Doubling quality made the hit only 1.17 times more likely.

:::tip Crafting resists on a Breach Ring?
Dropping to T2 targets cuts the cost to about a sixth of the T1 route. Add 40% quality with the Catalyst for the resist you most want to boost, and on average it beat a Gold Ring crafted for T1. The other resist and Life come out a little lower.
:::

:::note fold What we haven't verified (5 items)
- Costs and hit chances come from engine runs. We have not checked them against Craft of Exile or against crafting in game.
- That Chaos Orbs, Annulments and Exalts keep quality, while Omen of Catalysing Exaltation resets it to 0, is how the engine behaves. We have not confirmed it as a rule in game. All Elemental Resistances being boosted by any of the three element Catalysts is also the engine's tag-based handling.
- Prices are ExileDesk's market data from 2026-10-22. We assumed item level 82 for the Breach Ring and did not include base prices.
- The routes are simple ones without Annulment omens, not a search for the cheapest route. About 40% of the T1 cost is re-adding targets that Annulments removed.
- We ran the Refined Breach Ring (45% cap) only for the T1 targets, 2,000 runs.
:::

The Breach Ring lets one mod reach one tier higher than a Gold Ring can, thanks to 40% quality. Crafting cost is about the same, and even with T2 targets the boosted resist beat a Gold Ring's T1 on average.

## Where the Numbers Come From

:::fold Show sources (7 items)
- Value table, Catalyst matches, quality cost and crafting cost: docs/org/math/notes/2026-10-31-breach-ring.md, script scripts/analysis/breach-ring-ev.mjs (Omen of Catalysing Exaltation route 10,000 runs, seed 1; +1%-per-Catalyst count 2,000 runs; quality Catalyst counts 20,000 tries; hit chances 100,000 tries). Engine
- Tier ranges: engine data (aligned with poe2db; a 2026-10-24 check found no value mismatches on rings). poe2db
- Breach Ring implicit (+20% to Maximum Quality) and Refined Breach Ring (+25%): poe2db pages (checked 2026-10-31). poe2db
- Rounding down quality-boosted values: an ExileDesk rule the owner checked on an in-game item. In game
- +1-2% per Catalyst: an ExileDesk rule set by the owner. Engine
- Switching types resets quality to 0: the Catalyst description "Replaces other quality types". poe2db
- Prices: ExileDesk market data (2026-10-22 04:00 UTC, Forbidden Rites). Market
:::

## Try It Yourself

Pick the Breach Ring on the ExileDesk [crafting bench](/?base=Breach%20Ring), raise quality to 40% with Xoph's Catalysts, and watch how far Fire Resistance climbs, one click at a time.

**Related posts**

- [PoE2 Quality Rounding: Round Down, Not Nearest](/en/blog/quality-rounding-down/)
- [PoE2 Catalyst Types: Which Mods Each One Boosts](/en/blog/catalyst-types/)
- [PoE2 Catalysing Exaltation Multiplier: No One Knows It](/en/blog/catalysing-exaltation-multiplier/)

VOICEVOX: Zundamon / Shikoku Metan
