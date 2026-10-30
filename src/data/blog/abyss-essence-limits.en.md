---
title: PoE2 Essence of the Abyss: When You Can't Use It
description: When PoE2's Essence of the Abyss won't apply: 27 item types, blocked by revealed Desecrated mods, swaps with unrevealed ones, and the Mark's tier floor.
date: 2026-11-07
tags: Essence of the Abyss, Mark of the Abyssal Lord, Desecration, bones, Essence
craft: /?base=Gold%20Ring
ready: true
draft: true
---
PoE2's Essence of the Abyss **can't be used on a rare item that already has a revealed Desecrated mod**. If the Desecrated mod is still unrevealed, it works, and the Mark of the Abyssal Lord replaces that unrevealed mod. It applies to 27 item types, and never to Jewels, Flasks or Charms.

:::zundamon troubled
I'm holding an Essence of the Abyss and clicking my ring, but nothing happens.
:::

:::metan normal
Does the ring already have a Desecrated mod?
:::

:::zundamon normal
It does. I revealed it with a bone.
:::

:::metan normal
That's it. A revealed Desecrated mod blocks the Essence of the Abyss. Let's go through the rules that were checked in game.
:::

:::summary What you'll learn
- It works on **27 item types**: weapons, armour, jewellery and more. Not on Jewels, Flasks or Charms
- It's blocked on non-rares, items that already have a Mark, items with a **revealed** Desecrated mod, and items that already have an Essence mod
- With an unrevealed Desecrated mod, it works and the Mark replaces that unrevealed mod
- Desecrating a Mark with a bone removes it and gives an unrevealed mod. ExileDesk uses a tier floor of **item level × 0.4** (Craft of Exile's formula)
:::

:::tip New to this? Words used here
- **Essence of the Abyss**: removes one mod from a rare item and adds a Mark of the Abyssal Lord
- **Mark of the Abyssal Lord**: the mod from that essence. A bone later turns it into a Desecrated mod
- **Desecrated mod**: a special mod added by bones. It starts "unrevealed" and you pick what it becomes when you reveal it
- **Reveal**: choose one of three options to decide what an unrevealed Desecrated mod becomes
- **Fractured**: a mod locked in place so it can't be removed
:::

## It Works on 27 Item Types

poe2db's Mark table lists 27 item types, each with a Mark on both the prefix and suffix side.

| Group | Item types |
|---|---|
| Weapons (16) | One Hand Swords, One Hand Axes, One Hand Maces, Two Hand Swords, Two Hand Axes, Two Hand Maces, Spears, Bows, Crossbows, Quarterstaves, Daggers, Staves, Wands, Sceptres, Flails, Talismans |
| Armour and off-hands (7) | Helmets, Body Armours, Gloves, Boots, Shields, Bucklers, Foci |
| Jewellery and more (4) | Rings, Amulets, Belts, Quivers |

Jewels, Charms, Flasks, Relics, Tablets and Waystones are not on the table, so they have no Mark at all.

:::zundamon normal
So no Essence of the Abyss on Jewels?
:::

:::metan normal
There's no Mark for it to add. To desecrate a Jewel, use a bone directly.
:::

## Four Cases Where It's Blocked

Here is when the Essence of the Abyss can and can't be used, with sources.

| Case | Usable? | Source |
|---|---|---|
| Not rare (Normal or Magic) | No | poe2db item text (used on a rare item) |
| Already has a Mark of the Abyssal Lord | No | ExileDesk engine rule |
| Has a **revealed** Desecrated mod | No | Checked in game by the site owner (2026-10-16) |
| Already has an Essence mod | No (Astrid's Creativity raises the limit) | ExileDesk engine rule |
| Has an **unrevealed** Desecrated mod | Yes. The Mark replaces the unrevealed mod | Checked in game by the site owner (2026-10-16) |
| Item is full | Yes. It removes one mod first (it removes one even with open slots) | Read from poe2db item text (removes one, then adds) |

:::zundamon surprised
Unrevealed is fine, but revealed is blocked!
:::

:::metan normal
Before you reveal it, you can turn it back into a Mark. That's handy when you want to redo the bone.
:::

:::zundamon normal
And after it's revealed?
:::

:::metan normal
Remove it first with an Orb of Annulment or similar, just like before using a bone.
:::

## Which Side Does the Mark Land On?

The Essence of the Abyss first removes one non-fractured mod, and the Mark lands on **the side of the removed mod**. It removes one even when there are open slots. If there is an unrevealed Desecrated mod, that one goes first and becomes the Mark.

| Item (no omen) | What's removed | Mark lands on |
|---|---|---|
| Has an unrevealed Desecrated mod | That unrevealed mod | Its side |
| No unrevealed mod | One non-fractured mod, evenly | The removed mod's side |
| Nothing removable (all fractured, etc.) | Nothing | An open side (or the omen's side) |

"Lands on the removed side" follows community crafting guides from around 0.5.5. poe2db doesn't state a side rule.

:::note fold What we haven't checked (3)
- The side the Mark lands on follows outside guides. We have not counted it dozens of times in game.
- "Already has a Mark" and "already has an Essence mod" are ExileDesk engine rules and are not written on poe2db.
- How it combines with Fractured or Corrupted items is not covered on that poe2db page.
:::

## Desecrating the Mark Sets a Tier Floor

Using a bone on an item with a Mark always removes the Mark and replaces it with an unrevealed Desecrated mod. The reveal options then get a tier floor (if an Ancient bone's floor of 40 is higher, that one applies).

| Number | Value | Example |
|---|---|---|
| Floor formula | Item level × 0.4, rounded down | — |
| Item level 82 | 82 × 0.4 = 32.8 → **32** | Tiers below modifier level 32 can't be offered |
| Item level 65 | 65 × 0.4 = 26 → **26** | Tiers below modifier level 26 can't be offered |

The formula is Craft of Exile's. poe2db only says the Mark becomes "a higher tier" unrevealed mod.

:::zundamon normal
So going through the Mark keeps weak tiers out?
:::

:::metan happy
It lets even a Preserved bone cut the lowest tiers. With an Ancient bone, its floor of 40 is higher. How each bone differs is in [Gnawed, Preserved, Ancient Bone](/en/blog/desecration-bone-types/).
:::

:::metan normal
One catch: if the Mark is fractured, a bone won't replace it.
:::

:::tip Order for redoing a Desecration
Before revealing, an Essence of the Abyss turns it back into a Mark. After revealing, remove the Desecrated mod first, then use the essence.
:::

The Essence of the Abyss is blocked by a revealed Desecrated mod and swaps in for an unrevealed one. In ExileDesk, desecrating the Mark with a bone gives a tier floor of item level × 0.4.

## Where the Numbers Come From

:::fold Show sources (4)
- Item types, item text and Mark rules: poe2db's Essence of the Abyss and Mark of the Abyssal Lord pages (English and Japanese, read 2026-10-22). Research notes docs/org/research/notes/2026-10-22-abyss-essence-limits.md. poe2db
- Revealed vs unrevealed Desecrated mods: checked in game by the site owner (2026-10-16). E-52 in docs/spec/engine.md. Game
- Which side the Mark lands on: community crafting guides (0.5.5). Estimate
- Bone tier floor (item level × 0.4, rounded down): ExileDesk follows Craft of Exile here (E-65 in engine.md). Craft of Exile
:::

## Try It Yourself

On the ExileDesk [crafting bench](/?base=Gold%20Ring), use an Essence of the Abyss on a ring with an unrevealed Desecrated mod and watch it turn into a Mark.

**Related posts**

- [PoE2 Gnawed, Preserved, Ancient Bone: Which to Use](/en/blog/desecration-bone-types/)
- [PoE2 Desecration: Which Side Does a Bone Land On?](/en/blog/desecration-bone-sides/)
- [PoE2 Fracturing Orb: Desecrated Mods Can't Be Fractured](/en/blog/fracture-desecrated/)
