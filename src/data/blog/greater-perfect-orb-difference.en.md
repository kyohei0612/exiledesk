---
title: PoE2 Greater vs Perfect Orb Difference: Min Mod Levels
description: The difference between PoE2 Greater and Perfect orbs is the minimum modifier level: 35/50 for Exalted and Chaos (poe2db), 44/70 for Transmutation and Augmentation (engine). A quick table, plus why Greater beat Perfect on ES gloves (105 vs 201 div with no runes).
date: 2026-10-22
tags: minimum modifier level, Exalted Orb, Chaos Orb, Orb of Transmutation, Orb of Augmentation
image: img/greater-perfect-orb-difference-og.en.png
ready: true
---
The difference between PoE2 Greater and Perfect orbs is the **minimum modifier level**: tiers below that mod level can't roll. On poe2db, Regal, Exalted and Chaos Orbs are 35 (Greater) and 50 (Perfect); in the ExileDesk engine, Orbs of Transmutation and Augmentation are 44 and 70. A higher floor means fewer low-tier misses, but a higher price.

:::zundamon normal
If it says "Perfect", that's the best orb, right?
:::

:::metan normal
It does look that way. But when we compared ES glove crafts, Greater came out cheapest.
:::

:::zundamon surprised
Not Perfect?! I want to know why.
:::

:::summary What you'll learn
- Greater and Perfect orbs skip low tiers. A quick table of their floors
- On ES gloves, Greater Exalted Orbs cost 105 div per item, less than Perfect (201 div)
- Set too high, a floor can cut out your target tier
:::

:::tip New to this? Words used here
- **Exalted Orb**: currency that adds one mod to a rare item
- **Mod tier (T1, T2...)**: the same mod splits into tiers by value. T1 is the strongest
- **Mod level**: a number fixed for each tier. Stronger tiers have higher levels
- **Greater / Perfect**: currency grades. Plain, Greater and Perfect
- **Minimum modifier level**: the floor. Tiers below this mod level can't roll
- **div**: Divine Orb. The price unit in this post
:::

## What's the Difference Between Greater and Perfect?

First, let's look at what Greater and Perfect orbs actually do.

:::zundamon normal
Aren't Greater and Perfect just stronger orbs?
:::

:::metan normal
Not stronger, really. They're orbs that don't add weak tiers.
:::

:::metan normal
Tiers below the floor's mod level never enter the roll at all.
:::

:::zundamon happy
So you get fewer low-tier misses!
:::

:::metan normal
Exactly. Since v0.1.515, the ExileDesk crafting bench shows "Only mod level X+ tiers" in large text at the top of Greater and Perfect cards.
:::

:::metan normal
You can see what gets cut before you click.
:::

## Minimum Modifier Level Quick Reference

Here are the floors for each orb.

| Orb | Plain | Greater | Perfect | Source |
|---|---:|---:|---:|---|
| Orb of Transmutation | — | 44 | 70 | engine |
| Orb of Augmentation | — | 44 | 70 | engine |
| Regal Orb | — | 35 | 50 | poe2db |
| Exalted Orb | none | 35 | 50 | poe2db |
| Chaos Orb | none | 35 | 50 | poe2db |

:::zundamon surprised
Only Transmutation and Augmentation have higher numbers!
:::

:::metan normal
Right. Just the two magic-item orbs are 44 for Greater and 70 for Perfect.
:::

:::metan troubled
Actually, we got this wrong once ourselves.
:::

:::zundamon normal
What did you get wrong?
:::

:::metan troubled
In an expected-cost experiment, we gave Transmutation and Augmentation the Exalted Orb's 35 / 50. That made us estimate the magic-item stage at twice its cost.
:::

:::metan normal
The full story is in [Crafting Calculator Mistakes](/en/blog/crafting-calculator-mistakes/).
:::

:::zundamon normal
Where do the numbers in the table come from?
:::

:::metan normal
Exalted and Chaos are values we read on poe2db on 2026-10-21.
:::

:::metan normal
Transmutation and Augmentation's 44 / 70 are the ExileDesk engine's floors, based on POE2Tube (2026-10-06) and the site owner (2026-09-10). Before 0.5.0, their Greater floor was 55.
:::

### What Does "Only Mod Level X+ Tiers" Mean?

Line up your target tier's mod level next to the floor, and it starts to make sense.

