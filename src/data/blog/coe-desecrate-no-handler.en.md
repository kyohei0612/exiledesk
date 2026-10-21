---
title: PoE2 Craft of Exile Desecrate: No Handler, No Weights
description: Craft of Exile has no Desecrate handler: on PoE2 Intelligence gloves (ilvl 82), its 15 Desecrated suffixes show no weights. What the bones show, and how to plan.
date: 2026-10-22
tags: Desecration, Craft of Exile, Rib, gloves, weight
tree: /?page=sim-tree&base=Sirenscale%20Gloves
craft: /?base=Sirenscale%20Gloves
image: img/coe-desecrate-no-handler-og.en.png
draft: true
---
In Craft of Exile, choosing Desecrate on screen gives you **"No handler for crafting this method"**, and no odds are produced for PoE2 Desecration. On Intelligence gloves (Sirenscale Gloves, Item Level 82), the Desecrated table has no Weight column either (in the data, every weight is a placeholder 1). What you do get is the list of mods that can roll and which bones are allowed.

If you price out crafts, Craft of Exile is probably the first tab you open. Pick the mods, and it hands you the odds and the average cost.

We tried to do exactly that for a glove craft with a Desecrated suffix, and got stuck on that one step. Every other step had numbers. The Desecration step had none.

So we went through the screen piece by piece to see what Craft of Exile shows for Desecration and what it leaves out.

:::summary What you'll learn
- Craft of Exile lists 15 "Desecrated Suffixes" for Intelligence gloves, with only Tiers and ILvl columns: **no weights**
- Choosing Desecrate plus a bone shows "**No handler for crafting this method**", so no odds are calculated
- Bones: Gnawed Rib is unusable (Item Level 64 max), Preserved Rib has no restriction shown, Ancient Rib has Minimum Modifier Level 40
- Plan the Desecration step on an assumption. ExileDesk treats every Desecrated mod as equally likely
:::

## What Does Craft of Exile Show for Desecrated Mods?

Names, tiers and mod levels, nothing more. Open Intelligence gloves at Item Level 82 and the "Desecrated Suffixes" table lists 15 mods, all at mod level 65 with a single tier (Tiers = 1).

| Table | Columns | Weights |
|---|---|---|
| Base Suffixes | includes a Weight column (e.g. 4000) | yes |
| Desecrated Suffixes | Tiers and ILvl only | **no** (no Weight / Type % / Weight % columns) |
| Desecrated Prefixes | the table doesn't exist | — |

The 15 mods match poe2db's glove page (Amanamu 3, Kurgal 5, Ulaman 7). No Desecrated prefix table also matches poe2db: on gloves, Desecrated mods are suffixes only.

Craft of Exile's data does hold weights for the 247 Desecrated-only mods, but they are all 1: a placeholder, not a difference between mods.

So you can see what can roll, but not how often each one rolls.

## Desecrate Returns "No Handler for Crafting This Method"

To get odds, we picked Desecrate as the crafting method and chose a bone. Craft of Exile showed "No handler for crafting this method" and calculated nothing.

For regular mods, choosing a method gets you numbers. For Desecration, choosing it on screen produces no odds. That doesn't mean Craft of Exile has no Desecration logic: its code has a side rule (poe2_desecrate) for which side a bone lands on, and ExileDesk matched it in v0.1.525.

We only read the page in Chrome. The only things we touched were "Change rarity to rare" on the item and the Desecrate option; nothing was submitted.

## What the Bone Picker Tells You

The bone picker does show which bones are allowed. Gloves are armour, so they're Desecrated with Ribs.

| Bone | Craft of Exile at Item Level 82 | Market price (Exalted Orbs) |
|---|---|---:|
| Gnawed Rib | **unusable** (greyed out): "Maximum Item Level 64 / Item level cannot be over 64" | 6.39 |
| Preserved Rib | usable, no restriction shown | 6.75 |
| Ancient Rib | usable: "Minimum Modifier Level 40" | 4,702 |

The Ancient Rib's Minimum Modifier Level 40 matches poe2db. But every Desecrated glove mod is mod level 65, so that cutoff removes none of them.

Whether it changes which mods appear, or how often, isn't shown anywhere. Whether the bone type changes the pool at all isn't listed on poe2db or Craft of Exile.

Craft of Exile's "Pricing" field also shows a number per bone (0.0323 / 0.0999 / 76.8). We couldn't read the unit, so we don't use those as prices.

### How Should You Plan a Craft That Includes Desecration?

**Treat the Desecration step separately.** You can estimate the regular-mod steps from weights, but nobody has numbers for the Desecration step.

Three things to keep in mind:

- **Any Desecration hit rate rests on an assumption.** If all weights are equal, one Desecrated mod on Intelligence gloves is 1 of 15 (about 6.7%). That's a rough guide, not a guarantee, and we found no measured data for gloves.
- **Gloves have no way to narrow the pool.** The Omen of the Blackblooded, which guarantees a Kurgal mod, says "weapon or jewellery" on poe2db. Gloves are armour, so it doesn't apply.
- **Pick the bone by Item Level.** At Item Level 82, the Gnawed Rib is out. The Ancient Rib's Minimum Modifier Level 40 doesn't remove any Desecrated glove mods.

:::note What is still unknown
Neither poe2db nor Craft of Exile publishes weights between Desecrated mods, and we found no measurements for gloves. Whether bone type changes the pool, and what happens when you Desecrate gloves with every slot filled, are unverified. The Gnawed Rib's "Item Level 64 max" is what Craft of Exile shows; we didn't confirm it on poe2db.
:::

## What ExileDesk Does Instead: Equal Weights

Where Craft of Exile stops, ExileDesk calculates Desecration by treating **every Desecrated-only mod as equally likely**. That follows the owner's call on 2026-10-16: when it's unknown, make it uniform. Why we chose equal weights and how the reveal options are counted is covered in [the desecration weights post](/en/blog/desecration-weights/).

This check didn't give us anything to change that with. It only confirmed that Craft of Exile's weights are placeholder 1s too, with no real numbers. For which side a bone lands on when the item is full, ExileDesk follows Craft of Exile's poe2_desecrate rule ([the bone sides post](/en/blog/desecration-bone-sides/)).

:::tip Read Desecration numbers as a range
In ExileDesk too, any cost that includes Desecration is built on the equal-weight assumption. When you target a specific Desecrated mod, expect the real cost to vary from the estimate.
:::

## Where the Numbers Come From

- The 15-mod Desecrated table, its columns (Tiers / ILvl only), the missing Weight column (the 247 mods are all 1 in the data, as in [the desecration weights post](/en/blog/desecration-weights/)), "No handler for crafting this method", the three bones' labels and the Pricing figures: Craft of Exile (beta.craftofexile.com, Gloves (INT), Sirenscale Gloves, Item Level 82), read on 2026-10-21 (poe2db / CoE).
- The Amanamu / Kurgal / Ulaman split, suffix-only, mod level 65, the Omen of the Blackblooded text and the Ancient Rib's Minimum Modifier Level 40: poe2db's Intelligence gloves page and the omen and bone pages (poe2db / CoE).
- Bone prices (6.39 / 6.75 / 4,702 Exalted Orbs): ExileDesk server market prices (2026-10-20).
- 1 in 15 (about 6.7%): a guide assuming equal weights, not a measurement (estimate).
- Equal weights: the owner's decision (2026-10-16), the ExileDesk engine (engine).

## Try It Yourself

Use a Rib on Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves) to see how Desecrated options come up. To compare costs for routes that include Desecration, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Desecration and Omen of Necromancy: Which Side?](/en/blog/desecration-bone-sides/)
