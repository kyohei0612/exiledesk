---
title: PoE2 Crafting Calculator Mistakes: 3 Bugs We Caught
description: Three mistakes we found in our own PoE2 crafting expected-cost calculation: a biased random generator (68 div), the wrong minimum modifier level for Transmutation and Augmentation (magic cost doubled), and a desecration marker that put us 24% off the engine. What went wrong, how we noticed, and how we fixed it.
date: 2026-10-22
tags: expected cost, calculation, random numbers, minimum modifier level, correction
image: img/crafting-calculator-mistakes-og.en.png
ready: true
draft: true
---
When you work out PoE2 crafting costs by calculation, **a small slip in how the calculation is built turns straight into a wrong number**. In our ExileDesk test calculation, a biased random generator gave 68 div (div = Divine Orb), using the Exalted Orb's minimum modifier levels for Transmutation and Augmentation doubled the magic-item cost, and the way we tracked a desecration marker put us 24% off the engine.

:::zundamon normal
Once you build the formula, an expected-cost calculation gives the right number, right?
:::

:::metan troubled
We thought so too. But every time we replayed it on the engine, the numbers were off.
:::

:::zundamon surprised
So the problem was in the calculation!?
:::

:::metan normal
Yes. All three were mistakes you'd never notice from the answer alone.
:::

:::summary What you'll learn
- A simple random generator was biased and the same calculation gave 68 div. With mulberry32: 61.9 div calculated, 58.7 div on the engine
- We used the Exalted Orb's 35 and 50 as the minimum modifier levels for Transmutation and Augmentation (really Greater 44, Perfect 70), and estimated the magic-item cost at double
- We kept the desecration marker after its target was removed, and drifted 24% from the engine. You can't see a calculation's mistakes unless you put it next to the engine
:::

:::tip New to this? Words used here
- **Expected cost**: the average cost per item if you craft it many times
- **div**: Divine Orb, the price unit in this post
- **Engine**: ExileDesk's system that plays out a craft one currency at a time
- **Minimum Modifier Level**: a floor; tiers below this modifier level can't roll
- **Desecration marker**: a flag the calculation keeps to remember "there is a Desecrated mod"
- **Random numbers**: arbitrary numbers used to decide hits and misses
:::

## Mistake 1: A Biased Random Generator Gave 68 div

On 2026-10-20 and 21 we tested working out, backward, the expected cost to finish a pair of Intelligence gloves (suffix: +2 to Level of all Projectile Skills). The first thing that tripped us up was the random generator.

:::zundamon normal
Why does an expected-cost calculation need random numbers?
:::

:::metan normal
Evaluated as is, rare paths that go round in circles inflated the values.
:::

:::metan normal
So inside the calculation we follow crafts one run at a time, with a cap on how often the same move can repeat.
:::

:::zundamon normal
And those runs use random numbers.
:::

:::metan troubled
Right. With our first, simple generator (a linear congruential generator), the top order came out at 68 div.
:::

| Counted with | Cost of the top order | What happened |
|---|---:|---|
| Calculation (simple generator) | 68 div | Biased numbers, too high |
| Calculation (mulberry32) | 61.9 div | Dropped just by swapping the generator |
| Engine (1,000 runs) | 58.7 div | The played-out value |

:::zundamon surprised
Same calculation, and the generator alone moved the number!
:::

:::metan normal
Our calculation rules now say: use mulberry32, because linear congruential generators are biased.
:::

## Mistake 2: Transmutation and Augmentation Floors Aren't the Exalted Orb's

Starting from a white base, the first half makes a magic item with Orbs of Transmutation and Augmentation. Their Greater and Perfect versions have a minimum modifier level for the mods they add.

:::zundamon normal
Isn't the floor the same for every orb?
:::

:::metan troubled
Our first calculation used the Exalted Orb's Greater 35 and Perfect 50. But the real values are different.
:::

| Orb | Greater | Perfect | What's different |
|---|---:|---:|---|
| Exalted Orb | 35 | 50 | Our first calculation used these for Transmutation and Augmentation too |
| Orb of Transmutation / Augmentation | **44** | **70** | The real floors, higher than the Exalted Orb's |

:::zundamon normal
What goes wrong if the floor is too low?
:::

:::metan normal
Low tiers of the target family count as possible, so hits look rarer in the calculation.
:::

:::metan troubled
So we estimated the magic-item cost at double. The earlier "about 580 div per restart" is too high by that much.
:::

:::zundamon normal
How did you fix it?
:::

:::metan normal
The engine keeps the floors in `CURRENCY_FLOOR`, with separate values for Transmutation and Augmentation. We matched the calculation to them.
:::

## Mistake 3: A Desecration Marker Put Us 24% Off

The test kept "is there a mod added by Desecration" as a marker in each state. Only one marker was allowed, and with a marker present, bones couldn't be used.

:::zundamon normal
What was wrong with the marker?
:::

:::metan troubled
After a desecrated target was removed with an Orb of Annulment, we kept the marker.
:::

