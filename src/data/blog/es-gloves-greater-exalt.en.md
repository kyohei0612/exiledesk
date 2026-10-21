---
title: PoE2 Energy Shield Gloves Craft: Greater Exalt Beats Perfect
description: For a PoE2 Energy Shield gloves craft, we compared Exalted Orb types for maximum ES, ES% and maximum Mana at T2+, 300 runs each. Greater was cheapest at 105 div; Perfect cost 201 and the plain Exalted Orb 423.
date: 2026-10-22
tags: gloves, Energy Shield, Exalted Orb, Chaos Orb, expected cost
tree: /?page=sim-tree&base=Sirenscale%20Gloves
craft: /?base=Sirenscale%20Gloves
image: img/es-gloves-greater-exalt-og.en.png
ready: true
draft: true
---
For a PoE2 Energy Shield gloves craft with maximum Energy Shield, ES% and maximum Mana (T2+) as prefixes, **Omen of Sinistral Exaltation + Greater Exalted Orb was the cheapest method at 105 div per item** (div = Divine Orb). Perfect cost 201 div and the plain Exalted Orb 423 div. Catalysts can't be used on gloves.

:::zundamon normal
If I'm aiming for high tiers, I should just use the best one, the Perfect Exalted Orb, right?
:::

:::metan normal
That's what most people think. It skips the low-tier misses, so hits come easier.
:::

:::metan happy
But on ES gloves, Greater was the cheapest. Perfect cost almost twice as much, and the plain one four times as much.
:::

:::zundamon surprised
Perfect loses?! I need to know why.
:::

:::summary What you'll learn
- For three ES glove prefixes (maximum ES, ES%, maximum Mana, T2+), Omen of Sinistral Exaltation + Greater Exalted Orb is cheapest at 105 div per item
- Perfect is held back by its price; the plain Exalted Orb rolls low-tier misses, and annulling them takes your targets with them
- Socketing runes makes it 1.8 times (194 div). Greater is still cheapest
:::

:::tip New to this? Words used here
- **Exalted Orb**: a currency that adds one mod to a Rare item
- **Omen of Sinistral Exaltation**: an Omen that makes the Exalted Orb add a prefix only
- **Mod tier (T2 etc.)**: the same mod comes in tiers by how strong its numbers are. A smaller number is stronger
- **Greater / Perfect**: the grades of a currency. There are three: plain, Greater and Perfect
- **Minimum modifier level**: a floor; tiers below this modifier level can't roll
- **div**: Divine Orb, the price unit in this post
:::

## The Gloves

First, the gloves we compared and how we crafted them.

:::zundamon normal
Which gloves did you use?
:::

:::metan normal
Sirenscale Gloves. They're Intelligence gloves with 54 Energy Shield, requiring level 80.
:::

:::metan normal
At Item Level 82, it's the regular base with the highest ES.
:::

:::zundamon normal
What does the item look like at the start?
:::

:::metan normal
A Rare with a Fractured "+2 to Level of all Projectile Skills" suffix, plus one random mod.
:::

:::metan normal
The cost of fracturing isn't included.
:::

| Target (prefixes only) | Tier | How it's treated |
|---|---|---|
| Maximum Energy Shield | T2+ | Target |
| Increased Energy Shield % | T2+ | Target |
| Maximum Mana | T2+ | Target |
| Suffixes | Anything | Made later, so ignored |

:::zundamon normal
And how do you craft it?
:::

:::metan normal
It's the cheapest method from [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/), "annul misses at once", flipped to the prefix side.
:::

| Step | What to use | When |
|---|---|---|
| 1 | Chaos Orb | While no target is on the item |
| 2 | Orb of Annulment (no Omen) | Right away, once a non-target prefix appears |
| 3 | Omen of Sinistral Exaltation + Exalted Orb | To add a missing target. This is the Exalted Orb we compared as plain, Greater and Perfect |

:::zundamon normal
Can't you weight the targets with a Catalyst, like on a ring?
:::

