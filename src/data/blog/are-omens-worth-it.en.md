---
title: PoE2 Omens Worth It? When a Plain Annul Is Enough
description: Are PoE2 omens worth it? The expensive ones cost 12.9-19.4 div each; an Orb of Annulment costs 0.44 div. Using optimal-play calculations on gloves, we sort the spots where an omen pays from the ones where a plain Annul is enough. Our rule of thumb points the same way as the calculation in all 54 spots.
date: 2026-10-22
tags: Omen, Orb of Annulment, expected cost, gloves, prices
craft: /?base=Intricate%20Gloves
image: img/are-omens-worth-it-og.en.png
ready: true
---
Are PoE2 omens worth it, even when they're expensive? The optimal-play calculation says: **in most spots, skip them; a plain 0.44 div Orb of Annulment does the job** (div = Divine Orb). Expensive omens like the Omen of Sinistral Annulment (14.9 div) or the Omen of Sinistral Erasure (16 div, poe2db trade rates) only pay off **when a target sits on the side with no miss**.

:::zundamon normal
I don't want to hit my targets, so I want the omen that removes only the side with the miss.
:::

:::metan normal
I get it. But an Orb of Annulment is 0.44 div, and several omens cost more than 10 div.
:::

:::zundamon surprised
That big a gap?! Should I still use them?
:::

:::metan happy
When we calculated the cheapest move on gloves, the expensive omens barely came up. The cheap ones, under 1 div, showed up again and again.
:::

:::summary What you'll learn
- Omens that pick which side to remove (Annulment, Erasure) cost 12.9-19.4 div each, and the Omen of Whittling 13.1 div. The side omens for Exaltation, Crystallisation and Necromancy cost under 1 div
- The optimal route removed misses with plain Orbs of Annulment and almost never used the expensive omens. They pay when your targets are lined up on the side with no miss; there, a plain Annul loses +740-3,300 div aiming for T1, +120-1,580 div for T3+
- A rule-of-thumb formula for deciding yourself, and its limits
:::

:::tip New to this? Words used here
- **div**: Divine Orb. The price unit in this post
- **Omen**: An item that, while you hold it, changes how the next currency you use works
- **Orb of Annulment**: Currency that removes one random modifier from an item
- **Side**: Where a modifier sits. The left side is prefixes, the right side is suffixes
- **Target / miss**: A modifier you need for the finished item is a target; one you don't need is a miss
- **Optimal move**: The move with the lowest expected cost to finish
:::

## Omen Prices: The Expensive Ones and the Cheap Ones

These are the trade rates shown on each poe2db page (taken 2026-10-21). Which way each rate reads (which side is the price) is our estimate from the listing.

| Omen | Effect | Price each | Expensive or cheap |
|---|---|---:|---|
| Omen of Dextral Erasure | Next Chaos Orb removes only suffixes | 19.4 div | Expensive |
| Omen of Sinistral Erasure | Next Chaos Orb removes only prefixes | 16 div | Expensive |
| Omen of Sinistral Annulment | Next Orb of Annulment removes only prefixes | 14.9 div | Expensive |
| Omen of Whittling | Next Chaos Orb removes the lowest level modifier | 13.1 div | Expensive |
| Omen of Dextral Annulment | Next Orb of Annulment removes only suffixes | 12.9 div | Expensive |
| Omen of Light | Next Orb of Annulment removes only Desecrated modifiers | 6.42 div | Medium |
| Omen of Sinistral Crystallisation | Next Perfect or Corrupted Essence removes only prefixes | 0.51 div | Cheap |
| Omen of Dextral Crystallisation | Same, suffixes only | 0.29 div | Cheap |
| Omen of Abyssal Echoes | Lets you reroll the choices once when revealing the next Desecration | 0.09 div | Cheap |
| Omen of Dextral Necromancy | Next Desecration adds only a suffix | 0.049 div | Nearly free |
| Omen of Sinistral Exaltation | Next Exalted Orb adds only a prefix | 1 div = 9.87 | Cheap |
| Omen of Dextral Exaltation | Next Exalted Orb adds only a suffix | about 0.017 div | Nearly free |

