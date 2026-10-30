---
title: PoE2 Chaos Orb: Can the Removed Mod Roll Right Back?
description: A PoE2 Chaos Orb can re-add the mod it just removed. On our boots the same tier came back about 1-2.3% of the time, about 9% counting other tiers.
date: 2026-11-01
tags: Chaos Orb, odds, Greater, Perfect, rules
craft: /?base=Drakeskin%20Boots
ready: true
draft: true
---
Yes. In PoE2 **a Chaos Orb can add back the same mod it just removed, in the same use**. It removes one mod first, then rolls a new one on the item as it is after the removal, so the removed mod is back in the pool. On our boots example the exact same tier returned about 1-2.3% of the time per orb, and about 9% counting other tiers of the same mod.

:::zundamon troubled
I used a Chaos Orb, Fire Res T1 got removed... and Fire Res T1 got added again.
:::

:::metan normal
Nothing visibly changed, so it feels like a wasted orb.
:::

:::zundamon surprised
Is that a bug?
:::

:::metan happy
No, that's exactly how the Chaos Orb works. We also counted how often it happens.
:::

:::summary What you'll learn
- A Chaos Orb works as "remove one mod, then add one to the item after removal." The removed mod is back in the pool
- On the boots example, the same mod at the same tier returns **1.1% (regular), 2.0% (Greater) and 2.3% (Perfect)** of the time per orb
- The removed mod is neither avoided nor favoured. It comes back at its normal roll chance
- With Greater and Perfect orbs, tiers below the floor cannot come back
:::

:::tip New to this? Words used here
- **Chaos Orb**: removes one mod from a rare item and adds one
- **Tier (T1, T2...)**: the same mod comes in tiers by value strength. T1 is the strongest
- **Greater / Perfect**: stronger Chaos Orbs with a Minimum Modifier Level (35 and 50) that blocks low tiers
- **Mod group**: mods of the same kind. An item can't have two from one group
- **Fractured**: a mod locked in place so it can't be removed
:::

## A Chaos Orb Removes First, Then Adds

A Chaos Orb picks one non-fractured mod evenly and removes it, then adds one. The pool for the new mod is built from the item after the removal.

:::zundamon normal
What changes if the pool is built after the removal?
:::

:::metan normal
Once Fire Res is gone, the item has no Fire Res, so the Fire Res group is open again.
:::

:::metan normal
Craft of Exile doesn't exclude the removed mod either. The same mod at the same tier can be picked again.
:::

We confirmed this in Craft of Exile's code. It builds the pool from the item after removal and rolls the new mod with an empty exclusion list. We have not found an official statement from the developer.

| Source | What it says | Removed mod |
|---|---|---|
| Craft of Exile simulator | Builds the pool after removing one mod, adds with no exclusions | Back in the pool |
| poe2db Chaos Orb text | "Removes a random modifier and augments a Rare item with a new random modifier" | Not mentioned |
| Crafting guides | Remove one, add one | Not mentioned |

The ExileDesk emulator follows the same order as Craft of Exile.

## The Same Tier Comes Back About 1-2.3% of the Time

We used 200,000 Chaos Orbs on each of two items.

- **Boots**: Drakeskin Boots at item level 82 with Movement Speed T1 (fractured), Fire Res T1, Life T3 and Dexterity T2. Three mods can be removed
- **Ring**: a Gold Ring at item level 82 with Rarity T1 and Cast Speed T1

| Item | Chaos | Same mod, same tier | Same mod, other tier | What it means |
|---|---|---:|---:|---|
| Boots | Regular | 1.08% | 7.95% | About 9% get the same mod back |
| Boots | Greater | 2.03% | 6.62% | Same tier about twice as often as regular |
| Boots | Perfect | 2.29% | 6.84% | Same tier is most likely here |
| Ring | Regular | 0.62% | 1.88% | About 2.5% in total |
| Ring | Greater | 1.31% | 1.26% | Same tier and other tiers about equal |
| Ring | Perfect | 1.85% | 0.93% | Same tier about twice the other tiers |

