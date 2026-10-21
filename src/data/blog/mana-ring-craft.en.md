---
title: PoE2 Mana Ring Craft: Five Targets Cost 1,991 div
description: We ran a PoE2 mana Gold Ring (maximum Mana %, maximum Mana T1, Cast Speed, all Resistances T1, Mana Regeneration T1) on the engine, 300 runs per method. It costs 1,991 div per ring and finishes 64% of the time; loosening Resistances and Mana Regeneration to T2+ brings it to 643 div.
date: 2026-10-22
tags: Gold Ring, maximum Mana, Perfect Essence, Neural Catalyst, expected cost
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/mana-ring-craft-og.en.png
ready: true
draft: true
---
A PoE2 mana ring craft with five targets (maximum Mana % and maximum Mana T1 as prefixes; Cast Speed T2+, all Elemental Resistances T1 and Mana Regeneration Rate T1 as suffixes) **costs about 1,991 Divine Orbs (div) per ring, and only 64% finish within a 2,000 div cap per run**. Just loosening Resistances and Mana Regeneration to T2+ brings it down to 643 div with 95% finishing.

:::zundamon normal
Three Gold Ring suffixes got down to 220 div per ring. Five targets should be double that at most, right?
:::

:::metan normal
That's what you'd think. The method is in [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/). But when the engine crafted a mana setup, the cost jumped by an order of magnitude.
:::

:::zundamon surprised
An order of magnitude?!
:::

:::metan troubled
And only 64% finished within the cap.
:::

:::summary What you'll learn
- Five targets (with Resistances T1 and Mana Regeneration T1), essence after: about 1,991 div per ring, 64% finished. Loosened to T2+: 643 div, 95.3% finished
- Essence first: 4,942 div, 33.3% finished. Maximum Mana % was lost 67 times per run
- Without Catalysts + the Catalysing Omen, no Exalted Orb finishes more than 10%
:::

:::tip New to this? Words used here
- **Fractured**: a mod locked in place, so Annulment and Chaos Orbs can't remove it
- **Catalyst**: adds Quality to rings and amulets. Each Catalyst has a fixed Quality type that boosts mods of that type
- **Omen of Catalysing Exaltation**: makes Exalted Orbs more likely to add mods of the Catalyst's Quality type
- **Perfect Essence**: the top tier of Essences, which add a set mod
- **Annul**: remove one mod with an Orb of Annulment. It can hit a target too
- **div**: Divine Orbs, the price unit in this post
:::

## The Ring and the Method

First, which ring we crafted and in what order.

:::zundamon normal
What ring did you start from?
:::

:::metan normal
A Rare Gold Ring, Item Level 82. It has a Fractured Spell Mana Cost Efficiency T1 prefix.
:::

:::metan normal
That mod is Calculating, a mod from the Genesis Tree.
:::

:::zundamon normal
Does maximum Mana % come from a normal Exalted Orb?
:::

:::metan normal
No. It's "(4–6)% increased maximum Mana" from the Perfect Essence of the Mind. It isn't in the normal pool.
:::

:::zundamon normal
How do you aim for the suffixes?
:::

:::metan normal
The method is "annul misses at once." We aim for Cast Speed, then Resistances, then Mana Regeneration.
:::

:::metan normal
Each try uses 20 Catalysts (20% Quality) + Omen of Catalysing Exaltation + Omen of Dextral Exaltation + a Perfect Exalted Orb.
:::

| Target | Catalyst used |
|---|---|
| Cast Speed | Skittering Catalyst |
| all Resistances | Tul's Catalyst |
| Mana mods (Mana Regeneration, maximum Mana) | Neural Catalyst |

:::zundamon normal
When do the prefixes go in?
:::

:::metan normal
Once the suffixes are done, Omen of Sinistral Crystallisation + Perfect Essence of the Mind adds maximum Mana %.
:::

:::metan normal
Last, we aim for maximum Mana T1 with Neural Catalysts + Catalysing + Sinistral + Perfect. That's "essence after."
:::

:::zundamon normal
Didn't you try the other order?
:::

:::metan normal
We did. Adding the Essence right after fracturing is "essence first," and we compared the two.
:::

## Results: Five Targets Cost 1,991 div, 64% Finish

The engine ran 300 runs per method, each capped at 2,000 div.

| Method | Finished | Cost per ring | Average of finishers | Perfect Exalted Orbs | How it went |
|---|---:|---:|---:|---:|---|
| Essence after | 64.0% | **1,991 div** | 865 div | 128 | Some runs hit the cap unfinished |
| Essence first | 33.3% | 4,942 div | 936 div | 143 | Most expensive, fewest finished |
| Essence after, Resistances and Mana Regen at T2+ | **95.3%** | **643 div** | 545 div | 84 | **Cheapest**. Almost every run finishes |

"Cost per ring" is everything spent, including runs that hit the cap unfinished, divided by the number finished.

