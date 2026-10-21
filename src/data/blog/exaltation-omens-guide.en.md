---
title: PoE2 Omen of Dextral & Sinistral Exaltation (+ Greater)
description: How the PoE2 Omen of Dextral and Sinistral Exaltation and the Omen of Greater Exaltation work, how they stack and what they cost. Greater adds only one mod when just one slot is open, and Sinistral + Greater Exalt made ES gloves for 105 div.
date: 2026-10-22
tags: Exalted Orb, omens, Omen of Sinistral Exaltation, Omen of Dextral Exaltation, Omen of Greater Exaltation
image: img/exaltation-omens-guide-og.en.png
draft: true
---
In PoE2, the **Omen of Sinistral Exaltation makes your next Exalted Orb add only a prefix, the Omen of Dextral Exaltation only a suffix, and the Omen of Greater Exaltation adds two mods** instead of one. Greater stacks with either side omen to put two mods on one side, but it adds only one mod when only one slot is open.

An Exalted Orb on its own just adds one random mod to a Rare. One omen changes where that mod goes, or how many you get.

If your targets are all prefixes, Sinistral lets you skip every suffix miss. Greater sounds like a shortcut, but how much it does depends on how many open slots you have.

We checked each of these rules while building the ExileDesk emulator, and fixed one misleading line on our own screen along the way.

:::summary What you'll learn
- What Sinistral, Dextral and Greater Exaltation each change
- Greater adds **only one mod when only one slot is open**; stacked with a side omen, the open slots on that side decide
- Rough prices: Sinistral about 0.1 div, Dextral about 9 Exalted Orbs, Greater about 3 Exalted Orbs (poe2db rates)
- An example: Sinistral + Greater Exalted Orb finished ES glove prefixes for 105 div per item
:::

## What Do the Three Omens Do?

All three work while active in your inventory and affect your next Exalted Orb. The orb tier (Exalted, Greater, Perfect) doesn't matter.

| Omen | Next Exalted Orb | Rough price |
|---|---|---:|
| Omen of Sinistral Exaltation | adds only a prefix | ~0.1 div |
| Omen of Dextral Exaltation | adds only a suffix | ~9 Exalted Orbs |
| Omen of Greater Exaltation | adds two random mods | ~3 Exalted Orbs |

Prices are the trade rates shown on poe2db. Which direction each rate is quoted in is our estimate, and thinly traded items are a weak guide.

An easy way to remember it: Sinistral and Dextral pick the side, Greater picks the count.

## Does Greater Exaltation Always Add Two Mods?

No. **If only one slot is open, it stops at one.**

Say a Rare has three prefixes and one open suffix slot. Using Omen of Greater Exaltation still adds just one mod, because there is nowhere for the second to go.

We set this rule after checking how Craft of Exile handles it (rolling stops once nothing more can be added). Using Greater with only one open slot wastes the omen.

## Can You Stack Greater With Sinistral or Dextral?

Yes. In the ExileDesk engine, Greater plus a side omen puts **both mods on that side**.

Here is the mistake we made. With a side omen stacked, only one mod is added if that side has one open slot, but our simulation screen still said "adds two." We fixed that text in v0.1.450.

| Omens used | Mods added | When slots run short |
|---|---|---|
| Greater | 2 (either side) | 1 if only one slot is open |
| Greater + Sinistral | 2 prefixes | 1 if only one prefix slot is open |
| Greater + Dextral | 2 suffixes | 1 if only one suffix slot is open |

Omen of Catalysing Exaltation also stacks with Greater, and then both mods are weighted (multiplier 1 + 0.2 × quality, so 5x at 20%). It needs Catalyst Quality, which only rings and amulets can take.

## Which Ones Actually Get Used?

When your targets are all prefixes, Sinistral does the heavy lifting. In our [ES gloves post](/en/blog/es-gloves-greater-exalt/), Omen of Sinistral Exaltation + Greater Exalted Orb was the cheapest way to get three prefixes (maximum ES, ES%, maximum Mana, T2+) at 105 div per item (300 engine runs). Catalysts don't work on gloves, so picking the side is the only way to dodge misses there.

What about Greater? In a calculation experiment that worked backward to find the best move for a pair of gloves, "Greater + side omen for two mods on one side" was almost never picked by the top orderings. Allowing it moved the calculated expected cost of the later steps from 54.8 to 54.7 div.

I expected "two mods at once" to be faster too. But when targets are filled one at a time, the number of open slots and misses seems to matter more.

:::note What we haven't verified
- The best-move result is a calculation experiment, not an ExileDesk feature (automatic crafting isn't part of the site). It covers one glove base and one finished item; we haven't checked other slots.
- Greater + side omen putting two mods on one side is how our engine works. We haven't confirmed it with many in-game uses.
- Prices are poe2db rates; the direction is our estimate.
- Omen of Homogenising Exaltation is left out because we couldn't confirm it can be obtained in the current version.
:::

:::tip Rule of thumb
If your targets are on one side only, pick that side with Sinistral or Dextral. Only consider Greater when the target side has two or more open slots.
:::

## Where the Numbers Come From

- Omen names and effects: poe2db descriptions (English and Japanese pages). **poe2db / CoE**
- Prices (Sinistral ~0.1 div, Dextral ~9 Exalted Orbs, Greater ~3 Exalted Orbs): trade rates on poe2db pages, read 2026-10-22. Direction is **estimated**
- Greater adds one mod when one slot is open: rule checked against Craft of Exile (rollAffixes), docs/reviews/2026-10-17-rule-checklist.md. **poe2db / CoE**
- Greater + side omen = two mods on that side, and the screen text fix: ExileDesk v0.1.450. **Engine**
- Catalysing + Greater weights both mods, multiplier 1 + 0.2 × quality: Craft of Exile (exaltedParams), v0.1.525 and v0.1.534. **poe2db / CoE**
- ES gloves at 105 div: ExileDesk engine, 300 runs ([ES gloves post](/en/blog/es-gloves-greater-exalt/)). **Engine**
- 54.8 → 54.7 div: backward best-move calculation experiment on gloves. **Engine** (calculation experiment)

## Try It Yourself

On the [crafting bench](/?base=Sirenscale%20Gloves) you can activate an omen and then use an Exalted Orb. Try Omen of Greater Exaltation on a Rare with one open slot and watch it stop at one mod.

**Related posts**

- [PoE2 omens worth it? When a plain Annul is enough](/en/blog/are-omens-worth-it/)
- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Energy Shield gloves craft: Greater Exalt beats Perfect](/en/blog/es-gloves-greater-exalt/)