:::zundamon normal
What does "1 div = 9.87" mean?
:::

:::metan normal
It means one Divine Orb buys 9.87 of them.
:::

:::zundamon normal
And the Orb of Annulment we're comparing against costs how much?
:::

:::metan normal
0.45 div on the same trade rates. The ExileDesk market prices used in the calculation put it at 0.44 div.
:::

:::zundamon surprised
So not every omen is expensive!
:::

:::metan happy
Right. Only the omens that choose which side to remove (Annulment, Erasure) are expensive, plus Whittling, which steers removal to the lowest-level mod. The omens that choose where to add are on the cheap side.
:::

## Which Omens Did the Optimal Route Use?

The test item was a pair of Intelligence gloves with +2 Projectile among the targets. For every state, we worked backward to find the move with the lowest expected cost to finish (the method is in [PoE2 Crafting Expected Cost](/en/blog/optimal-move-vs-intuition/)).

| Used? | Omen | How it was used |
|---|---|---|
| Used | Omen of Sinistral Exaltation | With a Greater Exalted Orb, to add prefix targets |
| Used | Crystallisation omens (0.4 div) | Make an Essence remove from the side that holds the miss |
| Used | Omen of Light (9.3 div) | Remove only a Desecrated miss; 1.4 per item in the run with Desecration |
| Used | Omen of Abyssal Echoes | Paired with revealing a Desecration |
| Not used | Erasure and Annulment omens (14-21 div) | Misses were removed with a plain Orb of Annulment |

:::zundamon normal
These prices are a bit different from the poe2db table.
:::

:::metan normal
0.4, 9.3 and 14-21 div are the ExileDesk market prices used in the calculation (2026-10-21).
:::

:::zundamon normal
The Omen of Light costs 6-9 div, and it still got used?
:::

:::metan normal
Only when a Desecrated miss had to go. Every other miss got a plain Annul.
:::

:::metan happy
It isn't "too expensive, skip it." It's "what does it protect in this spot."
:::

## When Does an Expensive Omen Pay Off?

In a separate calculation, we took gloves with five targets (a Fractured T1 Mana, plus two prefix and three suffix targets), split the craft into 27 spots, and measured how much each move loses. We ran it twice, all targets at T1 and T3 or better, for 54 spots in total.

| Spot (targets / prefix misses / suffix misses) | Best move | Loss with plain Annul (T1 / T3+) | Loss with side-only removal (T1 / T3+) | Which pays |
|---|---|---:|---:|---|
| 0 / 0 / 2 | Plain Annul | 0 / 0 | +14 / +14 div | No omen (no target to protect) |
| 0 / 1 / 0 | Chaos Orb | 0 / 0 | +21 / +21 div | No omen (no target to protect) |
| 1 / 1 / 1 | Plain Annul | 0 / 0 | +14 / +14 div | No omen |
| 2 / 1 / 0 | Desecration (Preserved Rib) + Omen of Dextral Necromancy | +1,004 / +185 div | +1 / 0 div | Side-choosing move |
| 3 / 1 / 0 | Greater Chaos Orb + Omen of Sinistral Erasure | +3,335 / +1,581 div | +1 / +1 div | Side-choosing move |
| 3 / 2 / 0 | Annul + Omen of Sinistral Annulment | +2,655 / +1,252 div | 0 / 0 | Side-choosing move |
| 4 / 1 / 0 | Annul + Omen of Sinistral Annulment | +2,723 / +1,354 div | 0 / 0 | Side-choosing move |

:::zundamon normal
What's "side-only removal"?
:::

:::metan normal
A move with an omen that picks the side holding the miss.
:::

:::zundamon normal
In the top three rows, side-only removal is the one losing.
:::

:::metan normal
Early on there are 0-1 targets, and only on the same side as the misses. With nothing to protect, the omen's price (+14-21 div at the prices in the calculation) is simply wasted.
:::

:::zundamon surprised
In the bottom four rows, the plain Annul loses on a whole other scale!
:::

