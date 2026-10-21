---
title: PoE2 Crafting Order Cost: 58.7 to 249 div by Order
description: How much does crafting order change the cost in PoE2? We calculated 24 orders for the same four targets on one pair of gloves and ran the six recorded ones 1,000 times each on the engine: 58.7 div for the cheapest, 249 div for the priciest recorded order, and one order finishing only about 20%.
date: 2026-10-22
tags: crafting order, expected cost, gloves, Essence, Chaos Orb
image: img/crafting-order-cost-og.en.png
ready: true
---
In PoE2, crafting order alone can change the cost a lot. Reordering the same four targets on one pair of gloves, **the cheapest order (+2 Projectile first, then both Essences, prefix last) cost 58.7 div per finished item**, while the most expensive of the recorded orders cost 249 div (div = Divine Orb). One order finished only about 20% of the time.

:::zundamon normal
If the mods are the same, the cost is the same whatever order I go in, right?
:::

:::metan normal
You'd think so. But on the same gloves, order alone spread the cost from 58.7 div to 249 div.
:::

:::zundamon surprised
That much? What's different?
:::

:::metan normal
Only which target you go for first. With a bad order, the item may never get finished.
:::

:::summary What you'll learn
- With the same finished item, order alone moved the cost from 58.7 div to 249 div per item (recorded orders, 1,000 engine runs each)
- The cheapest order puts +2 to Level of all Projectile Skills first and the prefix last
- Putting the prefix right after +2 Projectile loops in circles and finishes only about 20%
:::

:::tip New to this? Words used here
- **Prefix / Suffix**: the two sides of an item's mods. Each side has a cap on how many mods it can hold
- **Fractured**: a mod that is locked in place and can't be removed
- **Gate**: in this post, a step in the order. You don't move on until the current target is in place
- **Calculation**: ExileDesk's calculation experiment that estimates the cheapest way to craft
- **Engine**: actually crafts with the same rules as the crafting bench and counts the results
- **div**: Divine Orb, the price unit in this post
:::

## What Was Tested

First, what we compared and how.

:::note Not an auto-craft feature
This was a **calculation experiment** inside ExileDesk. The site has no automatic crafting (the owner decided to drop it on 2026-10-21). The point here is why order matters when you craft by hand.
:::

:::zundamon normal
What item did you test it on?
:::

:::metan normal
A pair of gloves. It starts as a Rare with a Fractured maximum Mana T1 prefix.
:::

:::metan normal
Four targets remain: three suffixes and one prefix.
:::

| Target | Side | Note |
|---|---|---|
| +2 to Level of all Projectile Skills | Suffix | Low chance to land in one try |
| the Essence of Hysteria mod | Suffix | Added with an Essence |
| the Essence of Horror mod | Suffix | Added with an Essence |
| projectile speed, or maximum Energy Shield T1 (either one) | Prefix | Either one counts as a hit |

:::zundamon normal
Four targets. How many ways to order them?
:::

:::metan normal
24. We treated each order as a series of **gates**.
:::

:::metan normal
A target later in the order counts as a miss if it shows up early, and gets removed.
:::

:::zundamon normal
So how did you get the costs?
:::

:::metan normal
For each order we calculated the cheapest way to play it, then had the engine play that way for 1,000 runs. Each gate had a cap.
:::

:::metan troubled
But only 6 of the 24 orders have their numbers on record.
:::

## Result: 58.7 div to 249 div Across the Recorded Orders

Costs are per finished item, including runes, and exclude the first half (making the Fractured Rare). The records don't say which Essence comes first, so we write "one Essence" and "the other."

| Order | Calculation | Engine, 1,000 runs | What happened |
|---|---:|---:|---|
| **Projectile → both Essences → Prefix** | **61.9 div** | **58.7 div** (100% finished) | **Cheapest** |
| Projectile → Essence → Prefix → Essence | 109 div | 83 div | Second cheapest. Calculation and engine 24% apart |
| One Essence → Projectile → the other → Prefix | 172 div | 175 div | Middle of the pack |
| One Essence (the reverse) → Projectile → the other → Prefix | 186 div | 178 div | About the same as above |
| Prefix → both Essences → Projectile | 269 div | 249 div | Most expensive recorded |
| Projectile → Prefix → … | 19% finished | 21.5% finished | Loops in circles and rarely finishes |

:::zundamon surprised
Cheapest versus most expensive: 58.7 div against 249 div!
:::

:::metan normal
Even though the same mods go on with the same currency.
:::

:::zundamon troubled
The last order has no cost listed.
:::

:::metan troubled
It kept bouncing between the same states and didn't finish. Only about 2 in 10 of the 1,000 runs finished (19% calculated, 21.5% on the engine).
:::

## Why Going for +2 Projectile First Is Cheaper

The cheapest order put +2 Projectile first. Let's read the reason from the recorded numbers.

:::zundamon normal
What adds +2 Projectile?
:::

:::metan normal
In an earlier experiment on the same gloves (a calculation without a fixed order), the chosen move was Chaos Orbs.
:::

