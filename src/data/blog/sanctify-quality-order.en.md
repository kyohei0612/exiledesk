---
title: PoE2 Sanctify vs Quality Order: Why +6 but Never +5
description: In PoE2, Sanctification applies to the base value before Quality. A 50% Quality Absent Amulet can show +6 to Level of all Spell Skills, but never +5. Here is why a trade search for +5 found nothing, multiplier by multiplier.
date: 2026-10-22
tags: Sanctified, Quality, Absent Amulet, Divine Orb, Catalyst
tree: /?page=sim-tree&base=Absent%20Amulet
craft: /?base=Absent%20Amulet
draft: true
---
In PoE2, Sanctify and Quality apply in a fixed order: **Sanctification hits the base value (×0.78 to 1.22, rounded), then Quality applies at display (rounded down)**. So on a 50% Quality Absent Amulet, "+# to Level of all Spell Skills" shows +3, +4 or +6, and never +5.

On the trade site there was an Absent Amulet with 50% Quality showing "+6 to Level of all Spell Skills." The top tier (T1) of this mod is a flat +3 with no range, yet the item showed +6. And a search for +5 under the same conditions found nothing at all. +4 and +6 exist, but +5 doesn't. The order in which Sanctification and Quality apply explains it.

## Two Boosts

Two boosts act on this number:

- **Sanctification**: Using a Divine Orb with an Omen of Sanctification makes a Rare item Sanctified. Each mod's values are rerolled, then multiplied by 0.78 to 1.22. In the ExileDesk engine, the multiplier is drawn evenly in 0.01 steps, and the result is rounded and stored as the mod's value.
- **Quality (Caster Modifiers)**: Quality from a Sibilant Catalyst raises the numbers of mods with the caster tag. At 50% Quality it is ×1.5. This one applies at display time and rounds down.

50% Quality is the normal cap of 20% plus things like the "+20% to Maximum Quality" mod from an Essence of the Breach. Removing the Maximum Quality mod after adding Quality leaves the Quality in place (see [Decoding the Gold Ring Video](/en/blog/gold-ring-video-decoded/)).

## The Order Changes the Answer

The base value is +3. In each order:

| Order | Calculation | Shown |
|---|---|---:|
| Sanctify the base value → Quality | 3 × 1.22 = 3.66 → rounds to 4; 4 × 1.5 = 6 | **+6** |
| Quality → Sanctify | 3 × 1.5 = 4.5; 4.5 × 1.22 = 5.49 | +5 |

Applying Quality first caps out at +5 even with the best Sanctification roll. Since +6 exists, the game must sanctify the base value first and apply Quality afterward. The ExileDesk engine uses this order, and it matches the real item. Sanctifying an Absent Amulet on the [crafting bench](/?base=Absent%20Amulet) shows the same values.

## What Each Multiplier Shows

In the engine's order, at 50% Quality:

| Sanctification multiplier | Value after Sanctify (rounded) | Shown at 50% Quality (rounded down) | Share (of 45 steps) |
|---|---:|---:|---:|
| 0.78 to 0.83 | 2 | +3 | 6 (13.3%) |
| 0.84 to 1.16 | 3 | +4 (4.5 rounded down) | 33 (73.3%) |
| 1.17 to 1.22 | 4 | **+6** | 6 (13.3%) |

Only +3, +4 and +6 can be shown. **+5 never appears, whatever the multiplier.** That is why the owner's trade search for "Absent Amulet, 50% Quality, +5 to Level of all Spell Skills" (instant buyout listings only) returned zero results.

If the multiplier is drawn evenly, +6 comes up 6 times in 45, about 13%. The game doesn't publish whether the multiplier is really uniform, so that part is an engine assumption.

## What If Quality Were 20% or 40%?

With the same rules (Sanctification rounds, Quality rounds down at display), changing the amount of Quality gives:

| Value after Sanctify | 20% Quality | 40% Quality | 50% Quality |
|---:|---:|---:|---:|
| 2 | +2 | +2 | +3 |
| 3 | +3 | +4 | +4 |
| 4 | +4 | **+5** | **+6** |

At 20% Quality (the normal cap), Quality doesn't move this mod at all: 3 × 1.2 = 3.6 and 4 × 1.2 = 4.8 both round back down. At 40%, a Sanctified 4 shows +5. Only 50% reaches +6. So a "+6" item rolled the top 13% on Sanctification and also stacked Quality to 50%. Conversely, +5 is possible at 40% Quality, so a trade search for +5 might find items if you drop the Quality filter (this is a prediction from the calculation, not checked with a search).

## Things to Watch When Crafting

- **Quality can go on before or after Sanctification.** Quality applies at display time, so re-adding Catalysts after Sanctifying keeps +6 at +6. What matters is that Sanctification applies to the base value.
- **Sanctification is final.** A Sanctified item can't be modified further. If you roll +4, that's it.
- **Small numbers feel the rounding most.** For a value like +3, 3.49 versus 3.51 changes the result by a full point. For large values, the multiplier shows up directly in the number.
- The same item's +55 Spirit was also above its T1 range (47 to 50). Spirit has no caster tag, so that was Sanctification alone.

## Where the Numbers Come From

- The +6 item and the zero results for +5 were checked by the owner on the trade site.
- The multiplier range (0.78 to 1.22), the order and the rounding come from the ExileDesk engine (apply-vaal.ts, quality.ts). The order matches the real +6 item. Whether the multiplier is uniform is unconfirmed.

You can try Sanctification and Quality on an Absent Amulet in the crafting bench.

**Related posts**

- [PoE2 Gold Ring craft (why the Maximum Quality mod is removed)](/en/blog/gold-ring-video-decoded/)
- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
