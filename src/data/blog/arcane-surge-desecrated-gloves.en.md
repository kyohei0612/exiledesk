---
title: PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often
description: In PoE2, the Desecrated Arcane Surge mod (of Kurgal) only rolls on gloves with Intelligence; on Intelligence gloves it is one of 15 Desecrated mods. It appears among the 3 reveal options 7.4% of the time on the ExileDesk engine.
date: 2026-10-22
tags: Desecration, Arcane Surge, gloves, Rib, Kurgal
tree: /?page=sim-tree&base=Sirenscale%20Gloves
craft: /?base=Sirenscale%20Gloves
draft: true
---
In PoE2, the Desecrated Arcane Surge mod (of Kurgal: "(10–15)% chance to gain Arcane Surge when you deal a Critical Hit") rolls only on **gloves with Intelligence** (Intelligence, Strength/Intelligence and Dexterity/Intelligence). On Intelligence gloves it is one of 15 Desecrated mods, and on the ExileDesk engine it appeared among the three reveal options 7.4% of the time.

One common ES glove craft fills a suffix slot with a Desecrated Arcane Surge, right?

But once we started researching it, we found claims like "only on Intelligence gloves" and "nine Desecrated mods" mixed in. They needed a recount.

So we recounted on poe2db and Craft of Exile.

:::summary What you'll learn
- Arcane Surge rolls only on gloves with Intelligence (Intelligence, Strength/Intelligence, Dexterity/Intelligence). Intelligence gloves have 15 Desecrated mods
- You pick one of three options on Reveal, so the odds are not 1/15 but "shows up among the options": **7.40%** on the engine
- A Preserved Rib (6.75 Exalted Orbs) is enough. Even an Ancient Rib (4,702 Exalted Orbs) removes none of the Desecrated mods
- Craft of Exile can't calculate Desecration weights either
:::

## Arcane Surge Rolls Only on Gloves with Intelligence

Every Desecrated mod on gloves is a suffix with modifier level 65. The count depends on the glove's attributes.

| Glove attributes | Desecrated mods | Amanamu / Kurgal / Ulaman | Arcane Surge |
|---|---:|---|---|
| Intelligence | 15 | 3 / 5 / 7 | yes |
| Strength | 11 | 3 / 3 / 5 | no |
| Dexterity | 13 | 5 / 3 / 5 | no |
| Strength + Intelligence | 15 | 3 / 5 / 7 | yes |
| Dexterity + Intelligence | 17 | 5 / 5 / 7 | yes |
| Strength + Dexterity | 13 | 5 / 3 / 5 | no |

On Intelligence gloves, Kurgal's five are Arcane Surge, Cast Speed while on Full Life, Mana Cost Efficiency, Dexterity and Intelligence, and Cold and Chaos Resistance.

Craft of Exile's "Desecrated Suffixes" for Intelligence gloves (Item Level 82) also lists 15, matching poe2db.

The Omen of the Blackblooded, which guarantees a Kurgal mod, says "weapon or jewellery" on poe2db. It can't be used on gloves (armour), so on gloves you draw from all 15.

## The Odds Are Not 1/15 but 7.4% to Show Up Among the Options

An Unrevealed mod from Desecration lets you **pick one of three options** when you Reveal it. So the odds are not "one of 15." They are "how often Arcane Surge is among the three options."

The ExileDesk engine draws 1, 2 or 3 Desecrated-only mods among the three options at 85% / 14% / 1% (a community count of 563 rings). It fills the rest from normal mods by weight, and no two options share a mod group.

With that model, we Desecrated Intelligence gloves (Sirenscale Gloves, Item Level 82, prefixes full) with a Preserved Rib. Counting the options 5,000 times, Arcane Surge appeared **7.40%** of the time.

:::note 7.40% assumes equal weights
Nobody has published weights between Desecrated-only mods, so the engine treats them all as equal. It is not a measurement on gloves.
:::

If it doesn't show up, an Omen of Abyssal Echoes lets you draw one more set of options.

### When It Misses, Remove It with Omen of Light

When it misses, remove the unwanted Desecrated mod and Desecrate again.

Removing it with Omen of Dextral Annulment can also take out a target sitting next to it. In the [ES gloves article](/en/blog/es-gloves-greater-exalt/), that changed the cost a lot.

:::tip Use Omen of Light to remove it
Omen of Light (your next Orb of Annulment removes only Desecrated mods) takes off just the unwanted Desecrated mod.
:::

## A Preserved Rib Is Enough

Gloves (armour) are Desecrated with Ribs. Craft of Exile showed this for Item Level 82 Intelligence gloves:

| Bone | Shown | Market (Exalted Orbs) |
|---|---|---:|
| Gnawed Rib | unusable (Item Level 64 max) | 6.39 |
| Preserved Rib | usable | 6.75 |
| Ancient Rib | usable (Minimum Modifier Level 40) | 4,702 |

All Desecrated mods are level 65, so the Ancient Rib's minimum of 40 removes none of them. Whether the bone changes which options appear is not stated on poe2db or Craft of Exile.

Given the price gap, a Preserved Rib is the natural pick for gloves at Item Level 65 or above.

### Which Side It Lands On

Which side a Desecrated mod goes to follows Craft of Exile on the engine too. If both sides are open, it's half and half; if both are full, one non-Fractured mod is removed at random and the new one goes on that side.

Glove Desecrated mods are suffixes only, so with full prefixes it lands in the suffixes.

## Craft of Exile Can't Calculate Desecration Weights Either

Craft of Exile's Desecrated table has no weight column. Choosing "Desecrate" with a bone shows "No handler for crafting this method," so no odds are calculated.

Desecration weights are, for now, a blank everywhere.

## Where the Numbers Come From

- Counts and names: poe2db's six glove pages. The 15 on Intelligence gloves match Craft of Exile's screen.
- 7.40%: the ExileDesk engine, 5,000 tries. It assumes equal weights for Desecrated-only mods; it is not a measurement on gloves.
- Bones: Craft of Exile's screen. Prices: ExileDesk server market (2026-10-20 16:00 UTC).

## Try It Yourself

You can Desecrate gloves on the [crafting bench](/?base=Sirenscale%20Gloves) to see how the options come up. To compare methods side by side, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Energy Shield gloves craft](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Kolr's Hunt gloves](/en/blog/kolrs-hunt-gloves/)
- [PoE2 Desecration weights](/en/blog/desecration-weights/)
