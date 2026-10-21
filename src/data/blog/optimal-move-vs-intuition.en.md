---
title: PoE2 Crafting Expected Cost: The Cheapest Move Skips Omens
description: We worked out PoE2 crafting expected cost backward from the finished item. A route close to intuition costs about 3,400 div; the best route about 105 div. Why plain Orbs of Annulment beat expensive Omens, with 1,000 engine runs.
date: 2026-10-22
tags: expected cost, Orb of Annulment, Omen, Chaos Orb, gloves
tree: /?page=sim-tree&base=Intricate%20Gloves
craft: /?base=Intricate%20Gloves
image: img/optimal-move-vs-intuition-og.en.png
ready: true
draft: true
---
Working PoE2 crafting expected cost backward from the finished item, the cheapest route **barely used expensive Omens and removed misses with a plain Orb of Annulment**. On one pair of gloves, a route close to intuition cost about 3,400 div (div = Divine Orb), while the best route cost 105 div, and 94 div over 1,000 engine runs. That's about one thirtieth.

:::zundamon normal
When a miss rolls, the best play is an expensive Omen that removes only the miss's side, right?
:::

:::metan normal
That's what most people think. But the calculation picked a plain Orb of Annulment, at 0.44 div each.
:::

:::zundamon surprised
It might hit a target, and it's still cheaper?!
:::

:::metan happy
Yes. It came to about one thirtieth of the intuitive route. Let's go through why.
:::

:::summary What you'll learn
- The cheapest route on these gloves: 105 div by calculation, 94 div over 1,000 engine runs. About 1/30 of the intuitive route (about 3,400 div)
- Remove misses with a **plain Orb of Annulment**. Expensive Omens only pay off when a target sits on the side with no miss
- Starting over was never chosen in any situation
:::

:::tip New to this? Words used here
- **Expected cost**: the average cost if you repeated the craft many times
- **Miss**: a mod you don't want. It fills an open prefix or suffix slot
- **Orb of Annulment**: removes one mod. You can't choose which one
- **Omen**: changes how the next currency works. The ones that pick a side are expensive
- **Fractured**: a mod locked so it can't be removed
- **div**: Divine Orb, the price unit in this post
:::

## What We Calculated

The item is a pair of Intelligence gloves: one Fractured prefix, plus +2 to Level of all Projectile Skills on the suffix side.

:::zundamon normal
What gloves did you start from?
:::

:::metan normal
A Rare with one Fractured prefix and +2 to Level of all Projectile Skills as a suffix.
:::

:::zundamon normal
And what are you aiming for from there?
:::

:::metan normal
Maximum Energy Shield or maximum Mana at T1, plus the mods from the Essence of Hysteria and the Essence of Horror.
:::

:::zundamon troubled
How do you even work out "average div to finish"?
:::

:::metan normal
You start from the finished item and step backward, one craft at a time.
:::

:::metan normal
For each state, you try every possible craft and keep the one with the lowest expected cost afterward. It's value iteration on a Markov decision process.
:::

:::zundamon surprised
Sounds like there would be endless states.
:::

:::metan normal
Summarize a state as "which targets are present + how many misses on each side," and there are only a few hundred.
:::

:::metan happy
So nothing heavy like machine learning is needed. Starting over from a white base was also one of the allowed moves.
:::

## Result: About 1/30 of the Intuitive Route

Here is the expected cost to finish for each route.

| Route | Expected cost to finish | Source | Versus the cheapest route |
|---|---:|---|---|
| Cheapest route (calculated) | 105 div | backward calculation | baseline |
| Same route, 1,000 runs on the engine | 94 div | engine | about the same as the calculation |
| Rule: "if +2 Projectile is lost, start over" | 775 div (engine 788 div) | calculation + engine | much higher |
| A route close to intuition (Chaos + Omen of Sinistral Erasure) | about 3,400 div | calculation only | an order of magnitude higher |
| Annul misses + Omen of Sinistral Annulment | about 3,900 div | calculation only | even higher |

The closer a route is to intuition, the more it costs, by an order of magnitude.

:::zundamon surprised
105 div versus about 3,400 div?! That's a different order of magnitude.
:::

:::metan normal
And the cheapest route came to 94 div over 1,000 engine runs.
:::

:::zundamon normal
But with bad luck, it costs more, right?
:::

:::metan normal
Half of the runs finished within 64 div, and one in ten took 223 div or more.
:::

:::note An order of magnitude
The intuitive routes (about 3,400 to 3,900 div) are calculation only and were not checked on the engine. Treat them as an order of magnitude.
:::

## Inside the Cheapest Route

The moves the calculation picked, by situation:

| Situation | Move chosen | Why |
|---|---|---|
| A miss rolled | Plain Orb of Annulment (0.44 div) | The expected loss from hitting a target is smaller than a side-picking Omen (14 to 21 div each) |
| Aiming for maximum ES / maximum Mana T1 | Greater Exalted Orb + Omen of Sinistral Exaltation | Adds only to the target's side |
| Adding an Essence | Omen of Sinistral/Dextral Crystallisation (0.4 div) | Adds it while removing from the side with a miss |
| +2 Projectile was lost | Don't start over: put it back with Chaos Orbs | About 31 div on average. Starting over from white costs about 580 div |

