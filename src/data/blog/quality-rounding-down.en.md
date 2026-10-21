---
title: PoE2 Quality Rounding: Round Down, Not Nearest
description: PoE2 quality rounding goes down, not to the nearest number. We switched ExileDesk to rounding to match Craft of Exile, then saw +3 Spell Skills stay +3 at 33% quality and hit +4 at 34%, and switched back.
date: 2026-10-22
tags: Quality, Catalyst, rounding, Level of all Spell Skills, correction
image: img/quality-rounding-down-og.en.png
ready: true
---
PoE2 quality rounding goes **down, not to the nearest whole number**. On real items, "+3 to Level of all Spell Skills" shows exactly +4 at 34% Quality and stays +3 at 33%. ExileDesk once switched this to normal rounding, found it didn't match the game, and switched back.

:::zundamon normal
Do Quality-boosted numbers round to the nearest whole number?
:::

:::metan troubled
We thought so too, and switched to that once. Honestly, this is a story about our own mistake.
:::

:::zundamon surprised
You got it wrong!? What happened?
:::

:::metan normal
The owner lined up real in-game items, and one number was off. Something we said would be +4 at 33% Quality was still +3.
:::

:::summary What you'll learn
- Quality-boosted whole-number values **round down**. +3 stays +3 at 33% Quality and becomes +4 at exactly 34%
- ExileDesk switched to nearest rounding in v0.1.526 to match CoE, and went back to rounding down in v0.1.567
- The two methods show a different number at 20% and 33% Quality. This is separate from Sanctified rounding (to nearest)
:::

:::tip New to this? Words used here
- **Quality**: on rings and amulets, multiplies the base value of matching mods by (1 + Quality) to raise the number
- **Quality (Caster Modifiers)**: the Quality a Sibilant Catalyst adds
- **Round down**: drop the fraction. 3.99 becomes 3
- **Round to nearest**: round up when the fraction is half or more. 3.6 becomes 4
- **Sanctified**: a boost that multiplies the base value by 0.78 to 1.22 and rounds to nearest
- **CoE**: Craft of Exile, the outside tool ExileDesk uses to check probabilities
:::

## Does Quality Round to Nearest or Down?

Down. Quality multiplies the mod's base value by (1 + Quality) and drops the fraction when the value is displayed.

:::zundamon normal
So what happens to the fraction after multiplying?
:::

:::metan normal
It's always dropped. Here's "+3 to Level of all Spell Skills" with Quality (Caster Modifiers).
:::

| Quality | Multiplied | Round down (the game) | Round to nearest (ExileDesk v0.1.526) | What happens |
|---|---:|---:|---:|---|
| 20% | 3 × 1.2 = 3.6 | +3 | +4 | Nearest rounding already jumps to +4 |
| 33% | 3 × 1.33 = 3.99 | **+3** | +4 | Just short of 4, so the game stays at +3 |
| 34% | 3 × 1.34 = 4.02 | **+4** | +4 | Past 4, so both show +4 |

:::zundamon surprised
Still +3 at 3.99! That's basically 4.
:::

:::metan normal
Right. Real items showed +3 at 33% and +4 at 34%. Nearest rounding gives +4 at both 20% and 33%, which doesn't match.
:::

:::metan happy
Only rounding down matches the game.
:::

## Why Did We Switch to Rounding in the First Place?

Here's the history, version by version.

:::zundamon normal
Was it rounding to nearest from the start?
:::

:::metan troubled
No. It was right at first, and we went out of our way to change it.
:::

| Version | Rounding | What we did |
|---|---|---|
| v0.1.474 | Down | Added a Quality type selector (Caster and others) for Jewellery Quality. The note said "Caster at 34% turns +3 Spell Skills into +4" |
| v0.1.526 | To nearest | While checking against CoE, changed quality-boosted values to round to nearest. The note said "previously truncated, same as Craft of Exile" |
| v0.1.567 | Down | Didn't match the owner's items (+4 at 34%, +3 at 33%), so we went back to rounding down |

:::zundamon normal
Why switch to rounding to nearest?
:::

:::metan normal
CoE rounds to nearest. We matched an outside source, so we assumed it had to be right.
:::