Looking only at regular Chaos on the boots when Fire Res T1 was removed, Fire Res T1 came back 1.09% of the time and another Fire Res tier 7.64%.

:::zundamon surprised
On the boots it's almost 1 in 10 that the same mod comes back!
:::

:::metan normal
Whether Fire Res, Life or Dexterity was removed, it came back at almost the same rate.
:::

## The Removed Mod Is Neither Avoided Nor Favoured

The return rate matched, within the margin of error, how often that mod normally rolls on the item after removal. A Chaos Orb gives the removed mod no special treatment.

:::zundamon normal
How did you check that?
:::

:::metan normal
We had Craft of Exile's code list the pool and weights for the item after each removal. Then we compared those odds with 200,000 crafts in ExileDesk.
:::

:::metan happy
Every row, per removed mod and overall, fell inside the margin of error. In ExileDesk and Craft of Exile, the return rate follows the weight share.
:::

We compared single-craft odds with Craft of Exile in more detail in [Do PoE2 Crafting Odds Match Craft of Exile?](/en/blog/coe-odds-parity/).

## Tiers That Return More, and Tiers That Can't

Greater and Perfect Chaos Orbs never add a tier below their Minimum Modifier Level (35 and 50). That floor changes what can come back.

| Case | Greater | Perfect | Why |
|---|---|---|---|
| Boots lose Fire Res T1 | Returns 2.03% | Returns 3.43% | Lower tiers leave the pool, so T1 gets a bigger share |
| Boots lose Life T3 | Returns 2.07% | **0%** | Life T3's modifier level is below 50 |
| Ring loses Rarity T1 | Other tiers **0%** | Other tiers **0%** | Every Rarity tier except T1 is below the floor |

:::zundamon normal
So with a Perfect Chaos Orb, Life T3 never comes back?
:::

:::metan normal
Right. If Life returns at all, it's a higher tier that clears the floor.
:::

:::tip When a Chaos Orb gives the same mod back
Even if the same mod at the same tier returns, the orb is spent. It's not a misfire, it's the rule. When you estimate costs, keep "the removed mod can return" in the math.
:::

:::note fold What we haven't checked (3)
- What matches is ExileDesk and Craft of Exile's calculation. We have not compared against tens of thousands of crafts in the live game.
- We found no official statement from the developer. This is based on Craft of Exile's code and how the emulator works.
- The numbers are for the boots and ring above. Other items and mods have different weights, so the rates differ.
:::

A Chaos Orb can add back the mod it just removed, in the same use. It comes back at its normal roll chance.

## Where the Numbers Come From

:::fold Show sources (3)
- Return rates: notes docs/org/math/notes/2026-10-31-chaos-same-mod-back.md, script scripts/analysis/chaos-same-mod-back.mjs (200,000 crafts in the engine, compared with Craft of Exile's exact odds). Engine, Craft of Exile
- Remove-then-add with no exclusions: research notes docs/org/research/notes/2026-10-26-chaos-reroll-same-mod.md (read Craft of Exile's code, poe2db and guides). Craft of Exile, poe2db
- Emulator rule: E-30 in docs/spec/engine.md. Engine
:::

## Try It Yourself

Use Chaos Orbs on Drakeskin Boots on the ExileDesk [crafting bench](/?base=Drakeskin%20Boots) and each step shows what was removed and what was added.

**Related posts**

- [Do PoE2 Crafting Odds Match Craft of Exile? 50k Rolls Each](/en/blog/coe-odds-parity/)
- [PoE2 Chaos Spam Odds: How Many Orbs at 0.3% per Try](/en/blog/chaos-spam-odds/)
- [PoE2 Chaos Orb Reroll vs Restart: 31 div vs 580 div](/en/blog/chaos-reroll-vs-restart/)

VOICEVOX: Zundamon / Shikoku Metan
