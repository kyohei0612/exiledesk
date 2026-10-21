---
title: PoE2 Crafting Expected Cost: The Cheapest Move Skips Omens
description: We worked out PoE2 crafting expected cost backward from the finished item. A route close to the video costs about 3,400 div; the best route about 105 div. Why plain Orbs of Annulment beat expensive Omens, with 1,000 engine runs.
date: 2026-10-22
tags: expected cost, Orb of Annulment, Omen, Chaos Orb, gloves
tree: /?page=sim-tree&base=Intricate%20Gloves
craft: /?base=Intricate%20Gloves
image: img/optimal-move-vs-intuition-og.en.png
draft: true
---
Working PoE2 crafting expected cost backward from the finished item, the cheapest route **barely used expensive Omens and removed misses with a plain Orb of Annulment**. On one pair of gloves, a route close to intuition cost about 3,400 Divine Orbs (div), while the best route cost 105 div, and 94 div over 1,000 engine runs.

That's about one thirtieth.

When a miss rolls mid-craft, isn't it tempting to reach for an expensive Omen, such as Omen of Sinistral Erasure, to remove only the side with the miss? You don't want to hit a target. But the calculation picked a plain Orb of Annulment, worth 0.44 div. Let's look at how the calculation works and why the answer differs from intuition.

:::summary What you'll learn
- The cheapest route on these gloves: 105 div by calculation, 94 div over 1,000 engine runs. About 1/30 of the intuitive route (about 3,400 div)
- Remove misses with a **plain Orb of Annulment**. Expensive Omens are almost never chosen
- Omens pay off when a target sits on the side with no miss. A simple formula shows the break-even point
- Starting over was never chosen in any situation
:::

## What We Calculated

The item is a pair of Intelligence gloves from a stream.

It starts as a Rare with one Fractured prefix and a Fractured suffix of +2 to Level of all Projectile Skills. The remaining targets are maximum Energy Shield or maximum Mana at T1, plus the mods from the Essence of Hysteria and the Essence of Horror.

The average cost from any state to a finished item can be found by stepping backward from the finished state. For each state, try every possible craft and keep the one with the lowest expected cost afterward (value iteration on a Markov decision process).

If a state is summarized as "which targets are present + how many misses on each side," there are only a few hundred states, so nothing like machine learning is needed. Starting over from a white base was also one of the allowed moves.

## Result: About 1/30 of the Intuitive Route

:::chart bar Expected cost to finish (div)
unit: div
labels: Cheapest route, Start over if +2 Projectile is lost, Close to the video, Annul + Sinistral Annulment
Expected cost: 105, 775, 3400, 3900
:::

| Route | Expected cost to finish | Source |
|---|---:|---|
| Cheapest route (calculated) | 105 div | backward calculation |
| Same route, 1,000 runs on the engine | 94 div | engine |
| Close to the video (Chaos + Omen of Sinistral Erasure) | about 3,400 div | calculation only |
| Annul misses + Omen of Sinistral Annulment | about 3,900 div | calculation only |
| Rule: "if +2 Projectile is lost, start over" | 775 div (engine 788) | calculation + engine |

The cheapest route was 105 div by calculation and 94 div over 1,000 engine runs.

What about luck? Half of the runs finished within 64 div, and one in ten took 223 div or more.

:::note An order of magnitude
The intuitive routes (about 3,400 to 3,900 div) are calculation only and were not checked on the engine. Treat them as an order of magnitude.
:::

## Inside the Cheapest Route

The moves the calculation picked:

- **Remove misses with a plain Orb of Annulment.** Omens of Erasure or Annulment (14 to 21 div each) are almost never chosen.
- Aim maximum ES / maximum Mana T1 with a Greater Exalted Orb + Omen of Sinistral Exaltation.
- Add Essences with a Crystallisation Omen (0.4 div), removing from the side that holds a miss.
- **If +2 Projectile is lost, don't start over: reroll it with Chaos Orbs.** Each Chaos Orb lands it only 0.32% of the time (measured on the engine), but it averages about 31 div. Starting over from white costs about 580 div.

A plain Annulment can hit a target. Even so, it costs 0.44 div.

It wins whenever "chance of hitting a target × cost to put it back" is smaller than the Omen's price. On these gloves, putting +2 Projectile back with Chaos Orbs is cheap, so the loss from hitting it is small.

## Where Omens Pay Off

So when should you use the expensive Omens? Splitting another pair of gloves into 54 situations, the rule was simple:

- If targets sit only on the same side as the miss, use a plain Annulment.
- **If a target sits on the side with no miss, use a move that picks the side** (Omen of Sinistral Annulment, Chaos + Omen of Sinistral Erasure, a bone + Omen of Dextral Necromancy, and so on).

:::tip The break-even formula
Use the Omen when "(chance a plain Annulment hits a target − chance the side-specific one does) × cost to put the target back > the Omen's price." This matched the calculated choice in all 54 situations (a comparison inside the calculation, not checked against in-game results).
:::

On the same 54-situation gloves, we also measured what happens when moves are banned.

| Restriction | Versus the cheapest route |
|---|---:|
| Ban side-picking Omens and Erasure (all targets T1) | about 36 times (about 190,000 div) |
| Ban side-picking Omens and Erasure (targets T3 or better) | about 11 times |
| Ban plain Annulment | +17 to 18% |
| Starting over (69 div per base) | never chosen (always at least 67 div worse) |

Always using Omens and never using them are both losing strategies. The cheapest route switches by situation.

Starting over was never chosen either, which also runs against intuition. Even when misses pile up and you feel like throwing the item away, the calculation says continuing from what you have is cheaper.

The Gold Ring in [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/) follows the same logic: annulling while holding misses gives more chances to hit a target.

## Where the Numbers Come From

- The calculation used the engine's weights and tiers and market prices from 2026-10-21 (1 Divine Orb = 718 Exalted Orbs). It uses approximations (a miss doesn't shrink the pool; only T1 is considered; and so on), and still matched engine runs within 10%.
- "About 3,400" and "about 3,900" are calculation only, not checked on the engine.
- The price of buying the base is not included. Nothing here has been compared with Craft of Exile.

## Try It Yourself

You can apply the moves one by one on the [crafting bench](/?base=Intricate%20Gloves). To compare what you do after a miss, try the [Craft route tree](/?page=sim-tree&base=Intricate%20Gloves).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Energy Shield gloves craft](/en/blog/es-gloves-greater-exalt/)
