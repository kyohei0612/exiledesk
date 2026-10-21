---
title: PoE2 Fracturing Orb: Desecrated Mods Can't Be Fractured
description: In PoE2, a Fracturing Orb never fractures a Desecrated mod. They count toward the four-mod requirement but are left out of the pick. We once built it wrong; 24 in-game tries with 0 hits set us straight.
date: 2026-10-22
tags: Fracturing Orb, Desecration, Bone, correction
draft: true
---
In PoE2, a Fracturing Orb **can't fracture a Desecrated mod**. Desecrated mods count toward the "four or more mods" requirement, but they are never the one that gets fixed. The owner used a Fracturing Orb 24 times in game, and a Desecrated mod was fractured 0 times.

Here's the embarrassing part: ExileDesk once let you fracture Desecrated mods. Locking in a strong mod you got from a bone sounds great, so we assumed it worked and put it into the emulator without checking.

Then, while fixing it, we got it wrong a second time by allowing normal mods added by bones to be fractured again. In the end, counting in game settled it. This post is the record of both mistakes and how we fixed them.

:::summary What you'll learn
- A Fracturing Orb works on a Rare with four or more mods and fixes one, picked evenly from the eligible mods
- Desecrated mods (even once revealed) and Unrevealed slots count toward the four, but are not eligible
- Normal mods added by a bone are not eligible either; Essence and crafted mods are
- ExileDesk wrongly allowed it in v0.1.464 and reached the current rule through fixes in v0.1.466, 469 and 471
:::

## How Does the Fracturing Orb Pick a Mod?

Here is the rule as ExileDesk has it now.

| Item | Rule |
|---|---|
| Can be used on | A Rare with four or more mods |
| Mods fixed | One |
| How it picks | Evenly among eligible mods |
| Counts toward the four | Every mod, including Desecrated mods and Unrevealed slots |
| Not eligible | Unrevealed slots, Desecrated mods (even revealed), normal mods added by a bone |
| Eligible | Normally rolled mods, Essence mods, crafted mods |

The key point: Desecrated mods count, but they are never in the draw. An item can have four mods and still have some of them sitting outside the pick from the start.

## Why We First Built It Wrong

The first mistake was v0.1.464. In the starting-item editor, we let you mark a Desecrated mod as Fractured too, so the mod carried both labels.

That came from an assumption: Desecrated mods surely fracture like any other mod. We made it possible without testing it in game.

## Fix 1: Desecrated Mods Leave the Pick (v0.1.466)

Two versions later, v0.1.466 stopped Desecrated mods from being fractured, revealed or not. The Fracturing Orb counts them toward the four but leaves them out of the pick.

Manually fracturing a Desecrated mod was blocked too. The patch note said plainly that allowing it in the earlier version was a mistake.

### Fixes 2 and 3: What About Normal Mods from Bones?

Then we second-guessed ourselves. Reveals from bones offer normal mods as well as Desecrated-only mods. In v0.1.469, we made **normal mods added by a bone fracturable again**, thinking only Unrevealed slots and Desecrated-only mods should be excluded.

That was wrong too. The owner used a Fracturing Orb 24 times in game, and a mod added by Desecration was fractured 0 times. In v0.1.471, Desecrated mods stay out of the pick even once revealed, and normal mods added by a bone are excluded the same way.

| Version | Desecrated-only mods | Normal mods from a bone | Result |
|---|---|---|---|
| v0.1.464 | Fracturable | Fracturable | Wrong |
| v0.1.466 | Not fracturable | Not fracturable | Right |
| v0.1.469 | Not fracturable | Fracturable | Wrong |
| v0.1.471 | Not fracturable | Not fracturable | Current (checked in game) |

Both mistakes came from guessing at things the item text doesn't spell out. For small rules like this, firing the orb and counting beats reasoning it out.

:::note What we haven't verified
- The item used for the 24 tries (base, mods, how many Desecrated mods it had) wasn't recorded.
- 0 out of 24 is an in-game count, not a rule stated in the orb's text.
- "Picked evenly among eligible mods" follows Craft of Exile's implementation (EmulatorManager.fracture). We haven't counted the split in game.
:::

## What This Means for Your Craft

If you use a Fracturing Orb after Desecrating, the Desecrated mod stays on the item but never gets fixed. So "Desecrate a strong mod, then fracture it to protect it" doesn't work.

If there's a mod you want to fracture, it has to be a normally rolled mod, an Essence mod or a crafted mod. The Desecrated mod still counts toward the four.

:::tip Count before you fracture
Before using a Fracturing Orb, count the eligible mods. Leave out Desecrated mods and Unrevealed slots; whatever is left is the pool picked from evenly.
:::

## Where the Numbers Come From

- 0 out of 24: the owner's in-game count (ExileDesk v0.1.471 patch note and our confirmed-rules record). **In game**
- Version-by-version changes: ExileDesk patch notes v0.1.464, v0.1.466, v0.1.469, v0.1.471. **Engine**
- "Rare with four or more mods, fixes one": checked in game by the owner (rule checklist, 2026-10-17). **In game**
- "Picked evenly among eligible mods": matches Craft of Exile's implementation (rule checklist, 2026-10-17). **CoE**
- "Essence and crafted mods can be fractured": our confirmed-rules record. **In game**

## Try It Yourself

On the [crafting bench](/), Desecrate a Rare and then use a Fracturing Orb to see the Desecrated mod left out of the pick.

**Related posts**

- [PoE2 Gold Ring Craft: Decoding the Steps and the Breach Bait](/en/blog/gold-ring-video-decoded/)
- [PoE2 Crafting Expected Cost: The Cheapest Move Skips Omens](/en/blog/optimal-move-vs-intuition/)
