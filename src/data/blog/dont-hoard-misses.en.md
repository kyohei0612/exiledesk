---
title: PoE2 Ring Suffix Craft: Annul Misses Early, 400 → 220 div
description: We crafted Rarity, Cast Speed and all Elemental Resistances on a PoE2 Gold Ring's suffixes, 300 engine runs per method. Annulling misses at once cut the cost per ring from 400 to 220 Divine Orbs.
date: 2026-10-22
tags: Gold Ring, Chaos Orb, Orb of Annulment, Omen of Catalysing Exaltation, expected cost
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/dont-hoard-misses-og.en.png
ready: true
draft: true
---
We had three groups of 300 crafters make the same Gold Ring. The only difference was one move: what to do when a miss rolls. In this PoE2 ring craft for three suffixes, the group that **annulled every miss on the spot** paid 220 div per ring. The group that held misses and annulled later paid 400 div (div = Divine Orb).

:::zundamon normal
An Orb of Annulment can wipe out a target you already hit.
:::

:::zundamon normal
So I'd rather keep adding Exalted Orbs until the slots are full, then annul it all at once.
:::

:::metan normal
That's the natural instinct. But when we ran it hundreds of times on the engine, the opposite came out.
:::

:::zundamon surprised
The opposite!? One move makes it almost half the price?
:::

:::summary What you'll learn
- Annulling a non-target suffix **the moment it rolls** is the cheapest. 220 div per ring, about half of holding misses first (400 div)
- The cost comes from how many Annulments you use, not how risky one Annulment is. Holding misses more than doubles the Annulments and adds restarts
- Swapping the Rarity T1 target for a single resistance T1 brings the same method down to 111 div per ring
- All numbers are averages of 300 engine runs each (about ±10%)
:::

:::tip New to this? Words used here
- **Suffix**: one side of an item's mod slots. On rings, this is where resistances and the like go
- **Orb of Annulment**: removes one mod that isn't Fractured
- **Exalted Orb**: adds one mod to a Rare item
- **Fractured**: a mod locked in place so it can't be removed
- **Omen of Catalysing Exaltation**: uses up all Catalyst Quality to make the matching mods more likely
- **div**: Divine Orb, the price unit in this post
:::

## The Ring We Crafted

This is a common caster ring.

| Item | Details |
|---|---|
| Base | Rare Gold Ring, Item Level 82 |
| Starting item | Spell Damage prefix (Glyphic, T2) Fractured, plus one random mod. Two mods total |
| Targets (suffixes only) | increased Rarity of Items found (of Archaeology) T1, Cast Speed T2 or better, all Elemental Resistances T2 or better |
| Prefixes | Anything is fine |

:::zundamon normal
So how do you build it?
:::

:::metan normal
Start with Chaos Orbs. Once one target lands, add the rest with Exalted Orbs.
:::

:::metan normal
Misses get removed with an Orb of Annulment (no Omen). If every target is gone, it's back to Chaos Orbs.
:::

:::tip How the Exalted Orbs are used (same for all three groups)
- Cast Speed: a Skittering Catalyst brings Quality to 20%, then Omen of Catalysing Exaltation + Omen of Dextral Exaltation + Perfect Exalted Orb
- All Elemental Resistances: a Tul's Catalyst brings Quality to 20%, then the same Omens + Perfect Exalted Orb
- Rarity: there is no Catalyst for it, so it is aimed plainly with Omen of Dextral Exaltation + Greater Exalted Orb
:::

### The One Move We Changed

Up to here, all three groups are the same. The only difference is whether you annul a miss right away or wait until all three suffixes are full.

| Method | What you do when a miss rolls |
|---|---|
| **A** | Use only Chaos Orbs until Rarity T1 rolls. If Cast Speed or Resistances roll first, ignore them |
| **B** | Keep adding Exalted Orbs until all three suffixes are full, then annul |
| **C** | Annul on the spot as soon as any non-target suffix appears |

:::metan normal
Which one do you think is cheapest?
:::

:::zundamon happy
A, since it never annuls, or B, since it annuls in one go!
:::

## Result: Annulling at Once Costs 220 div per Ring

Averages of 300 runs each. The noise is about ±10%.

| Method | Cost per ring | Finished | How it went |
|---|---:|---:|---|
| A Chaos for Rarity only | 441 div | 99.0% | The most expensive. Keeps spamming Chaos Orbs |
| B Fill to three | 400 div | 99.7% | A bit cheaper than A. The ranges just barely overlap |
| **C Annul misses at once** | **220 div (cheapest)** | **100%** | About half of B. The gap is far larger than the noise |

:::zundamon surprised
Wait, C annuls right away and it's the cheapest? I thought using fewer Annulments was always better.
:::

:::metan normal
That's the trap. Here's what each run used.
:::

