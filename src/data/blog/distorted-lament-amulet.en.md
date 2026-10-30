---
title: PoE2 Distorted vs Lament Amulet: 3/2 or 2/3 Affixes?
description: PoE2 engine runs: Distorted Amulet (3/2) for prefix-heavy targets, Lament (2/3) for suffix-heavy. The wrong pick cost 1.14-1.5x more with a fracture.
date: 2026-11-10
tags: Distorted Amulet, Lament Amulet, amulet, Fracturing Orb, expected cost
craft: /?base=Lament%20Amulet
ready: true
draft: true
---
The PoE2 Distorted Amulet has one fewer suffix (3 prefixes / 2 suffixes), and the Lament Amulet has one fewer prefix (2/3). In our engine runs, the answer was simple: **pick the Distorted Amulet when most of your targets are prefixes, and the Lament Amulet when most are suffixes**. Crafted with a fracture, the right pick cost the same as a normal amulet or about 10% less, and the wrong pick 1.14 to 1.5 times more. With only Exalts and Annuls, the wrong pick cost 1.4 to 2.1 times more.

:::zundamon normal
Last time we found that the Absent Amulet costs more because it has fewer slots.
:::

:::metan normal
Right. But the Distorted and Lament Amulets only lose a slot on one side.
:::

:::zundamon troubled
So what happens then?
:::

:::metan happy
We split the targets into prefix-heavy and suffix-heavy and counted on three bases.
:::

:::summary What you'll learn
- Prefix-heavy targets: pick **Distorted**. Suffix-heavy: pick **Lament**. The wrong one costs 1.14-1.5x more with a fracture, 1.4-2.1x with Exalts and Annuls only
- With a fracture, the right pick costs **the same as a normal amulet or about 10% less**
- The reason: Chaos Orbs add mods to the side that still has its full slots
- With Exalts and Annuls only and targets on both sides, even the right pick costs 1.4-1.5x a normal amulet (about equal with suffix targets only)
:::

:::tip New to this? Words used here
- **Affix slots**: how many prefixes and suffixes an item can hold. A normal rare holds 3 of each
- **Fractured**: a mod locked in place so it can't be removed
- **Orb of Annulment**: removes one mod. You can't choose which
- **Omen of Sinistral / Dextral Exaltation**: makes an Exalted Orb add a prefix / suffix only
:::

## How Do the Distorted and Lament Amulets Differ?

Only in affix slots. The mod pool and weights were the same on all three bases.

| | Distorted Amulet | Lament Amulet | Gold Amulet (our comparison) |
|---|---|---|---|
| Implicit | -1 maximum suffixes | -1 maximum prefixes (also grants a skill) | Item Rarity |
| Rare affix slots | 3 prefixes / 2 suffixes | 2 prefixes / 3 suffixes | 3 / 3 |
| Orb of Augmentation | Can't use | Can't use | Can use |

Augmentation is blocked because an Orb of Transmutation leaves one side with zero magic slots.

We built two sets of targets. The suffix-heavy one is last article's +3 to Level of all Spell Skills and Cast Speed, plus Energy Shield. The prefix-heavy one swaps how many targets sit on each side, with Spirit T1 in place of the +3.

| Targets | Prefixes | Suffixes |
|---|---|---|
| Prefix-heavy | Spirit T1 + Energy Shield T2+ | Cast Speed T2+ |
| Suffix-heavy | Energy Shield T2+ | +3 Spell Skills (T1) + Cast Speed T2+ |
| Suffixes only | (anything) | +3 Spell Skills (T1) + Cast Speed T2+ |

The routes are the same two as last time. Exalts are Greater Exalted Orbs with the matching side omen. The Fracture route spends Chaos Orbs until the hard target (Spirit T1 or the +3) appears, locks it with a Fracturing Orb, then adds the rest with Exalts and Annuls.

## Results: Distorted for Prefixes, Lament for Suffixes

Average cost per amulet on the Fracture route (10,000 runs each), with ExileDesk's market prices from 2026-10-22 (Forbidden Rites).

| Targets | Distorted (3/2) | Gold (3/3) | Lament (2/3) | Pick |
|---|---:|---:|---:|---|
| Prefix-heavy | **262.9 div** | 268.9 div | 299.8 div | Distorted (about the same as Gold; Lament 1.14x) |
| Suffix-heavy | 1,037 div | 818.8 div | **760.0 div** | Lament (0.93x Gold; Distorted 1.36x) |
| Suffixes only | 951.3 div | 713.3 div | **631.3 div** | Lament (0.89x Gold; Distorted 1.51x) |

:::zundamon surprised
Fewer slots, and it's cheaper than normal!
:::

:::metan normal
Only if the side with more targets keeps its full slots. Distorted for prefix-heavy targets is about the same as Gold; with other seeds it was 0.96-0.99x. Lament for suffix-heavy targets was clearly cheaper.
:::

