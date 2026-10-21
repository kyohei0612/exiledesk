---
title: PoE2 Mana Ring Craft: Five Targets Cost 1,991 div
description: We ran a PoE2 mana Gold Ring (maximum Mana %, maximum Mana T1, Cast Speed, all Resistances T1, Mana Regeneration T1) 300 times on the engine. It costs 1,991 div per ring and finishes 64% of the time; loosening two targets to T2+ brings it to 643 div.
date: 2026-10-22
tags: Gold Ring, maximum Mana, Perfect Essence, Neural Catalyst, expected cost
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
A PoE2 mana ring craft with five targets (maximum Mana % and maximum Mana T1 as prefixes; Cast Speed T2+, all Elemental Resistances T1 and Mana Regeneration Rate T1 as suffixes) **costs about 1,991 Divine Orbs (div) per ring, and only 64% finish within a 2,000 div cap per run**. Loosening Resistances and Mana Regeneration to T2+ brings it down to 643 div with 95% finishing.

Three Gold Ring suffixes can be done for 220 div per ring with the right method ([Don't Hoard Your Misses](/en/blog/dont-hoard-misses/)). Going to five targets should maybe double that at most, right?

But with a mana setup on the engine, the cost jumped by an order of magnitude.

And only 64% finished within the cap.

:::summary What you'll learn
- Five targets (including Resistances T1 and Mana Regeneration T1) with essence after cost about 1,991 div per ring, 64% finished
- Loosening Resistances and Mana Regeneration to T2+ brings it to 643 div, 95.3% finished (about a third of the cost)
- Essence first costs 4,942 div, 33.3% finished; maximum Mana % was lost 67 times per ring
- Without Catalysts + the Catalysing Omen, no Exalted Orb type finishes more than 10%
:::

## The Ring and the Method

- A Rare Gold Ring, Item Level 82, with a Fractured Spell Mana Cost Efficiency T1 prefix (Calculating, a Genesis Tree mod).
- Maximum Mana % is "(4–6)% increased maximum Mana" from the Perfect Essence of the Mind (not in the normal pool).
- Method: annul misses at once. Suffixes are aimed in the order Cast Speed → Resistances → Mana Regeneration with 20 Catalysts (20% Quality) + Omen of Catalysing Exaltation + Omen of Dextral Exaltation + Perfect Exalted Orb. Catalysts: Skittering for Cast Speed, Tul's for Resistances, Neural for the mana mods.
- Once the suffixes are done, Omen of Sinistral Crystallisation + Perfect Essence of the Mind adds maximum Mana %, then maximum Mana T1 is aimed with Neural Catalysts + Catalysing + Sinistral + Perfect (essence after). We also tried adding the Essence right after fracturing (essence first).

## Results: Five Targets Cost 1,991 div, 64% Finish

:::chart bar Cost per ring (div, 300 engine runs each)
unit: div
labels: Essence after, Essence first, Essence after at T2+
Cost per ring: 1991, 4942, 643
:::

| Method | Finished | Cost per ring | Average of finishers | Perfect Exalted Orbs |
|---|---:|---:|---:|---:|
| Essence after | 64.0% | **1,991 div** | 865 div | 128 |
| Essence first | 33.3% | 4,942 div | 936 div | 143 |
| Essence after, Resistances and Mana Regen at T2+ | **95.3%** | **643 div** | 545 div | 84 |

"Cost per ring" is everything spent, including runs that hit the cap, divided by the number finished.

### Essence first keeps losing maximum Mana %

With essence first, maximum Mana % becomes the only non-Fractured mod. Chaos Orbs are off the table, since they would always remove it.

On top of that, every Annulment can take it out too. It was lost 67 times per ring.

## The Weight Is Resistances T1 and Mana Regeneration T1

From Fractured + maximum Mana %, one use of 20% Catalyst + Catalysing + side Omen + Perfect Exalted Orb lands (20,000 tries on the engine):

| Target | Per try |
|---|---:|
| Cast Speed T2+ | 24.77% |
| all Resistances T1 | 7.13% |
| Mana Regeneration T1 | 9.81% |
| maximum Mana T1 | 11.81% |
| all Resistances T2+ (loosened) | 14.47% |
| Mana Regeneration T2+ (loosened) | 19.65% |

Resistances T1 and Mana Regeneration T1 don't reach 10%. Misses get annulled, and those Annulments hit targets already in place.

Every target was lost and restarted from Chaos Orbs 45 times per ring. Perfect Exalted Orbs (about 2.9 div each) ran to 128, and re-adding Skittering Catalysts for Cast Speed cost 228 div.

:::tip Loosen to T2+ for about a third
At T2+, both odds roughly double and full restarts drop to 25, cutting the cost to about a third.
:::

## Without Catalysts It Almost Never Finishes

Without Catalysts and the Catalysing Omen, aiming with plain Dextral / Sinistral Exaltation almost never finished within 2,000 div, whatever the Exalted Orb:

| Plain Exalted Orb | Finished | Cost per ring |
|---|---:|---:|
| Exalted Orb | 1.0% | about 200,000 div |
| Greater | 10.0% | about 19,000 div |
| Perfect | 8.3% | about 23,000 div |

A mana ring like this depends on Catalysts + the Catalysing Omen.

:::note The Catalysing multiplier is not cross-checked
The Catalysing Omen multiplier follows Craft of Exile's formula. It has not been compared with Craft of Exile or in-game results. The Perfect Essence of the Mind price is also the server's value, which differs from poe2db's trade rate (0.1 to 2.6 div per ring).
:::

## Where the Numbers Come From

- The ExileDesk engine, 300 runs per method, capped at 2,000 div per run. Per-try odds: 20,000 tries.
- Market: ExileDesk server (2026-10-20 16:00 UTC; 1 Divine Orb = 696.93 Exalted Orbs). The Perfect Essence of the Mind uses the server's 26.5 Exalted Orbs, which differs from poe2db's trade rate, but it only accounts for 0.1 to 2.6 div per ring.
- The Catalysing Omen multiplier follows Craft of Exile's formula. Not compared with Craft of Exile or in-game results.

## Try It Yourself

You can try the mana targets one craft at a time on a [Gold Ring on the crafting bench](/?base=Gold%20Ring). To compare the order of moves, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Omen of Catalysing Exaltation multiplier](/en/blog/catalysing-exaltation-multiplier/)
