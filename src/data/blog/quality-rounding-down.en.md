---
title: PoE2 Quality Rounding: Round Down, Not Nearest
description: PoE2 quality rounding goes down, not to the nearest number. We switched ExileDesk to rounding to match Craft of Exile, then saw +3 Spell Skills stay +3 at 33% quality and hit +4 at 34%, and switched back.
date: 2026-10-22
tags: Quality, Catalyst, rounding, Level of all Spell Skills, correction
image: img/quality-rounding-down-og.en.png
draft: true
---
PoE2 quality rounding goes **down, not to the nearest whole number**. On real items, "+3 to Level of all Spell Skills" shows exactly +4 at 34% Quality and stays +3 at 33%. ExileDesk once switched this to normal rounding, found it didn't match the game, and switched back.

To be upfront: this is a story about a mistake we made.

We use Craft of Exile (CoE) as an outside check for probabilities. While lining our emulator up with CoE, we changed quality-boosted values to round to the nearest number, like CoE does. Matching an outside source felt like the safe choice.

Then the owner put real in-game items side by side, and one number was off. At 33% Quality, our emulator said +4. The game said +3.

:::summary What you'll learn
- Quality-boosted whole-number values **round down**. +3 stays +3 at 33% Quality and becomes +4 at exactly 34%
- ExileDesk switched to nearest rounding in v0.1.526 to match CoE, and went back to rounding down in v0.1.567
- The two methods disagree at 20% and 33% Quality, among others
- Sanctification rounds differently (to nearest), and its order with Quality is unchanged
:::

## Does Quality Round to Nearest or Down?

Down. Quality multiplies the mod's base value by (1 + Quality) and drops the fraction when the value is displayed.

Here is "+3 to Level of all Spell Skills" with Caster Modifiers Quality (the Quality a Sibilant Catalyst adds):

| Quality | Multiplied | Round down (the game) | Round to nearest (ExileDesk v0.1.526) |
|---|---:|---:|---:|
| 20% | 3 × 1.2 = 3.6 | +3 | +4 |
| 33% | 3 × 1.33 = 3.99 | **+3** | +4 |
| 34% | 3 × 1.34 = 4.02 | **+4** | +4 |

The real items showed +3 at 33% and +4 at 34%. Nearest rounding would show +4 at 33% (3.99) and even at 20% (3.6), which doesn't match. Only rounding down fits.

## Why Did We Switch to Rounding in the First Place?

The timeline, from our changelog:

1. **v0.1.474**: Jewellery got a Quality type selector (Caster and others). This version already rounded down, and the note said Caster at 34% turns +3 Spell Skills into +4.
2. **v0.1.526**: While checking against CoE, we changed quality-boosted values to round to nearest. The note read "previously truncated, same as Craft of Exile." CoE uses Math.round.
3. **v0.1.567**: The owner's items (+4 at 34%, +3 at 33%) didn't match, so we went back to rounding down.

In other words, we were right at first, then broke it on purpose to match an outside tool.

### How Did We Catch It?

Items right at the threshold settled it.

When you round down, a +3 mod first reaches +4 at 34%. When you round to nearest, it gets there at a much lower Quality. So checking whether a 33% item shows +3 or +4 tells you which method the game uses.

The owner checked in-game: +3 at 33%, exactly +4 at 34%. That's rounding down.

The lesson for us: **we still check probabilities against CoE, but its display rounding isn't automatically right.** Of the rules we aligned with CoE on 10-16, only quality rounding was overridden by the owner's in-game check on 10-18.

:::note What we haven't checked
The in-game check covers a +3 skill level mod on jewellery at 33% and 34%. We haven't compared every other mod, or mods with larger numbers, against real items. The engine rounds down every quality-boosted whole-number value the same way.
:::

## How Is This Different from Sanctification?

Sanctification is the confusing part. It multiplies the **base value** by 0.78 to 1.22 and **rounds to nearest**. Quality then applies at display and **rounds down**.

Two kinds of rounding, pointing in different directions:

| Boost | Applied to | Rounding |
|---|---|---|
| Sanctified | Base value | To nearest |
| Quality | Displayed value | Down |

This combination is why a 50% Quality Absent Amulet never shows "+5 to Level of all Spell Skills." We worked through every multiplier in [Sanctify vs Quality Order](/en/blog/sanctify-quality-order/). The rounding down in this post is the same rule used there.

:::tip Find the threshold before stacking Quality
For small numbers, falling even 1% short of a threshold means the displayed value doesn't move. To turn +3 into +4 you need 34%, not 33%. Work out the threshold for the value you want before spending Catalysts.
:::

## What Changed in the Emulator?

Since v0.1.567, ExileDesk's emulator displays quality-boosted values rounded down, like the game.

- At 33% Quality or less, a +3 skill level shows as +3 (v0.1.526 to 566 showed +4 at 17% to 33% Quality).
- At 20% Quality (the normal cap), a +3 skill level doesn't move.
- Sanctified items match the tables in [Sanctify vs Quality Order](/en/blog/sanctify-quality-order/), which assume rounding down.


## Where the Numbers Come From

- +4 at 34%, +3 at 33%: checked by the owner on real in-game items (game).
- The rounding history: src/data/changelog-notes.json, v0.1.474 (added, rounding down), v0.1.526 (to nearest, same as CoE), v0.1.567 (back to rounding down).
- CoE rounding to nearest (Math.round): our 10-16 CoE comparison record (poe2db / CoE).
- The table's multiplications (3.6, 3.99, 4.02) apply the rule above directly (the same formula as the engine's quality.ts).

## Try It Yourself

On the [crafting bench](/?base=Absent%20Amulet), set Caster Quality to 33% and then 34% and watch "+3 to Level of all Spell Skills" go from +3 to +4.

**Related posts**

- [PoE2 Sanctify vs Quality order (why +6 but never +5)](/en/blog/sanctify-quality-order/)
