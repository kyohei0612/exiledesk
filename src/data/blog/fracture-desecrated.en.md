---
title: PoE2 Fracturing Orb: Desecrated Mods Can't Be Fractured
description: In PoE2, a Fracturing Orb never fractures a Desecrated mod. They count toward the four-mod requirement but are left out of the pick. We once built it wrong; 24 in-game tries with 0 hits set us straight.
date: 2026-10-22
tags: Fracturing Orb, Desecration, Bone, correction
image: img/fracture-desecrated-og.en.png
ready: true
draft: true
---
In PoE2, a Fracturing Orb **can't fracture a Desecrated mod**. Desecrated mods count toward the "four or more mods" requirement, but they are never the one that gets fixed. The owner used a Fracturing Orb 24 times in game, and a Desecrated mod was fractured 0 times.

:::zundamon happy
I want to lock in the strong mod I got from Desecration with a Fracturing Orb!
:::

:::metan troubled
Sounds handy, right? But a Desecrated mod can't be fractured.
:::

:::zundamon surprised
Wait, I'm sure ExileDesk let me fracture it!
:::

:::metan troubled
It did. We built it that way once, then got it wrong again while fixing it. In the end, counting in game settled it.
:::

:::summary What you'll learn
- A Fracturing Orb fixes one mod on a Rare with four or more mods. Desecrated mods and Unrevealed slots count toward the four, but are not eligible
- Normal mods added by a bone are not fractured either. Essence and crafted mods can be
- ExileDesk wrongly allowed it in v0.1.464 and reached the current rule through three fixes: v0.1.466, 469 and 471
:::

:::tip New to this? Words used here
- **Fracturing Orb**: a currency that fixes one mod on a Rare item
- **Desecration**: a craft where you use a bone to add an Unrevealed Desecrated mod
- **Unrevealed slot**: a mod slot added by Desecration whose mod isn't decided yet
- **Reveal**: deciding what an Unrevealed slot becomes. It can be a Desecrated-only mod or a normal mod
- **Essence and crafted mods**: mods added by an Essence or by crafting. A Fracturing Orb can fix them
:::

## How Does the Fracturing Orb Pick a Mod?

First, here is the current rule in one table.

| Item | Rule | What it means |
|---|---|---|
| Can be used on | A Rare with four or more mods | Not usable on a Rare with fewer mods |
| Mods fixed | One | Only one, however many there are |
| How it picks | Evenly among eligible mods | You can't choose the one you want |
| Counts toward the four | Every mod, including Desecrated mods and Unrevealed slots | Whether you can use it depends on the full count |
| Not eligible | Unrevealed slots, Desecrated mods (even revealed), normal mods added by a bone | They count, but aren't in the draw |
| Eligible | Normally rolled mods, Essence mods, crafted mods | One of these is picked evenly |

The key point: they count, but they aren't in the draw.

:::zundamon normal
So with four mods, any of them might get fractured?
:::

:::metan normal
With four mods you can use the orb. But Desecrated mods sit outside the draw from the start.
:::

## Why We First Built It Wrong

The first mistake was v0.1.464.

:::zundamon normal
What did v0.1.464 do?
:::

:::metan normal
In the starting-item editor, we let you mark a Desecrated mod as Fractured too.
:::

:::metan normal
That mod then carried both labels, Desecrated and Fractured.
:::

:::zundamon troubled
Did you check that in game?
:::

:::metan troubled
We didn't. We just assumed Desecrated mods fracture like any other mod.
:::

:::metan troubled
We made it possible without testing it in game.
:::

## Fix 1: Desecrated Mods Leave the Pick (v0.1.466)

Two versions later, v0.1.466 stopped Desecrated mods from being fractured, even once revealed.

:::zundamon normal
Even revealed ones are out?
:::

:::metan normal
Yes. The Fracturing Orb counts Desecrated mods toward the four but leaves them out of the pick.
:::