:::zundamon surprised
Finishers averaged 865 div, but the cost per ring is 1,991 div!
:::

:::metan normal
That's because the unfinished runs' spending is divided by the finished count too. At 64% finished, that weighs a lot.
:::

### Essence first keeps losing maximum Mana %

:::zundamon normal
Why does essence first cost 4,942 div?
:::

:::metan normal
With essence first, maximum Mana % is the only non-Fractured mod. A Chaos Orb would always remove it, so Chaos Orbs are off the table.
:::

:::metan troubled
On top of that, every Annulment can take it out too. It was lost 67 times per run.
:::

:::zundamon troubled
Re-adding the Essence 67 times...
:::

## The Weight Is Resistances T1 and Mana Regeneration T1

Starting from Fractured + maximum Mana %, we used Catalysts at 20% Quality + Omen of Catalysing Exaltation + the side Omen + a Perfect Exalted Orb and counted the hits over 20,000 tries on the engine.

| Target | Hit per try | How likely |
|---|---:|---|
| Cast Speed T2+ | 24.77% | Most likely |
| all Resistances T1 | 7.13% | Under 10% (the hardest) |
| Mana Regeneration T1 | 9.81% | Under 10% |
| maximum Mana T1 | 11.81% | Just over 10% |
| all Resistances T2+ (loosened) | 14.47% | About double T1 only |
| Mana Regeneration T2+ (loosened) | 19.65% | About double T1 only |

:::zundamon normal
Resistances T1 and Mana Regeneration T1 don't even reach 10%.
:::

:::metan troubled
And misses get annulled. Those Annulments can hit targets already in place.
:::

:::zundamon troubled
So the targets you landed vanish too...
:::

:::metan normal
Losing every target and restarting from Chaos Orbs happened 45 times per run.
:::

:::metan normal
It used 128 Perfect Exalted Orbs (about 2.9 div each). Re-adding Skittering Catalysts for Cast Speed cost another 228 div.
:::

:::zundamon happy
So what happens if you loosen them to T2+?
:::

:::metan happy
Both odds roughly double, and full restarts drop to 25. The cost falls to about a third.
:::

:::tip Loosen to T2+ for about a third
Loosening Resistances and Mana Regeneration to T2+ cut restarts from 45 to 25, and the cost from 1,991 div to 643 div.
:::

## Without Catalysts It Almost Never Finishes

We also tried dropping the Catalysts and the Catalysing Omen, aiming with a plain Omen of Dextral / Sinistral Exaltation.

:::zundamon normal
Can you get by without Catalysts?
:::

:::metan troubled
No. Whatever the Exalted Orb, it almost never finished within 2,000 div.
:::

| Plain Exalted Orb | Finished | Cost per ring | What happens |
|---|---:|---:|---|
| Exalted Orb | 1.0% | about 200,000 div | Almost never finishes (most expensive) |
| Greater Exalted Orb | 10.0% | about 19,000 div | The best of the three, but few still finish |
| Perfect Exalted Orb | 8.3% | about 23,000 div | Pricier than Greater, under 10% finish |

:::zundamon surprised
Even the best one is 19,000 div!
:::

:::metan normal
A mana ring like this is built around Catalysts + the Catalysing Omen.
:::

:::note fold Not yet verified (2)
- The Catalysing Omen multiplier follows Craft of Exile's formula. It has not been compared with Craft of Exile or in-game results.
- The Perfect Essence of the Mind price is the server's value, which differs from poe2db's trade rate (its effect on cost is 0.1 to 2.6 div per run).
:::

:::zundamon normal
So how should I craft a mana ring?
:::

:::metan happy
Add the Essence after, and settle for T2+ on Resistances and Mana Regeneration. That was the cheapest.
:::

In a five-target mana ring, Resistances T1 and Mana Regeneration T1 make up most of the cost. Loosen them to T2+ and aim with Catalysts + the Catalysing Omen.

## Where the Numbers Come From

:::fold Show sources (3)
- The ExileDesk engine, 300 runs per method, capped at 2,000 div per run. Per-try odds: 20,000 tries on the engine.
- Market: the ExileDesk server (2026-10-20 16:00 UTC; 1 Divine Orb = 696.93 Exalted Orbs). The Perfect Essence of the Mind uses the server's value (26.5 Exalted Orbs), which differs from poe2db's trade rate, but its effect on cost is 0.1 to 2.6 div per run.
- The Catalysing Omen multiplier follows Craft of Exile's formula. Not compared with Craft of Exile or in-game results.
:::

## Try It Yourself

You can try the mana targets one craft at a time on a [Gold Ring on the crafting bench](/?base=Gold%20Ring). To compare the order of moves, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Omen of Catalysing Exaltation multiplier](/en/blog/catalysing-exaltation-multiplier/)

VOICEVOX: Zundamon / Shikoku Metan
