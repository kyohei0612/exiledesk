---
title: PoE2 Crafting Budget: How Many Times the Average?
description: We counted how PoE2 crafting costs spread over 10,000 runs each on a Gold Ring and boots. Budget the average and 63% finish; 2x the average, 87%; 3x, 95%.
date: 2026-10-22
updated: 2026-10-31
tags: expected cost, cost, luck, budget, cap
craft: /?base=Gold%20Ring
image: img/crafting-cost-variance-og.en.png
ready: true
---
If you budget exactly the average (expected) cost of a PoE2 craft, **only about 6 in 10 runs finish**. Over 10,000 engine runs each on a Gold Ring and a pair of boots, the average budget finished about 63% of runs, twice the average about 87%, and three times about 95%. The two examples differ 7x in average cost, yet these shares came out almost the same.

:::zundamon normal
If the average is 200 div, then 200 div is enough, right?
:::

:::metan troubled
For a bit more than half of runs, yes. Almost 4 in 10 runs need more than 200.
:::

:::zundamon surprised
That many runs go over the average?
:::

:::metan normal
A few unlucky runs cost a huge amount and pull the average up. We counted what share of runs finish at each multiple of the average.
:::

:::summary What you'll learn
- Budget the average and **about 63%** of runs finish. For about 90% you need **a bit over 2x** the average, and for 95% **about 3x**
- Half of runs finish at about 0.7x the average, and 1 in 100 needs about 4.5x
- A 200 div ring and a 30 div pair of boots spread out almost identically relative to their averages
- If you set a cap, read "per finished item", not "average of finished runs"
:::

:::tip New to this? Words used here
- **Average (expected cost)**: total spent by everyone divided by the number of runs
- **Median**: the run in the exact middle when sorted from cheapest to most expensive
- **90th percentile**: the cost at the 90% mark from cheapest. 1 in 10 runs costs more
- **Cap**: the amount at which you give up
:::

## Budget the Average and Almost 4 in 10 Fall Short

Two examples. Each had a fixed set of rules, and 10,000 runs crafted to the end.

| Example | What | Average |
|---|---|---:|
| Ring | Three Gold Ring suffixes (Rarity, Cast Speed, All Resistances), annulling junk right away | 200.4 div |
| Boots | Two T1 resists on boots with fractured Movement Speed T1 | 29.9 div |

We counted the share of runs that finish within a budget set at a multiple of the average.

| Budget | Ring (avg 200 div) | Boots (avg 30 div) | How to read it |
|---|---:|---:|---|
| 0.5x average | 37.1% | 40.6% | Almost 4 in 10 finish for half |
| Exactly the average | **63.3%** | **63.6%** | Almost 4 in 10 fall short |
| 1.5x average | 78.6% | 78.0% | 1 in 5 still falls short |
| 2x average | **87.2%** | **86.1%** | Nearly 9 in 10 finish |
| 3x average | 95.5% | 94.6% | 1 in 20 still falls short |

:::zundamon troubled
Even at twice the average, 1 in 7 or 8 falls short.
:::

:::metan normal
Right. Use twice the average as a rule of thumb, and remember it can still run out.
:::

## Half Finish at 0.7x, 1 in 100 Needs 4.5x

What each point of the run order cost, sorted from cheapest:

| Point | Ring | x average | Boots | x average |
|---|---:|---:|---:|---:|
| 25% (1 in 4 is cheaper) | 66.4 div | 0.33 | 8.0 div | 0.27 |
| 50% (median) | 143.9 div | 0.72 | 20.4 div | 0.68 |
| 75% | 271.6 div | 1.36 | 41.0 div | 1.37 |
| 90% (1 in 10 costs more) | 447.3 div | 2.23 | 69.8 div | 2.34 |
| 95% | 583.1 div | 2.91 | 92.0 div | 3.08 |
| 99% (1 in 100 costs more) | 893.1 div | 4.46 | 139.5 div | 4.67 |
| Most expensive run | 1,859 div | 9.3 | 364 div | 12.2 |

:::zundamon surprised
Half of runs are cheaper than average, but the unluckiest one paid over 9 times the average.
:::

