---
title: PoE2 Sanctify vs Quality Order: Why +6 but Never +5
description: In PoE2, Sanctification applies to the base value before Quality. A 50% Quality Absent Amulet can show +6 to Level of all Spell Skills, but never +5. Here is why a trade search for +5 found nothing, multiplier by multiplier.
date: 2026-10-22
tags: Sanctify, Quality, Absent Amulet, Divine Orb, Catalyst
craft: /?base=Absent%20Amulet
image: img/sanctify-quality-order-og.en.png
ready: true
draft: true
---
In PoE2, Sanctify and Quality apply in a fixed order: **Sanctification hits the base value (×0.78 to 1.22, rounded), then Quality applies at display (rounded down)**. So on a 50% Quality Absent Amulet, "+# to Level of all Spell Skills" shows +3, +4 or +6. No multiplier ever gives +5.

:::zundamon surprised
I found a 50% Quality Absent Amulet on the trade site with "+6 to Level of all Spell Skills"!
:::

:::metan normal
The T1 of that mod is a flat +3 with no range. Yet it shows +6.
:::

:::zundamon troubled
And a search for +5 under the same conditions found nothing. +4 and +6 exist, so why not +5?
:::

:::metan happy
The **order** in which Sanctification and Quality apply explains it.
:::

:::summary What you'll learn
- Sanctification multiplies the base value by 0.78 to 1.22 and rounds. Quality applies later, at display, and rounds down (add Quality before Sanctifying)
- So at 50% Quality you get +3, +4 or +6, and +5 never appears. +6 comes up about 13% of the time
- At 40% Quality, +5 is possible. +6 needs 50% Quality
:::

:::tip New to this? Words used here
- **Sanctification**: using a Divine Orb with an Omen of Sanctification makes a Rare item Sanctified. Its mod values are rerolled
- **Quality (Caster Modifiers)**: Quality that raises the numbers on mods with the caster tag
- **Sibilant Catalyst**: the catalyst that adds Caster Modifiers Quality
- **Mod tier (T1)**: the same mod comes in tiers by strength. T1 is the strongest
- **Rounding / rounding down**: Sanctification rounds to the nearest whole number, Quality drops the fraction
:::

## Two Boosts

Two boosts act on this item's numbers: Sanctification and Quality.

:::zundamon normal
What does Sanctification actually do?
:::

:::metan normal
When an item becomes Sanctified, each mod's value is rerolled. Then it is multiplied by 0.78 to 1.22.
:::

:::metan normal
The ExileDesk engine draws that multiplier evenly in 0.01 steps. The result is rounded and stored as the mod's value.
:::

:::zundamon normal
And Quality?
:::

:::metan normal
That's Quality from a Sibilant Catalyst. At 50% Quality it is ×1.5.
:::

:::metan normal
This one applies at display time, and the fraction is rounded down.
:::

:::zundamon surprised
But Quality caps at 20%. How can you stack 50%?
:::

:::metan normal
It's the normal 20% cap plus things like the "+20% to Maximum Quality" mod from an Essence of the Breach.
:::

:::metan normal
If you remove the Maximum Quality mod after adding Quality, the Quality stays.
:::

| Boost | How to add it | Multiplier | Rounding | When it applies |
|---|---|---|---|---|
| Sanctification | Omen of Sanctification + Divine Orb | ×0.78 to 1.22 (0.01 steps) | Rounded | On the base value, stored as the mod's value |
| Quality (Caster Modifiers) | Sibilant Catalyst | ×1.5 at 50% Quality | Rounded down | At display time |

The different rounding and timing are the key to this whole post.

## The Order Changes the Answer

The base value is +3. Let's calculate it in both orders.

:::zundamon normal
It's just multiplication. The order shouldn't matter.
:::

:::metan normal
It does, because of the rounding in between. Look at the table.
:::

| Order | Calculation | Shown | What happens |
|---|---|---:|---|
| Sanctify the base value → Quality | 3 × 1.22 = 3.66 → rounds to 4; 4 × 1.5 = 6 | **+6** | Sanctification lifts it to 4, then Quality applies |
| Quality → Sanctify | 3 × 1.5 = 4.5; 4.5 × 1.22 = 5.49 | +5 | Even the best roll stops at +5 |

:::zundamon surprised
With Quality first, you can't get +6!
:::

:::metan normal
Right. Since +6 exists, the game must Sanctify the base value first and apply Quality afterward.
:::

:::metan happy
The ExileDesk engine uses the same order, and it matches the real item.
:::

## What Each Multiplier Shows

In the engine's order, here is what each multiplier shows at 50% Quality.

| Sanctification multiplier | Value after Sanctify (rounded) | Shown at 50% Quality (rounded down) | Steps (of 45) | What happens |
|---|---:|---:|---:|---|
| 0.78 to 0.83 | 2 | +3 | 6 (13.3%) | Sanctify lowers it, Quality brings it back to +3 |
| 0.84 to 1.16 | 3 | +4 (4.5 rounded down) | 33 (73.3%) | Sanctify doesn't move it, Quality makes it +4 |
| 1.17 to 1.22 | 4 | **+6** | 6 (13.3%) | Sanctify raises it, Quality makes it +6 |

