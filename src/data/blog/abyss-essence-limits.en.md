---
title: PoE2 Essence of the Abyss: When You Can't Use It
description: When PoE2's Essence of the Abyss won't apply: 27 item types, blocked by revealed Desecrated mods, random removal, and the Mark's tier floor.
date: 2026-11-03
updated: 2026-11-06
tags: Essence of the Abyss, Mark of the Abyssal Lord, Desecration, bones, Essence
craft: /?base=Gold%20Ring
ready: true
draft: true
---
PoE2's Essence of the Abyss **can't be used on a rare item that already has a revealed Desecrated mod**. If the Desecrated mod is still unrevealed, it works: like any other Essence, it removes one random mod and adds a Mark of the Abyssal Lord. It applies to 27 item types, and never to Jewels, Flasks or Charms.

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
- An unrevealed Desecrated mod doesn't block it. The removed mod is random, so the unrevealed mod may stay next to the Mark
- Desecrating a Mark with a bone removes it and gives an unrevealed mod. The tier floor is **the removed mod's level × 0.4, rounded**, and tiers at or below it can't appear
:::

:::tip New to this? Words used here
- **Essence of the Abyss**: removes one mod from a rare item and adds a Mark of the Abyssal Lord
- **Mark of the Abyssal Lord**: the mod from that essence. A bone later turns it into a Desecrated mod
- **Desecrated mod**: a special mod added by bones. It starts "unrevealed" and you pick what it becomes when you reveal it
- **Reveal**: choose one of three options to decide what an unrevealed Desecrated mod becomes
- **Modifier level**: the level set for each mod tier. An item needs at least this item level to roll that tier
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
| Has an **unrevealed** Desecrated mod | Yes. It's just one of the mods that can be removed | Checked in game by the site owner (2026-11-06) |
| Item is full | Yes. It removes one mod first (it removes one even with open slots) | Read from poe2db item text (removes one, then adds) |

:::zundamon surprised
Unrevealed is fine, but revealed is blocked!
:::

:::metan normal
Right. But the Mark doesn't replace the unrevealed mod. The removed mod is random, so the unrevealed one can stay right next to the Mark.
:::

:::zundamon normal
And after it's revealed?
:::

:::metan normal
Remove it first with an Orb of Annulment or similar, just like before using a bone.
:::

## Which Side Does the Mark Land On?

Like a regular Perfect Essence, the Essence of the Abyss first removes one non-fractured mod at even odds, and the Mark lands on **the side of the removed mod**. It removes one even when there are open slots. An unrevealed Desecrated mod is in that pool with the same odds as every other mod.

| Item (no omen) | What's removed | Mark lands on |
|---|---|---|
| Has removable mods (unrevealed Desecrated mods included) | One non-fractured mod, evenly | The removed mod's side |
| Nothing removable (all fractured, etc.) | Nothing | An open side (or the omen's side) |

"Lands on the removed side" follows community crafting guides from around 0.5.5. poe2db doesn't state a side rule.

:::note fold What we haven't checked (3)
- The side the Mark lands on follows outside guides. We have not counted it dozens of times in game.
- "Already has a Mark" and "already has an Essence mod" are ExileDesk engine rules and are not written on poe2db.
- How it combines with Fractured or Corrupted items is not covered on that poe2db page.
:::

## Desecrating the Mark Sets a Tier Floor

Using a bone on an item with a Mark always removes the Mark and replaces it with an unrevealed Desecrated mod. The reveal options then get a tier floor. The floor comes from **the modifier level of the mod the Essence of the Abyss removed** (call it L), not from the item level.

| Number | Value | Tiers offered |
|---|---|---|
| Floor formula | L × 0.4, rounded. **Tiers at or below it can't appear** (an exact match is out too) | — |
| L = 75 | 75 × 0.4 = 30 → **30** | Modifier level 31 and up |
| L = 79 | 79 × 0.4 = 31.6 → **32** | Modifier level 33 and up |
| Mark with no removed mod | No floor | All tiers |

If the removed mod was an unrevealed Desecrated mod, it counts as modifier level 1, so there's effectively no floor. When an Ancient bone's floor of 40 also applies, the stricter one wins.

:::zundamon normal
So going through the Mark keeps weak tiers out?
:::

:::metan happy
The higher the tier the Essence removed, the more low tiers get cut. Even a Preserved bone can skip the weakest tiers that way. How each bone differs is in [Gnawed, Preserved, Ancient Bone](/en/blog/desecration-bone-types/).
:::

:::metan normal
One catch: if the Mark is fractured, a bone won't replace it.
:::

:::tip Order for redoing a Desecration
Before revealing, you can still use an Essence of the Abyss, but it removes one random mod, so the unrevealed mod may stay. After revealing, remove the Desecrated mod first, then use the essence.
:::

The Essence of the Abyss is blocked by a revealed Desecrated mod, and with an unrevealed one it removes one random mod as usual. Desecrating the Mark with a bone keeps out tiers at or below the removed mod's level × 0.4, rounded.

## Where the Numbers Come From

:::fold Show sources (4)
- Item types, item text and Mark rules: poe2db's Essence of the Abyss and Mark of the Abyssal Lord pages (English and Japanese, read 2026-10-22). Research notes docs/org/research/notes/2026-10-22-abyss-essence-limits.md. poe2db
- Revealed vs unrevealed Desecrated mods: checked in game by the site owner (blocked by revealed = 2026-10-16; unrevealed is not swapped, just one of the removable mods = 2026-11-06). E-52 in docs/spec/engine.md. Game
- Which side the Mark lands on: community crafting guides (0.5.5). Estimate
- Bone tier floor (removed mod's level × 0.4, rounded; tiers at or below it are out): ExileDesk rule following the site owner's in-game check (2026-11-06, E-65 in engine.md). Game
:::

## Try It Yourself

On the ExileDesk [crafting bench](/?base=Gold%20Ring), use an Essence of the Abyss on a ring with an unrevealed Desecrated mod and watch it remove one mod and add a Mark.

**Related posts**

- [PoE2 Gnawed, Preserved, Ancient Bone: Which to Use](/en/blog/desecration-bone-types/)
- [PoE2 Desecration: Which Side Does a Bone Land On?](/en/blog/desecration-bone-sides/)
- [PoE2 Fracturing Orb: Desecrated Mods Can't Be Fractured](/en/blog/fracture-desecrated/)

**Update history**

- 2026-11-06: Corrected two mistakes. (1) We said the Mark replaces an unrevealed Desecrated mod. In game it doesn't: like any other mod, one random mod is removed. (2) We said the bone tier floor was item level × 0.4, rounded down. It's actually the modifier level of the mod the Essence removed × 0.4, rounded, and tiers at or below that value can't appear.
- 2026-11-03: Published.

VOICEVOX: Zundamon / Shikoku Metan
