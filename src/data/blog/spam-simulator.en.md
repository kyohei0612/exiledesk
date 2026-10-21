---
title: PoE2 Spam Simulator: Augment, Chaos or Exalt Spam?
description: How the PoE2 spam simulator works: pick one target mod and it runs augment, chaos and exalt spam at Perfect, Greater and Regular grades, 100 runs each, to find the cheapest route. Plus how to read the results and the luck test that shows your rank among the 100.
date: 2026-10-22
tags: spam simulator, Orb of Augmentation, Chaos Orb, Exalted Orb, luck
image: img/spam-simulator-og.en.png
ready: true
draft: true
---
The ExileDesk **poe2 spam simulator** takes one target mod and **runs augment, chaos and exalt spam at all three grades (Perfect, Greater and Regular), 100 runs each, to see which gets there cheapest.** The cheapest route gets a "Cheapest" tag, and a luck test lets you spam that route yourself to see where you rank among the 100.

:::zundamon normal
I just want one mod. But should I use augment, chaos or exalt spam?
:::

:::metan normal
And each orb comes in Regular, Greater and Perfect. The prices and the odds all differ.
:::

:::zundamon troubled
That's way too much to compare in my head...
:::

:::metan happy
So ExileDesk runs all nine options, 100 times each, on the same engine as the Emulator.
:::

:::summary What you'll learn
- The spam simulator answers one question: which spam, at which grade, reaches this one mod cheapest
- Read the results by more than the average: the half and 90% marks, and how many times the cheapest route it costs
- The luck test shows your rank among the 100, and you can share it on X or use "Continue from here"
:::

:::tip New to this? Words used here
- **Spam**: using the same currency over and over until the target lands
- **Grade**: the tier of a currency: Regular, Greater or Perfect
- **Route**: which spam you use to chase the target: augment, chaos or exalt
- **Half / 90% marks**: line up the runs that hit by cost; these are the costs by which half, and nine in ten, have finished
- **Luck test**: spam it yourself and see what top percent your luck lands in among the 100
- **Continue from here**: a button that takes your current item into the Emulator
:::

## What Does the Spam Simulator Compare?

You target one mod. That one mod is spammed on three routes at three grades.

:::zundamon normal
Only one mod? Can I pick the tier too?
:::

:::metan normal
Yes. You can set a tier, such as T1 or better.
:::

:::zundamon normal
Can I compare with a rune socketed?
:::

:::metan normal
You can. There's Serle's Triumph (+1 suffix slot), and runes with special mods, like Kolr's Hunt.
:::

:::metan happy
You can target those special mods too (v0.1.578).
:::

:::zundamon surprised
Does it start calculating as soon as I pick a target?
:::

:::metan normal
Not right away. Press "Start" to run it, and the same button stops it mid-run (v0.1.579).
:::

| Route | Starting item | How it spams | What happens |
|---|---|---|---|
| Augment spam | White base | Make it Magic with an Orb of Transmutation. If the target side is free, use an Orb of Augmentation; if a non-target mod is there, use an Orb of Annulment | Augment and Annul repeat until the target lands |
| Chaos spam | Rare with one mod | Chaos Orb until the target lands | One mod goes, one comes, so it stays at one mod |
| Exalt spam | Rare with no mods | An Omen makes the Exalted Orb add two mods | On a miss, Annul twice back to zero and try again |

Every route runs its currency at all three grades: Perfect, Greater and Regular.

:::zundamon normal
Does it count the white base, or the cost of making the starting Rare?
:::

:::metan normal
No. Those are the same for every route, so they're left out of the comparison.
:::

:::zundamon troubled
Are there bases where augment spam doesn't work?
:::

:::metan normal
Yes, when the Magic item has no room on the target side. Then augment spam shows as unavailable.
:::

## How to Read the Results: Don't Stop at the Average

When the run finishes, each route and grade shows its numbers. The key is not to look at the average alone.

| Number shown | What it means | Why it matters |
|---|---|---|
| Average cost and average uses | The average of the runs that hit | A guide to the cheapest route |
| Half and 90% marks | Runs that hit, lined up by cost: the cost by which half, and nine in ten, finished (runs that never hit are left out) | Tells you how bad an unlucky session can get |
| Times the cheapest | The cheapest counted as 1, shown as "× n.n" | Shows the gap between routes at a glance |
| Currency used per run | The average count of each currency | Tells you what to stock up on, and how much |

:::zundamon normal
Which one gets the "Cheapest" tag?
:::

:::metan normal
The route with the lowest average cost. In the luck test's grade tabs, that route's cheapest grade is marked "Best".
:::

