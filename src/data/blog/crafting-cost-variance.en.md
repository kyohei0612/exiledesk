---
title: PoE2 Crafting Cost Variance: Average, Median and Unlucky 10%
description: Average cost alone misleads in PoE2 crafting. In five examples run on the ExileDesk engine, half the runs finished at about 70% of the average, and one in ten paid more than twice the average. Plus how to read "cost per item" with a cap.
date: 2026-10-22
tags: expected cost, cost, luck, median, cap
craft: /?base=Gold%20Ring
image: img/crafting-cost-variance-og.en.png
ready: true
---
Looking only at the average (expected) cost of a PoE2 craft is misleading. In five examples run on the ExileDesk engine, **half the runs finished at about 70% of the average, and one in ten paid more than twice the average**. A few unlucky runs pull the average up, so it sits above what most people actually experience.

:::zundamon normal
If a post says "N div per item," does everyone craft it for that price?
:::

:::metan normal
Not at all. With the same method, one person finishes in 50 div and another needs 500.
:::

:::zundamon surprised
That big a gap?! You'd never see it from the average alone.
:::

:::metan happy
So we took the engine's records of hundreds of runs and laid out the spread of luck.
:::

:::summary What you'll learn
- In examples where every run finished, half the runs paid 0.68 to 0.75 of the average, and one in ten paid 2.0 to 2.4 times it
- With a cap, look at "cost per item," not "average of finished runs" (865 div vs 1,991 div on the mana ring)
- Annulling misses at once cuts not just the average but also the unlucky runs' cost to less than half
:::

:::tip New to this? Words used here
- **Average (expected cost)**: everyone's cost added up, divided by the number of runs
- **Half the runs (median)**: sort runs from cheapest; the cost of the run right in the middle
- **One in ten (90th percentile)**: sort runs from cheapest; the cost at the 90% mark. A guide to the unlucky side
- **Cap**: a limit you set in advance: "I give up once I've spent this much"
- **Cost per item**: everything spent by every run, divided by the number finished
- **div**: Divine Orb, the price unit in this post
:::

## Half the Runs Finish at About 70% of the Average

Here are the average, median and 90th percentile for five examples. The top three are examples where every run finished; the bottom two count finished runs only.

:::zundamon normal
If the average is 220 div, I'll finish for about 220 div, right?
:::

:::metan normal
Look at the table. In every example, the middle run paid less than the average.
:::

| Example | Runs | Average | Half the runs (median) | One in ten (90th percentile) | What the numbers are |
|---|---:|---:|---:|---:|---|
| Gold Ring, three suffixes (annul misses at once) | 300 | 220 div | 166 div | 451 div | Every run finished |
| ES gloves, three prefixes (Omen of Sinistral Exaltation + Greater Exalted Orb) | 300 | 105 div | 74 div | 250 div | Every run finished |
| Other gloves (cheapest route) | 1,000 | 94 div | 64 div | 223 div | Every run finished |
| ES gloves suffixes | 300 | 747 div | 631 div | 1,533 div | Finished runs only (looks cheap) |
| Mana ring | 300 | 865 div | 794 div | 1,634 div | Finished runs only (looks cheap) |

In every example, the middle run paid less than the average, and one in ten paid about twice the average.

:::zundamon surprised
The middle run is cheaper than the average!
:::

:::metan normal
In the top three, the middle run paid 0.68 to 0.75 of the average.
:::

:::metan troubled
On the other hand, one in ten paid 2.0 to 2.4 times the average.
:::

:::zundamon troubled
How much does the unluckiest person pay?
:::

:::metan troubled
On the Gold Ring, one run in a hundred cost 980 div. That's 4.5 times the average.
:::

:::note The bottom two examples count finished runs only
The ES gloves suffixes and the mana ring show only runs that finished within the 2,000 div cap. The spending of runs that never finished is left out, so they look cheap.
:::

## A Few Unlucky Runs Push the Average Up

Crafting cost works like "keep going until it lands." So there is no ceiling for an unlucky run.

