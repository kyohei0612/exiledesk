---
title: PoE2 Crafting Order Cost: 58.7 to 249 div by Order
description: How much does crafting order change the cost in PoE2? We calculated 24 orders for the same four targets on one pair of gloves and ran the six recorded ones 1,000 times each on the engine: 58.7 div at best, 249 div at worst, one finishing only ~20%.
date: 2026-10-22
tags: crafting order, expected cost, gloves, Essence, Chaos Orb
draft: true
---
In PoE2, crafting order alone can change the cost several times over. Reordering the same four targets on one pair of gloves, **the cheapest order (+2 Projectile first, then both Essences, prefix last) cost 58.7 Divine Orbs (div) per finished item**, while the most expensive of the orders we have records for cost 249 div. Some orders only finished about 20% of the time.

Same mods. Same currency. The only difference is which target you go for first.

Yet a bad order takes several times longer to land all four, and at worst it circles the same states and never finishes. If you usually start with "whatever's easiest to hit," this one is for you. Here's what a calculation experiment says about why order matters.

:::summary What you'll learn
- With the same finished item, order alone moved the cost from 58.7 div to 249 div per item across the recorded orders (1,000 engine runs each)
- The cheapest order puts +2 to Level of all Projectile Skills first and the prefix last
- Among the recorded orders, prefix first was the most expensive; prefix right after +2 Projectile loops and finishes only about 20%
- One order showed a 24% gap between calculation and engine, and the cause was a bug in our calculation
:::

## What Was Tested

:::note Not an auto-craft feature
This was a **calculation experiment** inside ExileDesk. The site has no automatic crafting (the owner dropped it on 2026-10-21). The point here is why order matters when you craft by hand.
:::

The item is a pair of gloves crafted on a stream. It starts as a Rare with a Fractured maximum Mana T1 prefix. Four targets remain:

| Target | Side |
|---|---|
| +2 to Level of all Projectile Skills | Suffix |
| the Essence of Hysteria mod | Suffix |
| the Essence of Horror mod | Suffix |
| projectile speed, or maximum Energy Shield T1 (either one) | Prefix |

Four targets give 24 orders. Each order works as a series of **gates**: any target later in the order counts as a miss if it shows up early, and gets removed. For each order we calculated the cheapest way to play it, then had the engine play that way for 1,000 runs (with a cap per gate). Of the 24 orders, the six below are the ones whose numbers were recorded.

## Result: 58.7 div to 249 div Across the Recorded Orders

Costs are per finished item, including runes, excluding the first half (making the Fractured Rare). The records don't say which Essence is which in the orders below, so we write "one Essence" and "the other."

| Order | Calculation | Engine, 1,000 runs |
|---|---:|---:|
| **Projectile → both Essences → Prefix** | **61.9 div** | **58.7 div** (100% finished) |
| Projectile → Essence → Prefix → Essence | 109 div | 83 div |
| One Essence → Projectile → the other → Prefix | 172 div | 175 div |
| One Essence (the reverse) → Projectile → the other → Prefix | 186 div | 178 div |
| Prefix → both Essences → Projectile | 269 div | 249 div |
| Projectile → Prefix → … | 19% finished | 21.5% finished |

:::chart bar Cost by order (div per finished item)
unit: div
labels: Proj→2 Ess→Prefix, Proj→Ess→Prefix→Ess, Ess→Proj→Ess→Prefix (a), Ess→Proj→Ess→Prefix (b), Prefix→2 Ess→Proj
Calculation: 61.9, 109, 172, 186, 269
Engine: 58.7, 83, 175, 178, 249
:::

Best versus worst among the recorded orders, on the engine: 58.7 div against 249 div. And orders starting "Projectile → Prefix → …" kept bouncing between the same states, finishing only about one run in five (19% calculated, 21.5% on the engine).

## Why Going for +2 Projectile First Is Cheaper

In an earlier experiment on the same gloves (a calculation without a fixed order), the chosen way to add +2 Projectile was Chaos Orbs. In this experiment's records, one Chaos Orb lands it 0.30 to 0.32% of the time (calculation and engine agree).

What follows is our reading of the recorded numbers, not something we checked. At roughly 0.3% per try, it is likely one of the slower gates of the four. A Chaos Orb removes one non-Fractured mod and adds one. Spamming hundreds of them while your other targets are already in place gives each of them hundreds of chances to get wiped. **Put the gate that is likely slowest first, while there is little to lose**, and that loss shrinks.

The same reading explains why prefix-first was the most expensive of the recorded orders: it leaves the Projectile gate for the end. We don't know why orders starting "Projectile → Prefix" loop. The records don't say, so we won't guess.

:::tip Decide the order before the first orb
On these gloves the cheapest order was "+2 Projectile first, prefix last." When crafting by hand, decide the order up front and get the moves that can wipe anything (Chaos Orbs) out of the way first. You should lose finished pieces less often (a rule of thumb based on the reading above).
:::

Keep in mind this is one pair of gloves. Different weights or currency prices can change which order is cheapest.

## The Order Where Calculation and Engine Were 24% Apart

"Projectile → Essence → Prefix → Essence" came out at 109 div calculated but 83 div on the engine, a 24% gap. The calculation was counting about 40% more Chaos Orbs at the Projectile gate.

The cause was a bug in the calculation. It kept the marker for a target added by Desecration even after that target was annulled. So it thought bones couldn't be used, kept cycling Exalted Orbs and Annulments, and those Annulments removed +2 Projectile 1.02 times per run (0.45 on the engine).

Once the marker tracked which target it belonged to and cleared on removal, this order came to 70.5 div calculated and 65.1 div on the engine (excluding 10.8 div of runes), and the gap shrank to 6 to 8%. The full story is in [PoE2 crafting calculator mistakes](/en/blog/crafting-calculator-mistakes/).

:::note What isn't verified
- All numbers come from ExileDesk's calculation and engine only. Not compared with Craft of Exile or in-game results.
- Only 6 of the 24 orders have recorded numbers. 249 div is the highest among those, not necessarily the highest of all 24.
- The table shows values from before the calculation bug was fixed. After the fix, the "Projectile → both Essences → Prefix" order was recorded at 54.8 div calculated and 51.5 div on the engine (excluding 10.8 div of runes).
- Adding +2 Projectile with Chaos Orbs is the move chosen in the earlier experiment. The reason for the gaps (Chaos Orbs wiping finished pieces) is our reading of the numbers, not checked situation by situation.
:::

## Where the Numbers Come From

- The recorded calculated costs among the 24 orders, 61.9, 109, 172, 186 and 269 div, and 19% finished: ExileDesk calculation experiment, 2026-10 (**calculation**).
- 58.7, 83, 175, 178 and 249 div, 100% and 21.5% finished: the calculated play run on the engine, 1,000 runs each, with per-gate caps (**engine**).
- 70.5 / 65.1 div and 54.8 / 51.5 div (after the fix), 1.02 / 0.45 removals, 0.30 to 0.32% per Chaos Orb: the same experiment's root-cause notes (**calculation** and **engine**).
- Adding +2 Projectile with Chaos Orbs: the move chosen in an earlier experiment on the same gloves, without a fixed order (**calculation**).
- Costs include runes and exclude making the Fractured Rare. Prices are the ExileDesk server's market prices.

## Try It Yourself

Try a different order one move at a time on the [crafting bench](/).

**Related posts**

- [PoE2 crafting expected cost: the cheapest move skips Omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 crafting calculator mistakes](/en/blog/crafting-calculator-mistakes/)