:::zundamon normal
"Only 35+" doesn't really click for me.
:::

:::metan normal
Let's put the T2 mod levels of the ES glove prefixes next to each floor (engine data).
:::

| Mod (prefix) | T2 mod level | Greater (floor 35) | Perfect (floor 50) | Going Perfect |
|---|---:|---|---|---|
| Maximum Energy Shield (flat) | 46 | T2 can roll | T2 can't roll | Cuts your T2 target: a loss |
| Maximum Mana | 54 | T2 can roll | T2 can roll | Only cuts low-tier misses |
| Increased Energy Shield % | 60 | T2 can roll | T2 can roll | Only cuts low-tier misses |

:::zundamon normal
What happens with a plain Exalted Orb?
:::

:::metan normal
The plain Exalted Orb has no floor. So even in your target families, low tiers below T2 roll often.
:::

:::metan normal
Greater drops every tier under 35, and Perfect every tier under 50.
:::

:::zundamon happy
So the higher the floor, the better!
:::

:::metan troubled
Not quite. Set too high, it can cut your target tier too. We'll get to that in the last section.
:::

## Perfect Isn't Always Cheapest: Greater Wins on ES Gloves

We compared the cost of landing three ES glove prefixes (the three in the table above, all T2+) with Omen of Sinistral Exaltation, 300 engine runs each.

:::zundamon normal
Perfect cuts the most misses, so it's cheapest, right?
:::

:::metan happy
Nope. Look at the table. Greater is the cheapest.
:::

| Exalted Orb | Floor | Per item (no runes) | With 2 runes | What happens |
|---|---|---:|---:|---|
| Plain | none | 423 div | 598 div | Many low-tier misses; Annulments hit your targets and you fall back to Chaos Orbs |
| **Greater** | 35 | **105 div (cheapest)** | **194 div (cheapest)** | Cuts low tiers, and costs only about 13 Exalted Orbs each |
| Perfect | 50 | 201 div | 307 div | Fewer misses, but about 2.9 div each adds up |

Greater was cheapest both with no runes and with two runes socketed. Here's how many orbs each one used.

| Omen of Sinistral Exaltation + (no runes) | Per item | Exalted used | Chaos Orb | Lost all targets |
|---|---:|---:|---:|---:|
| Exalted Orb | 423 div | 244 | 2,682 | 111 times |
| **Greater Exalted Orb** | **105 div** | 65 | 654 | 26 times |
| Perfect Exalted Orb | 201 div | 45 | 423 | 17 times |

:::zundamon surprised
Greater is cheapest at 105 div!
:::

:::metan normal
Going Perfect cuts Exalted Orbs used from 65 to 45. So it really does hit more often.
:::

:::zundamon normal
Then why does Perfect lose?
:::

:::metan normal
Price. Greater is about 13 Exalted Orbs each, but Perfect is about 2,046 (about 2.9 div).
:::

:::metan normal
The Perfect orbs alone cost 132 div per item.
:::

:::zundamon normal
The plain Exalted Orb is cheap, so why does it cost 423 div?
:::

:::metan normal
Too many low-tier misses. Each Annulment can take out another target, so you keep falling back to Chaos Orbs.
:::

:::metan happy
Greater cuts the low tiers and stays cheap. It lands right in between.
:::

:::zundamon normal
Is it the same with runes socketed?
:::

:::metan normal
With Serle's Triumph + Kolr's Hunt, it's 194 div for Greater, 307 for Perfect and 598 for plain. Same ranking.
:::

:::metan normal
The full glove results are in [Greater Exalt Beats Perfect](/en/blog/es-gloves-greater-exalt/).
:::

## When a High Floor Backfires

On the same gloves' suffixes (with Kolr's Hunt socketed), the Perfect floor worked against us.

:::zundamon troubled
So Perfect can actually cost you?
:::

:::metan normal
It can. Critical Damage Bonus T2 is mod level 45.
:::

:::zundamon normal
And Perfect's floor is 50, so...
:::

:::metan normal
Right, it's below 50, so in the engine T2 can't roll. Only T1 is left (mod level 59, weight 250).
:::

| Suffix (aimed with Omen of Dextral Exaltation) | Critical Damage Bonus T2 (mod level 45) | Per item | Finish rate | Better? |
|---|---|---:|---:|---|
| Greater Exalted Orb | Can roll | 1,158 div | 83% | **Better** (T2 still counts) |
| Perfect Exalted Orb | Can't roll (T1 only) | 2,683 div | 53% | Worse (hits barely rise, each slam costs more) |

