---
title: PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE
description: PoE2 ring Cast Speed has modifier weight 1 on poe2db but 1,000 in Craft of Exile and ExileDesk. That decides whether Omen of Dextral Exaltation + Greater Exalted Orb lands Cast Speed T2+ 4.37% or 0.00% of the time.
date: 2026-10-22
tags: poe2db, Craft of Exile, weight, Cast Speed, Gold Ring
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/poe2db-cast-speed-weight-og.en.png
draft: true
---
PoE2 ring Cast Speed has a modifier weight of **1 on poe2db (a placeholder, all five tiers) but 1,000 in Craft of Exile and ExileDesk**. At 1,000, Omen of Dextral Exaltation + Greater Exalted Orb lands Cast Speed T2+ 4.37% of the time; with poe2db's 1 it is 0.00%, and any Cast Speed ring looks absurdly expensive.

It started with one line on a crafting stream: "poe2db's Cast Speed weight is broken, it shows 1. In practice it rolls about one in five."

If ring Cast Speed really had weight 1, it would roll a thousand times less often than other mods (which sit around 1,000). That can't be right, can it?

Is it really 1, and what does ExileDesk use? We compared poe2db, Craft of Exile and the ExileDesk engine.

:::summary What you'll learn
- poe2db lists ring Cast Speed at weight **1 on all five tiers (it looks like a placeholder)**. The stream was right: it's broken
- Craft of Exile and ExileDesk use **1,000**. Omen of Dextral Exaltation + Greater Exalted Orb lands T2+ 4.37% of the time
- Using poe2db's 1 as-is gives 0.00%, and any Cast Speed ring looks absurdly expensive
- "It took N tries" misleads by several times unless you know which tier was meant
:::

## What a Weight Is

When a mod is added, the weights of all eligible mods are summed, and one is picked in proportion to its weight. With twenty mods at weight 1,000, any one of them has a one-in-twenty chance. A weight-1 mod mixed in is almost never picked. The game client does not contain PoE2 weights, so every tool takes them from outside sources.

## Three Sources Side by Side

Gold Ring suffix weights for Cast Speed, Rarity and all Elemental Resistances (the same value on every tier):

| Source | Cast Speed (5 tiers) | Rarity (suffix, 3 tiers) | all Elemental Resistances (5 tiers) |
|---|---:|---:|---:|
| poe2db ring page (checked 2026-10-22) | **1** | 1,000 | 800 |
| Craft of Exile (local copy, 2026-10-09) | 1,000 | 1,000 | 800 |
| ExileDesk engine | 1,000 | 1,000 | 800 |

On poe2db, only the five Cast Speed tiers (of Talent, of Nimbleness, of Expertise, of Sortilege, of Legerdemain) have weight 1. In the page data, the other rows hold text values such as "1000", while these five hold the number 1. It looks like a placeholder for a weight that isn't known for a mod new in PoE2. **The stream's "it's broken, it shows 1" is correct.**

Craft of Exile has ring Cast Speed (CastSpeedJewellery1 to 5) at 1,000 per tier, and 800 per tier on amulets.

The ExileDesk engine has not used poe2db's 1 since 2026-09-23. Any mod whose weights are 1 or less on every tier is treated as a placeholder and filled from Craft of Exile. The current value is 1,000, the same as Craft of Exile.

## How Much the Weight Changes the Odds

On a Gold Ring with Fractured Spell Damage and Rarity T1, we applied Omen of Dextral Exaltation + Greater Exalted Orb 20,000 times on the engine and counted how often Cast Speed rolled. Only the Cast Speed weight was changed.

| Cast Speed weight | Rolls T2 or better | Rolls any tier |
|---|---:|---:|
| 1,000 (Craft of Exile, ExileDesk) | **4.37%** | 6.52% |
| 1 (poe2db) | 0.00% | 0.01% |
| 200 (reference: reading "one in five" as 1/5 of 1,000) | 0.97% | 1.48% |

:::chart bar Cast Speed T2+ rate (Dextral Exaltation + Greater Exalted Orb, 20,000 engine runs each)
unit: %
labels: Weight 1,000, Weight 200 (reference), Weight 1 (poe2db)
T2 or better: 4.37, 0.97, 0
:::

Using poe2db's 1 as-is means Cast Speed essentially never rolls from a plain Exalted Orb.

A cost tool using that value would make any Cast Speed ring look absurdly expensive.

What the stream's "one in five" refers to (the weight or the roll rate) can't be settled from the words alone. The 200 row is just one possible reading, for reference.

## We Once Lowered It to 60, Then Went Back

ExileDesk itself once lowered Cast Speed's weight to 60. That came from a video where it took "about 500 Chaos Orbs," but those 500 were until Cast Speed **T1** rolled. In Craft of Exile's simulator, Chaos Orbs on a ring with one fixed mod and one miss landed T1 once every 152 on average (55 hits counted, worst 566). Weight 1,000 explains that, so we went back to Craft of Exile's value.

The lesson: when a stream or video says "it took N tries," which tier they meant changes the implied weight enormously.

:::tip Reading "it took N tries"
Comparing counts without the tier misreads the weight by several times. Check first whether they meant T1 or any tier.
:::

## Where the Numbers Come From

- poe2db: the public ring page (https://poe2db.tw/us/Rings), read once on 2026-10-22.
- Craft of Exile: a local copy of its data from 2026-10-09 (ring class).
- Roll rates: the ExileDesk engine, 20,000 tries each, with the weight changed only inside the script. Not compared with in-game results.

All our Gold Ring cost articles, including [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/), use weight 1,000.

:::note Not yet verified
The rates were counted on the engine and have not been compared against in-game results.
:::

## Try It Yourself

On ExileDesk's [crafting bench](/?base=Gold%20Ring) you can craft a Gold Ring with the odds at weight 1,000 shown.

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Gold Ring craft, step by step](/en/blog/gold-ring-video-decoded/)
