---
title: PoE2 Spam Simulator: Augment, Chaos or Exalt Spam?
description: How the PoE2 spam simulator works: pick one target mod and it runs augment, chaos and exalt spam at Perfect, Greater and Regular grades, 100 runs each, to find the cheapest route. Plus how to read the results and the luck test.
date: 2026-10-22
tags: spam simulator, Orb of Augmentation, Chaos Orb, Exalted Orb, luck
image: img/spam-simulator-og.en.png
draft: true
---
The ExileDesk **poe2 spam simulator** answers one question: for a single target mod, **which spam is cheapest: Orb of Augmentation, Chaos Orb or Exalted Orb, and at which grade (Perfect, Greater or Regular)?** It runs all nine combinations 100 times each, tags the cheapest as "Cheapest", and lets you take a luck test to see where you'd rank among those 100.

If you want one specific mod, the options pile up fast. Augment spam on a Magic item, chaos spam on a Rare, or exalt-and-annul on an empty Rare, and each orb comes in three grades with different prices and different odds.

Rather than guess, we let the same engine that powers the Emulator do the work, one currency use at a time, and lay the costs side by side.

:::summary What you'll learn
- The question the spam simulator answers: which spam and grade reaches one target mod cheapest
- How each of the three routes (augment, chaos, exalt) starts and what it repeats
- How to read the results: average cost, the half-way and 90% marks, and "times the cheapest"
- The luck test: your rank among the 100, sharing on X, and "Continue from here"
:::

## What Does the Spam Simulator Compare?

You target **one** mod, with a minimum tier if you like. You can also compare with runes socketed, such as Serle's Triumph (+1 suffix slot) or a special-mod rune like Kolr's Hunt, whose special mods you can target too (v0.1.578).

Picking a target doesn't start the calculation by itself. Press "Start" to run it; the same button stops it mid-run (v0.1.579).

Three routes are compared, each at the Perfect, Greater and Regular grade of its main orb:

| Route | Starting item | What it repeats |
|---|---|---|
| Augment spam (Orb of Augmentation) | White base | Make it Magic with an Orb of Transmutation. If the target side is free, Augment; if a non-target sits there, Annul. Repeat until the target lands |
| Chaos spam (Chaos Orb) | Rare with one mod | Chaos Orb until the target lands (one mod out, one in, so it stays at one mod) |
| Exalt spam (Exalted Orb) | Rare with no mods | An Omen makes the Exalted Orb add two mods; on a miss, Annul twice back to zero and repeat |

The white base and the cost of making the starting Rare are the same for every route, so they are left out. If a base has no room on the target side as a Magic item, augment spam shows as unavailable.

## How to Read the Results: Don't Stop at the Average

When the run finishes, each route and grade shows:

- **Average cost and average uses** among the runs that hit.
- **Half and 90%**: the cost by which half, and nine in ten, of the runs that hit finished (runs that never hit are left out).
- **Times the cheapest**: a "× n.n" ratio against the cheapest route.
- **Currency used per run**, on average, by type.

The route with the lowest average cost gets the "Cheapest" tag. In the luck test, the grade tabs mark that route's cheapest grade as "Best".

The average and the half-way mark can sit far apart. In our [chaos spam odds](/en/blog/chaos-spam-odds/) glove example, a 0.32% target averaged 313 orbs, yet half of the runs finished within 216, while one in ten needed 718 or more. Spam has a long tail, so the 90% figure tells you how bad an unlucky session can get.

If no run hits within the use cap, that grade is flagged as possibly unable to roll that tier, a useful hint when a grade can't reach the tier you picked.

## Luck Test: Where Would You Rank Among 100?

On the cheapest route, or any route and grade you choose, you can spam yourself. Hold to spam, release to stop. When the target lands, you see **your rank among the 100 runs**. Your start is built by the same rule with fresh randomness, so on the chaos route your one starting mod differs from theirs.

On PC (100 runs), exceptional luck (top 10%) gets a copper-toned effect and a sound. Runs that never hit count as slower than you.

On phones, each route is compared with 10 runs to keep it light (v0.1.579), so your result is shown as a place, such as "#n of 11", rather than a percentage, and the special effect appears only for 1st place.

:::tip Keep crafting from the hit
"Continue from here" takes the item straight to the Emulator so you can finish the other mods on the crafting bench (the luck-test uses aren't added to the steps).
:::

### Share on X and Friends Can Race the Same 100

You can share a luck test on X. The link carries the finished results, so whoever opens it can take the luck test right away against the same 100 runs, without recalculating (v0.1.579).

:::note What isn't verified
Costs come from the ExileDesk engine and ExileDesk's own market prices. They haven't been checked against Craft of Exile or in-game results. The 100 runs use fresh randomness each time, so "Recompute" gives a slightly different set. When two routes are close, recompute a few times and see whether the order holds.
:::

## How It Differs From the Old Chaos Spam Calculator

The spam simulator replaces the earlier chaos spam calculator. In v0.1.534, that calculator ran the Chaos Orb at its regular, Greater and Perfect grades and picked the cheapest (a request from YouTube).

In v0.1.578 we widened it to augment and exalt spam, added the luck test and runes, and folded the calculator into the spam simulator. Old calculator share links now open the spam simulator.

## Where the Numbers Come From

- 100 runs each, nine combinations, 10 runs on phones, the luck effect (top 10% on PC, 1st place on phones): ExileDesk release notes (changelog-notes-en.json, v0.1.578 and v0.1.579) and our spam simulator notes (engine).
- 313 / 216 / 718 orbs: calculated from 0.32% per try in [Chaos Spam Odds](/en/blog/chaos-spam-odds/) (engine plus calculation).
- No per-route cost example is given here; results depend heavily on the target and base, so run your own.

## Try It Yourself

Open the [spam simulator](/?page=routes), pick one target mod and press "Start" to see all nine costs. It's also reachable from the button next to Currency.

**Related posts**

- [PoE2 chaos spam odds: how many orbs at 0.3% per try](/en/blog/chaos-spam-odds/)
- [PoE2 crafting cost variance: average, median and unlucky 10%](/en/blog/crafting-cost-variance/)
