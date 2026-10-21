---
title: PoE2 Omen of Dextral & Sinistral Exaltation (+ Greater)
description: How the PoE2 Omen of Dextral and Sinistral Exaltation and the Omen of Greater Exaltation work, how they stack and what they cost. Greater adds only one mod when just one slot is open, and Sinistral + Greater Exalted Orb made ES gloves for 105 div.
date: 2026-10-22
tags: Exalted Orb, omens, Omen of Sinistral Exaltation, Omen of Dextral Exaltation, Omen of Greater Exaltation
image: img/exaltation-omens-guide-og.en.png
ready: true
---
In PoE2, the **Omen of Sinistral Exaltation makes your next Exalted Orb add only a prefix, the Omen of Dextral Exaltation only a suffix, and the Omen of Greater Exaltation adds two mods in one use**. Greater stacks with either side omen, so you can aim for two mods on one side. But if only one slot is open, Greater adds only one mod.

:::zundamon normal
With Omen of Greater Exaltation, I always get two mods, right?
:::

:::metan normal
Easy to think so. But how it works depends on the open slots.
:::

:::zundamon surprised
Not always?! Is it different from the side omens too?
:::

:::metan happy
The side omens change where the mod goes. Greater changes how many. Let's go one at a time.
:::

:::summary What you'll learn
- What Sinistral, Dextral and Greater Exaltation each change
- Greater adds only one mod when one slot is open; stacked with a side omen, the open slots on that side decide
- An example: Sinistral + Greater Exalted Orb finished ES glove prefixes for 105 div per item
:::

:::tip New to this? Words used here
- **Exalted Orb**: currency that adds one mod to a Rare item
- **Omen**: an item that, while active in your inventory, changes how your next currency works
- **Prefix / Suffix**: the two sides of mods. Each side has a cap on how many it can hold
- **Open slot**: room on a side for one more mod
- **Greater**: a currency tier. Low-tier mods can no longer roll
- **div**: Divine Orb, the price unit in this post
:::

## What Do the Three Omens Do?

All three affect "the next Exalted Orb you use while the omen is active in your inventory." The orb tier (Exalted, Greater, Perfect) doesn't matter.

:::zundamon normal
So what's the difference between the three?
:::

:::metan normal
Sinistral and Dextral pick the side. Greater raises the count.
:::

| Omen | Next Exalted Orb | Rough price | Best when |
|---|---|---:|---|
| Omen of Sinistral Exaltation | adds only a prefix | ~0.1 div | your targets are prefixes only |
| Omen of Dextral Exaltation | adds only a suffix | ~9 Exalted Orbs | your targets are suffixes only |
| Omen of Greater Exaltation | adds two random mods | ~3 Exalted Orbs | two or more slots are open |

:::zundamon happy
If I want prefixes, Sinistral skips every suffix miss!
:::

:::metan normal
Exactly. The prices are trade rates shown on poe2db pages.
:::

:::metan troubled
Which way each rate is quoted is our estimate, though. Thinly traded items are a weak guide.
:::

## Does Greater Exaltation Always Add Two Mods?

No. If only one slot is open, it stops at one.

:::zundamon normal
It's a two-mod omen, but it stops at one?
:::

:::metan normal
Picture a Rare with three prefixes filled and only one open suffix slot.
:::

:::metan normal
Omen of Greater Exaltation still adds just one mod. There's nowhere for the second to go.
:::

:::zundamon troubled
If I used it expecting two, that's a waste...
:::

:::metan normal
We set this rule after checking how Craft of Exile handles it (rolling stops once nothing more fits).
:::

## Can You Stack Greater With Sinistral or Dextral?

Yes. In the ExileDesk engine, Greater plus a side omen puts both mods on that side.

| Omens used | Mods added | When slots run short | What happens |
|---|---|---|---|
| Greater | 2 (either side) | 1 if only one slot is open | no side choice, just more mods |
| Greater + Sinistral | 2 prefixes | 1 if only one prefix slot is open | aim for two on one side |
| Greater + Dextral | 2 suffixes | 1 if only one suffix slot is open | aim for two on one side |

