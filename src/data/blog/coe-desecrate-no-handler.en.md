---
title: PoE2 Craft of Exile Desecrate: No Handler, No Weights
description: We checked Desecration odds on PoE2 Intelligence gloves (Item Level 82) in Craft of Exile. The 15-mod table has no Weight column, and Desecrate shows "No handler". What the three Ribs show, and how to plan.
date: 2026-10-22
tags: Desecration, Craft of Exile, Rib, gloves, weight
craft: /?base=Sirenscale%20Gloves
image: img/coe-desecrate-no-handler-og.en.png
ready: true
---
PoE2 Desecration odds **can't be calculated in Craft of Exile either**. On Intelligence gloves (Sirenscale Gloves, Item Level 82), the Desecrated table has no Weight column (in the data, every weight is a placeholder 1). Choosing "Desecrate" and a bone shows "No handler for crafting this method", and no odds are calculated. All you get is the list of mods that can roll and which bones are allowed.

:::zundamon normal
To price a craft, I just open Craft of Exile and I'm done.
:::

:::metan normal
For regular mods, yes. It gives you the odds and the average cost. It's a solid tool.
:::

:::zundamon surprised
For regular mods...? Is Desecration different?!
:::

:::metan troubled
We tried a glove craft with a Desecrated suffix, and only the Desecration step had no numbers at all. We read the screen piece by piece to confirm it.
:::

:::summary What you'll learn
- Craft of Exile lists 15 Desecrated suffixes for Intelligence gloves. The only columns are tiers and modifier level: **no Weight column**
- Choosing "Desecrate" plus a bone shows "**No handler for crafting this method**". No Desecration odds are calculated
- What the bones show, and how to plan a craft that includes Desecration. ExileDesk calculates it with all weights equal
:::

:::tip New to this? Words used here
- **Desecration**: A craft where a bone adds an Unrevealed mod
- **Rib**: The bone that Desecrates armour, such as gloves. It comes in three kinds: Gnawed, Preserved and Ancient
- **Weight**: A number for how often each mod rolls. Higher means more often
- **Modifier level**: A number fixed for each tier. Stronger tiers have higher levels
- **Minimum Modifier Level**: A floor. Tiers below this modifier level can't be added
- **Exalted Orb**: The unit for the bone prices in this post
:::

## What Does Craft of Exile Show for Desecrated Mods?

Only the names of the mods that can roll, their tiers and their modifier level.

:::zundamon normal
What do I see when I open Intelligence gloves?
:::

:::metan normal
At Item Level 82, the Desecrated Suffixes table lists 15 mods. All are modifier level 65 with a single tier (tier count = 1).
:::

:::zundamon normal
Does it show the weights?
:::

:::metan troubled
That's the problem. Let's put the tables side by side.
:::

| Table | Columns shown | Weights | What you learn |
|---|---|---|---|
| Regular suffixes | Has a Weight column (e.g. 4000) | Yes | Which mods roll, and how often |
| Desecrated suffixes | Tiers and modifier level only | **No** (no weight or percentage columns) | Only which mods can roll |
| Desecrated prefixes | No table at all | — | Desecrated glove mods are suffixes only |

:::zundamon surprised
Only the Desecrated table is missing the whole Weight column!
:::

:::metan normal
The 15 mods match poe2db's glove page: Amanamu 3, Kurgal 5, Ulaman 7.
:::

:::metan normal
The missing Desecrated prefix table matches poe2db too.
:::

:::zundamon normal
Maybe the weights are hidden deeper in the data?
:::

:::metan troubled
The 247 Desecrated-only mods do have weights, but they're all 1. That's a placeholder, not a real difference between mods.
:::

:::zundamon troubled
So I can see what rolls, but not how often each one rolls...
:::

## Desecrate Returns "No Handler for Crafting This Method"

To get to the odds, we picked "Desecrate" as the crafting method and chose a bone.

:::zundamon normal
Once you pick the method, the odds show up, right?
:::

:::metan troubled
The screen said "No handler for crafting this method", and nothing was calculated.
:::

:::zundamon surprised
So Craft of Exile has no Desecration logic at all?!
:::

:::metan normal
Not quite. Its code has the rule for which side a bone's mod lands on (poe2_desecrate).
:::

:::metan normal
ExileDesk matched that rule in v0.1.525.
:::

:::zundamon normal
Did you submit anything while checking?
:::

:::metan normal
Nothing. We only read the Craft of Exile page in Chrome.
:::

:::metan normal
The only things we touched were making the item rare and picking "Desecrate".
:::

| What we picked | Craft of Exile's screen | What happens |
|---|---|---|
| A regular crafting method | Shows the odds | You can estimate the cost |
| "Desecrate" + a bone | "No handler for crafting this method" | No odds; the calculation stops |

## What the Bone Picker Tells You

The bone picker does show which bones are allowed. Gloves are armour, so they're Desecrated with Ribs.

:::zundamon normal
What does the bone picker tell me?
:::

:::metan normal
On Item Level 82 gloves, the three Ribs showed up like this.
:::