:::metan normal
Those are spots where your suffix targets are lined up and the misses are only prefixes. A plain Annul can take out the suffixes you built.
:::

:::metan normal
When a target sits on the side with no miss, a plain Annul loses +740-3,300 div aiming for T1, and +120-1,580 div even for T3+.
:::

:::metan happy
Here a Sinistral Erasure or Annulment omen at 21.0 div each (the price in the calculation) is a bargain.
:::

:::zundamon normal
In "2 / 1 / 0", the Necromancy omen got picked.
:::

:::metan happy
That's the fun part. Instead of removing anything, it steers the Desecration onto the suffix side to add a target. At 0.049 div, it's picked almost for free.
:::

## A Rule of Thumb You Can Use

We also wrote a formula to guess the calculation's answer by hand.

:::tip Rule of thumb
Use the omen if (chance a plain Annul hits a target − chance a side-only Annul hits a target) × cost to put that target back > the omen's price.
:::

:::zundamon normal
What price did you plug in for the omen?
:::

:::metan normal
The prices in the calculation were 13.6 or 21.0 div, depending on the spot.
:::

| Spot | Left side | Omen price | Formula says | Actual loss with plain Annul |
|---|---:|---:|---|---:|
| T1 "3 / 1 / 0" | 2,592.7 div | 21.0 div | Use the omen (far above) | +3,335 div |
| T1 "4 / 1 / 0" | 67.8 div | 21.0 div | Use the omen | +2,723 div |
| Early spots | 0 (no target to hit) | 13.6 or 21.0 div | No omen needed | 0 |

:::zundamon happy
With this formula, I don't need to run the calculation!
:::

:::metan normal
In all 54 spots, it pointed the same way as the optimal move (omen or plain Annul).
:::

:::metan troubled
But only the direction. In "4 / 1 / 0" the left side was 67.8 div, while the real loss was 2,723 div. It's not a way to size the loss.
:::

:::zundamon normal
What happens if a target is cheap to put back?
:::

:::metan normal
The left side shrinks. On the gloves in the earlier post, plain Annuls were fine because +2 Projectile could be put back with Chaos Orbs.
:::

:::metan normal
Putting it back cost about 31 div on average, so hitting it didn't cost much.
:::

:::note fold Not yet verified (3)
- The Omen of Whittling (13.1 div) was not one of the moves in the calculation. We can't say from it whether there's a spot where it pays.
- The 54-spot results are comparisons inside the calculation. They haven't been checked against in-game results or Craft of Exile, and we haven't yet measured the remaining cost from the boundary spots with the engine.
- Which way poe2db's trade rates read (which side is the price) is our estimate from the listing. Items with few trades are weak guides.
:::

Use an expensive omen only when there's a target to protect on the side with no miss. Everywhere else, a 0.44 div Orb of Annulment is enough.

## Where the Numbers Come From

:::fold Show sources (3)
- Omen and Orb of Annulment price list: trade rates on each poe2db page (taken 2026-10-21). The direction is estimated (poe2db / estimate).
- Omens used by the optimal route, 0.44 / 0.4 / 9.3 / 14-21 div, and the ~31 div put-back cost: optimal-play calculation on the gloves (2026-10-21, ExileDesk server prices, 1 div = 718 Exalted Orbs). The optimal route matched 1,000 engine runs within 10% (engine). The 0.32% chance per put-back attempt was measured in the engine.
- 54-spot table and rule of thumb: calculation on the five-target gloves (2026-10-20; 5,285 div from the start for T1, 2,577 div for T3+). A comparison inside the calculation, not an outside answer key (engine calculation).
:::

## Try It Yourself

To compare a plain Annul and an omen after a miss, apply moves one at a time to gloves on the [crafting bench](/?base=Intricate%20Gloves).

**Related posts**

- [PoE2 crafting expected cost: the cheapest move skips expensive omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 ring suffix craft: annul misses right away](/en/blog/dont-hoard-misses/)
- [PoE2 Exaltation omens: left, right and Greater](/en/blog/exaltation-omens-guide/)

VOICEVOX: Zundamon / Shikoku Metan
