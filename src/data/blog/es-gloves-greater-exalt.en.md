---
title: PoE2 Energy Shield Gloves Craft: Greater Exalt Beats Perfect
description: For a PoE2 Energy Shield gloves craft, we compared Exalted Orb types for maximum ES, ES% and maximum Mana at T2+, 300 runs each. Greater was cheapest at 105 div; Perfect cost 201 and the plain Exalted Orb 423.
date: 2026-10-22
tags: gloves, Energy Shield, Exalted Orb, Chaos Orb, expected cost
tree: /?page=sim-tree&base=Sirenscale%20Gloves
craft: /?base=Sirenscale%20Gloves
image: img/es-gloves-greater-exalt-og.en.png
draft: true
---
For a PoE2 Energy Shield gloves craft with maximum Energy Shield, ES% and maximum Mana (T2+) as prefixes, **Omen of Sinistral Exaltation + Greater Exalted Orb was cheapest at 105 Divine Orbs (div) per item**. Perfect cost 201 div and the plain Exalted Orb 423 div. Catalysts can't be used on gloves.

When aiming for high tiers, it's tempting to reach for the best one, the Perfect Exalted Orb, right? Its high minimum modifier level cuts out low-tier misses.

But when we compared the cost of putting three ES prefixes on Intelligence gloves, the **Greater** Exalted Orb was cheapest.

Perfect cost almost twice as much, and the plain Exalted Orb four times as much.

:::summary What you'll learn
- For three ES glove prefixes (maximum ES, ES%, maximum Mana, T2+), **Omen of Sinistral Exaltation + Greater Exalted Orb** is cheapest at 105 div per item
- Perfect costs 201 div (the orbs are too expensive); plain costs 423 div (low-tier misses lead to Annulments that hit your targets)
- Catalysts can't be used on gloves, so prefixes are aimed with a plain Omen of Sinistral Exaltation
- Socketing runes (Serle's Triumph + Kolr's Hunt) makes it 1.8 times (194 div). Greater is still cheapest
:::

## The Gloves

- Base: Sirenscale Gloves (Energy Shield 54, requires level 80), the highest-ES regular Intelligence glove base at Item Level 82.
- Start: a Rare with a Fractured "+2 to Level of all Projectile Skills" suffix plus one random mod. The cost of fracturing is not included.
- Targets (prefixes only): maximum Energy Shield T2+, increased Energy Shield T2+ and maximum Mana T2+. Suffixes come later, so anything goes there.

The method mirrors the cheapest one from [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/), flipped to the prefix side:

1. While no target is present, use Chaos Orbs.
2. If a non-target prefix appears, use an Orb of Annulment (no Omen) right away.
3. Add missing targets with Omen of Sinistral Exaltation + an Exalted Orb. We compared plain, Greater and Perfect.

:::note Catalysts don't work on gloves
On a ring, an Omen of Catalysing Exaltation with Catalyst Quality weights your target heavily. But Catalysts are for "a ring or amulet" only (poe2db's description). The ExileDesk engine also refuses: "Catalysts: Rings and Amulets only." Without Catalyst Quality, the Omen of Catalysing Exaltation can't be used either. Glove prefixes have to be aimed with a plain Omen of Sinistral Exaltation.
:::

## Result: Greater Exalted Orb Is Cheapest at 105 div

:::chart bar Cost per item (div, 300 engine runs each)
unit: div
labels: Exalted Orb, Greater Exalted Orb, Perfect Exalted Orb
No runes: 423, 105, 201
Serle's Triumph + Kolr's Hunt: 598, 194, 307
:::

| Omen of Sinistral Exaltation + | Finished | Cost per item | Chaos Orb | Annulment | Exalted | Lost all targets |
|---|---:|---:|---:|---:|---:|---:|
| Exalted Orb | 99.7% | 423 div | 2,682 | 242 | 244 | 111 times |
| **Greater Exalted Orb** | **100%** | **105 div** | 654 | 63 | 65 | 26 times |
| Perfect Exalted Orb | 100% | 201 div | 423 | 43 | 45 | 17 times |

300 runs each; Greater's average is within ±11 div. The gaps are well outside the noise.

## Why Greater

### Perfect loses on price

A Perfect Exalted Orb costs about 2.9 div (2,046 Exalted Orbs). Going Perfect cuts Exalted Orbs from 65 to 45 and Chaos Orbs from 654 to 423.

But the Perfect Exalted Orbs alone cost 132 div per item, far more than what is saved. The hit rate rises, but not enough to pay for the price.

### The plain Exalted Orb loses on misses

It has no minimum modifier level, so low tiers of the target families roll often. Anything below T2 is a miss and gets annulled at once.

Those Annulments hit targets already in place. Losing every target and going back to Chaos Orbs balloons to 111 times per item, and Chaos Orbs alone cost 277 div.

:::tip Greater sits right in between
The Greater Exalted Orb (minimum modifier level 35, about 13 Exalted Orbs each) cuts low tiers while staying cheap, landing right in between.
:::

## Runes Make It 1.8 Times

The +2 Projectile mod on these gloves is actually a Marksman mod that only appears when the rune Kolr's Hunt is socketed. Rerunning with the finished item's runes, Serle's Triumph (+1 suffix) and Kolr's Hunt:

| Omen of Sinistral Exaltation + | No runes | Serle's Triumph + Kolr's Hunt |
|---|---:|---:|
| Exalted Orb | 423 div | 598 div (96.7% finished) |
| **Greater Exalted Orb** | 105 div | **194 div** |
| Perfect Exalted Orb | 201 div | 307 div |

With Kolr's Hunt, Marksman mods enter not only the suffix pool but also the prefix pool (projectile damage, projectile speed, curse effect). More non-targets means Chaos Orbs rise from 654 to 1,275 and Greater Exalted Orbs from 65 to 107. The ranking holds: Greater stays cheapest. Annulment never hit a suffix in either setup, because the item has only two mods during the Chaos phase, and once a target lands no non-Fractured suffix is left.

For reference, finishing the suffixes afterward with Critical Damage Bonus and Arcane Surge brought the total, including the 194 div prefixes, to about 1,350 div per item (83% finished). The suffixes are most of the cost.

## Where the Numbers Come From

- All results come from the ExileDesk engine, one craft at a time. 300 runs per method, capped at 2,000 div per run.
- Prices are the ExileDesk server's market prices (2026-10-20 16:00 UTC; 1 Divine Orb = 696.93 Exalted Orbs). Rune costs (Serle's Triumph about 3.0 div, Kolr's Hunt about 1.0 div) are not included.
- Mod names and tiers come from the engine's data. Not compared with Craft of Exile or in-game results.

## Try It Yourself

You can apply the same moves to Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves). To compare Exalted Orb types, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