:::metan normal
Then bones counted as unusable, and it chose a path of Exalted Orbs and Annulments over and over.
:::

| Times +2 Projectile was removed (per run) | Times | What happened |
|---|---:|---|
| Calculation | 1.02 | The leftover marker caused repeated Annulments |
| Engine | 0.45 | The played-out value |

:::zundamon surprised
The calculation removed the target more than twice as often!
:::

:::metan normal
So the marker now also records which target came from Desecration, and disappears when that target is removed.
:::

For one of the target orders, here is the calculation next to the engine.

| Cost per item, one order | Calculation | Engine | Gap | Result |
|---|---:|---:|---:|---|
| Before the fix | 109 div | 83 div | 24% | Calculation far too high |
| After the fix | 70.5 div | 65.1 div | 6-8% | Gap shrank |

:::zundamon normal
The costs themselves are very different before and after.
:::

:::metan normal
Runes are handled differently. The "after" figures exclude 10.8 div of runes, so compare the gap, not the totals.
:::

:::metan troubled
Even after the fix, a 6-8% gap remains, always with the engine cheaper.
:::

### The same kind of mistake, once more

Handing the calculated answer to the engine tripped on the marker too.

:::zundamon normal
It's just handing it over. What happened?
:::

:::metan normal
The engine can't see which target came from Desecration. So we told it "if Speed is there, the desecrated mod is Speed."
:::

:::metan troubled
It then kept removing a Speed mod that had come from a Chaos Orb, looping 280 times per run.
:::

:::zundamon normal
How did you fix that?
:::

:::metan normal
We now pass the marker answer that the calculation's own runs went through most often.
:::

## How We Caught Them: Calculation Next to Engine

On their own, all three gave plausible numbers. We caught them because we replayed the calculation's best moves on the engine, 1,000 runs at a time, and lined the numbers up.

:::zundamon normal
Did playing it on the engine show anything else?
:::

:::metan normal
Yes, more mistakes on the calculation side. Omens that pick a side, such as Omen of Sinistral / Dextral Crystallisation, can't be used unless that side has a removable mod.
:::

:::metan normal
A Perfect Essence also needs a removable mod. Only a Rare with zero mods takes it without losing one.
:::

:::zundamon normal
Do you do anything to stop endless loops?
:::

:::metan normal
At the start of the test, the owner told us automated expected-cost calculations bug out easily and should have caps.
:::

:::metan normal
So re-adding a mod is capped at 3,000 times, and everything else at 300.
:::

:::zundamon happy
So now you never stop at the calculation.
:::

:::metan happy
Right. Rule number one of our calculation work: show every calculated number next to the engine's result, with the gap in %.
:::

:::note fold Not yet verified (4)
- This is about a **calculation experiment** that decides crafting moves automatically. Deciding moves automatically is not a feature of the site (there are too many branches; the owner decided against it on 2026-10-21).
- We don't yet know what causes the 6-8% gap left after fixing Mistake 3.
- The "double" in Mistake 2 is the recorded estimate. We haven't recomputed the restart cost after the fix.
- The subject was one pair of gloves. We haven't checked whether other item types show gaps of the same size.
:::

:::tip Using an expected-cost calculator
A Greater or Perfect orb's minimum modifier level depends on which orb it is. Before trusting a calculator's number, play the same method a few dozen times on a step-by-step tool and check that the average lands close.
:::

Expected-cost calculations drift from small details like the random generator, the floors and a marker. Lining them up with played-out numbers is the quickest way to catch the mistakes.

## Where the Numbers Come From

:::fold Show sources (6)
- 68 and 61.9 div (random generator), 109 and 70.5 div and 1.02 removals (desecration marker): values from the ExileDesk calculation experiment, 2026-10-20 to 21 (**calculation**).
- 58.7 div (random generator), 83 and 65.1 div and 0.45 removals (desecration marker), the 280-time loop: 1,000 engine runs of the calculation's answers (**engine**). The 24% and 6-8% figures are the gaps between the two.
- Prices from the 2026-10-21 market (1 div = 718 Exalted Orbs).
- Transmutation / Augmentation floors (Greater 44, Perfect 70) and Exalted Orb floors (35, 50): the engine's `CURRENCY_FLOOR` (**engine**).
- Magic-item cost doubled, restart about 580 div: the experiment's notes (**estimate**; not recomputed after the fix).
- The mulberry32 rule and the "line it up with the engine" rule: ExileDesk's calculation rules (docs/org/math/README.md).
:::

## Try It Yourself

Play a craft one step at a time on the [crafting bench](/), or compare Chaos, Augmentation and Exalted spam in the [spam simulator](/?page=routes).

**Related posts**

- [PoE2 crafting expected cost: the cheapest move skips Omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 crafting cost variance: average, median and unlucky 10%](/en/blog/crafting-cost-variance/)
- [PoE2 Greater vs Perfect orb difference: min mod levels](/en/blog/greater-perfect-orb-difference/)

VOICEVOX: Zundamon / Shikoku Metan
