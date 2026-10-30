---
title: PoE2 Ring Catalysts: Go Resists First with Greater Exalts
description: On a PoE2 Gold Ring, Tul's Catalyst + Greater Exalt when only Rarity is on cut the cost from ~200 to 177-180 div. Cost per hit: ~20 vs ~3.5 div.
date: 2026-11-07
tags: Gold Ring, catalyst, Omen of Catalysing Exaltation, Greater, expected cost
craft: /?base=Gold%20Ring
ready: true
draft: true
---
When crafting suffixes on a PoE2 Gold Ring, **switching the craft used when only Rarity is on to "Tul's Catalyst + Greater Exalted Orb, going for resistances first" cut the cost from about 200 div to 177-180 div per ring** (10,000 runs each, about 10% cheaper). Omen of Catalysing Exaltation uses up the catalyst quality every time, and our reading is that a cheap catalyst with a Greater Exalt wins because it brings the cost per hit down from about 20 div to about 3.5 div.

:::zundamon normal
Rarity's on, so next is Cast Speed. Skittering Catalyst and a Perfect Exalt, let's go!
:::

:::metan normal
That's how we used to do it. But changing just this one step turned out cheaper.
:::

:::zundamon surprised
A Perfect Exalt hits more often, but a Greater one is cheaper?
:::

:::metan happy
It's hit rate times the price of each try. We changed only this one step and compared 10,000 runs each.
:::