| Method | Chaos Orb | Annulment | Perfect Exalted | Greater Exalted | Lost all targets | What happens |
|---|---:|---:|---:|---:|---:|---|
| A Chaos for Rarity only | 1,683 | 32 | 34 | 0 | 46 times | No Greater Exalted Orbs, but Chaos Orbs pile up |
| B Fill to three | 1,197 | 135 | 30 | 108 | 35 times | The most Annulments and many restarts |
| **C Annul misses at once** | 930 | 57 | 15 | 44 | 25 times | Every line is smaller than B |

:::zundamon surprised
B is the one annulling the most!
:::

:::metan normal
Right. A uses the fewest Annulments, then C. B, the one that waits, uses the most.
:::

## Why Holding Misses Costs More

It comes down to how the Orb of Annulment works. Without an Omen, it removes one non-Fractured mod at random, each equally likely.

| Method | Suffixes when you annul | Chance one Annulment hits a target | Annulments used | Restarts |
|---|---|---:|---:|---:|
| B Hold, then annul | 1 target + 2 misses | 1 in 3 (lower) | 135 (more) | 35 |
| C Annul at once | 1 target + 1 miss | 1 in 2 (higher) | 57 (fewer) | 25 |

:::zundamon normal
Per Annulment, annulling right away like C is riskier.
:::

:::metan normal
It looks that way. But what set the cost wasn't the risk of one Annulment. It was **how many you use**.
:::

### What happens when you wait (B)

B holds misses and annuls later, so it ends up annulling more often.

:::metan normal
B used 135 Annulments per run. Each one is another chance to take out a target you already have.
:::

:::zundamon normal
But if you keep adding Exalted Orbs, a target shows up eventually, right?
:::

:::metan troubled
Rarity T1 lands only 2.3% of the time with Omen of Dextral Exaltation + Greater Exalted Orb. Add while holding misses, and the slots fill with things you don't want.
:::

:::zundamon troubled
So that's how the restarts from Chaos Orbs grew to 35 per run...
:::

### What happens when you annul at once (C)

C annuls the moment a miss appears, so two misses never sit in the suffixes together.

:::metan normal
It needed only 57 Annulments, and restarts dropped to 25.
:::

:::metan normal
Perfect Exalted Orbs went from B's 30 down to 15. Chaos Orbs went from 1,197 down to 930.
:::

:::zundamon normal
A doesn't use any Greater Exalted Orbs. Why is it pricier than B?
:::

:::metan normal
It keeps spamming Chaos Orbs until Rarity rolls. Chaos Orbs rise 1.4 times, to 1,683.
:::

:::tip When you craft it yourself
If a non-target suffix rolls, annul it before your next Exalted Orb. Don't wait to "fill one more slot first."
:::

### The first roll doesn't matter

We split C's 300 runs by which target rolled first, and by the order the targets came together.

:::zundamon normal
If Rarity rolls first, does it end up cheaper?
:::

:::metan normal
Every group averaged 210 to 245 div. The gaps were all within the noise.
:::

:::metan normal
After so many trips back to Chaos Orbs, the luck of the first roll seems to wash out.
:::

## Swap One Target, Halve It Again: 111 div

We kept method C but replaced Rarity T1 with "any one of Fire, Cold or Lightning Resistance T1."

| Third target | Cost per ring | Chaos Orb | Why |
|---|---:|---:|---|
| Rarity T1 | 220 div | 930 | No Catalyst, hard to hit |
| **Single resistance T1 (any of Fire, Cold, Lightning)** | **111 div (half)** | 160 | Heavily weighted with a Tul's Catalyst + Omen of Catalysing Exaltation, and any element will do |

:::zundamon surprised
Exactly half!
:::

:::metan normal
Since any of the three elements works, Chaos Orbs find the first target sooner too. Almost all the savings are Chaos Orbs.
:::

:::metan happy
Deciding up front what you need from the ring might be the biggest saving of all.
:::

:::note fold Not yet verified (1)
- These expected costs themselves have not been compared against Craft of Exile or in-game results. They are engine results.
:::

Annulling a non-target suffix on the spot, instead of holding it, was the cheapest way to craft this ring. What sets the cost is not how risky one Annulment is, but how many you use.

## Where the Numbers Come From

:::fold Show sources (3)
- Every number comes from the ExileDesk engine (the same one the website uses), applied one craft at a time. 300 runs per method, with a 2,000 div cap per run.
- Prices are the market prices collected by the ExileDesk server (2026-10-20 16:00 UTC, Forbidden Rites; 1 Divine Orb = 696.93 Exalted Orbs). The cost of fracturing is not included.
- Mod names and tiers were checked on poe2db. The Omen of Catalysing Exaltation multiplier follows Craft of Exile's formula.
:::

## Try It Yourself

You can [try the same Gold Ring on the crafting bench](/?base=Gold%20Ring). To compare costs while changing what you do after a miss, use ExileDesk's [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
- [PoE2 Cast Speed weight on poe2db](/en/blog/poe2db-cast-speed-weight/)

VOICEVOX: Zundamon / Shikoku Metan