:::metan troubled
Hits barely go up, but each slam costs more. The suffix cost rose from 1,158 div with Greater to 2,683 div with Perfect.
:::

:::metan troubled
The finish rate also dropped from 83% to 53%.
:::

:::zundamon normal
Are there other cases where it costs you?
:::

:::metan normal
When you pair it with Omen of Whittling, which removes the lowest-level mod.
:::

:::metan normal
The higher the Chaos Orb's floor, the higher the level of the junk suffixes it adds.
:::

:::metan troubled
Then Whittling removes your prefix target instead, since it's now the lower-level mod.
:::

| Chaos Orb with Omen of Whittling | Removed a prefix target | Why |
|---|---:|---|
| Chaos Orb | 37% | Junk suffixes can roll low tiers too, so Whittling sometimes removes those |
| Perfect Chaos Orb | 48% | Junk suffixes roll higher levels, so your prefix target ends up lowest |

:::zundamon troubled
With a Perfect Chaos Orb, almost half the time your target goes...
:::

:::note fold Not yet verified (5)
- The Exalted and Chaos minimum modifier levels were read on poe2db on 2026-10-21; Transmutation and Augmentation are the engine's values (based on POE2Tube and the site owner). We haven't checked each one in game.
- "Tiers below the Perfect floor can't roll, leaving only T1" is engine behaviour and remains a hypothesis until checked in game.
- "Greater is cheapest" comes from one pair of ES gloves run in the ExileDesk engine. It isn't checked against Craft of Exile, and other slots or targets may rank differently.
- Prices are the ExileDesk server's market prices (2026-10-20 16:00 UTC). If prices move, so does the gap between Greater and Perfect.
- The "twice the cost" from the Transmutation/Augmentation mix-up is the recorded estimate; we didn't recompute the corrected cost.
:::

:::zundamon normal
So which orb should I pick?
:::

:::metan happy
Check your target tier's mod level first, then pick the cheapest floor that doesn't cut it.
:::

:::tip A rule of thumb
Check your target tier's mod level first, then pick the cheapest floor that doesn't cut it. Perfect is only worth considering when every target tier sits above its floor and the misses it removes outweigh the price gap.
:::

The only difference between Greater and Perfect orbs is the minimum modifier level. Perfect isn't always best; compare your target tier's mod level and the price, then choose.

## Where the Numbers Come From

:::fold Show sources (6)
- Minimum modifier levels (Regal / Exalted / Chaos: plain none, Greater 35, Perfect 50): poe2db orb pages, read 2026-10-21 (poe2db)
- Minimum modifier levels (Transmutation / Augmentation 44 / 70): the ExileDesk engine's `CURRENCY_FLOOR`, based on POE2Tube (2026-10-06) and the site owner (2026-09-10); Greater was 55 before 0.5.0 (engine)
- "Only mod level X+ tiers" on cards: ExileDesk changelog v0.1.515
- ES glove prefix costs (no runes: 105 / 201 / 423 div and orb counts; Serle's Triumph + Kolr's Hunt: 194 / 307 / 598 div), T2 mod levels, Critical Damage Bonus T2 excluded by Perfect (suffixes with Kolr's Hunt: 1,158 / 2,683 div), Whittling 37% / 48%: docs/org/math/notes/2026-10-21-es-gloves-ev.md, 300 ExileDesk engine runs each (engine; not verified in game)
- Exalted Orb prices (Greater 13.38, Perfect 2,045.74 Exalted Orbs; 1 Divine Orb = 696.93 Exalted Orbs): ExileDesk server market prices, 2026-10-20 16:00 UTC
- The magic stage estimated at "twice the cost": our expected-cost experiment notes (estimate; not recomputed after the fix)
:::

## Try It Yourself

Pick a Greater or Perfect orb and its card shows "Only mod level X+ tiers" at the top. Try Greater and Perfect Exalted Orbs side by side on Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Energy Shield Gloves Craft: Greater Exalt Beats Perfect](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Crafting Calculator Mistakes: 3 Bugs We Caught](/en/blog/crafting-calculator-mistakes/)

VOICEVOX: Zundamon / Shikoku Metan
