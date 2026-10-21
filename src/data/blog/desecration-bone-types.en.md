---
title: PoE2 Gnawed, Preserved, Ancient Bone: Which to Use
description: We checked PoE2 desecration bones on poe2db and Craft of Exile. Bones split by slot (Jawbone, Rib, Collarbone); on Ribs, Gnawed works up to Item Level 64 and Ancient has Minimum Modifier Level 40. Prices and which bone is enough.
date: 2026-10-22
tags: Desecration, bones, Ancient Rib, Preserved Rib, Craft of Exile
image: img/desecration-bone-types-og.en.png
draft: true
---
PoE2 desecration bones come in **three slots (Jawbone, Rib, Collarbone) and three grades (Gnawed, Preserved, Ancient)**. On Ribs, the ones we checked, a Gnawed Rib only works on items up to Item Level 64, a Preserved Rib has no restriction, and an Ancient Rib adds "Minimum Modifier Level 40".

We were planning how to get the Desecrated Arcane Surge mod onto a pair of gloves when the bone choice stopped us. Several bones with near-identical names, and prices that differ by orders of magnitude.

If the expensive bone rolled better mods, it would be worth paying for, right? But on Intelligence gloves at Item Level 82, the Ancient bone's restriction didn't remove a single Desecrated mod from the pool.

Here is what splits the bones, where the differences actually show up, and what is still unknown.

:::summary What you'll learn
- Bones are slot-specific: Jawbone = weapons and quivers, Rib = armour, Collarbone = amulets, rings and belts
- A Gnawed Rib is capped at Item Level 64, so it can't be used on Item Level 82 gloves (only Ribs were checked)
- The Ancient Rib's Minimum Modifier Level 40 doesn't filter any glove Desecrated mod (all are modifier level 65)
- Ancient bones are by far the most expensive; on Item Level 65+ gear, a Preserved bone is the sensible default
:::

## Each Slot Has Its Own Bone

Bones don't work on every item. The item descriptions list what each one desecrates:

| Bone | Desecrates (item description) |
|---|---|
| Jawbone | a Rare Weapon or Quiver |
| Rib | a Rare Armour |
| Collarbone | a Rare Amulet, Ring or Belt |

Gloves and helmets are armour, so they take a Rib; rings take a Collarbone. There is also an Altered Collarbone, whose description adds a "chance for otherworldly modifiers".

In ExileDesk, v0.1.508 fixed talismans being treated as armour, which kept faction omens from working, and made their bones Jawbones. The same version stopped offering bones for sceptres that have no Desecrated mods.

## Gnawed vs Preserved vs Ancient: Only the Level Limits Differ

Within a slot, all three grades simply "desecrate"; the difference is a level restriction. Here are the Ribs:

| Bone | Restriction | Item Level 82 Intelligence gloves (Craft of Exile) |
|---|---|---|
| Gnawed Rib | Maximum Item Level 64 | **Not usable** (greyed out) |
| Preserved Rib | None | Usable |
| Ancient Rib | Minimum Modifier Level 40 | Usable |

Craft of Exile's hover on the Gnawed Rib reads "Maximum Item Level 64 / Item level cannot be over 64". On gear at Item Level 65 or higher, it's simply off the table.

The Ancient Rib's "Minimum Modifier Level 40" appears the same way on both poe2db and Craft of Exile.

## Does Minimum Modifier Level 40 Filter Any Desecrated Mod?

Not on Intelligence gloves. They have 15 Desecrated mods (Amanamu 3, Kurgal 5, Ulaman 7), and **every one is modifier level 65 with a single tier**. Nothing falls below 40, so the pool stays the same.

Greater and Perfect orbs use a minimum modifier level to cut low tiers. Glove Desecrated mods have no low tiers, so that logic has nothing to cut.

Whether the bone grade changes which mods appear, or how often, is a separate question. Neither poe2db nor Craft of Exile says.

:::note What we haven't confirmed
- Whether the bone grade changes the Desecrated mod pool or its odds is unconfirmed (neither poe2db nor Craft of Exile lists it).
- We only checked the level limits on Ribs (Intelligence gloves). We haven't confirmed that Jawbones and Collarbones of the same grade have the same limits.
- The Gnawed Rib's Item Level 64 cap was confirmed in Craft of Exile's hover. Our research notes disagree on whether poe2db's bone page states it, so this post relies on Craft of Exile.
:::

### How Much Do Bones Cost?

Both price sources agree on one thing: Ancient bones are far more expensive than the rest.

| Bone | poe2db in-page trade rate (2026-10-21) | ExileDesk server price (2026-10-20) |
|---|---|---:|
| Gnawed Rib | 4 Chaos Orbs each | 6.39 Exalted |
| Preserved Rib | 1 Exalted Orb buys 1.15 | 6.75 Exalted |
| Ancient Rib | 2.4 Divine Orbs each | 4,702 Exalted |

The two sources disagree on whether Gnawed or Preserved is cheaper. The direction of poe2db's rates is our reading of its notation (an estimate), and thinly traded items are weak as a guide.

:::tip On Item Level 65+ gear, start with a Preserved bone
A Gnawed bone can't be used, and the Ancient bone's floor removes no Desecrated mods. Given the price gap, a Preserved bone is the sensible default for Item Level 65+ gear (whether the grade changes the odds is unconfirmed, so that part is a judgment call).
:::

## How ExileDesk Handles Bone Grades

The emulator's rules for bones were settled over a few versions:

- **v0.1.467**: With Preserved bones, Ancient bones and the Altered Collarbone, Desecrated-only mods can appear as reveal options **regardless of item level**. Low item level gear can roll T1, which may raise the level requirement. Gnawed bones are unchanged.
- **v0.1.531**: Bones on a Mark of the Abyssal Lord (from an Essence of the Abyss) now have a minimum tier of "item level × 0.4" (same as Craft of Exile; previously fixed at 33).
- **v0.1.508**: Talismans take Jawbones; no bones for sceptres without Desecrated mods.

Which side (prefix or suffix) a bone lands on is a separate rule from the grade; see [Desecration and Omen of Necromancy: Which Side?](/en/blog/desecration-bone-sides/).

## Where the Numbers Come From

- What each slot's bone desecrates and the Altered Collarbone text: in-game item descriptions (ExileDesk's currency text table, poe2db) (poe2db / CoE).
- Gnawed Rib Item Level 64 cap, no restriction on the Preserved Rib, Ancient Rib Minimum Modifier Level 40: Craft of Exile bone hovers (Gloves (INT), Sirenscale Gloves, Item Level 82, 2026-10-21); the level 40 floor also matches poe2db (poe2db / CoE).
- 15 Desecrated mods on Intelligence gloves, all modifier level 65 with one tier: poe2db's Intelligence gloves page and Craft of Exile's "Desecrated Suffixes" (poe2db / CoE).
- Prices: poe2db in-page trade rates (2026-10-21, direction estimated) and the ExileDesk server prices (2026-10-20) (estimate).
- ExileDesk's handling: changelog v0.1.467, v0.1.531, v0.1.508 (engine).

## Try It Yourself

Try different bones on Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves) and compare the reveal options. To compare costs of routes that include desecration, use the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Desecration and Omen of Necromancy: Which Side?](/en/blog/desecration-bone-sides/)
- [PoE2 Craft of Exile Desecrate: No Handler, No Weights](/en/blog/coe-desecrate-no-handler/)
- [PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often](/en/blog/arcane-surge-desecrated-gloves/)
