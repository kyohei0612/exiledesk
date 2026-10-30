---
title: PoE2 Absent Amulet Crafting: Why 2/2 Affixes Cost More
description: In PoE2 engine runs, an Absent Amulet (2/2 affixes) cost 1.14-2x more than a Gold Amulet for +3 Spell Skills and Cast Speed. Fracture first: ~817 div.
date: 2026-11-08
tags: Absent Amulet, amulet, Fracturing Orb, Orb of Annulment, expected cost
craft: /?base=Absent%20Amulet
ready: true
draft: true
---
The PoE2 Absent Amulet can only hold two prefixes and two suffixes. Fewer slots means fewer places for bad mods, so it looks easier to craft. But when we had the engine craft the same targets on it and on a normal amulet, **the Absent Amulet cost 1.14 to 2 times more on every route we tried**. The cheapest route was to fracture +3 to Level of all Spell Skills first, at about 817 Divine Orbs per amulet on average.

:::zundamon normal
The Absent Amulet has fewer slots for junk. It must be cheaper to craft.
:::

:::metan normal
That's what most people think. So we crafted the same targets the same way on a normal amulet and compared.
:::

:::zundamon surprised
And it came out the other way?
:::

:::metan happy
It did. And the reason is easy to pin down, so let's go through it.
:::

:::summary What you'll learn
- The chance that one Exalted Orb or Chaos Orb hits a target is **the same** on both amulets
- The Absent Amulet still costs more. With Exalts and Annuls it is **2x** (about 4,236 vs 2,108 div)
- The gap comes from Annulments that remove your target along with the junk
- Fracturing the +3 first shrinks the gap to **1.14x** and cuts the cost to about a fifth
:::

:::tip New to this? Words used here
- **Affix slots**: how many prefixes and suffixes an item can hold. A normal rare holds 3 of each
- **Fractured**: a mod locked in place so it can't be removed. In our runs, using a Fracturing Orb on a rare with 4 mods locked one of them at random
- **Orb of Annulment**: removes one mod. You can't choose which
- **Omen of Dextral Exaltation**: makes an Exalted Orb add a suffix only
:::

## What Makes the Absent Amulet Different?

Its implicit lowers both the maximum number of prefixes and the maximum number of suffixes by one. Even as a rare, it holds two of each, four mods in total.

| | Absent Amulet | Gold Amulet (our comparison) |
|---|---|---|
| Required level | 50 | 35 |
| Implicit | -1 prefix / -1 suffix | Item Rarity |
| Rare affix slots | 2 prefixes / 2 suffixes | 3 prefixes / 3 suffixes |
| Mod pool and weights | Same | Same |
| Can't use | Orb of Augmentation (0 magic slots; an Orb of Transmutation leaves it magic with no mods) | — |

We compared against the Gold Amulet, the highest-level amulet whose implicit doesn't change affix slots. Its Rarity implicit has nothing to do with our targets or with caster Catalysts.

:::zundamon normal
So the only difference is the number of slots.
:::

:::metan normal
Right. Any cost gap comes from having fewer slots.
:::

### What Did We Try to Craft?

Two suffixes. Prefixes could be anything.

| Target | Tier | Chance per Greater Exalted Orb (suffix) |
|---|---|---:|
| +# to Level of all Spell Skills | T1 (+3) | 0.183% |
| Cast Speed | T2 or better (22-28%) | 2.93% |

The +3 is the hard one. Cast Speed is the easy one: with a Greater Exalted Orb, about half of the Cast Speed rolls land in our tiers.

Each run started from a white base, used an Orb of Alchemy, then followed one of four routes. Both bases used exactly the same rules.

| Route | Rules |
|---|---|
| Chaos only | Chaos Orb until done |
| Exalt + Annul | Suffix slot open: Omen of Dextral Exaltation + Greater Exalted Orb. Suffixes full and not done: Orb of Annulment |
| Same + Catalysts | Before each Exalt, Sibilant Catalysts to 20% caster quality, plus Omen of Catalysing Exaltation |
| Fracture | Chaos until the +3 appears → Fracturing Orb → once the +3 is fractured, Exalt + Annul for Cast Speed. If the fracture hits another mod, start over from a white base |

We skipped Essences. No amulet Essence guarantees Spell Skill levels or Cast Speed.

## Results: The Absent Amulet Costs More on Every Route

Average cost per finished amulet, using ExileDesk's market prices from 2026-10-22 (Forbidden Rites).

| Route | Absent Amulet | Gold Amulet | Absent vs Gold |
|---|---:|---:|---:|
| Fracture | **~817 div** | ~713 div | 1.14x (smallest gap) |
| Exalt + Annul | ~4,236 div | ~2,108 div | 2.0x (largest gap) |
| Exalt + Annul + Catalysts | ~5,500 div | ~3,240 div | 1.7x |
| Chaos only | ~6,140 div | ~3,710 div | 1.6-1.7x |

