---
title: PoE2 Greater vs Perfect Orb Difference: Min Mod Levels
description: The difference between PoE2 Greater and Perfect orbs is the minimum modifier level: 35/50 for Exalted and Chaos (poe2db), 44/70 for Transmutation and Augmentation (engine). A quick table, plus why Greater beat Perfect on ES gloves.
date: 2026-10-22
tags: minimum modifier level, Exalted Orb, Chaos Orb, Orb of Transmutation, Orb of Augmentation
image: img/greater-perfect-orb-difference-og.en.png
draft: true
---
The difference between PoE2 Greater and Perfect orbs is the **minimum modifier level**: tiers below that mod level can't roll. On poe2db, Regal, Exalted and Chaos Orbs are 35 (Greater) and 50 (Perfect); in the ExileDesk engine, Orbs of Transmutation and Augmentation are 44 and 70. A higher floor means fewer low-tier misses, but a higher price.

"Perfect" sounds like the obvious pick for high tiers. Slam the best version and you can't go wrong, right?

When we compared Energy Shield glove crafts in the ExileDesk engine, though, the **Greater** Exalted Orb was cheapest. Perfect cost about twice as much, and the plain Exalted Orb about four times. In some spots the Perfect floor was so high it cut out the very tier we wanted.

:::summary What you'll learn
- A quick table of Greater and Perfect minimum modifier levels (Transmutation, Augmentation, Regal, Exalted, Chaos)
- What "only mod level X+ tiers" actually means for the roll
- Why Greater Exalted Orbs cost 105 div per ES glove craft versus 201 div for Perfect
- When a high floor backfires (your target tier is excluded; Omen of Whittling hits your targets)
:::

## Greater vs Perfect: It's the Minimum Modifier Level

Greater and Perfect orbs put a floor on the mods they add. Any tier whose mod level is below the minimum modifier level is left out of the roll.

Since v0.1.515, the ExileDesk crafting bench shows "Only mod level X+ tiers" in large text at the top of Greater and Perfect currency cards, so you can see what gets cut before you click.

## Minimum Modifier Level Quick Reference

| Orb | Plain | Greater | Perfect | Source |
|---|---:|---:|---:|---|
| Orb of Transmutation | — | 44 | 70 | engine |
| Orb of Augmentation | — | 44 | 70 | engine |
| Regal Orb | — | 35 | 50 | poe2db |
| Exalted Orb | none | 35 | 50 | poe2db |
| Chaos Orb | none | 35 | 50 | poe2db |

The Exalted and Chaos values were read on poe2db on 2026-10-21. Transmutation and Augmentation's 44 / 70 are the floors the ExileDesk engine uses (`CURRENCY_FLOOR`), based on POE2Tube (2026-10-06) and the site owner (2026-09-10); we haven't checked them on poe2db. Before 0.5.0, the Greater floor for these two was 55.

Note that **Transmutation and Augmentation are the odd ones out**. The two magic-item orbs have higher floors (44 / 70) than the three rare-item orbs.

We tripped over this ourselves. In an expected-cost experiment we gave Transmutation and Augmentation the Exalted Orb's 35 / 50, and ended up estimating the magic-item stage at twice its cost. The full story is in [Crafting Calculator Mistakes](/en/blog/crafting-calculator-mistakes/).

## What Does "Only Mod Level X+ Tiers" Mean?

Every mod tier has a mod level. On the ES gloves we crafted, the T2 prefixes sit at these levels (engine data):

| Prefix | T2 mod level |
|---|---:|
| Maximum Energy Shield (flat) | 46 |
| Maximum Mana | 54 |
| Increased Energy Shield % | 60 |

The plain Exalted Orb has no minimum modifier level, so low tiers below T2 roll often even within your target families. Greater drops everything under 35, Perfect everything under 50.

A floor doesn't only cut low misses, though. **Set too high, it cuts your target tier too.** More on that below.

### Perfect Isn't Always Cheapest: Greater Wins on ES Gloves

We compared the cost of landing three ES glove prefixes (the three above, all T2+) with Omen of Sinistral Exaltation, 300 engine runs each. The table below is the setup with no runes socketed.

| Omen of Sinistral Exaltation + (no runes) | Cost per item | Exalted used | Chaos Orb | Lost all targets |
|---|---:|---:|---:|---:|
| Exalted Orb | 423 div | 244 | 2,682 | 111 times |
| **Greater Exalted Orb** | **105 div** | 65 | 654 | 26 times |
| Perfect Exalted Orb | 201 div | 45 | 423 | 17 times |

