---
title: PoE2 Chaos Orb Reroll vs Restart: 31 div vs 580 div
description: When +2 Projectile is lost mid-craft in PoE2, should you reroll it with Chaos Orbs or restart? Rerolling averaged about 31 div, restarting about 580 div, and in a related 54-situation study restarting was never chosen.
date: 2026-10-22
tags: Chaos Orb, chaos spam, restart, expected cost, gloves
tree: /?page=sim-tree&base=Intricate%20Gloves
craft: /?base=Intricate%20Gloves
draft: true
---
In PoE2, Chaos Orb reroll vs restart has a clear answer: when a key mod gets wiped mid-craft, **rerolling it with Chaos Orbs is far cheaper than starting over**. On one pair of gloves, putting "+2 to Level of all Projectile Skills" back with Chaos Orbs averaged about 31 Divine Orbs (div), while restarting from a white base cost about 580 div. And each Chaos Orb lands it only 0.32% of the time (measured on the engine).

You annul a miss, and the Annulment takes your best mod with it. Ever felt like throwing the item away and starting fresh?

At 0.32% per orb, rerolling sounds hopeless. But once you work out the expected cost to finish, restarting loses. In a separate example with different targets, split into 54 situations, restarting was the cheapest move in none of them.

:::summary What you'll learn
- If +2 Projectile is lost, rerolling it with Chaos Orbs averages about 31 div, far below restarting (about 580 div)
- A "restart when it's lost" rule costs 775 div at best by calculation (788 on the engine). The reroll route costs 105 div by calculation (94 over 1,000 engine runs)
- In a separate 54-situation example, restarting was never the best move (always at least 67 div worse)
- The 580 div figure later turned out too high, and this item's restart cost hasn't been recalculated yet
:::

## Rerolling Costs About 31 div, Restarting About 580

The item is a pair of Intelligence gloves from a stream. It starts as a Rare with one Fractured prefix and a Fractured "+2 to Level of all Projectile Skills" suffix. The remaining targets are maximum Energy Shield or maximum Mana at T1, the mods from the Essence of Hysteria and the Essence of Horror, and Astrid's Creativity.

Removing misses with a plain Orb of Annulment sometimes hits that +2 Projectile mod. When it does, you have two options.

| When +2 Projectile is lost | Cost | Details |
|---|---:|---|
| Reroll it with Chaos Orbs | about 31 div on average | lands 0.32% per orb (engine) |
| Restart from a white base | about 580 div | calculated: about 190 div per magic-to-Fractured attempt × 3, plus Astrid's Creativity |

:::chart bar Cost to get +2 Projectile back (div)
unit: div
labels: Reroll with Chaos Orbs, Restart from white
Cost: 31, 580
:::

0.32% per orb is a low hit rate, yet the cost is an order of magnitude below a restart. Restarting means walking the whole long road again: building the magic item, making it Rare, then fracturing.

Bad luck still happens. In the engine runs, the longest reroll took 2,500 Chaos Orbs in a row. The calculation treats rerolling as spam with a 3,000-orb cap.

## What Does a "Restart When Lost" Rule Cost?

One reroll versus one restart isn't the whole story, because the same choice comes back every time the mod is lost. So we compared the expected cost to finish for the whole route.

| Rule when +2 Projectile is lost | Calculated | Engine |
|---|---:|---:|
| Reroll with Chaos Orbs (cheapest route) | 105 div | 94 div (1,000 runs) |
| Restart (cheapest route under that rule) | 775 div | 788 div |

Under the restart rule, no amount of smart play elsewhere gets below 775 div by calculation. In both rows the calculation lands close to the engine.

The rest of the cheapest route (plain Annulments for misses, Omens almost never) is covered in [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/). Here we dig into one question only: continue or start over?

## In Another Example, Was Restarting Ever Right?

