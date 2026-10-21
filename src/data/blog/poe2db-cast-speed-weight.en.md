---
title: PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE
description: PoE2 ring Cast Speed has modifier weight 1 on poe2db but 1,000 in Craft of Exile and ExileDesk. That decides whether Omen of Dextral Exaltation + Greater Exalted Orb lands Cast Speed T2+ 4.37% or 0.00% of the time.
date: 2026-10-22
tags: poe2db, Craft of Exile, weight, Cast Speed, Gold Ring
craft: /?base=Gold%20Ring
image: img/poe2db-cast-speed-weight-og.en.png
ready: true
draft: true
---
PoE2 ring Cast Speed has a modifier weight of **1 on poe2db (all five tiers, a placeholder) but 1,000 in Craft of Exile and ExileDesk**. At 1,000, Omen of Dextral Exaltation + Greater Exalted Orb lands Cast Speed T2 or better 4.37% of the time. Use poe2db's 1 as-is and it drops to 0.00%, so any Cast Speed ring looks absurdly expensive.

:::zundamon normal
I opened poe2db's ring page, and Cast Speed has a weight of 1.
:::

:::metan surprised
Other mods sit around 1,000. If that were true, it would roll a thousand times less often.
:::

:::zundamon troubled
That can't be right. Which number is correct?
:::

:::metan normal
Let's line up poe2db, Craft of Exile and the ExileDesk engine and check.
:::

:::summary What you'll learn
- poe2db lists ring Cast Speed at weight **1** on all five tiers, which looks like a placeholder
- Craft of Exile and ExileDesk use **1,000**. With 1, the T2+ rate falls from 4.37% to 0.00%
- "It took N tries" misreads the weight by several times unless you know which tier was meant
:::

:::tip New to this? Words used here
- **Weight**: how likely a mod is to be picked. Bigger means more likely
- **Tier (T1, T2...)**: the same mod comes in tiers by value strength. T1 is the strongest
- **Exalted Orb**: a currency that adds one mod to a rare item
- **Omen of Dextral Exaltation**: an omen that makes an Exalted Orb add a suffix only
- **Fractured**: a mod locked in place so it can't be removed
:::

## What a Weight Is

When a mod is added, the weights of all eligible mods are summed, and one is picked in proportion to its weight.

:::zundamon normal
So how does a weight actually work?
:::

:::metan normal
With twenty mods at weight 1,000, each one has a one-in-twenty chance.
:::

:::zundamon normal
And if a weight-1 mod is mixed in?
:::

:::metan troubled
That mod is almost never picked.
:::

:::zundamon normal
Can't we just read the weights from the game data?
:::

:::metan normal
The game data (the client) doesn't contain PoE2 weights. So every tool takes them from outside sources.
:::

## Three Sources Side by Side

Gold Ring suffix weights for Cast Speed, Rarity and all Elemental Resistances (the same value on every tier).

| Source | Cast Speed (5 tiers) | Rarity (suffix, 3 tiers) | all Elemental Resistances (5 tiers) | What it looks like |
|---|---:|---:|---:|---|
| poe2db ring page (checked 2026-10-22) | **1** | 1,000 | 800 | Only Cast Speed is far smaller |
| Craft of Exile (local copy, 2026-10-09) | 1,000 | 1,000 | 800 | All three are normal weights |
| ExileDesk engine | 1,000 | 1,000 | 800 | Same as Craft of Exile |

The only difference is poe2db's Cast Speed.

:::zundamon surprised
Only poe2db has Cast Speed at 1!
:::

:::metan normal
All five tiers are 1. In the page data, the other rows hold text values like "1000", but these five hold the number 1.
:::

:::zundamon normal
Why would it be like that?
:::

:::metan troubled
It **looks like a placeholder 1** for a mod new in PoE2 whose weight isn't known.
:::

:::zundamon normal
How does Craft of Exile have it?
:::

:::metan normal
Ring Cast Speed is 1,000 per tier. On amulets it's 800 per tier.
:::

:::zundamon normal
And what does ExileDesk do?
:::

:::metan normal
We haven't used poe2db's 1 since 2026-09-23. Any mod at 1 or less on every tier is treated as a placeholder and filled from Craft of Exile.
:::

:::metan happy
So the current value is 1,000, the same as Craft of Exile.
:::

## How Much the Weight Changes the Odds

On a Gold Ring with Fractured Spell Damage and Rarity T1, we used Omen of Dextral Exaltation + Greater Exalted Orb. Only the Cast Speed weight was changed, and the engine counted the rates over 20,000 runs each.

| Cast Speed weight | Rolls T2 or better | Rolls any tier | What happens |
|---|---:|---:|---|
| 1,000 (Craft of Exile, ExileDesk) | **4.37%** | 6.52% | Rolls now and then |
| 1 (poe2db) | 0.00% | 0.01% | Almost never rolls |

At weight 1, Cast Speed almost never rolls.

:::zundamon surprised
4.37% turns into 0.00%!
:::

:::metan normal
If you use poe2db's 1 as-is, an Exalted Orb will almost never give Cast Speed.
:::

:::zundamon troubled
What if a cost tool used that value?
:::

:::metan troubled
Any Cast Speed ring would look absurdly expensive.
:::

:::metan normal
All our Gold Ring cost posts, like [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/), use weight 1,000.
:::

## We Once Lowered It to 60, Then Went Back

ExileDesk itself once lowered the Cast Speed weight to 60.

:::zundamon surprised
ExileDesk got it wrong too!?
:::

:::metan troubled
We worked the weight back from how many Chaos Orbs it took to hit.
:::

:::metan troubled
But that count was until Cast Speed **T1** rolled, not any tier.
:::

:::zundamon normal
So how often does T1 roll?
:::

:::metan normal
In Craft of Exile's simulator, we used Chaos Orbs on a ring with one fixed mod and one miss.
:::

| What we counted | Number | What it showed |
|---|---:|---|
| Average until T1 | Once every 152 | Weight 1,000 explains it |
| Hits counted | 55 | — |
| Worst case | 566 | Bad luck can take several times the average |

Counted as T1 only, weight 1,000 explains the numbers. So we went back to Craft of Exile's value.

:::zundamon happy
Mix up the tier, and you read the weight several times too small.
:::

:::metan happy
Right. When you look at a count, first check whether it's about T1 or any tier.
:::

:::tip Reading "it took N tries"
Comparing counts without the tier misreads the weight by several times. Check first whether they meant T1 or any tier.
:::

:::note fold Not yet verified (1)
- The rates were counted on the engine and have not been compared against in-game results.
:::

poe2db's ring Cast Speed weight of 1 looks like a placeholder, and ExileDesk uses 1,000, the same as Craft of Exile. When you read a weight, always check its source and its tier first.

## Where the Numbers Come From

:::fold Show sources (3)
- poe2db: the public ring page (https://poe2db.tw/us/Rings), read once on 2026-10-22.
- Craft of Exile: a local copy of its data from 2026-10-09 (ring class, CastSpeedJewellery1 to 5).
- Rates: the ExileDesk engine, 20,000 runs each, with the weight changed only inside the test script. Not compared against in-game results.
:::

## Try It Yourself

On ExileDesk's [crafting bench](/?base=Gold%20Ring), you can craft a Gold Ring while seeing the odds at weight 1,000.

**Related posts**

- [PoE2 Ring Suffix Craft: Annul Misses Early, 400 → 220 div](/en/blog/dont-hoard-misses/)
- [PoE2 Crafting Simulator Custom Weights: Edit Mod Weights](/en/blog/custom-mod-weights/)

VOICEVOX: Zundamon / Shikoku Metan