:::zundamon normal
So where is the multiplier that gives +5?
:::

:::metan normal
There isn't one. Grouped by shown value, it looks like this.
:::

| Shown at 50% Quality | Share (uniform multiplier assumed) | Appears? |
|---|---:|---|
| +3 | 13.3% | Yes |
| +4 | 73.3% | Yes (most common) |
| +5 | 0% | **Never, at any multiplier** |
| +6 | 13.3% | Yes (6 of 45) |

Only +3, +4 and +6 can be shown. No multiplier gives +5.

:::zundamon happy
That's why the trade search for +5 found nothing!
:::

:::metan normal
Exactly. The owner searched "Absent Amulet, 50% Quality, +5 to Level of all Spell Skills" and got zero results, just as the table says.
:::

:::metan normal
That search covered instant buyout listings only.
:::

:::zundamon normal
How hard is it to roll +6?
:::

:::metan normal
With an even multiplier, 6 steps out of 45. About 13%.
:::

### What If Quality Were 20% or 40%?

With the same rules (Sanctification rounds, Quality rounds down at display), changing the amount of Quality gives this.

| Value after Sanctify | 20% Quality | 40% Quality | 50% Quality | What happens |
|---:|---:|---:|---:|---|
| 2 | +2 | +2 | +3 | Goes up one only at 50% Quality |
| 3 | +3 | +4 | +4 | Goes up one from 40% Quality |
| 4 | +4 | **+5** | **+6** | +5 at 40% Quality, +6 at 50% |

:::zundamon surprised
At 20% Quality, not a single number moves!
:::

:::metan normal
3 × 1.2 = 3.6 and 4 × 1.2 = 4.8 both round back down.
:::

:::metan normal
At 40% Quality, a Sanctified 4 shows +5. Only 50% Quality reaches +6.
:::

:::zundamon happy
So a +6 item hit the top 13% on Sanctification and also stacked Quality to 50%!
:::

:::tip Looking for +5 on trade
+5 is possible at 40% Quality, so dropping the Quality filter might turn some up (a prediction from the calculation, not checked with a search).
:::

## Things to Watch When Crafting

Here are the points to remember when working with Sanctification and Quality.

:::zundamon normal
Do I have to add Quality before Sanctifying?
:::

:::metan normal
Yes, before. Once an item is Sanctified, nothing more can be done to it, Catalysts included.
:::

:::metan normal
In the calculation, Sanctification applies to the base value and Quality applies later at display. That's how +6 happens.
:::

:::zundamon normal
If I roll +4, I'll just Sanctify it again.
:::

:::metan troubled
Sanctification happens only once. A Sanctified item can't be Sanctified again, so a +4 is final.
:::

:::zundamon normal
What about mods with small numbers?
:::

:::metan normal
The rounding edge matters most there. For a value like +3, 3.49 versus 3.51 changes the result by one.
:::

:::metan normal
For mods with large values, the multiplier shows up directly in the number.
:::

:::zundamon surprised
The same item's +55 Spirit was also above its T1 range (47 to 50)!
:::

:::metan normal
Spirit has no caster tag. So Quality didn't touch it, and that was Sanctification alone.
:::

| Watch for | What happens | Why |
|---|---|---|
| When to add Quality | Only before Sanctifying | Nothing can be done after Sanctification |
| How many Sanctifications | Only once, and the roll is final | A Sanctified item can't be changed |
| Mods with small numbers | One point changes at the rounding edge | 3.49 and 3.51 give different results |
| +55 Spirit | Goes past T1 (47 to 50) from Sanctification alone | No caster tag, so Quality doesn't apply |

:::note fold Not yet verified (2)
- The game doesn't publish whether every multiplier is equally likely. The roughly 13% chance of +6 is based on the engine's assumption.
- "+5 is possible at 40% Quality" is a prediction from the calculation, not checked with a trade search.
:::

Sanctification applies to the base value and rounds; Quality applies at display and rounds down. Because of this order, 50% Quality never shows +5, and +4 jumps straight to +6.

## Where the Numbers Come From

:::fold Show sources (2)
- The +6 item and the zero results for +5 were checked by the owner with real items and a search on the trade site.
- The Sanctification multiplier range (0.78 to 1.22), the calculation order and the rounding come from the ExileDesk engine (apply-vaal.ts, quality.ts). The order matches the real +6 item. Whether the multiplier is uniform is unconfirmed.
:::

## Try It Yourself

You can try Sanctification and Quality on an Absent Amulet on the [crafting bench](/?base=Absent%20Amulet). Sanctify it and you'll see the same values as the tables above.

**Related posts**

- [PoE2 crafting expected cost vs intuition](/en/blog/optimal-move-vs-intuition/)

VOICEVOX: Zundamon / Shikoku Metan
