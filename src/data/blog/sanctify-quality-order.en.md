---
title: Sanctify and Quality Make +6 Only in One Order: Why There Is No +5 Absent Amulet
description: A Sanctified Absent Amulet with 50% Quality showed +6 to Level of all Spell Skills. +6 only appears if Sanctification hits the base value before Quality, and +5 never appears. Here is why a trade search for +5 found nothing.
date: 2026-10-22
tags: Sanctified, Quality, Absent Amulet, Divine Orb, Catalyst
tree: /?page=sim-tree&base=Absent%20Amulet
craft: /?base=Absent%20Amulet
---
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

Applying Quality first caps out at +5 even with the best Sanctification roll. Since +6 exists, the game must sanctify the base value first and apply Quality afterward. The ExileDesk engine uses this order, and it matches the real item.

## What Each Multiplier Shows

In the engine's order, at 50% Quality:

| Sanctification multiplier | Value after Sanctify (rounded) | Shown at 50% Quality (rounded down) | Share (of 45 steps) |
|---|---:|---:|---:|
| 0.78 to 0.83 | 2 | +3 | 6 (13.3%) |
| 0.84 to 1.16 | 3 | +4 (4.5 rounded down) | 33 (73.3%) |
| 1.17 to 1.22 | 4 | **+6** | 6 (13.3%) |

Only +3, +4 and +6 can be shown. **+5 never appears, whatever the multiplier.** That is why the owner's trade search for "Absent Amulet, 50% Quality, +5 to Level of all Spell Skills" (instant buyout listings only) returned zero results.

If the multiplier is drawn evenly, +6 comes up 6 times in 45, about 13%. The game doesn't publish whether the multiplier is really uniform, so that part is an engine assumption.

## Things to Watch When Crafting

- **Quality can go on before or after Sanctification.** Quality applies at display time, so re-adding Catalysts after Sanctifying keeps +6 at +6. What matters is that Sanctification applies to the base value.
- **Sanctification is final.** A Sanctified item can't be modified further. If you roll +4, that's it.
- **Small numbers feel the rounding most.** For a value like +3, 3.49 versus 3.51 changes the result by a full point. For large values, the multiplier shows up directly in the number.
- The same item's +55 Spirit was also above its T1 range (47 to 50). Spirit has no caster tag, so that was Sanctification alone.

## Where the Numbers Come From

- The +6 item and the zero results for +5 were checked by the owner on the trade site.
- The multiplier range (0.78 to 1.22), the order and the rounding come from the ExileDesk engine (apply-vaal.ts, quality.ts). The order matches the real +6 item. Whether the multiplier is uniform is unconfirmed.

You can try Sanctification and Quality on an Absent Amulet in the crafting bench.
