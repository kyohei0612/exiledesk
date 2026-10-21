---
title: PoE2 Fracturing Orb and Desecrated Mods: 0 Fixed in 24 Tries
description: In PoE2, a Fracturing Orb never picks a Desecrated mod to fracture. Desecrated mods count toward the four-mod requirement but are never chosen. We explain the rule from 24 in-game tries with zero hits and three rounds of fixes.
date: 2026-10-22
tags: Fractured, Desecration, Fracturing Orb, bones, corrections
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
In PoE2, a Fracturing Orb **never picks a Desecrated mod to fracture**. Desecrated mods count toward the "four or more mods" requirement, but they are never the one that gets fixed. The owner used Fracturing Orbs 24 times in game and a Desecrated mod was fractured zero times. ExileDesk rebuilt this rule three times before getting it right.

Fracturing fixes one mod so Chaos Orbs and Orbs of Annulment can't remove it. Fracture one high-tier mod and you can retry the rest as often as you like without losing it. The Gold Ring video also fractured Spell Damage before starting chaos spam.

## The Fracturing Rules

| Rule | Detail |
|---|---|
| Usable on | Rare items with 4 or more mods |
| Mods fixed | one |
| Which one | chosen evenly among eligible mods |
| Not eligible | Unrevealed Desecrated slots, mods added by Desecration |
| Eligible | normal mods, Essence and crafted mods |

The ExileDesk engine also picks "evenly among eligible mods." For example, with four mods where one came from Desecration, your target is fractured one time in three, not one in four.

## Three Rounds of Fixes

ExileDesk changed this rule three times:

1. **v0.1.464**: we let Desecrated mods be fractured from the starting state, assuming they could be.
2. **v0.1.466**: Desecrated mods, even revealed, were no longer fractured. They counted toward four but were removed from the candidates. The previous version was wrong.
3. **v0.1.469**: normal mods added by a bone (Reveal options include normal mods) were made fracturable again, on the theory that only Unrevealed slots and Desecrated-only mods were excluded.
4. **v0.1.471**: after the owner tested 24 times in game, Desecrated mods were never chosen even when revealed, and **normal mods added by a bone weren't chosen either**. That is the current rule.

The first two came from inferring rules from what is written; the last from counting in game. For fine details the descriptions don't cover, testing and counting beat inference.

## Desecration as "Just Adding a Count"

This rule can be used in a craft. Fracturing needs four mods. If you have three, Desecrating with a bone brings it to four, and since the Desecrated mod can't be fractured, **you add to the count without adding a candidate**.

The Gold Ring video did exactly this. After rolling Spell Damage to 34 with a Divine Orb, it Desecrated to reach four mods, then used a Fracturing Orb (the moments of Desecration and fracturing aren't shown on screen; this is read from the captions). Adding a normal mod instead would make four candidates and drop your target's chance to one in four. Adding a Desecrated mod keeps it at one in three.

On the [crafting bench](/?base=Gold%20Ring), bring an item to four mods and use a Fracturing Orb to see the candidates and their chances.

## Where the Numbers Come From

- 0 in 24: the owner's in-game count (around v0.1.471).
- The rules table: the ExileDesk engine (fracture chance chosen evenly among eligible mods) and our record of confirmed rules.
- The fixes: ExileDesk release notes (v0.1.464, 466, 469, 471).

**Related posts**

- [PoE2 Gold Ring craft, step by step](/en/blog/gold-ring-video-decoded/)
- [PoE2 Desecration weights](/en/blog/desecration-weights/)
