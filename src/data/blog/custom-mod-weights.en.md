---
title: PoE2 Mod Weights Explained: 5x the Weight Isn't 5x the Odds
description: A PoE2 mod's chance is its weight over the total weight. Gold Ring Cast Speed at weight 1, 200, 1,000, 5,000: 0.01%, 1.14%, 5.43%, 22.30%. Why 5x isn't 5x.
date: 2026-10-22
updated: 2026-10-31
tags: weight, odds, Cast Speed, Gold Ring, mod list
craft: /?base=Gold%20Ring
ready: true
---
A PoE2 mod weight is how likely that mod is to roll, and **its chance is "its weight ÷ the total weight of everything that can roll"**. On a Gold Ring with an Orb of Augmentation, raising Cast Speed's weight 5x from 1,000 to 5,000 only takes its chance from 5.43% to 22.30%, about 4.1x. When you raise the weight, the total you divide by goes up too.

:::zundamon normal
If the weight is 5 times bigger, the chance is 5 times bigger, right?
:::

:::metan normal
For a mod with a small weight, almost. But the bigger the weight gets, the further it falls short of 5x.
:::

:::zundamon surprised
Why?
:::

:::metan happy
Because the number you divide by grows too. We changed the weight four ways on a Gold Ring and compared the odds table with real rolls.
:::

:::summary What you'll learn
- Chance to roll = the mod's weight ÷ the total weight of mods that can roll
- On a Gold Ring with an Orb of Augmentation, Cast Speed at weight 1, 200, 1,000 and 5,000 rolls 0.01%, 1.14%, 5.43% and 22.30% of the time
- 5x the weight doesn't give 5x the chance (1,000 → 5,000 is about 4.1x). The bigger the weight, the bigger the gap
- In the ExileDesk mod list, you can edit a mod's weight yourself and compare the odds
:::

:::tip New to this? Words used here
- **Weight**: how likely a mod is to be picked. Bigger means more likely
- **Tier**: the same mod comes in tiers by value strength
- **Orb of Augmentation**: adds one mod to a magic item
- **Odds table**: ExileDesk's table of what the next craft can add, and how often
- **Mod list**: ExileDesk's list of every mod and tier that can roll
:::

## How Do Weights Set the Odds?

When a mod is added, the weights of everything that can roll right now are summed, and one is picked in proportion to its weight.

| Number | What it is |
|---|---|
| Top | The weight of the mod (tier) you want |
| Bottom | The total weight of every mod and tier that can roll now (including yours) |
| Chance | Top ÷ bottom |

:::zundamon normal
Do mods from a group already on the item count in the total?
:::

:::metan normal
No. That group can't roll again, so it leaves the pool. That's why the same weight gives different odds on different items.
:::

## How Much Does the Weight Change the Odds?

Here is the chance of Cast Speed when using an Orb of Augmentation on a magic Gold Ring with one prefix. Only Cast Speed's weight changes.

| Cast Speed weight | Odds table | 4,000 real rolls | Versus 5x less weight | How it looks |
|---:|---:|---:|---|---|
| 1 (poe2db's value) | 0.01% | 0.03% | — | Almost never |
| 200 | **1.14%** | 1.13% | — | Rare |
| 1,000 (ExileDesk default) | **5.43%** | 5.03% | About 4.8x weight 200 | ExileDesk's current odds |
| 5,000 | 22.30% | 21.80% | About 4.1x weight 1,000 | More than 1 in 5 |

The odds table and 4,000 real rolls landed close together.

:::zundamon surprised
200 → 1,000 is 4.8x, and 1,000 → 5,000 is 4.1x. It drifts further from 5x.
:::

:::metan normal
As Cast Speed's weight grows, it takes up more of the total you divide by. The total grows noticeably too, so the chance falls short of 5x.
:::

:::metan normal
On the other hand, small tweaks to a low-weight mod move its chance almost exactly with the weight.
:::

## Some Mods Have No Known Weight

PoE2's game data doesn't include mod weights, so every tool takes them from outside sources. For some mods, those sources disagree.

| Mod | How sources differ | Post |
|---|---|---|
| Ring Cast Speed | 1 on poe2db, 1,000 in Craft of Exile and ExileDesk | [Cast Speed weight](/en/blog/poe2db-cast-speed-weight/) |
| Desecrated-only mods | Nobody has measured them; ExileDesk made them equal | [Desecration weights](/en/blog/desecration-weights/) |
| Omen of Catalysing Exaltation multiplier | No official number | [Catalysing Exaltation multiplier](/en/blog/catalysing-exaltation-multiplier/) |

:::zundamon troubled
If you don't know the weight, you don't know the odds or the cost.
:::

:::metan normal
That's why ExileDesk sets a default and lets you change it. As the table shows, weight 1 and weight 1,000 differ by hundreds of times.
:::

## How to Edit Weights in ExileDesk

Open a row in the mod list on the ExileDesk crafting bench and a weight field appears above its tier table. Type a number and that mod's odds change right away.

| What you want | How | What happens |
|---|---|---|
| Change a weight | Type a number (for example 200) | The odds table, mod list and actual crafts all use the new weight |
| Which tier's weight | Enter the heaviest tier's weight | Other tiers move in the same ratio |
| Undo | Press "Reset all" | Back to the defaults, and saved values are cleared |
| Keep it after closing | Nothing to do | Saved in your browser |
| Share it | Share your craft steps | Each step carries the edited weights and replays with them |

Grouped rows (several mods bundled into one row) don't show this field.

:::tip When you're unsure about a weight
If you can't settle on one value, check the odds once with each candidate (say 200 and 1,000). You'll see how much that mod swings your cost.
:::

:::note fold What we haven't checked (2)
- These numbers come from the ExileDesk engine and the screen, not from live game rolls or Craft of Exile.
- The default of 1,000 for Cast Speed is borrowed from Craft of Exile. Whether it's the game's real weight is unknown.
:::

A mod's chance is its weight over the total weight of everything that can roll. Raising the weight also raises the total, so 5x the weight doesn't give 5x the chance.

## Where the Numbers Come From

:::fold Show sources (3)
- Augmentation odds (odds table, 4,000 rolls): ExileDesk engine, check script (2026-10-22, emulator team note 2026-10-22-mod-weight-edit). Engine
- How the weight field behaves (odds change, Reset all, replay and share): the same note and a local check on screen. Engine
- Where weights come from (poe2db 1, Craft of Exile 1,000, ExileDesk 1,000 since 2026-09-23): the table in [the Cast Speed weight post](/en/blog/poe2db-cast-speed-weight/). poe2db, Craft of Exile
:::

## Try It Yourself

Open a Gold Ring on the ExileDesk [crafting bench](/?base=Gold%20Ring), expand the Cast Speed row in the mod list, and compare the odds at different weights.

**Related posts**

- [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)
- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Catalysing Exaltation Multiplier: No One Knows It](/en/blog/catalysing-exaltation-multiplier/)

**Update history**

- 2026-10-31: The weight field went live on 2026-10-25, so we removed "not released yet". We refocused the post on how weights change the odds, shortened the implementation details, and added why 5x the weight isn't 5x the chance. No numbers changed.
- 2026-10-22: Published.

VOICEVOX: Zundamon / Shikoku Metan