:::zundamon normal
Why don't the middle run and the average line up?
:::

:::metan normal
A few runs miss over and over, lose every target and have to start again.
:::

:::metan normal
Those few runs drag the average up.
:::

:::zundamon happy
Most runs don't miss that much, so the middle sits below the average.
:::

:::metan normal
Exactly. On the Gold Ring, runs lost every target and restarted from Chaos Orbs 25 times on average.
:::

:::metan normal
More restarts make the cost balloon. Fewer restarts come in well under the average.
:::

:::zundamon normal
So how much should I budget?
:::

:::metan normal
If you hear "220 div on average" and bring 220 div, more than half of you will have some left over.
:::

:::metan troubled
But if you want to be nearly sure to finish, plan for twice that or more.
:::

:::tip Budget twice the average
Bring only the average, and more than half of you will have some left over. To be nearly sure to finish, plan for twice the average or more.
:::

## With a Cap, Look at Cost per Item

One more thing to watch: the numbers you get when you set a cap (for example, giving up at 2,000 div per run).

:::zundamon normal
What changes when there's a cap?
:::

:::metan normal
The number changes depending on whether the runs that never finished are counted.
:::

| Number | What it counts | Mana ring | How it reads |
|---|---|---:|---|
| Average of finished runs | Only runs that finished within the cap | 865 div | Leaves out runs that never finished, so it looks cheap |
| Cost per item | Everything spent by every run, divided by the number finished | 1,991 div | Includes runs that never finished (everyone's spending spread over the finished items) |

On the mana ring, 64% finished, and the cost per item was more than twice the finished-run average.

:::zundamon surprised
More than twice?!
:::

:::metan troubled
When the finish rate is low, the finished-run average alone makes it look more than twice as cheap as it is.
:::

:::metan happy
That's why ExileDesk articles show both side by side.
:::

## Annulling Misses at Once Halves the Spread

The method changes the spread too. For the Gold Ring suffixes, we compared holding misses until three are filled (B) with annulling them at once (C).

:::zundamon normal
Saving misses and annulling them together sounds like less hassle.
:::

:::metan normal
It's the other way around. Look at the table.
:::

| Method | Average | Median | 90th percentile | Which is better |
|---|---:|---:|---:|---|
| B fill to three | 394 div | 272 div | 955 div | Worse (Annulments hit targets more often) |
| C annul at once | 220 div | 166 div | 451 div | **Better** (cheaper on average and for the unlucky) |

Annulling at once (C) cut not just the average but also the 90th percentile to less than half.

:::zundamon surprised
Even the unlucky runs dropped from 955 div to 451 div!
:::

:::metan normal
Fewer Annulments hitting targets means fewer "lost everything, start again" runs.
:::

:::metan normal
The details are in [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/).
:::

:::note fold Not yet verified (2)
- Every number comes from the ExileDesk engine. None were compared with Craft of Exile or in-game results.
- Prices are from the ExileDesk server market (2026-10-20 to 21). If the market moves, the costs change too.
:::

Look at "half the runs" and "one in ten" alongside the average, and you won't misread crafting costs. When there's a cap, put the cost per item next to them too.

## Where the Numbers Come From

:::fold Show sources (3)
- Average, median, 90th percentile, one in a hundred, number of restarts, and methods B and C for the five examples: ExileDesk engine. Run counts as in the tables. Capped at 2,000 div per run (only the other gloves used a different setup: 1,000 runs with a cap on the number of crafts instead of on div)
- Mana ring 64% finished, 1,991 div per item: ExileDesk engine, 2,000 div cap
- Market: ExileDesk server market (2026-10-20 to 21)
:::

## Try It Yourself

Apply the same moves a few times on a [Gold Ring on the crafting bench](/?base=Gold%20Ring) and you'll feel the spread for yourself.

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
- [PoE2 mana ring craft](/en/blog/mana-ring-craft/)

VOICEVOX: Zundamon / Shikoku Metan