:::zundamon surprised
It's more expensive every single time!
:::

:::metan normal
And the route matters far more than the base. The same Absent Amulet costs ~4,236 div with Exalt + Annul, but ~817 div with the Fracture route.
:::

## Why Do Fewer Slots Cost More?

The chance of hitting a target with one roll was the same on both bases, because the mod pool and weights are the same.

The gap appears when you remove junk. On the Exalt + Annul route, the +3 was annulled away 15.9 times per run on the Absent Amulet and 8.0 times on the Gold Amulet. The cost ratio is about the same, 2x.

:::zundamon troubled
Why does the Absent Amulet lose its target so often?
:::

:::metan normal
It only has two suffixes. With the +3 next to one junk suffix, an Annul that hits a suffix takes the +3 half the time. The Gold Amulet can sit with two junk suffixes next to the +3, so it's one in three.
:::

With Chaos Orbs, fewer slots also mean fewer ways to finish. From four mods holding Cast Speed plus junk, one Chaos Orb finished the item 0.025% of the time on the Absent Amulet and 0.037% on the Gold Amulet. The Absent Amulet only finishes when the junk suffix is the one removed, while the Gold Amulet can also lose a prefix and gain a suffix.

## Fracturing the +3 Closes Most of the Gap

Once the +3 is fractured, Annulments can't remove it. On the Fracture route the gap fell to 1.14x.

| Measure | Absent Amulet | Gold Amulet | How to read it |
|---|---:|---:|---|
| Average per amulet | ~817 div | ~713 div | Cheapest of the four routes |
| Median | 576 div | 494 div | Average luck costs less than the average |
| 1 in 10 runs went past | 1,873 div | 1,610 div | Bad luck costs over 2x the average |
| Done within 1,000 div | 70.7% | 75.8% | About 7 in 10 with a 1,000 div budget |
| Fracturing Orbs used | 3.75 | 3.65 | Only 1 in 4 lands on the +3 |

About 90% of the cost is the Chaos Orbs spent waiting for the +3. The Fracturing Orbs themselves came to about 43 div per run.

:::zundamon normal
What if we add Catalysts to the Exalt + Annul route?
:::

:::metan normal
With 20% caster quality, one Exalt hit the +3 0.91% of the time instead of 0.18%, about five times as often. But a Catalyst cost about 0.43 div that day, and 20 of them per Exalt is about 8.7 div. At those prices, plain Exalt + Annul without Catalysts was cheaper.
:::

:::tip Going for +3 on an Absent Amulet?
Fracture the hard target first, then add the easy one. In our runs that cost about a fifth of the Exalt + Annul route.
:::

:::note fold What we haven't verified (5 items)
- These costs come from engine runs. We have not checked them against Craft of Exile or against crafting in game.
- Prices are ExileDesk's market data from 2026-10-22. On the Fracture route, 90% of the cost is Chaos Orbs, so the Chaos Orb price moves the result a lot.
- The routes are simple rules based on the item's current state. We did not search for the cheapest possible route, and did not try starting from one mod with an Orb of Transmutation and a Regal Orb.
- We think the remaining 1.14x gap on the Fracture route comes from the Gold Amulet being able to hold three suffixes even with four mods. We have not counted this.
- Mod weights come from one source each: poe2db for Spell Skills T1, Craft of Exile for Cast Speed.
:::

The Absent Amulet's fewer slots make Annulments more likely to take your target with them, so on the same route it costs more than a normal amulet. In our runs, the cheapest way was to fracture the hard target first and add the easy one after.

## Where the Numbers Come From

:::fold Show sources (4 items)
- Costs, currency used, median and 90th percentile: docs/org/math/notes/2026-10-31-absent-amulet.md, script scripts/analysis/absent-amulet-ev.mjs (Fracture route 10,000 runs, seed 7; other routes 2,000 runs on 2 seeds). Engine
- Chance per roll: mod weight shares in the same notes, plus 200,000 engine rolls per case. Engine
- Weights: Spell Skills T1 from poe2db, Cast Speed from Craft of Exile (docs/org/math/notes/2026-10-22-cast-speed-weight.md). poe2db / CoE
- Prices: ExileDesk market data (2026-10-22 04:00 UTC, Forbidden Rites). Market
:::

## Try It Yourself

Pick the Absent Amulet on the ExileDesk [crafting bench](/?base=Absent%20Amulet) to see why Augmentation is blocked and watch Annulments take your target, one click at a time.

**Related posts**

- [PoE2 Amulet with 4 Targets: 700 div or 90,000 by Route](/en/blog/amulet-four-aims/)
- [PoE2 Sanctify vs Quality Order: Why +6 but Never +5](/en/blog/sanctify-quality-order/)
- [PoE2 Crafting Budget: How Many Times the Average?](/en/blog/crafting-cost-variance/)

VOICEVOX: Zundamon / Shikoku Metan