Going Perfect cuts Exalted Orbs used from 65 to 45, so it does hit more often.

It loses on price. A Greater Exalted Orb is about 13 Exalted Orbs; a Perfect one is about 2,046 (about 2.9 div), and the Perfect orbs alone cost 132 div per item. The plain orb has the opposite problem: every low-tier miss gets annulled, the Annulments hit targets already in place, and you keep falling back to Chaos Orbs.

Greater cuts the low tiers while staying cheap, landing right in between. In the finished item's setup with runes (Serle's Triumph + Kolr's Hunt), it's 194 div for Greater, 307 for Perfect and 598 for plain: same ranking. The full glove breakdown is in [Greater Exalt Beats Perfect](/en/blog/es-gloves-greater-exalt/).

## When a High Floor Backfires

On the same gloves' suffixes (with Kolr's Hunt socketed), the Perfect floor worked against us in the engine.

Critical Damage Bonus T2 is mod level 45, below Perfect's 50, so **in the engine it can't roll**. Only T1 is left (mod level 59, weight 250). That's engine behaviour; we haven't verified it in game. Aiming with Omen of Dextral Exaltation, the suffix cost rose from 1,158 div with Greater to 2,683 div with Perfect, and the finish rate dropped from 83% to 53%.

The other case is Omen of Whittling, which removes the lowest-level mod. The higher the Chaos Orb's floor, the higher the level of the junk suffixes it adds, so Whittling ends up removing a lower-level prefix target instead. That happened 37% of the time with the plain Chaos Orb and 48% with the Perfect one.

:::note What we haven't verified
- The Exalted and Chaos minimum modifier levels were read on poe2db on 2026-10-21; Transmutation and Augmentation are the engine's values (based on POE2Tube and the site owner). We haven't checked each one in game.
- "Tiers below the Perfect floor can't roll, leaving only T1" is engine behaviour and remains a hypothesis until checked in game. In one video, a Perfect Chaos Orb did add a mod level 47 mod, which conflicts with the floor of 50. That discrepancy is still unresolved.
- "Greater is cheapest" comes from one pair of ES gloves run in the ExileDesk engine. It isn't checked against Craft of Exile, and other slots or targets may rank differently.
- Prices are the ExileDesk server's market prices (2026-10-20 16:00 UTC). If prices move, so does the gap between Greater and Perfect.
- The "twice the cost" from the Transmutation/Augmentation mix-up is the recorded estimate; we didn't recompute the corrected cost.
:::

:::tip A rule of thumb
Check your target tier's mod level first, then pick the cheapest floor that doesn't cut it. Perfect is only worth considering when every target tier sits above its floor and the misses it removes outweigh the price gap.
:::

## Where the Numbers Come From

- Minimum modifier levels (Regal / Exalted / Chaos: plain none, Greater 35, Perfect 50): poe2db orb pages, read 2026-10-21 (poe2db)
- Minimum modifier levels (Transmutation / Augmentation 44 / 70): the ExileDesk engine's `CURRENCY_FLOOR`, based on POE2Tube (2026-10-06) and the site owner (2026-09-10); Greater was 55 before 0.5.0 (engine)
- "Only mod level X+ tiers" on cards: ExileDesk changelog v0.1.515
- ES glove prefix costs (no runes: 105 / 201 / 423 div and orb counts; Serle's Triumph + Kolr's Hunt: 194 / 307 / 598 div), T2 mod levels, Critical Damage Bonus T2 excluded by Perfect (suffixes with Kolr's Hunt: 1,158 / 2,683 div), Whittling 37% / 48%: docs/org/math/notes/2026-10-21-es-gloves-ev.md, 300 ExileDesk engine runs each (engine; not verified in game)
- Exalted Orb prices (Greater 13.38, Perfect 2,045.74 Exalted Orbs; 1 Divine Orb = 696.93 Exalted Orbs): ExileDesk server market prices, 2026-10-20 16:00 UTC
- The magic stage estimated at "twice the cost": our expected-cost experiment notes (estimate; not recomputed after the fix)

## Try It Yourself

Pick a Greater or Perfect orb and its card shows "Only mod level X+ tiers" at the top. Try Greater and Perfect Exalted Orbs side by side on Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Energy Shield Gloves Craft: Greater Exalt Beats Perfect](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Crafting Calculator Mistakes: 3 Bugs We Caught](/en/blog/crafting-calculator-mistakes/)
