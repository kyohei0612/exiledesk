---
title: PoE2 Chaos Orb Reroll vs Restart: 31 div vs 580 div
description: When +2 Projectile is lost mid-craft in PoE2, should you reroll it with Chaos Orbs or restart? Rerolling averaged about 31 div, restarting about 580 div, and in a separate 54-situation example restarting was never chosen.
date: 2026-10-22
tags: Chaos Orb, chaos spam, restart, expected cost, gloves
craft: /?base=Intricate%20Gloves
image: img/chaos-reroll-vs-restart-og.en.png
ready: true
---
When a target mod gets wiped mid-craft in PoE2, **rerolling it with Chaos Orbs is far cheaper than starting over**. On one pair of gloves, putting "+2 to Level of all Projectile Skills" back with Chaos Orbs averaged about 31 div (div = Divine Orb), while restarting from a white base cost about 580 div. And each Chaos Orb lands it only 0.32% of the time (measured on the engine).

:::zundamon troubled
My Orb of Annulment took my best mod with it. I'm throwing this away and starting over...
:::

:::metan normal
Wait. If you work out the expected cost to finish, restarting is the losing move.
:::

:::zundamon surprised
Chaos lands it only 0.32% of the time, and rerolling is still cheaper!?
:::

:::summary What you'll learn
- If +2 Projectile is lost, rerolling it with Chaos Orbs averages about 31 div, far below restarting (about 580 div). The 580 div later turned out too high and hasn't been recalculated yet
- A "restart when it's lost" rule costs 775 div at best by calculation. The reroll route costs 105 div by calculation
- In a separate example with different targets, restarting was chosen in none of its 54 situations
:::

:::tip New to this? Words used here
- **Chaos Orb**: removes one mod from a Rare and adds a new one
- **Orb of Annulment**: removes one mod from a Rare. It can hit a target mod
- **Fractured**: a mod locked in place so it can't be removed
- **Expected cost**: the average cost to finish if you made the item many times
- **div**: Divine Orb, the price unit in this post
:::

## Rerolling Costs About 31 div, Restarting About 580

First, let's compare the two options when +2 Projectile is lost.

:::zundamon normal
What kind of gloves are we crafting?
:::

:::metan normal
A pair of Intelligence gloves. They start as a Rare with one Fractured prefix and "+2 to Level of all Projectile Skills" on the suffix side.
:::

:::metan normal
There's one more prefix on it too. We add the remaining targets from there.
:::

:::zundamon normal
What are the remaining targets?
:::

:::metan normal
Maximum Energy Shield or maximum Mana at T1, the mods from the Essence of Hysteria and the Essence of Horror, and Astrid's Creativity.
:::

:::zundamon troubled
But the +2 Projectile can get wiped, right?
:::

:::metan troubled
Removing misses with a plain Orb of Annulment sometimes hits it. When that happens, you have two options.
:::

| When it's lost | Cost | Details | Why that much |
|---|---:|---|---|
| Reroll it with Chaos Orbs | about 31 div on average | lands 0.32% per orb (engine) | low hit rate, but you only spam Chaos Orbs |
| Restart from a white base | about 580 div | calculated: about 190 div per magic-to-Fractured attempt × 3, plus Astrid's Creativity | you walk the whole long road again |

By calculation, rerolling is an order of magnitude cheaper.

:::zundamon surprised
Even at 0.32%, it's an order of magnitude cheaper than restarting!
:::

:::metan normal
Because restarting means redoing everything: lining up targets on a magic item, making it Rare, then fracturing.
:::

:::zundamon troubled
But with bad luck, the Chaos Orbs could go on forever?
:::

:::metan troubled
In the engine runs, the longest streak was 2,500 orbs.
:::

:::metan normal
The calculation treats rerolling as spam and stops it at a 3,000-orb cap.
:::

## What Does a "Restart When Lost" Rule Cost?

The same choice comes back every time the mod is lost, so we compared the expected cost to finish for the whole route.

:::zundamon normal
Doesn't comparing one reroll with one restart already settle it?
:::

:::metan normal
Not yet. The choice keeps coming back, so we have to compare whole routes.
:::