### How Did We Catch It?

Items right at the threshold settled it.

:::zundamon normal
Where do you look to tell which rounding it is?
:::

:::metan normal
With rounding down, a +3 mod first reaches +4 at 34%. With rounding to nearest, it gets there at a lower Quality.
:::

:::metan normal
So checking whether 33% shows +3 or +4 gives a clear answer.
:::

:::zundamon happy
And when the owner checked, 33% was +3.
:::

:::metan normal
Yes, and exactly +4 at 34%. It was rounding down.
:::

:::zundamon normal
So we can't trust CoE anymore?
:::

:::metan normal
We still use it to check probabilities. The lesson is that its fine display rounding isn't automatically right.
:::

:::metan normal
Of the rules from our CoE comparison on 10-16, only quality rounding was overridden by the owner's check on 10-18.
:::

:::note fold Not yet verified (1)
- The in-game check covers only a +3 skill level mod on jewellery at 33% and 34%. We haven't compared other mods, or mods with larger numbers, against real items one by one. The engine assumes they round down the same way and treats them all alike.
:::

## How Is This Different from Sanctified Rounding?

Sanctified items are the confusing part. There are two roundings, and they go in different directions.

:::zundamon troubled
Wait, doesn't Sanctified round to nearest? I'm getting mixed up.
:::

:::metan normal
Sanctified multiplies the base value by 0.78 to 1.22 and rounds to nearest. In the calculation, Quality applies later, at display, and rounds down.
:::

| Boost | Applied to | Rounding | Order |
|---|---|---|---|
| Sanctified | Base value | To nearest | First |
| Quality | At display | Down | After |

:::metan normal
That combination is why a 50% Quality Absent Amulet never shows "+5 to Level of all Spell Skills."
:::

:::metan normal
The table for each multiplier is in [Sanctify vs Quality Order](/en/blog/sanctify-quality-order/). The rounding down here is the same rule used there.
:::

:::zundamon normal
How much Quality should I aim for?
:::

:::metan normal
For small numbers, missing the threshold by even 1% means the display won't go up. To turn +3 into +4, you need 34%, not 33%.
:::

:::tip How much Quality to aim for
For small numbers, falling even 1% short of a threshold means the displayed value doesn't go up. To turn +3 into +4 you need 34%, not 33%. Work out the threshold for the value you want before stacking Quality, and you won't waste any.
:::

## What Changed in the Emulator?

Since v0.1.567, ExileDesk's emulator rounds down like the game.

| Quality | v0.1.526 to 566 (to nearest) | From v0.1.567 (down) | What changed |
|---|---:|---:|---|
| 17 to 33% | +4 | +3 | It showed one too high; now it stays +3 |
| 20% (normal cap) | +4 | +3 | Even at the normal cap, a +3 skill level doesn't move |
| 34% | +4 | +4 | No change |

:::zundamon normal
Did the display for Sanctified items change too?
:::

:::metan happy
Yes. With rounding down, it now matches the tables in [Sanctify vs Quality Order](/en/blog/sanctify-quality-order/).
:::

Quality-boosted numbers round down, so +3 first becomes +4 at 34%. When you line up with an outside tool, checking real items at the threshold is the fastest way to be sure.

## Where the Numbers Come From

:::fold Show sources (4)
- +4 at 34%, +3 at 33%: checked by the owner on real in-game items (game).
- The rounding history: src/data/changelog-notes.json, v0.1.474 (added, rounding down), v0.1.526 (to nearest, same as CoE), v0.1.567 (back to rounding down).
- CoE rounding to nearest (Math.round): our 10-16 CoE comparison record (poe2db / CoE).
- The table's multiplications (3.6, 3.99, 4.02) apply the rule above directly (the same formula as the engine's quality.ts).
:::

## Try It Yourself

On the [crafting bench](/?base=Absent%20Amulet), set Quality (Caster Modifiers) to 33% and then 34% and watch "+3 to Level of all Spell Skills" go from +3 to +4.

**Related posts**

- [PoE2 Sanctify vs Quality order (why +6 but never +5)](/en/blog/sanctify-quality-order/)

VOICEVOX: Zundamon / Shikoku Metan
