---
title: PoE2 Chaos Spam Odds: How Many Orbs at 0.3% per Try
description: In PoE2 chaos spam, a T1 target landed 0.30 to 0.32% per Chaos Orb in our glove example. That means about 313 orbs on average, 216 for half of all runs, and 718 or more for one in ten. We also compare what annulling misses early saves.
date: 2026-10-22
tags: Chaos Orb, chaos spam, odds, expected cost, Gold Ring
craft: /?base=Gold%20Ring
image: img/chaos-spam-odds-og.en.png
ready: true
draft: true
---
In PoE2 chaos spam, the chance that one Chaos Orb lands a T1 target was **0.30 to 0.32%** in the glove example we checked on ExileDesk. At 0.32% per try, it takes about 313 orbs on average, 216 or fewer for half of all runs, and 718 or more for one run in ten. A Chaos Orb is about 0.1 div, so that is about 32 div on average.

:::zundamon troubled
I keep using Chaos Orbs and nothing lands. Am I just unlucky?
:::

:::metan normal
It's easy to feel that way. But on the gloves we measured, one try hit only about 0.3% of the time.
:::

:::zundamon surprised
0.3%? That almost never hits!?
:::

:::metan normal
Right. And plenty of people use more than the average, too. Let's go through it.
:::

:::summary What you'll learn
- In the glove example, one Chaos Orb lands a T1 target **0.30 to 0.32%** of the time (calculation and engine agree)
- At 0.32% per try: 313 orbs on average (about 32 div), 216 for half of runs, and 1,437 for one run in a hundred (4.6 times the average)
- For three Gold Ring suffixes, annulling misses at once cuts 1,683 orbs to 930
:::

:::tip New to this? Words used here
- **Chaos Orb**: removes one mod and adds one new mod
- **Chaos spam**: using Chaos Orbs over and over until the target mod lands
- **Fractured**: a mod locked in place so Chaos Orbs can't swap it out
- **Mod tier (T1, T2...)**: the same mod comes in tiers by strength. T1 is the strongest
- **Orb of Annulment**: removes a mod. Here it is used to remove misses
- **div**: Divine Orb, the price unit in this post
:::

## About 0.3% per Try

On a pair of Intelligence gloves, we worked out how often one Chaos Orb lands one of the four T1 targets, both by calculation and on the engine.

:::zundamon normal
What does a Chaos Orb do to the gloves?
:::

:::metan normal
It removes one mod and adds one new mod.
:::

:::metan normal
If only one mod isn't Fractured, that one mod gets swapped every time.
:::

:::zundamon normal
So what were the odds per try?
:::

:::metan normal
The calculation and the engine agreed: **0.30 to 0.32%**.
:::

| Case | Odds per try | What it shows |
|---|---:|---|
| One of the four T1 targets lands (calculation and engine) | 0.30 to 0.32% | Calculation and engine agree |
| Putting +2 to Level of all Projectile Skills back with Chaos Orbs after losing it (engine) | 0.32% | Re-rolling it back is about the same |
| Calculation including misses blocking their mod group | Barely moves from 0.30 to 0.32% | Only 1 to 12% off. The 0.3% estimate holds |

:::zundamon normal
Misses blocking their mod group? What's that?
:::

:::metan normal
Two mods from the same group can't both be on an item. So once a miss lands, its group drops out of the roll.
:::

:::metan happy
Even counting that, the odds per try changed by only 1 to 12%.
:::

## How Many Orbs

If every try has the same 0.32% chance, the number of orbs until a hit follows a geometric distribution.

| Runs finished | Chaos Orbs | div (1 Chaos Orb = 71.89 Exalted) | What it means |
|---|---:|---:|---|
| Half of runs | 216 | about 22 | Half of all runs hit by here |
| Average | 313 | about 32 | Pulled up by unlucky runs, so higher than the half mark |
| 9 in 10 | 718 | about 74 | One run in ten needs more than this |
| 99 in 100 | 1,437 | about 148 | One run in a hundred uses 4.6 times the average |

This table is calculated from 0.32%, not from runs on the engine one by one.

:::zundamon surprised
The average is 313, but half of runs are done by 216!?
:::

:::metan normal
Yes. The runs that never seem to hit push the average up.
:::

:::zundamon troubled
Then what about me, past the average and still nothing...
:::

:::metan normal
One run in ten takes 718 or more. When it feels like it will never land, you are usually in that tail.
:::

:::zundamon normal
Is the calculation really right, though?
:::

:::metan happy
Re-rolling it back over 1,000 engine runs averaged about 31 div. That matches the 32 div above (the market dates differ).
:::

## Costs Beyond the Spam

Across a whole craft, the Chaos Orb count grows further. For three Gold Ring suffixes, we compared the Chaos Orbs used per finished ring (engine, 300 runs each).

:::zundamon normal
Once one target lands, the rest is easy, right?
:::

:::metan troubled
Not quite. If Annulments wipe out every target after that, you're back to Chaos Orbs.
:::

| Method | Chaos Orbs | Why |
|---|---:|---|
| Spam for Rarity T1 only | 1,683 | Keeps using Chaos Orbs until Rarity lands, and goes back to Chaos Orbs the most |
| Fill to three misses, then annul | 1,197 | Slightly fewer returns |
| Annul misses at once | 930 | The fewest returns |
| Swap the target to a single Resistance T1 | 160 | The target itself lands more easily |

:::zundamon surprised
Just annulling misses right away takes 1,683 down to 930!
:::

:::metan normal
Cutting the trips back to Chaos Orbs matters more than the spam for the first target.
:::

:::metan happy
And if you can switch to a target that lands more easily, it drops to 160.
:::

:::tip Fewer returns
Cutting the trips back to Chaos Orbs matters more than the spam for the first target ([Don't Hoard Your Misses](/en/blog/dont-hoard-misses/)).
:::

:::note fold Not yet verified (2)
- The orb count table is calculated from 0.32%, not from runs on the engine one by one.
- The Gold Ring table comes from 300 engine runs per method. It has not been compared with Craft of Exile or in-game results.
:::

One chaos spam try hits only about 0.3% of the time, and using more than the average is common. To use fewer orbs, the way you craft matters more than spam luck: cut the trips back to Chaos Orbs.

## Where the Numbers Come From

:::fold Show sources (3)
- 0.30 to 0.32%: calculation and the engine (the gloves above). The ~31 div re-roll average: 1,000 engine runs (2026-10-21 market).
- Orb count table: geometric distribution from 0.32%. Chaos Orb price: ExileDesk server market (2026-10-20 16:00 UTC).
- Gold Ring table: the engine, 300 runs per method. Not compared with Craft of Exile or in-game results.
:::

## Try It Yourself

You can try the spam on a [Gold Ring on the crafting bench](/?base=Gold%20Ring). To compare methods side by side, open the spam simulator from the button by the Currency heading on the crafting bench.

**Related posts**

- [PoE2 Crafting Cost Variance: Average, Median and Unlucky 10%](/en/blog/crafting-cost-variance/)
- [PoE2 Ring Suffix Craft: Annul Misses Early, 400 → 220 div](/en/blog/dont-hoard-misses/)

VOICEVOX: Zundamon / Shikoku Metan
