---
title: PoE2 Chaos Spam Odds: How Many Orbs at 0.3% per Try
description: In PoE2 chaos spam, a T1 target landed 0.30 to 0.32% per Chaos Orb in our glove example. That means about 313 orbs on average, 216 for half of all runs, and 718 or more for one in ten. We compare it with a video's "about 200."
date: 2026-10-22
tags: Chaos Orb, chaos spam, odds, expected cost, Gold Ring
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/chaos-spam-odds-og.en.png
draft: true
---
In PoE2 chaos spam, the chance that one Chaos Orb lands a T1 target was **0.30 to 0.32%** in the glove example we studied. At 0.32% per try, it takes about 313 orbs on average, 216 or fewer for half of all runs, and 718 or more for one run in ten. A Chaos Orb is about 0.1 div, so that is about 32 Divine Orbs on average.

Chaos spam means using Chaos Orbs on a Rare until the target mod rolls. When orb after orb misses, it's easy to feel like you're the only unlucky one.

A Chaos Orb "removes a random modifier and adds a random new modifier." On a two-mod item (one Fractured + one other), it swaps that one mod every time.

So how good is one try, and how many orbs is normal?

:::summary What you'll learn
- In the glove example, one Chaos Orb lands a T1 target **0.30 to 0.32%** of the time (calculation and engine agree)
- At 0.32% per try: 313 orbs on average (about 32 div), 216 for half of runs, 718 or more for one in ten
- One run in a hundred takes 1,437 orbs, 4.6 times the average
- For three Gold Ring suffixes, annulling misses at once cuts 1,683 orbs to 930
:::

## About 0.3% per Try

On gloves from a stream (one Fractured prefix and one Fractured suffix), we computed how often a single Chaos Orb lands one of the four T1 targets, both by calculation and on the engine.

Both gave **0.30 to 0.32%**. Putting +2 to Level of all Projectile Skills back with Chaos Orbs after losing it measured 0.32% per try on the engine.

Accounting for misses blocking their mod group (two mods of one group can't coexist) changed the per-try odds by only 1 to 12%.

## How Many Orbs

If every try has the same 0.32% chance, the number of tries follows a geometric distribution.

:::chart bar Chaos Orbs until the hit (0.32% per try)
unit: orbs
labels: average, half of runs, 9 in 10, 99 in 100
Chaos Orbs: 313, 216, 718, 1437
:::

| Runs finished | Chaos Orbs | div (71.89 Exalted each) |
|---|---:|---:|
| average | 313 | about 32 |
| half of runs | 216 | about 22 |
| 9 in 10 | 718 | about 74 |
| 99 in 100 | 1,437 | about 148 |

(This table is calculated from 0.32%, not from runs on the engine.)

Half of all runs need far fewer than the 313 average. On the other hand, one run in a hundred takes 4.6 times the average.

When chaos spam feels like it will never hit, you are usually in that tail.

The engine's average cost to put +2 Projectile back over 1,000 runs was about 31 div, consistent with the 32 div above (the market dates differ).

## The Video's "About 200"

A Gold Ring video said it took "about 200" Chaos Orbs to reach suffix Rarity T1. In the table, that is about where half of all runs finish.

:::note The video is one result
One video is one result, so we can't say whether it was lucky or not, but the order of magnitude matches the engine.
:::

Be careful: "it took N orbs" means very different things depending on the tier.

We once worked back a weight from "about 500 Chaos Orbs" for Cast Speed, and those 500 were for T1, so the weight was badly misread ([PoE2 Cast Speed weight on poe2db](/en/blog/poe2db-cast-speed-weight/)).

## Spam Beyond the First Hit

Across a whole craft, the Chaos Orb count grows further. For three Gold Ring suffixes, the Chaos Orbs used per finished ring were (engine, 300 runs each):

| Method | Chaos Orbs |
|---|---:|
| spam for Rarity T1 only | 1,683 |
| fill to three misses, then annul | 1,197 |
| annul misses at once | 930 |
| swap the target to a single Resistance T1 | 160 |

When Annulments wipe every target, you go back to Chaos Orbs.

:::tip Fewer returns
Reducing those returns matters more than the first spam ([Don't Hoard Your Misses](/en/blog/dont-hoard-misses/)).
:::

## Where the Numbers Come From

- 0.30 to 0.32%: calculation and the engine (the stream's gloves). The ~31 div re-roll average: 1,000 engine runs (2026-10-21 market).
- Orb count table: geometric distribution from 0.32%. Chaos Orb price: ExileDesk server market (2026-10-20 16:00 UTC).
- "About 200": said in the video (auto-captions).
- Gold Ring table: the engine, 300 runs each. Not compared with Craft of Exile or in-game results.

## Try It Yourself

You can try the spam on a [Gold Ring on the crafting bench](/?base=Gold%20Ring). To compare methods, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 crafting cost variance](/en/blog/crafting-cost-variance/)
- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