The suffixes-only targets match last article's Absent Amulet (about 817 div). For the same targets, Lament came to 631.3 div, more than 20% cheaper.

## Why Is the Right Pick Cheaper?

Chaos Orbs add mods to the side that keeps its slots. The reduced side fills up quickly, so more often the only open side is the full-size one.

| Chance per Chaos Orb (right after Alchemy, no targets yet) | Distorted | Gold | Lament |
|---|---:|---:|---:|
| Spirit T1 (prefix) | **0.387%** | 0.270% | 0.209% |
| Energy Shield T2+ (prefix) | **1.709%** | 1.286% | 1.014% |
| +3 Spell Skills T1 (suffix) | 0.043% | 0.060% | **0.069%** |
| Cast Speed T2+ (suffix) | 0.596% | 0.888% | **1.017%** |

On the Fracture route, 40-90% of the cost is Chaos Orbs spent waiting for the hard target. Those dropped to 1,089 per run on the prefix-heavy Distorted (1,442 on Gold) and 6,124 on the suffix-heavy Lament (6,953 on Gold).

:::zundamon normal
Don't you lose something later, when adding with Exalts?
:::

:::metan troubled
A little. Adding the target on the other side takes more Annulments because that side has fewer slots. On the suffix-heavy Lament it was 190 Annulments per run, vs 135 on Gold. But the Chaos savings were bigger.
:::

## With Only Exalts and Annuls, Even the Right Pick Tends to Cost More

Skip the fracture and use only omen-guided Exalts and plain Annuls, and the picture changes.

| Targets | Distorted | Gold | Lament | What happens |
|---|---:|---:|---:|---|
| Prefix-heavy | ~2,360 div | ~1,570 div | ~3,390 div | Even Distorted is about 1.5x Gold |
| Suffix-heavy | ~18,900 div | ~9,100 div | ~13,100 div | Even Lament is about 1.4x Gold |
| Suffixes only | ~4,236 div | ~2,108 div | ~2,048 div | Lament and Gold about equal |

Fewer slots make each Annulment more likely to hit a target. On the suffix-heavy targets, targets were annulled away 878 times per run on Lament and 605 on Gold. It's the same loss we saw on the Absent Amulet, now happening on the side with the other target.

:::tip Choosing a one-side-reduced amulet?
Pick the one whose reduced side has fewer of your targets, then fracture the hard target before adding the rest. In our runs, the same Lament Amulet cost ~13,100 div with Exalts and Annuls only, but 760 div with the fracture (about 1/17).
:::

:::note fold What we haven't verified (5 items)
- These costs come from engine runs. We have not checked them against Craft of Exile or against crafting in game.
- Prices are ExileDesk's market data from 2026-10-22. On the Fracture route, 40-90% of the cost is Chaos Orbs, so the Chaos Orb price matters.
- The routes are simple rules based on the item's current state, not a search for the cheapest route. On the Exalt + Annul route, changing the rules moved the suffix-heavy cost by 2-4x (tested on 50-100 runs).
- Base prices are not included. We have not checked where to get a white Distorted Amulet.
- We did not run the Portent Amulet (3/2) or the Twisted Amulet (2/3), which have the same slot shapes.
:::

Pick the Distorted Amulet for prefix-heavy targets and the Lament Amulet for suffix-heavy ones, and fracture the hard target first. In our runs, that made them as cheap as a normal amulet or about 10% cheaper.

## Where the Numbers Come From

:::fold Show sources (4 items)
- Costs, currency used, times targets were annulled: docs/org/math/notes/2026-10-31-split-amulet.md, script scripts/analysis/split-amulet-ev.mjs (Fracture route 10,000 runs, seed 7; Exalt + Annul the average of 2,000 runs on 2 seeds). Engine
- Chance per Chaos Orb: same notes (200,000 engine rolls per case). Engine
- Check against last article: the Gold Amulet's suffixes-only numbers match last article's to the decimal. This compares two runs of the same script, not an outside source. Engine
- Prices: ExileDesk market data (2026-10-22 04:00 UTC, Forbidden Rites). Market
:::

## Try It Yourself

Pick the [Lament Amulet](/?base=Lament%20Amulet) and the [Distorted Amulet](/?base=Distorted%20Amulet) on the ExileDesk crafting bench and watch which side Chaos Orbs add to, one click at a time.

**Related posts**

- [PoE2 Absent Amulet Crafting: Why 2/2 Affixes Cost More](/en/blog/absent-amulet-craft/)
- [PoE2 Amulet with 4 Targets: 700 div or 90,000 by Route](/en/blog/amulet-four-aims/)
- [PoE2 Omen of Dextral & Sinistral Exaltation (+ Greater)](/en/blog/exaltation-omens-guide/)

VOICEVOX: Zundamon / Shikoku Metan
