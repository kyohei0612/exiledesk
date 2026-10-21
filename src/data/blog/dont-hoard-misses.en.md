---
title: PoE2 Ring Suffix Craft: Annul Misses Early, 400 → 220 div
description: We crafted Rarity, Cast Speed and all Elemental Resistances on a PoE2 Gold Ring's suffixes, 300 engine runs per method. Annulling misses at once cut the cost per ring from 400 to 220 Divine Orbs.
date: 2026-10-22
tags: Gold Ring, Chaos Orb, Orb of Annulment, Omen of Catalysing Exaltation, expected cost
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
For a PoE2 ring suffix craft with three targets, the cheapest method was to **annul a miss the moment it rolls**. Putting Rarity, Cast Speed and all Elemental Resistances on a Gold Ring cost 400 Divine Orbs (div) per ring when misses were held until the suffixes were full, and 220 div when they were annulled at once.

Putting Rarity, Cast Speed and all Elemental Resistances in the suffixes of a Gold Ring is a familiar caster craft. We ran this craft hundreds of times on the ExileDesk engine and changed only one thing: what you do when a miss rolls. The difference looks small, but the cost per finished ring dropped from 400 Divine Orbs to 220.

## The Ring

The starting item:

- A Rare Gold Ring, Item Level 82.
- A Fractured Spell Damage prefix (Glyphic, T2), plus one random mod. Chaos Orbs start from this two-mod item.
- Suffix targets only: increased Rarity of Items found (of Archaeology) T1, Cast Speed T2 or better, and all Elemental Resistances T2 or better. Any prefix is fine.

Once one target is on the ring, the rest are added with Exalted Orbs. For Cast Speed, a Skittering Catalyst brings Quality to 20%; for all Elemental Resistances, a Tul's Catalyst does the same. Then we use Omen of Catalysing Exaltation + Omen of Dextral Exaltation + Perfect Exalted Orb. Rarity has no Catalyst, so it is aimed plainly with Omen of Dextral Exaltation + Greater Exalted Orb. Misses are removed with an Orb of Annulment (no Omen). If every target is gone, we go back to Chaos Orbs.

Up to here, all three methods are the same. The only difference is whether you annul a miss right away or wait until all three suffixes are full.

## Three Methods, Three Results

- **A**: Use only Chaos Orbs until Rarity T1 rolls. If Cast Speed or Resistances roll first, ignore them.
- **B**: Keep adding Exalted Orbs through misses until the suffixes are full, then annul.
- **C**: Annul as soon as any non-target suffix appears.

| Method | Finished | Cost per ring | Chaos Orb | Annulment | Perfect Exalted | Greater Exalted | Lost all targets |
|---|---|---|---|---|---|---|---|
| A Chaos for Rarity only | 99.0% | 441 div | 1,683 | 32 | 34 | 0 | 46 times |
| B Fill to three | 99.7% | 400 div | 1,197 | 135 | 30 | 108 | 35 times |
| **C Annul misses at once** | **100%** | **220 div** | 930 | 57 | 15 | 44 | 25 times |

C costs about half of B. You can [try the same Gold Ring on the crafting bench](/?base=Gold%20Ring). With 300 runs each, the average is within about ±10%, so the gap between B and C is well outside the noise. A and B barely overlap.

## Why Annulling Early Works

It comes down to how the Orb of Annulment works. Without an Omen, it removes one random non-Fractured mod. If the suffixes hold one target and two misses, there is a one-in-three chance of losing the target. With one target and one miss the chance is one in two, but you annul far less often.

B waits and then annuls, so it uses more Orbs of Annulment (135 per ring). Each one is another chance to hit a target you already have. Rarity T1 is also rare: Omen of Dextral Exaltation + Greater Exalted Orb lands it only 2.3% of the time. Adding Exalted Orbs while holding misses fills the slots with things you don't want. In the end, B lost every target and went back to Chaos Orbs 35 times per ring.

C annuls the moment a miss appears, so two misses never sit side by side. It used 57 Orbs of Annulment, and lost every target only 25 times. Perfect Exalted Orbs fell from 30 to 15, and Chaos Orbs from 1,197 to 930. Not hoarding misses made every line of the bill smaller.

A uses almost no Exalted Orbs. Instead it keeps spamming Chaos Orbs until Rarity rolls, so Chaos Orbs rise 1.4 times to 1,683 and the total ends up slightly above B.

We also checked whether the first lucky roll matters. Splitting C's 300 runs by which target rolled first, or by the order the targets came together, every group averaged 210 to 245 div, all within the noise. After so many trips back to Chaos Orbs, the first roll's luck washes out.

## Swap One Target, Halve It Again

Finally, we kept method C but replaced Rarity T1 with "any one of Fire, Cold or Lightning Resistance T1." Resistance T1 can also be weighted with a Tul's Catalyst and Omen of Catalysing Exaltation, and since any of the three elements will do, Chaos Orbs find it sooner. The result was 111 div per ring, exactly half of C. Almost all of the savings came from Chaos Orbs, down from 930 to 160. Insisting on Rarity is what makes this ring expensive.

## Where the Numbers Come From

- Every number comes from the ExileDesk engine (the same one the website uses), applied one craft at a time. 300 runs per method, with a 2,000 div cap per run.
- Prices are the market prices collected by the ExileDesk server (2026-10-20 16:00 UTC, Forbidden Rites; 1 Divine Orb = 696.93 Exalted Orbs). The cost of fracturing is not included.
- Mod names and tiers were checked on poe2db. The Omen of Catalysing Exaltation multiplier follows Craft of Exile's formula. These expected costs themselves have not been compared against Craft of Exile or in-game results.

You can try the same route, changing what you do after a miss, in ExileDesk's Craft route tree.

**Related posts**

- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
- [PoE2 Gold Ring craft, step by step](/en/blog/gold-ring-video-decoded/)
- [PoE2 Cast Speed weight on poe2db](/en/blog/poe2db-cast-speed-weight/)
