---
title: PoE2 Omens Worth It? When a Plain Annul Is Enough
description: Are PoE2 omens worth it? The expensive ones cost 12.9-19.4 div each; an Orb of Annulment costs 0.44 div. Using optimal-play calculations on gloves, we sort the spots where an omen pays from the ones where a plain Annul is enough.
date: 2026-10-22
tags: Omen, Orb of Annulment, expected cost, gloves, prices
tree: /?page=sim-tree&base=Intricate%20Gloves
craft: /?base=Intricate%20Gloves
draft: true
---
Are PoE2 omens worth it? In our optimal-play calculations, the answer was **mostly no: a plain 0.44 div Orb of Annulment does the job**. Expensive omens like the Omen of Sinistral Annulment (14.9 div) or Omen of Sinistral Erasure (16 div, poe2db trade rates) only paid off **when a target sat on the side with no miss**.

Line the omen prices up and plenty of them cost more than 10 div, against 0.44 div for an Annul. Still, when a miss lands, it's tempting to buy the omen that removes only that side, just so you don't hit a target you already have.

But when we calculated the cheapest move in every spot of a gloves craft, the expensive omens barely came up. The cheap omens, the ones under 1 div, showed up in the best route again and again.

Below are the omen prices, and the spots where the calculation chose an omen or skipped it.

:::summary What you'll learn
- Omens that pick which side to remove (Annulment, Erasure) cost 12.9-19.4 div, and the Omen of Whittling 13.1 div. Exaltation, Crystallisation and Necromancy side omens cost under 1 div
- The optimal route removed misses with plain Orbs of Annulment and almost never bought the expensive omens
- Expensive omens pay when your targets are lined up on the side with no miss; there, a plain Annul costs you +740-3,300 div aiming for T1, +120-1,580 div for T3+
- A rule-of-thumb formula for deciding yourself, and its limits
:::

## Omen Prices: The Expensive Ones and the Cheap Ones

These are the trade rates shown on each poe2db page (taken 2026-10-21). "1 div = n" means one Divine Orb buys n of them. Which way each rate reads (which side is the price) is our estimate from the listing.

| Omen | Effect | Price each |
|---|---|---:|
| Omen of Dextral Erasure | Next Chaos Orb removes only suffixes | 19.4 div |
| Omen of Sinistral Erasure | Next Chaos Orb removes only prefixes | 16 div |
| Omen of Sinistral Annulment | Next Orb of Annulment removes only prefixes | 14.9 div |
| Omen of Whittling | Next Chaos Orb removes the lowest level modifier | 13.1 div |
| Omen of Dextral Annulment | Next Orb of Annulment removes only suffixes | 12.9 div |
| Omen of Light | Next Orb of Annulment removes only Desecrated modifiers | 6.42 div |
| Omen of Sinistral Crystallisation | Next Perfect or Corrupted Essence removes only prefixes | 0.51 div |
| Omen of Dextral Crystallisation | Same, suffixes only | 0.29 div |
| Omen of Abyssal Echoes | Lets you reroll the choices once when revealing the next Desecration | 0.09 div |
| Omen of Dextral Necromancy | Next Desecration adds only a suffix | 0.049 div |
| Omen of Sinistral Exaltation | Next Exalted Orb adds only a prefix | 1 div = 9.87 |
| Omen of Dextral Exaltation | Next Exalted Orb adds only a suffix | about 0.017 div |

The Orb of Annulment itself is 0.45 div on the same trade rates, and 0.44 div on the ExileDesk market prices used in the calculation.

So "omens are expensive" really means **the omens that choose which side to remove** (Annulment, Erasure), plus Whittling, which steers removal to the lowest-level mod. The omens that choose where to add are among the cheapest things you can buy.

## Which Omens Did the Optimal Route Use?

The test item was a pair of Intelligence gloves crafted on a stream. For every state, we worked backward from the finished item to find the move with the lowest expected cost to finish (the method is in [PoE2 Crafting Expected Cost](/en/blog/optimal-move-vs-intuition/)).

The omens split like this:

| | Omen | How it was used |
|---|---|---|
| Used | Omen of Sinistral Exaltation | With a Greater Exalted Orb, to add prefix targets |
| Used | Crystallisation omens (0.4 div) | Make an Essence remove from the side that holds the miss |
| Used | Omen of Light (9.3 div) | Remove only a missed Desecrated mod; 1.4 per item in the run with Desecration |
| Used | Omen of Abyssal Echoes | Paired with revealing a Desecration |
| Not used | Erasure and Annulment omens (14-21 div) | Misses were removed with a plain Orb of Annulment |

The 0.4, 9.3 and 14-21 div figures are the ExileDesk market prices used in the calculation (2026-10-21), a bit different from the poe2db table above.

