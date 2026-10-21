---
title: PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal
description: Neither poe2db nor Craft of Exile publishes weights for PoE2's Desecrated-only mods (CoE has all 247 at 1). Here is a community count of 563 rings, why ExileDesk set them all equal, and the 85/14/1% split of options.
date: 2026-10-22
tags: Desecration, weight, Reveal, bones, Craft of Exile
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
PoE2's Desecrated-only mod weights **have no real numbers on poe2db or in Craft of Exile**. Craft of Exile's data has all 247 Desecrated mods at weight 1, meaning "unknown." So ExileDesk makes every Desecrated-only mod **equally likely**. About the only measured figure is a community count over 563 rings of how many Desecrated-only mods appear among the reveal options (one 85%, two 14%, three 1%).

Desecration puts an Unrevealed mod on an item with a bone, and when you Reveal it you pick one of three options. The options mix Desecrated-only mods (from Amanamu, Kurgal and Ulaman) with normal mods. Which ones come up is essential for any cost calculation, and it's a blank.

## What Is Known

| Item | Figure | Source |
|---|---|---|
| Desecrated-only mods among the 3 options | one 85% / two 14% / three 1% (never zero) | community count, 563 rings (Reddit) |
| Ring Desecrated-only suffix shares | from 11.8% (Strength + Dexterity) down to 1.2% (cooldown) | same count |
| Ring Desecrated-only prefix shares | from 19.4% (remnant) down to 9.8% (ignite) | same count |
| Craft of Exile Desecrated weights | all 247 at 1 | CoE data (copy from 2026-10-09) |
| Glove Desecrated weights | no weight column; "No handler for crafting this method" | CoE screen |

There is also a claim that "at Item Level 65+, at least one of the three options is Desecrated-only and the others are each about 50%," but its basis is weak and ExileDesk doesn't use it.

## We Used to Stretch the Ring Count to Other Slots

ExileDesk used the community count directly for rings, and for other slots applied the ring ratios to the same mods. Only rings were measured, so gloves and weapons were estimates on top of estimates.

So we made all Desecrated-only mods **equally likely** (v0.1.528). Since the game doesn't publish them, it is better to make "we don't know" explicit than to mix in weak guesses. The 85/14/1% option split still comes straight from the ring count.

## How Often a Mod Shows Up When All Are Equal

With equal weights, the odds come down to how many Desecrated-only mods there are. Intelligence gloves have 15, so roughly one in fifteen for any one mod. But you pick from three options, so the chance your target appears among them is somewhat higher. On the ExileDesk engine, Arcane Surge appeared among the three options on Intelligence gloves 7.40% of 5,000 tries ([Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)).

On the [crafting bench](/?base=Gold%20Ring), use a bone and Reveal to see the options alongside each one's chance.

## Attribute Mods Don't "All Disappear"

The community post also said "if the item has an attribute, Desecrated attribute mods all stop appearing." But the trade site had 576 rings (2026-10-09) with both a Desecrated "Strength + Dexterity" and a normal "Intelligence." The owner's call: **only mods that share a group (Strength with Strength, Dexterity with Dexterity) are blocked**, and the engine stays that way.

## What's Next

Desecration weights will change as more is measured. ExileDesk lets users change mod weights themselves: "equal by default, editable if you want." When new measurements appear, we'll apply them and cite the source.

## Where the Numbers Come From

- 85/14/1% and ring shares: a community count on Reddit (563 rings). No counts for other slots were found.
- All 247 at 1: a copy of Craft of Exile's data (2026-10-09). Glove display: CoE's screen.
- 7.40%: the ExileDesk engine, 5,000 tries (assuming equal weights).
- 576 listings: a trade site search (2026-10-09).

**Related posts**

- [PoE2 Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Cast Speed weight on poe2db](/en/blog/poe2db-cast-speed-weight/)