Plain Annulment for misses, Chaos for a lost target. Both are cheap moves.

:::zundamon troubled
So you don't use Omen of Sinistral Erasure or the Omens of Sinistral/Dextral Annulment?
:::

:::metan normal
They weren't chosen in most situations. They cost 14 to 21 div each.
:::

:::zundamon normal
But a plain Annulment can hit a target.
:::

:::metan normal
It can. Still, it's only 0.44 div.
:::

:::metan normal
If "chance of hitting a target × cost to put it back" is less than the Omen's price, the plain Annulment wins.
:::

:::zundamon surprised
Surely you start over if +2 Projectile is lost?
:::

:::metan normal
You put it back with Chaos Orbs. Each one lands it 0.32% of the time (measured on the engine).
:::

:::zundamon troubled
0.32%? That almost never lands...
:::

:::metan happy
Even so, it averages about 31 div. Starting over from white costs about 580 div, so it's no contest.
:::

:::metan normal
On these gloves, putting it back is cheap, so hitting it doesn't hurt much. That's why the plain Annulment wins.
:::

## Where Omens Pay Off

So when should you use the expensive Omens? Splitting another pair of gloves into 54 situations, the rule was simple.

| Where the miss and targets sit | Move to pick | Why |
|---|---|---|
| Targets only on the same side as the miss | Plain Annulment | Picking a side protects no target, so you just lose the Omen's price |
| **A target sits on the side with no miss** | **A move that picks the side** (Omen of Sinistral Annulment, Chaos + Omen of Sinistral Erasure, a Bone + Omen of Dextral Necromancy, and so on) | It protects the side with the target |

Picking a side only matters when a target sits on the side with no miss.

:::zundamon normal
Can the break-even point be written as a formula?
:::

:::metan normal
It can. It's in the box below.
:::

:::tip The break-even formula
Use the Omen when "(chance a plain Annulment hits a target − chance the side-specific one does) × cost to put the target back > the Omen's price." This matched the calculated choice in all 54 situations (a comparison inside the calculation, not checked against in-game results).
:::

On the same 54-situation gloves, we also measured what happens when moves are banned.

| Restriction | Versus the cheapest route | What happens |
|---|---:|---|
| Ban side-picking Omens and Erasure (all targets T1) | about 36 times (about 190,000 div) | The target's side can't be protected, so losses from hitting targets pile up |
| Ban side-picking Omens and Erasure (targets T3 or better) | about 11 times | Even with looser targets, the loss is large |
| Ban plain Annulment | +17 to 18% | You end up using expensive Omens even where a cheap move works |
| Starting over (69 div per base) | never chosen in any situation (always at least 67 div worse) | Continuing from what you have is cheaper |

Always using Omens and never using them both lose.

:::zundamon surprised
Banning Omens costs about 36 times more?!
:::

:::metan normal
That's when all targets are T1. About 190,000 div.
:::

:::zundamon normal
Then just use Omens every time.
:::

:::metan troubled
That loses too. Banning plain Annulment costs 17 to 18% more. Switching by situation is cheapest.
:::

:::zundamon troubled
When misses pile up, I just want to throw it away and start over.
:::

:::metan normal
The calculation never chose starting over. It was always at least 67 div worse.
:::

:::metan normal
The Gold Ring in [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/) follows the same logic.
:::

:::metan normal
Annulling while holding misses gives more chances to hit a target.
:::

:::note fold Not yet verified (3)
- "About 3,400 div" and "about 3,900 div" are calculation only, not checked on the engine.
- The break-even formula matching all 54 situations is a comparison inside the calculation, not checked against in-game results.
- The price of buying the base is not included. Nothing here has been compared with Craft of Exile.
:::

Remove misses with a plain Annulment, and use a side-picking Omen only when a target sits on the side with no miss. That is the cheapest route the calculation found.

## Where the Numbers Come From

:::fold Show sources (3)
- The calculation works backward using the engine's weights and tiers and market prices from 2026-10-21 (1 div = 718 Exalted Orbs). It uses approximations (a miss's mod group doesn't shrink the pool, only T1 is considered, and so on), and still matched engine runs within 10%.
- "About 3,400 div" and "about 3,900 div" are calculation only, not checked on the engine.
- The price of buying the base is not included. Nothing here has been compared with Craft of Exile.
:::

## Try It Yourself

You can apply the moves one by one on the [crafting bench](/?base=Intricate%20Gloves). To compare what you do after a miss, try the [Craft route tree](/?page=sim-tree&base=Intricate%20Gloves).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Energy Shield gloves craft](/en/blog/es-gloves-greater-exalt/)

VOICEVOX: Zundamon / Shikoku Metan