:::zundamon happy
So I only need the average!
:::

:::metan troubled
That's the trap. The average and the half mark can be far apart.
:::

| Glove example (0.32% per use) | Chaos Orbs | What it tells you |
|---|---:|---|
| Average | 313 | Everyone evened out |
| Half of runs | 216 | Half finish with fewer than this |
| 1 in 10 | 718 or more | Bad luck costs far more than the average |

:::zundamon surprised
One in ten needs 718 or more?!
:::

:::metan normal
Spam has a long tail. This example comes from [chaos spam odds](/en/blog/chaos-spam-odds/).
:::

:::metan normal
So check the 90% mark too, and know what an unlucky session will cost.
:::

:::zundamon normal
What if no run hits at a grade?
:::

:::metan normal
If none hits within the use cap, it says that grade may not be able to roll that tier.
:::

:::metan normal
It's a hint that some grades can't reach some tiers.
:::

## Luck Test: Where Would You Rank Among 100?

You can spam the cheapest route yourself. Other routes and grades work too.

:::zundamon happy
I get to spam it myself! How does it work?
:::

:::metan normal
Hold to spam, and release to stop.
:::

:::metan normal
When the target lands, you see where you placed among the 100.
:::

:::zundamon normal
Do I start from the same item as the 100?
:::

:::metan normal
Your start is made by the same rule as theirs. The randomness is separate, so on the chaos route your one starting mod differs.
:::

| Device | Runs per option | How your rank is shown | Special effect |
|---|---:|---|---|
| PC | 100 | Top n% among the 100 | Exceptional luck (top 10%) gets a copper-toned effect and a sound |
| Phone | 10 | "#n of 11" instead of a percentage | Only for 1st place |

:::zundamon normal
Fewer runs on phones?
:::

:::metan normal
Each option uses 10 runs to keep it light (v0.1.579). That's why it shows a place, not a percentage.
:::

:::zundamon troubled
How are runs that never hit counted?
:::

:::metan normal
They count as slower than you.
:::

:::tip Keep crafting from the hit
"Continue from here" takes the item you hit straight to the Emulator. You can finish the other mods on the crafting bench (the luck-test uses aren't added to the steps).
:::

### Share on X and Friends Can Race the Same 100

You can share your luck test result on X.

:::zundamon normal
Does whoever opens the link have to wait for the calculation again?
:::

:::metan happy
No wait. The link carries the finished results, so they can race the same 100 right away (v0.1.579).
:::

:::note fold Not yet verified (3)
- Costs here are results from the ExileDesk engine and ExileDesk's market prices. They haven't been checked against Craft of Exile or in-game results.
- The 100 runs use fresh randomness each time. "Recompute" runs a different 100, so the numbers shift a little.
- When two routes are close, recompute a few times and see whether the order holds.
:::

## How It Differs From the Old Chaos Spam Calculator

The spam simulator is a rebuild of the old chaos spam calculator.

:::zundamon normal
What did the old calculator do?
:::

:::metan normal
In v0.1.534, it ran the Chaos Orb at Regular, Greater and Perfect, and picked the cheapest.
:::

:::zundamon normal
So what's different now?
:::

:::metan normal
In v0.1.578 we added augment and exalt spam as routes. We also added the luck test and runes, and made it the spam simulator.
:::

:::zundamon troubled
Do the old calculator's share links still open?
:::

:::metan happy
Don't worry. They open in the spam simulator.
:::

The spam simulator compares nine ways to chase one mod, 100 runs each. Put the average next to the 90% mark, and pick the route that suits you.

## Where the Numbers Come From

:::fold Show sources (3)
- 100 runs each, nine options, 10 runs on phones, the luck effect (top 10% on PC, 1st place on phones): ExileDesk release notes (changelog-notes-en.json, v0.1.578 and v0.1.579) and our spam simulator notes (engine).
- Average 313, half 216, 1 in 10 at 718 orbs: calculated from 0.32% per use in [Chaos Spam Odds](/en/blog/chaos-spam-odds/) (engine plus calculation).
- No per-route cost example is given here. Results vary a lot with the target and base, so run your own.
:::

## Try It Yourself

On the [crafting bench](/?base=Gold%20Ring), open the spam simulator from the button by the Currency heading, pick one target mod and press "Start" to see all nine costs.

**Related posts**

- [PoE2 chaos spam odds: how many orbs at 0.3% per try](/en/blog/chaos-spam-odds/)
- [PoE2 crafting cost variance: average, median and unlucky 10%](/en/blog/crafting-cost-variance/)

VOICEVOX: Zundamon / Shikoku Metan