:::metan normal
Those few unlucky runs pull the average up. That's why the median comes out about 30% below the average.
:::

## A 7x Gap in Average, the Same Spread

The ring and boots average 200 and 30 div, almost 7x apart. Measured as a multiple of their own average, the runs spread out almost the same way.

| Finished at | Ring | Boots |
|---|---:|---:|
| 0-0.5x average | 37.1% | 40.6% |
| 0.5-1x | 26.2% | 23.1% |
| 1-2x | 23.9% | 22.4% |
| 2-3x | 8.4% | 8.5% |
| 3x or more | 4.5% | 5.4% |

:::zundamon normal
Different items, same shape?
:::

:::metan normal
Both use the "start over with Chaos when every target is lost" style. In these two examples, once you knew the average, you could roughly read the luck range as multiples of it.
:::

We haven't counted whether other styles (narrowing outcomes with pricey omens, for example) spread the same way.

## With a Cap, Read "Per Finished Item"

If you set a cap (give up at 2,000 div, say), the number changes depending on whether you count the runs that didn't finish.

| Number | What it counts | Mana ring example | How it looks |
|---|---|---:|---|
| Average of finished runs | Only runs that finished before the cap | 865 div | Leaves out failed runs, so it looks cheap |
| Per finished item | Everyone's total spend ÷ number of finished items | 1,991 div | Includes what failed runs spent |

The mana ring finished 64% of the time, so per finished item was more than twice the average of finished runs ([Mana Ring Craft](/en/blog/mana-ring-craft/)). Every ring and boots run above finished, so the two numbers are the same there.

:::tip Budget rule of thumb
In these two examples, twice the average (per finished item) got nearly 9 in 10 runs over the line. Decide in advance where you'll stop, in case you land in the unlucky 10-plus percent.
:::

:::note fold What we haven't checked (4)
- Costs come from the engine, not from crafting thousands of items in the live game. We have not compared them with an outside answer.
- We only counted two examples of the "start over with Chaos when every target is lost" style. Other styles may spread differently.
- The 99% point and the most expensive run swing with the random seed, and we ran one seed each.
- [Annul Misses Early](/en/blog/dont-hoard-misses/) gives 220 div for the same ring. That used 2026-10-20 prices (1 div = 696.93 exalts). In exalts, 220 div is about 153,000 and 200.4 div is about 162,000 (1 div = 807.07 exalts), about 5.5% apart.
:::

Budgeting only the average leaves almost 4 in 10 PoE2 crafts short. Twice the average finished nearly 90% of runs, and three times about 95%.

## Where the Numbers Come From

:::fold Show sources (3)
- Cost spread and finish share per budget: notes docs/org/math/notes/2026-10-31-cost-spread.md, script scripts/analysis/cost-spread.mjs (10,000 runs each, ring seed 1, boots seed 7; the averages match the earlier notes 2026-10-22-gold-ring-midway.md and 2026-10-23-boots-res.md). Engine
- Mana ring "average of finished runs" and "per finished item": docs/org/math/notes/2026-10-21-mana-ring-ev.md. Engine
- Prices: ExileDesk market prices (ring 2026-10-21 17:00 UTC, boots 2026-10-20 16:00 UTC). Market
:::

## Try It Yourself

Pick a Gold Ring on the ExileDesk [crafting bench](/?base=Gold%20Ring), craft the same ring yourself, and see how many divines it takes.

**Related posts**

- [PoE2 Ring Suffix Craft: Annul Misses Early, 400 → 220 div](/en/blog/dont-hoard-misses/)
- [PoE2 Mana Ring Craft: Five Targets Cost 1,991 div](/en/blog/mana-ring-craft/)
- [PoE2 Chaos Spam Odds: How Many Orbs at 0.3% per Try](/en/blog/chaos-spam-odds/)

**Update history**

- 2026-10-31: Replaced the table that repeated numbers from other posts with a fresh count of 10,000 runs each on a ring and boots (finish share per budget, 25th-99th percentiles). Removed the "annul junk right away" section, which repeated [Annul Misses Early](/en/blog/dont-hoard-misses/).
- 2026-10-22: Published.

VOICEVOX: Zundamon / Shikoku Metan