:::metan normal
We also blocked manually fracturing a Desecrated mod.
:::

:::metan troubled
The patch note said that allowing it in the earlier version was a mistake.
:::

### Fixes 2 and 3: What About Normal Mods from Bones?

Then we second-guessed ourselves.

:::zundamon normal
Reveals from bones can give normal mods too. Those should be fracturable, right?
:::

:::metan troubled
We thought so too. In v0.1.469, we made normal mods added by a bone fracturable again.
:::

:::metan normal
The idea was to exclude only Unrevealed slots and Desecrated-only mods.
:::

:::zundamon surprised
That was wrong too?
:::

:::metan normal
It was. The owner used a Fracturing Orb 24 times in game, and a mod added by Desecration was fractured 0 times.
:::

:::metan normal
So in v0.1.471, normal mods added by a bone are left out of the pick as well.
:::

| Version | Desecrated-only mods | Normal mods from a bone | Result | What happened |
|---|---|---|---|---|
| v0.1.464 | Fracturable | Fracturable | Wrong | Made fracturable without checking |
| v0.1.466 | Not fracturable | Not fracturable | Right | Desecrated mods left out of the pick, even revealed |
| v0.1.469 | Not fracturable | Fracturable | Wrong | Only normal mods from a bone put back |
| v0.1.471 | Not fracturable | Not fracturable | Current (checked in game) | Matched to 0 out of 24 |

:::zundamon troubled
Wrong twice...
:::

:::metan normal
Both times, we guessed at what the text doesn't say. For small rules the effect text leaves out, firing the orb and counting beats guessing.
:::

:::note fold Not yet verified (3)
- The item used for the 24 tries (base, mods, how many Desecrated mods it had) wasn't recorded.
- 0 out of 24 is an in-game count, not a rule stated in the orb's text.
- "Picked evenly among eligible mods" follows Craft of Exile's implementation (EmulatorManager.fracture). We haven't counted the split in game.
:::

## What This Means for Your Craft

If you use a Fracturing Orb after Desecrating, the Desecrated mod stays on the item but never gets fixed.

:::zundamon normal
What if I fracture first to protect the mod I got from Desecration?
:::

:::metan troubled
That doesn't work. Desecrated mods aren't eligible to be fixed.
:::

:::zundamon normal
Then what should I fracture?
:::

:::metan normal
Aim for a normally rolled mod, or an Essence or crafted mod.
:::

:::metan normal
And the Desecrated mod still counts toward the four.
:::

:::tip Count before you fracture
Before using a Fracturing Orb, count the eligible mods. Leave out Desecrated mods and Unrevealed slots; whatever is left is the pool picked from evenly.
:::

Desecrated mods count toward the Fracturing Orb's four, but never get fixed. Pick the mod you want to fracture from normally rolled mods, Essence mods or crafted mods.

## Where the Numbers Come From

:::fold Show sources (5)
- 0 out of 24: the owner's in-game count (ExileDesk v0.1.471 patch note and our confirmed-rules record). **In game**
- Version-by-version changes: ExileDesk patch notes v0.1.464, v0.1.466, v0.1.469, v0.1.471. **Engine**
- "Rare with four or more mods, fixes one": checked in game by the owner (rule checklist, 2026-10-17). **In game**
- "Picked evenly among eligible mods": matches Craft of Exile's implementation (rule checklist, 2026-10-17). **CoE**
- "Essence and crafted mods can be fractured": our confirmed-rules record. **In game**
:::

## Try It Yourself

On the [crafting bench](/), use a Fracturing Orb on a Rare with a Desecrated mod to see the Desecrated mod left out of the pick.

**Related posts**

- [PoE2 Gnawed, Preserved, Ancient Bone: Which to Use](/en/blog/desecration-bone-types/)
- [PoE2 Crafting Expected Cost: The Cheapest Move Skips Omens](/en/blog/optimal-move-vs-intuition/)

VOICEVOX: Zundamon / Shikoku Metan