This section is a **different example**. On the same glove setup, the finished suffixes were changed to +2 Projectile, Critical Damage Bonus and attack speed, and the craft was split into 54 situations by "targets present, prefix misses, suffix misses." Restarting in this example meant rebuilding the first half (up to the Fractured item) for 69 div.

Still, restarting was the cheapest move in zero situations. It was always at least 67 div worse than the best move.

| Targets present | Prefix misses | Suffix misses | Restart loss (T1 targets) | Restart loss (T3+ targets) |
|---:|---:|---:|---:|---:|
| 0 | 0 | 1 | +69 div | +69 div |
| 1 | 0 | 1 | +85 div | +73 div |
| 2 | 1 | 0 | +1,601 div | +361 div |
| 3 | 1 | 0 | +5,037 div | +2,281 div |
| 4 | 1 | 0 | +5,129 div | +2,429 div |

Even with no targets on the item, restarting loses roughly its own price (69 div). You pay to land in almost the same "no targets yet" state you were already in.

The more targets you hold, the worse it gets, by orders of magnitude. In this example, throwing away an item with three or four T1 targets throws away more than 5,000 div of progress. "Too many misses, I'll start over" discards the value of every target still on the item.

:::tip When a mod is lost, keep going
Even after losing a key mod, continuing from what you have was cheaper in every calculated case. Before you scrap an item, count how many targets are still on it.
:::

## The 580 div Was Too High. Does the Answer Hold?

To be honest, the first gloves' 580 div restart cost came from our first calculation, and it later turned out too high.

The Orbs of Transmutation and Augmentation used at the magic stage have their own tier floors (Greater 44, Perfect 70), different from Exalted Orbs. The first calculation used the Exalted Orb floors (35 and 50) and overestimated the magic stage by about 2 times, so the 580 div is inflated by that much. We haven't recalculated this item's restart cost with the corrected floors.

We expect the answer to hold, but that is an **inference**. It rests on two things: in the other example, even a 69 div restart was never chosen, and the gap to the 31 div reroll is large. It was not checked on the first gloves.

One more finding: +2 Projectile is also cheap to add with Chaos Orbs after the item is already Rare, cheaper than spamming Orbs of Augmentation on a magic item (178 div per attempt in the calculation). That suggests the very first step of the route could be rethought. The 178 div carries the same floor mistake.

:::note What we haven't verified
- The about 580 div restart cost is calculation only and too high by the floor mistake above. It hasn't been recalculated with corrected floors or checked on the engine.
- The 54 situations and "always at least 67 div worse" come from a different example and are comparisons inside the calculation (a calculation experiment, not a site feature). Applying them to the first gloves is an inference, and nothing here was checked against in-game results.
- 0.32% comes from the ExileDesk engine and was not compared with Craft of Exile or in-game results. The price of buying the base is not included.
:::

## Where the Numbers Come From

- First gloves (analysis log optimal-craft-dp, 2026-10-21):
  - Engine: 0.32% per Chaos Orb, longest reroll streak of 2,500, reroll route 94 div (1,000 runs), restart rule 788 div (run count not recorded).
  - Calculation: reroll about 31 div on average, restart about 580 div (about 190 div × 3 + Astrid's Creativity), 105 div and 775 div, 3,000-orb reroll cap.
  - Calculation (later notes in the same log): the 580 div overestimate (Transmutation / Augmentation floors Greater 44, Perfect 70) and 178 div per magic attempt.
- Different example (docs/org/math/notes/threshold-2026-10-20.md): the 54-situation table, the 69 div restart and "at least 67 div worse" are all calculation.
- Prices are market prices from 2026-10-21 (1 Divine Orb = 718 Exalted Orbs).

## Try It Yourself

You can apply the moves one by one on the [crafting bench](/?base=Intricate%20Gloves). To compare rerolling against other moves after a mod is lost, try the [Craft route tree](/?page=sim-tree&base=Intricate%20Gloves).

**Related posts**

- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
- [PoE2 chaos spam odds](/en/blog/chaos-spam-odds/)