:::metan troubled
No. Catalysts are for "a ring or amulet" only (poe2db's description).
:::

:::metan normal
The ExileDesk engine also refuses a Catalyst on gloves: "Catalysts: Rings and Amulets only."
:::

:::metan normal
Without Catalyst Quality, the Omen of Catalysing Exaltation is out too. So a plain Omen of Sinistral Exaltation is all you have.
:::

## Result: Greater Exalted Orb Is Cheapest at 105 div

We ran 300 crafts on the engine for each Exalted Orb type.

| Omen of Sinistral Exaltation + | No runes | Serle's Triumph + Kolr's Hunt | Worth it? |
|---|---:|---:|---|
| Exalted Orb | 423 div | 598 div | No (most expensive) |
| **Greater Exalted Orb** | **105 div** | **194 div** | **Yes (cheapest either way)** |
| Perfect Exalted Orb | 201 div | 307 div | No (almost twice Greater without runes) |

:::zundamon surprised
Greater is cheapest with or without runes!
:::

:::metan normal
Here's how many orbs each one used, without runes.
:::

| Omen of Sinistral Exaltation + | Finished | Cost per item | Chaos Orb | Annulment | Exalted | Lost all targets |
|---|---:|---:|---:|---:|---:|---:|
| Exalted Orb | 99.7% | 423 div | 2,682 | 242 | 244 | 111 times |
| **Greater Exalted Orb** | **100%** | **105 div** | 654 | 63 | 65 | 26 times |
| Perfect Exalted Orb | 100% | 201 div | 423 | 43 | 45 | 17 times |

:::zundamon normal
With only 300 runs, couldn't that be luck?
:::

:::metan normal
Greater's average has a margin of error of ±11 div. The gaps between the three are far bigger than that, so it's settled.
:::

## Why Greater

Perfect and plain lose for different reasons.

### Perfect loses on price

:::zundamon normal
Perfect uses the fewest orbs. Why does it lose?
:::

:::metan normal
The price. A Perfect Exalted Orb costs about 2.9 div (2,046 Exalted Orbs) each.
:::

:::metan normal
Going Perfect cuts Exalted Orbs from 65 to 45, and Chaos Orbs from 654 to 423.
:::

:::metan troubled
But the Perfect Exalted Orbs alone cost 132 div per run. That's far more than what you save.
:::

### Plain loses on misses

:::zundamon normal
The plain Exalted Orb is cheap. How does it end up at 423 div?
:::

:::metan normal
It has no minimum modifier level. So even in the target families, low tiers roll often.
:::

:::metan normal
Anything below T2 is a miss, so you annul it at once. That Annulment can take out a target you already landed.
:::

:::zundamon troubled
And if every target is gone, it's back to Chaos Orbs...
:::

:::metan troubled
Right. That happened 111 times per run, and Chaos Orbs alone cost 277 div.
:::

| Exalted Orb type | Why it loses / wins | What happens |
|---|---|---|
| Plain | Too many misses | Annulling low tiers takes targets with it; Chaos Orbs alone cost 277 div |
| **Greater** | **Right in between** | Minimum modifier level 35 cuts low tiers, and it's cheap at about 13 Exalted Orbs each |
| Perfect | Price | Hits come easier, but the Perfect Exalted Orbs alone cost 132 div per run |

:::zundamon happy
Greater cuts the low tiers and stays cheap. It's right in between!
:::

## Runes Make It 1.8 Times

The +2 Projectile mod on these gloves is a Marksman mod that only appears with the rune Kolr's Hunt socketed. So we reran with the finished item's runes: Serle's Triumph (+1 suffix) and Kolr's Hunt.

| Omen of Sinistral Exaltation + | No runes | Serle's Triumph + Kolr's Hunt | What happens |
|---|---:|---:|---|
| Exalted Orb | 423 div | 598 div (96.7% finished) | Still the most expensive |
| **Greater Exalted Orb** | 105 div | **194 div** | About 1.8 times, still the cheapest |
| Perfect Exalted Orb | 201 div | 307 div | Still loses to Greater |

:::zundamon normal
Why do runes make it more expensive?
:::

:::metan normal
With Kolr's Hunt, Marksman mods also join the prefix pool: projectile damage, projectile speed and curse effect.
:::

:::metan normal
More non-targets means Chaos Orbs rose from 654 to 1,275, and Greater Exalted Orbs from 65 to 107.
:::

:::zundamon normal
Does an Annulment ever remove a suffix that isn't Fractured?
:::

:::metan normal
Not once in either setup. During the Chaos phase the item has two mods, so once a target lands no non-Fractured suffix is left.
:::

:::zundamon normal
What if I make the suffixes afterward? How much is that?
:::

:::metan normal
With Critical Damage Bonus and Arcane Surge, it's about 1,350 div per item, including the 194 div prefixes (83% finished).
:::

:::metan troubled
So the suffixes are most of the cost.
:::

:::note fold Not yet verified (3)
- All results come from the ExileDesk engine. Mod names and tiers included, they have not been compared with Craft of Exile or in-game results.
- Prices are the ExileDesk server's market prices (2026-10-20 16:00 UTC).
- Rune costs (Serle's Triumph about 3.0 div, Kolr's Hunt about 1.0 div) are not included.
:::

For ES glove prefixes, the Greater Exalted Orb was the cheapest. Perfect isn't always best; weigh the hit rate against the price.

## Where the Numbers Come From

:::fold Show sources (3)
- All results come from the ExileDesk engine, one craft at a time. 300 runs per method, capped at 2,000 div per run.
- Prices are the ExileDesk server's market prices (2026-10-20 16:00 UTC; 1 div = 696.93 Exalted Orbs). Rune costs (Serle's Triumph about 3.0 div, Kolr's Hunt about 1.0 div) are not included.
- Mod names and tiers come from the engine's data. Not compared with Craft of Exile or in-game results.
:::

## Try It Yourself

You can apply the same moves to Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves). To compare Exalted Orb types side by side, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)

VOICEVOX: Zundamon / Shikoku Metan