The Omen of Light isn't cheap at 6-9 div, yet it was picked whenever a Desecrated miss had to go (other misses still got a plain Annul). The choice isn't "too expensive, skip it"; it's "what does it protect in this spot".

## When Does an Expensive Omen Pay Off?

In a separate calculation, we took gloves with five targets (a Fractured T1 Mana prefix, plus two prefix and three suffix targets), split the craft into 27 spots, and measured how much each move loses. We ran it twice, all targets at T1 and T3 or better, for 54 spots in total.

| Spot (targets / prefix misses / suffix misses) | Best move | Loss with plain Annul (T1 / T3+) | Loss with side-only removal (T1 / T3+) |
|---|---|---:|---:|
| 0 / 0 / 2 | Plain Annul | 0 / 0 | +14 / +14 div |
| 0 / 1 / 0 | Chaos Orb | 0 / 0 | +21 / +21 div |
| 1 / 1 / 1 | Plain Annul | 0 / 0 | +14 / +14 div |
| 2 / 1 / 0 | Desecrate (Preserved Rib) + Omen of Dextral Necromancy | +1,004 / +185 div | +1 / 0 div |
| 3 / 1 / 0 | Greater Chaos Orb + Omen of Sinistral Erasure | +3,335 / +1,581 div | +1 / +1 div |
| 3 / 2 / 0 | Annul + Omen of Sinistral Annulment | +2,655 / +1,252 div | 0 / 0 |
| 4 / 1 / 0 | Annul + Omen of Sinistral Annulment | +2,723 / +1,354 div | 0 / 0 |

"Side-only removal" means an Annul with an omen that picks the side holding the miss.

Early on (0-1 targets, and only on the same side as the misses), side-only removal loses just the omen's price, 14-21 div at the prices in the calculation. There's nothing to protect, so the omen is money thrown away.

Once your suffix targets are lined up and the only miss is a prefix, it flips. A plain Annul can hit those suffixes, In spots where a target sits on the clean side, a plain Annul loses +740-3,300 div aiming for T1, and +120-1,580 div even for T3+. Here a Sinistral Erasure or Annulment omen at 21.0 div (the price in the calculation) is a bargain.

Note the "2 / 1 / 0" spot: the best move uses an Omen of Dextral Necromancy at 0.049 div. Instead of removing anything, it steers a Desecration onto the suffix side to add a target, almost for free.

## A Rule of Thumb You Can Use

We also wrote a formula to guess the calculation's answer by hand.

:::tip Rule of thumb
Use the omen if (chance a plain Annul hits a target − chance a side-only Annul hits a target) × cost to put that target back > the omen's price.
:::

The omen prices in the calculation were 13.6 or 21.0 div depending on the spot. In the T1 "3 / 1 / 0" spot, the left side comes to 2,592.7 div, far above 21.0. In the early spots the left side is 0 (no target to hit), so no omen.

The formula pointed the same way as the optimal move (omen or plain Annul) in all 54 spots. Only the direction, though: in "4 / 1 / 0" the left side was 67.8 div while the real loss from a plain Annul was 2,723 div. It's not a way to size the loss.

If a target is cheap to put back, the left side shrinks. That's why plain Annuls were fine on the gloves in the earlier post: the +2 Projectile mod could be re-rolled with Chaos Orbs for about 31 div on average, so hitting it didn't cost much.

:::note What the calculation leaves out
- The Omen of Whittling (13.1 div) was not one of the moves in the calculation. We can't say from it whether there's a spot where it pays.
- The 54-spot results are comparisons inside the calculation. They haven't been checked against in-game results or Craft of Exile, and we haven't yet measured the remaining cost from those spots with the engine.
- Which way poe2db's trade rates read (which side is the price) is our estimate from the listing. Items with few trades are weak guides.
:::

## Where the Numbers Come From

- Omen and Orb of Annulment price list: trade rates on each poe2db page (taken 2026-10-21); the direction is estimated (poe2db / estimate).
- Omens used by the optimal route, 0.44 / 0.4 / 9.3 / 14-21 div, and the ~31 div put-back cost: optimal-play calculation on the gloves (2026-10-21, ExileDesk server prices, 1 div = 718 Exalted Orbs). The optimal route matched 1,000 engine runs within 10% (engine). The 0.32% per-Chaos chance for the put-back was measured in the engine.
- 54-spot table and rule of thumb: calculation on the five-target gloves (2026-10-20; 5,285 div from the start for T1, 2,577 div for T3+). A comparison inside the calculation, not an outside answer key (engine calculation).

## Try It Yourself

To compare a plain Annul and an omen after a miss, apply moves one at a time to gloves on the [crafting bench](/?base=Intricate%20Gloves). The [Craft route tree](/?page=sim-tree&base=Intricate%20Gloves) shows how each move branches.

**Related posts**

- [PoE2 crafting expected cost: the cheapest move skips omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
