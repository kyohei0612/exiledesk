---
title: PoE2 Crafting Calculator Mistakes: 3 Bugs We Caught
description: Three mistakes we found in our own PoE2 crafting cost calculation: a biased random generator (68 div), the wrong minimum modifier level for Transmutation and Augmentation (magic cost doubled), and a desecration marker that skewed results by 24%.
date: 2026-10-22
tags: expected cost, calculation, random numbers, minimum modifier level, correction
draft: true
---
PoE2 crafting calculator mistakes are easy to make and hard to see: **a small slip in how the calculation is built turns straight into a wrong number**. In our own test calculation, a biased random generator gave 68 Divine Orbs (div), using the Exalted Orb's minimum modifier levels for Transmutation and Augmentation doubled the magic-item cost, and the way we tracked a desecration marker put us 24% off the engine.

None of these would have shown up if we had only looked at the calculated answer.

ExileDesk has an engine that plays out a craft one currency at a time. On 2026-10-20 and 21 we ran a test: take a pair of gloves from a video (with "+2 to Level of all Projectile Skills" as a suffix) and work out, backward, the expected cost from each state to the finished item. Then we always replayed the calculated answer on the engine and put the two numbers side by side.

Every time, something was off. Chasing the gap led back to a mistake in the calculation. This is the story of fixing them.

:::summary What you'll learn
- A simple random generator (an LCG) was biased and gave 68 div. With mulberry32 the calculation said 61.9 div and the engine 58.7 div
- Transmutation and Augmentation have different minimum modifier levels from the Exalted Orb (Greater 44, Perfect 70). Using the Exalted Orb's 35 and 50 doubled our magic-item estimate
- We kept a "desecrated" marker even after removing the mod it belonged to, which skewed results by 24%
- An expected-cost calculation needs a play-by-play check next to it, or you won't see its mistakes
:::

## Mistake 1: A Biased Random Generator Gave 68 div

The calculation works out the cost to finish from every state. Evaluated as is, rare loops that go round and round inflated the values.

So inside the calculation we also follow crafts one run at a time, with a cap on how many times a step can repeat. Those runs need random numbers.

The first generator we used was a simple one (an LCG, linear congruential generator), and it put the top order at 68 div. Switching to mulberry32 gave 61.9 div from the calculation and 58.7 div from 1,000 engine runs. Same calculation, different random numbers, different answer.

Our calculation rules now say it plainly: use mulberry32, because LCGs are biased.

## Mistake 2: Transmutation and Augmentation Floors Aren't the Exalted Orb's

Starting from a white base, the first half of the craft makes a magic item with Orbs of Transmutation and Augmentation. The Greater and Perfect versions guarantee a minimum modifier level.

Our first calculation used the Exalted Orb's floors (Greater 35, Perfect 50). The real ones are different:

| Orb | Greater | Perfect |
|---|---:|---:|
| Exalted Orb | 35 | 50 |
| Orb of Transmutation / Augmentation | **44** | **70** |

A floor that is too low lets low tiers of the target family roll in the model, so hits look rarer. As a result we **estimated the magic-item cost at twice what it should be**. The earlier "about 580 div per restart" figure is too high by that same amount.

The engine keeps these floors in `CURRENCY_FLOOR`, with separate values for Transmutation and Augmentation. We changed the calculation to use the engine's values.

## Mistake 3: A Desecration Marker Skewed Results by 24%

The test tracked "is there a desecrated mod" as a marker in each state. In the calculation, only one marker was allowed, and with a marker present, bones couldn't be used.

But after a desecrated target was removed with an Orb of Annulment, the calculation kept the marker. It then treated bones as unusable and chose a loop of Exalted Orbs and Annulments. Those Annulments removed the +2 Projectile mod 1.02 times per run. On the engine it was 0.45 times.

The fix: the marker now records which target was desecrated, and disappears when that target is removed.

For one of the target orders, here is calculation next to engine:

| Cost per item, one order | Calculation | Engine | Gap |
|---|---:|---:|---:|
| Before the fix | 109 div | 83 div | 24% |
| After the fix | 70.5 div | 65.1 div | down to 6-8% |

Rune cost is handled differently before and after (the "after" figures exclude 10.8 div of runes), so compare the gap, not the totals. A 6-8% gap remains, always with the engine cheaper.

### The same kind of mistake, once more

Handing the calculated answer to the engine tripped on the marker again. The engine can't see which target was desecrated, so we had told it "if Speed is present, the desecrated mod is Speed."

The result: it kept erasing, with Chaos and an Omen of Erasure, a Speed mod that had actually come from a Chaos Orb, looping 280 times per run. We now pass the marker answer that the calculation's own runs went through most often.

## How We Caught Them: Calculation Next to Engine

All three gave plausible numbers on their own. We caught them because we replayed the calculation's best moves on the engine, 1,000 runs at a time, and lined the numbers up.

Playing it out on the engine also exposed other mistakes:

- Omens that pick a side, such as Crystallisation, need a removable mod on that side
- A Perfect Essence needs a removable mod (only a Rare with zero mods takes it without losing one)

Separately, at the start of the experiment the owner warned that automated expected-cost calculations bug out easily and should have caps. So every move has one: 3,000 for re-rolling the +2 Projectile mod, 300 for everything else.

Rule number one for our calculation work is now: show the engine's result next to every calculated number, with the gap in %.

:::note What we don't know yet
- This is about a **calculation experiment** that chooses crafting moves automatically. Automatic move selection is not a feature of the site; on 2026-10-21 the owner decided against it because there are too many branches.
- We don't yet know what causes the 6-8% gap left after fixing Mistake 3.
- The "twice" in Mistake 2 is the recorded estimate. We haven't recomputed the restart cost after the fix.
- All of this used one pair of gloves. We haven't checked whether other item types show gaps of the same size.
:::

:::tip Using a crafting calculator
A Greater or Perfect orb's minimum modifier level depends on which orb it is. Before trusting a calculator's number, play the same method a few dozen times on a step-by-step tool and see whether the average lands close.
:::

## Where the Numbers Come From

- 68 and 61.9 div (random generator), 109 and 70.5 div and 1.02 removals (desecration marker): values from the ExileDesk calculation experiment, 2026-10-20 to 21 (**calculation**).
- 58.7 div (random generator), 83 and 65.1 div and 0.45 removals (desecration marker), the 280-step loop: 1,000 engine runs of the calculation's answers (**engine**). The 24% and 6-8% figures are the gaps between the two.
- Prices from the 2026-10-21 market (1 div = 718 Exalted Orbs).
- Transmutation / Augmentation floors (Greater 44, Perfect 70) and Exalted Orb floors (35, 50): the engine's `CURRENCY_FLOOR` (**engine**).
- Magic-item cost doubled, restart about 580 div: the experiment's notes (**estimate**; not recomputed after the fix).
- The mulberry32 rule and the "line it up with the engine" rule: ExileDesk's calculation rules (docs/org/math/README.md).

## Try It Yourself

Play a craft one step at a time on the [crafting bench](/), or compare Chaos, Augmentation and Exalted spam in the [spam simulator](/?page=routes).

**Related posts**

- [PoE2 crafting expected cost: the cheapest move skips Omens](/en/blog/optimal-move-vs-intuition/)
- [PoE2 crafting cost variance: average, median and unlucky 10%](/en/blog/crafting-cost-variance/)
