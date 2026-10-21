---
title: PoE2 Crafting Cost Variance: Average, Median and Unlucky 10%
description: Average cost alone misleads in PoE2 crafting. In five examples run on the ExileDesk engine, half the runs finished at about 70% of the average, and one in ten paid more than twice the average. Plus how to read "cost per item" with a cap.
date: 2026-10-22
tags: expected cost, cost, luck, median, cap
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
Looking only at the average (expected) cost of a PoE2 craft is misleading. In five examples run on the ExileDesk engine, **half the runs finished at about 70% of the average, and one in ten paid more than twice the average**. A few unlucky runs pull the average up, so it sits above what most people actually experience.

Our earlier articles quoted "N div per item," an average. But the same method can finish in 50 div for one person and 500 for another, right? You see it on streams and at home.

The average alone doesn't show that spread. So we lined it up from records where the engine ran hundreds of crafts.

:::summary What you'll learn
- In the three examples where every run finished, the median was 0.68 to 0.75 of the average, and the 90th percentile 2.0 to 2.4 times it
- On the Gold Ring, one run in a hundred cost 980 div (4.5 times the average)
- With a cap, the mana ring's finished-run average was 865 div, but the cost per item was 1,991 div (64% finished)
- Annulling misses at once (C) cut not only the average but also the 90th percentile to less than half (955 div to 451 div)
:::

## Half the Runs Finish at About 70% of the Average

Here are the average, median and 90th percentile for five examples. The top three are examples where every run finished; the bottom two count finished runs only.

:::chart bar Cost in five examples (div, ExileDesk engine)
unit: div
labels: Gold Ring suffixes, ES gloves prefixes, Stream gloves, ES gloves suffixes, Mana ring
Average: 220, 105, 94, 747, 865
Median: 166, 74, 64, 631, 794
90th percentile: 451, 250, 223, 1533, 1634
:::

| Example | Runs | Average | Half the runs (median) | One in ten (90th percentile) |
|---|---:|---:|---:|---:|
| Gold Ring, three suffixes (annul misses at once) | 300 | 220 div | 166 div | 451 div |
| ES gloves, three prefixes (Sinistral + Greater) | 300 | 105 div | 74 div | 250 div |
| Gloves from a stream (cheapest route) | 1,000 | 94 div | 64 div | 223 div |
| ES gloves suffixes (finished runs only) | 300 | 747 div | 631 div | 1,533 div |
| Mana ring (finished runs only) | 300 | 865 div | 794 div | 1,634 div |

(div = Divine Orbs.) In the first three, the median was 0.68 to 0.75 of the average and the 90th percentile 2.0 to 2.4 times it.

On the Gold Ring, one run in a hundred cost 980 div (4.5 times the average).

## A Few Unlucky Runs Push the Average Up

Crafting is "keep going until it lands." So there is no ceiling for an unlucky run.

A few runs that miss over and over, losing every target and starting again, are enough to pull the average up. Most runs don't miss that much, so the median sits below the average.

On the Gold Ring, every target was lost and restarted from Chaos Orbs 25 times per ring on average. Runs with more restarts balloon; runs with fewer come in well under the average.

:::tip Budget twice the average
If you hear "220 div on average" and bring exactly 220, more than half of you will have some left over. If you want to be nearly sure to finish, budget twice that or more.
:::

## With a Cap, Look at Cost per Item

Be careful with numbers produced under a cap (for example, giving up at 2,000 div per run):

- **Average of finished runs**: only runs that finished within the cap. The spending of runs that gave up is left out, so it looks cheap.
- **Cost per item**: everything spent by every run, divided by the number finished. Includes the runs that gave up.

On the mana ring, the average of finished runs was 865 div, but only 64% finished, and the cost per item was 1,991 div.

When the finish rate is low, the finished-run average alone can understate the cost by more than half. ExileDesk articles show both side by side.

## Annulling Misses at Once Halves the Spread

The method changes the spread too. For the Gold Ring suffixes, holding misses until three are full (B) versus annulling at once (C):

| Method | Average | Median | 90th percentile |
|---|---:|---:|---:|
| B fill to three | 394 div | 272 div | 955 div |
| C annul at once | 220 div | 166 div | 451 div |

C cut not only the average but also the 90th percentile to less than half. Fewer Annulments hitting targets means fewer "lost everything, start again" runs for the unlucky ([Don't Hoard Your Misses](/en/blog/dont-hoard-misses/)).

## Where the Numbers Come From

- All from the ExileDesk engine, with the run counts in the tables, capped at 2,000 div per run (the stream's gloves used a different setup: 1,000 runs with a cap on the number of crafts instead of on div).
- Market: ExileDesk server (2026-10-20 to 21). Not compared with Craft of Exile or in-game results.

:::note The bottom two examples count finished runs only
The ES gloves suffixes and the mana ring show only runs that finished within the 2,000 div cap. The spending of runs that gave up is left out, so they look cheap. With that spending included, the mana ring's cost per item was 1,991 div.
:::

## Try It Yourself

Applying the same moves a few times on a [Gold Ring on the crafting bench](/?base=Gold%20Ring) makes the spread easy to feel. To compare methods, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
- [PoE2 mana ring craft](/en/blog/mana-ring-craft/)