:::summary What you'll learn
- Switching the "Rarity only" step to Tul's + Omen of Catalysing Exaltation + Omen of Dextral Exaltation + **Greater** Exalt takes a ring from **about 200 div to 177-180 div**
- Cost per hit: about 20 div with the old step (Skittering + Perfect), about 3.5 div with the new one (Tul's + Greater)
- Making other steps Greater too makes it more expensive (all Greater: 258 div)
- Using the "optimal" moves from a dynamic programming table as-is came out worse. Checking one change at a time in the engine mattered
:::

:::tip New to this? Words used here
- **Omen of Catalysing Exaltation**: makes mods matching your catalyst quality more likely. Quality drops to 0 after use
- **Tul's Catalyst**: adds quality for cold mods. It also works on All Elemental Resistances (in the ExileDesk engine)
- **Skittering Catalyst**: adds quality for speed mods. It works on Cast Speed
- **Greater / Perfect**: stronger Exalted Orbs with a Minimum Modifier Level (35 and 50) that blocks low tiers
- **Omen of Dextral Exaltation**: makes an Exalted Orb add a suffix only
:::

## The Ring and the Old Rules

| Item | Details |
|---|---|
| Base | Gold Ring, item level 82 |
| Prefix | Spell Damage T2, fractured |
| Targets (suffixes) | Rarity T1, Cast Speed T2+, All Elemental Resistances T2+ |

The old rules:

| Current item | Craft |
|---|---|
| 0 targets | Chaos Orb |
| Junk landed | Plain Annul right away |
| No Rarity | Omen of Dextral Exaltation + Greater Exalted Orb |
| Has Rarity | Catalyst (20% quality) + Omen of Catalysing Exaltation + Omen of Dextral Exaltation + Perfect Exalted Orb |

With only Rarity on, the old rules went for Cast Speed with a Skittering Catalyst.

## Change One Step, Save About 10%

We changed only the craft used when the ring has Rarity and nothing else (no junk), kept everything else the same, and ran 10,000 rings each.

| Rules | Seed 1 | Seed 2 | Difference |
|---|---:|---:|---|
| Old rules | 200.4 div | 197.3 div | Baseline |
| With Rarity only: **Tul's + Catalysing + Dextral + Greater Exalt** | **177.3 div** | **179.7 div** | About 18-23 div (about 10%) cheaper |

Starting from a half-done ring (Cast Speed + one junk mod) gave 177.0 div (seed 1) and 180.1 div (seed 2), the same direction.

:::zundamon surprised
One step saves about 20 div!
:::

## Why Greater Is Cheaper Here

Omen of Catalysing Exaltation uses up the quality, so you put in 20 catalysts every time. We counted 20,000 single crafts from the "Rarity only" ring.

| Craft | Cost per try | Target hit rate | Cost per hit | What lands |
|---|---:|---:|---:|---|
| Skittering + Perfect Exalt (old) | 6.03 div | 29.5% | About 20 div | Cast Speed |
| Tul's + Greater Exalt (new) | 0.47 div | 13.6% | About 3.5 div | Mostly All Elemental Resistances |

The 70-90% of tries that miss (about 70% for the old step, about 86% for the new one) get annulled the same way in both cases.

:::zundamon normal
Less than half the hit rate, but each try is about 13 times cheaper.
:::

:::metan normal
Right. Tul's Catalysts and Greater Exalts are both cheap, so a miss barely hurts. We think Perfect Exalts and Skittering Catalysts were just too expensive per try.
:::

## Making Other Steps Greater Costs More

We also changed other steps (seed 1, 10,000 runs). The last four rows (Cast Speed only, Resistances only) were changed on top of the Rarity-only change.

| Change | Per ring | How to read it |
|---|---:|---|
| Tul's + Greater with Rarity only (above) | **177.3 div** | Cheapest |
| Plus Greater on the two-target steps | 225.8 div | More expensive |
| Greater on every catalyst step | 258.2 div | Even more |
| Tul's + Greater with Cast Speed only | 185.7 div | More than 177.3 |
| Tul's + Perfect with Cast Speed only | 244.1 div | Expensive |
| Skittering + Greater with Resistances only | 228.6 div | Expensive |
| Skittering + Perfect with Resistances only | 257.0 div | Expensive |

:::metan normal
Making both two-target steps Greater cost 225.8 div, more. Our reading: Perfect only rolls tiers at modifier level 50 and above, and with the catalyst multiplier the hit rate gets big.
:::

### We Didn't Use the "Optimal" Table As-Is

This change was a candidate from dynamic programming, which works backward to find the cheapest next craft for every item state. But running all of the table's "optimal" moves together in the engine cost 213.6 div, more than the old rules run in the same check (200.8 div).

| How the table was built | Table's answer | Running it in the engine |
|---|---:|---:|
| 40 crafts per state and move | 96 div | 355-365 div |
| 3,000 crafts per state and move | 190.2 div | 213.6 div with all "optimal" moves |

:::zundamon troubled
The math and the runs are that far apart?
:::

:::metan troubled
With 40 tries, an outcome that happens 1-2% of the time shows up as 0% or 2.5%. The table picked moves that just got lucky and became too optimistic. Even at 3,000, the gaps between moves (0.1-2.6 div) were smaller than the noise in the table.
:::

So we treated the table's picks as candidates and checked each one in the engine. The 177 div step above is one that passed.

:::tip When using Omen of Catalysing Exaltation
Compare cost per hit: the price of one try (20 catalysts + omen + Exalt) against the hit rate. If a target that's easy to hit with a cheap catalyst is still open, taking it first can be cheaper.
:::

:::note fold What we haven't checked (3)
- Costs come from the engine, not from crafting hundreds of rings in the live game. Single-craft odds were checked against Craft of Exile earlier and matched within the margin.
- Prices are ExileDesk market prices (2026-10-21 17:00 UTC, 1 div = 807.07 exalts). If catalyst or Perfect Exalt prices move, the cheaper option can flip.
- We only broke down why Greater wins into cost per try and hit rate. Prefixes and Desecration are not included.
:::

On a Gold Ring with only Rarity on, going for resistances first with Tul's Catalyst + Greater Exalt made each ring about 10% cheaper. Of the changes we checked, this was the only one that came out cheaper.

## Where the Numbers Come From

:::fold Show sources (3)
- Costs per change, cost per try and hit rate, and the table vs engine gap: analyst notes docs/org/math/notes/2026-10-22-gold-ring-suffix-dp.md, script scripts/analysis/gold-ring-suffix-dp.mjs (10,000 runs, 2 seeds; 20,000 single crafts for the per-try comparison). Engine
- Single-craft odds checked against Craft of Exile: docs/org/math/notes/2026-10-23-coe-odds.md. Engine, Craft of Exile
- Prices: ExileDesk market prices (2026-10-21 17:00 UTC). Market
:::

## Try It Yourself

Pick a Gold Ring on the ExileDesk [crafting bench](/?base=Gold%20Ring) and compare the odds with different catalysts and Exalt tiers.

**Related posts**

- [PoE2 Catalysing Exaltation Multiplier: No One Knows It](/en/blog/catalysing-exaltation-multiplier/)
- [PoE2 Energy Shield Gloves Craft: Greater Exalt Beats Perfect](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Restart a Half-Done Ring? The Gap Is Small Either Way](/en/blog/restart-or-continue/)

VOICEVOX: Zundamon / Shikoku Metan