| Rib | Craft of Exile (Item Level 82) | Price (Exalted Orbs) | What happens |
|---|---|---:|---|
| Gnawed Rib | **Unusable** (greyed out). Item Level 64 max | 6.39 | Can't be used on these gloves |
| Preserved Rib | Usable. No restriction shown | 6.75 | Works as is |
| Ancient Rib | Usable. Minimum Modifier Level 40 | 4,702 | Works, but removes no mods |

:::zundamon normal
Doesn't the Ancient Rib's Minimum Modifier Level 40 cut some options?
:::

:::metan normal
poe2db shows the same 40. But every Desecrated glove mod is modifier level 65, so that floor removes none of them.
:::

:::zundamon normal
Does the bone change which mods roll, or how often?
:::

:::metan troubled
Nothing says. Whether the pool changes by bone isn't listed on poe2db or Craft of Exile.
:::

:::zundamon normal
The "Pricing" field shows a number per bone: 0.0323, 0.0999 and 76.8.
:::

:::metan normal
We couldn't tell the unit, so we don't use those as prices.
:::

### How Should You Plan a Craft That Includes Desecration?

You have to **treat the Desecration step on its own**.

:::zundamon normal
Can't I estimate it like the regular mods?
:::

:::metan normal
Regular-mod steps can be estimated from weights. But nobody has numbers for hitting on the Desecration step.
:::

:::zundamon happy
There are 15 mods, so one of them is 1 in 15!
:::

:::metan troubled
That's a rough guide if every weight is equal. It comes to about 6.7%, but there's no guarantee. We found no measurements for gloves either.
:::

:::zundamon normal
Is there a way to narrow it to the family I want?
:::

:::metan troubled
The Omen of the Blackblooded forces a Kurgal mod, but poe2db's text says it's for Desecrating a weapon or jewellery. Gloves are armour, so it doesn't apply.
:::

| For your plan | What it means | Why |
|---|---|---|
| Desecration hit rate | Any number is an assumption. Rough guide: 1 in 15 (about 6.7%) | No weights, and no measurements for gloves |
| Narrowing to one family | Not possible on gloves | The Omen of the Blackblooded only works on weapons or jewellery |
| Choosing a bone | Choose by Item Level limit | At Item Level 82, the Gnawed Rib can't be used. The Ancient Rib's 40 removes no mods |

For the Desecration step alone, the practical move is to accept counting it on an assumed number.

:::note fold Not yet verified (5)
- Neither poe2db nor Craft of Exile publishes weights between Desecrated mods.
- We found no measurements of Desecration on gloves.
- Whether the bone type changes the pool is unconfirmed.
- What happens when you Desecrate gloves with every slot filled is unconfirmed.
- The Gnawed Rib's "Item Level 64 max" is what Craft of Exile shows. We didn't check poe2db's wording.
:::

## What ExileDesk Does Instead: Equal Weights

Where Craft of Exile doesn't calculate Desecration, ExileDesk does, treating **every Desecrated-only mod as equally weighted**.

:::zundamon normal
How does ExileDesk get its Desecration odds?
:::

:::metan normal
The owner decided on 2026-10-16: when it's unknown, make it uniform. So every weight is the same.
:::

:::metan normal
Why we chose that, and how the number of reveal options is decided, is in [the Desecration weights post](/en/blog/desecration-weights/).
:::

:::zundamon normal
Does this check change how it works?
:::

:::metan normal
It gave us nothing to change it with. It only confirmed that Craft of Exile's weights are placeholder 1s too, with no real numbers.
:::

:::metan normal
For which side a bone lands on when the item is full, we follow Craft of Exile's poe2_desecrate ([the bone sides post](/en/blog/desecration-bone-sides/)).
:::

:::tip Read Desecration numbers as a range
In ExileDesk too, the cost of any route that includes Desecration rests on the equal-weight assumption. When you target a specific Desecrated mod, expect the estimate to have a range.
:::

Craft of Exile tells you which mods Desecration can roll and which bones are allowed, and that's it. Plan with the Desecration hit rate as an assumed number, wherever you look it up.

## Where the Numbers Come From

:::fold Show sources (5)
- The 15-mod Desecrated table, its columns (tiers and modifier level only), the missing Weight column (the 247 mods are all 1 in the data, as in [the Desecration weights post](/en/blog/desecration-weights/)), "No handler for crafting this method", the three bones' labels and the "Pricing" figures: Craft of Exile's screen (beta.craftofexile.com, Intelligence gloves, Sirenscale Gloves, Item Level 82), 2026-10-21 (poe2db / CoE).
- The 15-mod breakdown, suffix-only, modifier level 65, the Omen of the Blackblooded text and the Ancient Rib's Minimum Modifier Level 40: poe2db's Intelligence gloves page and its omen and bone pages (poe2db / CoE).
- Bone prices (6.39 / 6.75 / 4,702 Exalted Orbs): ExileDesk server market prices (2026-10-20).
- 1 in 15 (about 6.7%): a rough guide assuming equal weights, not a measurement (estimate).
- Equal weights: the owner's decision (2026-10-16), the ExileDesk engine (engine).
:::

## Try It Yourself

Use a Rib on Sirenscale Gloves on the [crafting bench](/?base=Sirenscale%20Gloves) to see how the Desecration options come up.

**Related posts**

- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Desecration and Omen of Necromancy: Which Side?](/en/blog/desecration-bone-sides/)

VOICEVOX: Zundamon / Shikoku Metan