:::metan normal
In this experiment's records, one Chaos Orb lands it 0.30 to 0.32% of the time, in both calculation and engine.
:::

:::zundamon surprised
About 0.3% per try? That's hundreds of orbs!
:::

:::metan normal
From here on, this is our reading of the recorded numbers. We haven't checked it.
:::

:::metan normal
A Chaos Orb removes one non-Fractured mod and adds one.
:::

:::zundamon normal
So if you spam Chaos after your other targets are in place...
:::

:::metan troubled
Right. Over hundreds of tries, you get more chances to wipe the targets you already have.
:::

:::metan happy
So **put the gate that's likely slowest first, while there's little to lose**, and that loss gets smaller. That's the reading.
:::

| Where the +2 Projectile gate sits | What Chaos can wipe | Cost of the recorded order |
|---|---|---|
| First | No targets in place yet | 58.7 div (cheapest) |
| Last (prefix earlier) | Both Essence mods and the prefix | 249 div (most expensive recorded) |

:::zundamon normal
Is that also why prefix-first was the most expensive?
:::

:::metan normal
The same view explains it. The Projectile gate is left for the end.
:::

:::zundamon normal
Why does "Projectile → Prefix" loop in circles?
:::

:::metan troubled
The records don't say. We won't guess here.
:::

:::tip Decide the order before the first orb
On these gloves the cheapest order was "+2 Projectile first, prefix last." When crafting by hand, decide the order before you start and get the targets that need moves able to wipe anything (Chaos Orbs) out of the way first. You should lose finished pieces less often (a rule of thumb based on the reading above).
:::

Keep in mind this is one pair of gloves. Different mod weights or currency prices can change which order is cheapest.

## The Order Where Calculation and Engine Were 24% Apart

One order showed a big gap between calculation and engine. The cause was a mistake in how the calculation was built.

:::zundamon normal
Which order was off?
:::

:::metan normal
"Projectile → Essence → Prefix → Essence." 109 div calculated, 83 div on the engine: 24% apart.
:::

:::metan normal
The calculation was counting 40% more Chaos Orbs at the Projectile gate.
:::

:::zundamon normal
Why did it count too many?
:::

:::metan troubled
It kept the marker for a target added by Desecration even after that target was annulled.
:::

:::metan troubled
Because of that, the calculation treated bones as unusable.
:::

:::zundamon normal
And what happens when you can't use bones?
:::

:::metan troubled
It kept cycling Exalted Orbs and Orbs of Annulment, and those Annulments removed +2 Projectile.
:::

| Times +2 Projectile was removed (per run) | Times |
|---|---:|
| Calculation (before the fix) | 1.02 |
| Engine | 0.45 |

:::metan normal
We fixed it so the marker knows which target it belongs to and clears when that target is removed.
:::

| Cost of this order (excluding 10.8 div of runes) | Calculation | Engine | Gap |
|---|---:|---:|---|
| After the fix | 70.5 div | 65.1 div | Shrank to 6 to 8% |

:::metan normal
The full story is in [PoE2 crafting calculator mistakes](/en/blog/crafting-calculator-mistakes/).
:::

:::note fold Not yet verified (4)
- All numbers come from ExileDesk's calculation and engine only. Not compared with Craft of Exile or in-game results.
- Only 6 of the 24 orders have recorded numbers. 249 div is the most expensive among those, not necessarily the most expensive of all 24.
- The table shows values from before the calculation was fixed. After the fix, the "Projectile → both Essences → Prefix" order was recorded at 54.8 div calculated and 51.5 div on the engine (excluding 10.8 div of runes).
- Adding +2 Projectile with Chaos Orbs is the move chosen in the earlier experiment. The reason for the gaps between orders (Chaos Orbs wiping targets already in place) is our reading of the numbers, not checked case by case.
:::

Order matters about as much as which mods and currency you use. Before you start, decide where the slow target goes.

## Where the Numbers Come From

:::fold Show sources (5)
- The recorded calculated costs among the 24 orders, 61.9, 109, 172, 186 and 269 div, and 19% finished: ExileDesk calculation experiment, 2026-10 (**calculation**).
- 58.7, 83, 175, 178 and 249 div, 100% and 21.5% finished: the calculated play run on the engine, 1,000 runs each, with per-gate caps (**engine**).
- 70.5 / 65.1 div and 54.8 / 51.5 div (after the fix), 1.02 / 0.45 removals, 0.30 to 0.32% per Chaos Orb: the same experiment's root-cause notes (**calculation** and **engine**).
- Adding +2 Projectile with Chaos Orbs: the move chosen in an earlier experiment on the same gloves, without a fixed order (**calculation**).
- Costs include runes and exclude making the Fractured Rare. Prices are the ExileDesk server's market prices.
:::

## Try It Yourself

Try a different order one move at a time on the [crafting bench](/).

**Related posts**

- [PoE2 crafting expected cost: the cheapest move skips Omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 crafting calculator mistakes](/en/blog/crafting-calculator-mistakes/)

VOICEVOX: Zundamon / Shikoku Metan