:::zundamon happy
So with a side omen stacked, I always get two on that side!
:::

:::metan troubled
Not quite. If that side has one open slot, you get one.
:::

:::metan troubled
Our simulation screen actually said "adds two." We fixed that line in v0.1.450.
:::

:::zundamon normal
Can Greater stack with other omens too?
:::

:::metan normal
Omen of Catalysing Exaltation stacks with Greater too. Then both mods are weighted.
:::

:::metan normal
The multiplier is 1 + 0.2 × quality, so 5x at 20% quality.
:::

:::metan troubled
But Catalysing needs Catalyst Quality on a ring or amulet.
:::

## Which Ones Actually Get Used?

When your targets are all prefixes, Omen of Sinistral Exaltation does the heavy lifting.

:::zundamon normal
What was the cheapest way to craft ES gloves?
:::

:::metan normal
That's when you fill three prefixes: maximum ES, ES% and maximum Mana, all T2 or better.
:::

:::metan happy
Omen of Sinistral Exaltation + Greater Exalted Orb was cheapest at 105 div per item. That's from 300 engine runs.
:::

:::metan normal
Catalysts don't work on gloves. So picking the side is the only way to dodge misses.
:::

:::zundamon normal
Did Greater get used a lot?
:::

:::metan normal
We ran a calculation that worked backward to find the best moves for gloves. The top orderings almost never used "Greater + side omen for two on one side."
:::

:::metan normal
Allowing that move only changed the calculated expected cost of the later steps from 54.8 to 54.7 div.
:::

:::zundamon surprised
I thought two at once would be faster!
:::

:::metan normal
So did I at first. But when targets fill one at a time, open slots and misses seem to matter more.
:::

:::note fold Not yet verified (4)
- The best-move result is a calculation experiment, not an ExileDesk feature (automatic crafting isn't part of the site). It covers one glove base and one fixed finished item; we haven't checked whether it carries over to other slots.
- Greater + side omen putting two mods on one side is how our engine works. We haven't confirmed it with many in-game uses.
- Prices are poe2db rates; the direction is our estimate.
- Omen of Homogenising Exaltation is left out because we couldn't confirm it can be obtained in the current version.
:::

:::tip Rule of thumb
If your targets are on one side only, pick that side with Sinistral or Dextral. Only consider Greater when the target side has two or more open slots.
:::

Side omens pick the side, and Greater raises the count. Greater stops when slots run out, so check the open slots on your target side first.

## Where the Numbers Come From

:::fold Show sources (7)
- Omen names and effects: poe2db descriptions (English and Japanese pages). **poe2db / CoE**
- Prices (Sinistral ~0.1 div, Dextral ~9 Exalted Orbs, Greater ~3 Exalted Orbs): trade rates on poe2db pages, read 2026-10-22. Direction is **estimated**
- Greater adds one mod when one slot is open: rule checked against Craft of Exile (rollAffixes), docs/reviews/2026-10-17-rule-checklist.md. **poe2db / CoE**
- Greater + side omen = two mods on that side, and the screen text fix: ExileDesk v0.1.450. **Engine**
- Catalysing + Greater weights both mods, multiplier 1 + 0.2 × quality: Craft of Exile (exaltedParams), v0.1.525 and v0.1.534. **poe2db / CoE**
- ES gloves at 105 div: ExileDesk engine, 300 runs ([ES gloves post](/en/blog/es-gloves-greater-exalt/)). **Engine**
- 54.8 → 54.7 div: backward best-move calculation experiment on gloves. **Engine** (calculation experiment)
:::

## Try It Yourself

On the [crafting bench](/?base=Sirenscale%20Gloves) you can activate an omen and then use an Exalted Orb. Try Omen of Greater Exaltation on a Rare with one open slot and watch it stop at one mod.

**Related posts**

- [PoE2 omens worth it? When a plain Annul is enough](/en/blog/are-omens-worth-it/)
- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Energy Shield gloves craft: Greater Exalt beats Perfect](/en/blog/es-gloves-greater-exalt/)

VOICEVOX: Zundamon / Shikoku Metan