| Rule when +2 Projectile is lost | Calculated | Engine | Which wins |
|---|---:|---:|---|
| Reroll with Chaos Orbs (cheapest route) | 105 div | 94 div (1,000 runs) | **wins** |
| Restart (cheapest route under that rule) | 775 div | 788 div | loses (smart play elsewhere doesn't bring it down) |

Under the restart rule, the cost never got below 775 div by calculation.

:::zundamon normal
Do the calculation and the engine agree?
:::

:::metan happy
Both rows land close. 94 div against 105, and 788 div against 775.
:::

:::zundamon normal
What does the cheapest route actually do?
:::

:::metan normal
It clears misses with plain Annulments and almost never uses Omens. The details are in [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/).
:::

:::metan normal
Here we only look at one question: keep going, or start over?
:::

## In Another Example, Was Restarting Ever Right?

From here on is a **different example**. Same glove setup, but with different suffixes on the finished item.

:::zundamon normal
A different example? What changed?
:::

:::metan normal
The finished suffixes are +2 Projectile, Critical Damage Bonus and attack speed.
:::

:::metan normal
We split it into 54 situations by targets present, prefix misses and suffix misses.
:::

:::zundamon normal
How much does a restart cost in this one?
:::

:::metan normal
69 div, to rebuild the first half up to the Fractured item. Much cheaper than the first gloves.
:::

:::zundamon happy
Then restarting has to win somewhere!
:::

:::metan normal
It won zero times. It was always at least 67 div worse than the best move.
:::

| Targets present | Prefix misses | Suffix misses | Restart loss (T1 targets) | Restart loss (T3+ targets) | What you throw away |
|---:|---:|---:|---:|---:|---|
| 0 | 0 | 1 | +69 div | +69 div | the restart price only |
| 1 | 0 | 1 | +85 div | +73 div | restart price + 1 target's value |
| 2 | 1 | 0 | +1,601 div | +361 div | restart price + 2 targets' value |
| 3 | 1 | 0 | +5,037 div | +2,281 div | restart price + 3 targets' value |
| 4 | 1 | 0 | +5,129 div | +2,429 div | restart price + 4 targets' value |

The more targets you hold, the bigger the loss, by orders of magnitude.

:::zundamon normal
With no targets on the item, restarting can't hurt, right?
:::

:::metan normal
It still costs its price, 69 div. You'd land in almost the same "no targets yet" state you're already in.
:::

:::zundamon surprised
And with three or four targets on it?
:::

:::metan troubled
If they're all T1, you throw away over 5,000 div. You lose the value of every target you're holding.
:::

:::tip Lost a mod? Keep going from what you have
Even after losing a key mod, continuing from the item with your remaining targets was cheaper by calculation. If you feel like restarting, count how many targets are still on the item you'd throw away.
:::

## The 580 div Was Too High. Does the Answer Hold?

The first gloves' restart cost of about 580 div came from our first calculation, and it later turned out too high.

:::zundamon surprised
The 580 div was wrong!?
:::

:::metan troubled
Orbs of Transmutation and Augmentation used on magic items have their own tier floors, separate from Exalted Orbs: Greater 44, Perfect 70.
:::

:::metan troubled
The first calculation used the Exalted Orb floors, 35 and 50. That doubled the estimated magic-stage cost.
:::

| Transmutation / Augmentation floor | Greater | Perfect | What happened |
|---|---:|---:|---|
| Correct value | 44 | 70 | not used in the first calculation |
| Value used first (same as Exalted Orb) | 35 | 50 | magic stage estimated at 2 times, so the 580 div is too high |

The 580 div is too high by the magic-stage overestimate.

:::zundamon troubled
So the answer might change too?
:::

:::metan normal
We expect it to point the same way. But that's an **inference**.
:::

:::metan normal
Two reasons. In the other example, even a 69 div restart was never chosen, and the gap to the 31 div reroll is large.
:::

:::metan troubled
We haven't checked it on the first gloves.
:::

:::zundamon normal
Did you notice anything else?
:::

:::metan normal
+2 Projectile is also cheap to add with Chaos Orbs after making the item Rare. Cheaper than Augmentation spam on the magic item, which is 178 div per attempt by calculation.
:::

:::metan troubled
So the very first step of the route could be rethought. But the 178 div carries the same floor mistake.
:::

:::note fold Not yet verified (3)
- The about 580 div restart cost is calculation only and too high by the floor mistake above. It hasn't been recalculated with corrected floors or checked on the engine.
- The 54 situations and "always at least 67 div worse" come from a different example and are comparisons inside the calculation (a calculation experiment, not a site feature). Applying them to the first gloves is an inference, and they weren't checked against in-game results.
- 0.32% comes from the ExileDesk engine and wasn't compared with Craft of Exile or in-game results. The price of buying the base isn't included.
:::

When a target mod is lost, rerolling from what you have is cheaper than restarting, by calculation. Before you scrap an item, count the targets still on it.

## Where the Numbers Come From

:::fold Show sources (5)
- First gloves, engine values (analysis log optimal-craft-dp, 2026-10-21): 0.32% per Chaos Orb, longest reroll streak of 2,500, reroll route 94 div (1,000 runs), restart rule 788 div (run count not recorded).
- First gloves, calculated values (same log): reroll about 31 div on average, restart about 580 div (about 190 div × 3 + Astrid's Creativity), 105 div and 775 div, 3,000-orb reroll cap.
- The 580 div overestimate (later notes in the same log, calculation): Transmutation / Augmentation floors Greater 44, Perfect 70, and 178 div per magic attempt.
- Different example (docs/org/math/notes/threshold-2026-10-20.md): the 54-situation table, the 69 div restart and "at least 67 div worse" are all calculation.
- Prices are market prices from 2026-10-21 (1 div = 718 Exalted Orbs).
:::

## Try It Yourself

You can apply the moves one by one on the [crafting bench](/?base=Intricate%20Gloves).

**Related posts**

- [PoE2 Crafting Expected Cost: The Cheapest Move Skips Omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 Chaos Spam Odds: How Many Orbs at 0.3% per Try](/en/blog/chaos-spam-odds/)
- [PoE2 Crafting Calculator Mistakes: 3 Bugs We Caught](/en/blog/crafting-calculator-mistakes/)

VOICEVOX: Zundamon / Shikoku Metan
