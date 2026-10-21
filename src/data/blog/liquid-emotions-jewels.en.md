---
title: PoE2 Liquid Emotions Jewel Crafting: Contempt and Ferocity
description: PoE2 Liquid Emotions jewel crafting: each one removes a random mod and adds a set crafted mod. How Potent Liquid Contempt allows a third mod on one side, how Ferocity boosts the other side, and why ExileDesk picks their side at random (v0.1.533).
date: 2026-10-22
tags: Liquid Emotions, jewel, Delirium, Contempt, Ferocity
draft: true
---
In PoE2, a Liquid Emotions jewel craft works like this: a Liquid Emotion (from Delirium) **removes one random mod from a Rare jewel and adds that emotion's set crafted mod**. Potent Liquid Contempt allows a third mod on one side, and Potent Liquid Ferocity boosts the numbers of the mods on the other side.

Jewel crafting gets less attention than rings or armour. But Liquid Emotions let you add a known mod on purpose, and Contempt even adds a mod slot.

There is one confusing part, though: Contempt and Ferocity each come in a prefix version and a suffix version, so which one do you get? ExileDesk got this wrong at first and fixed it later. That story is part of this post.

:::summary What you'll learn
- A Liquid Emotion removes one mod from a jewel, then adds one set crafted mod
- Potent Liquid Contempt adds a "+1 Modifier allowed" mod for a third mod on one side, then an Exalted Orb can add a 5th mod
- Potent Liquid Ferocity boosts the numbers on the opposite side
- Whether Contempt and Ferocity land as the prefix or suffix version is **random** in ExileDesk, because the description doesn't say (v0.1.533)
:::

## What Do Liquid Emotions Do to a Jewel?

The description ExileDesk shows for Potent Liquid Contempt says it removes a random modifier and augments a Rare Basic Jewel with a new guaranteed crafted modifier. The Ancient versions (such as Ancient Potent Liquid Contempt) do the same for Rare Time-Lost Jewels.

So a single use does two things at once: a random removal and a guaranteed addition. What gets added depends on the emotion, and some names carry a prefix: Diluted, plain, Concentrated and Potent.

ExileDesk added Liquid Emotions for jewels in v0.1.485.

## Why Is the Contempt and Ferocity Side Random?

Contempt and Ferocity each have a version that lands as a prefix and one that lands as a suffix. Which one you get changes the jewel a lot.

### At first, it followed the removed mod

When we built it in v0.1.485, ExileDesk **added the version on the side of the removed mod**. Lose a suffix, get the suffix version. It filled the gap that had just opened, so it looked natural.

### The description doesn't say, so now it's random

Reading the description again, nothing says how the version is chosen. ExileDesk runs currencies by what their descriptions say and does not add rules they don't state (more in [building the simulator without exceptions](/en/blog/crafting-simulator-no-exceptions/)).

So in v0.1.533 we made the choice between the prefix and suffix version **random**. "It goes on the side that lost a mod" had been a rule we invented with nothing to back it.

## What Do Potent Contempt and Ferocity Change?

### How Potent Liquid Contempt Adds a Slot

Potent Liquid Contempt adds either "+1 Prefix Modifier allowed" or "+1 Suffix Modifier allowed". In ExileDesk this lets the named side hold a third mod (v0.1.485).

The Medium tutorial "Learn liquid emotions" (v0.1.561) walks through adding the slot with Contempt, then filling a 5th mod with an Exalted Orb.

| Potent Liquid Contempt | What ExileDesk does |
|---|---|
| On use | Removes 1 mod, adds the prefix or suffix "+1 Modifier allowed" (version is random) |
| Afterwards | The named side can hold a 3rd mod; an Exalted Orb adds the 5th |
| After Contempt is removed | A Chaos Orb that hits the side still holding 3 mods is rejected |

### Potent Liquid Ferocity Boosts the Other Side

Potent Liquid Ferocity adds either "increased Effect of Suffixes" or "increased Effect of Prefixes". In ExileDesk it **raises the numbers of the mods on the opposite side** (v0.1.485).

For example, if "increased Effect of Prefixes" lands in a suffix slot, the prefix numbers go up. As with Contempt, the version is random, so the side you wanted may not be the one that grows.

## When Can't You Use One, and When Is It Rejected?

- **Not while a crafted mod is on the jewel** (v0.1.493). If a mod added by a Liquid Emotion is still there, no other emotion can be used.
- **Some hits get rejected.** For example, after Contempt is removed, a Chaos Orb that hits the side with 3 mods is rejected.
- ExileDesk keeps these "rejected only by where they hit" currencies on the shelf. If one is rejected, it **is not used up and stays in your steps** (v0.1.493), so you can click freely, as in the game.

:::note What we haven't verified
Everything here describes how the ExileDesk engine works. We did not re-read the poe2db description for this post (the quoted text is the site's own hover). Whether the two versions of Contempt and Ferocity are equally likely is not published; the engine assumes random because the description doesn't say.
:::

:::tip Plan the order of emotions
Liquid Emotions can't be used while a crafted mod is on the item (v0.1.493). Once Contempt or Ferocity is on, no further emotion works while that crafted mod remains, so decide which emotion you want first.
:::

## Where the Numbers Come From

- Original behavior (remove then add, Contempt's third mod, Ferocity boosting the other side, the Chaos Orb rejection): ExileDesk update notes v0.1.485 (engine)
- No emotion while a crafted mod is present; rejected currencies stay in the steps: v0.1.493 (engine)
- Why the Contempt / Ferocity version became random: v0.1.533 (engine; the description doesn't say)
- Tutorial "Learn liquid emotions" (5th mod with an Exalted Orb): v0.1.561 (engine)
- The quoted description: ExileDesk's hover text, not re-checked on poe2db for this post (unverified)

## Try It Yourself

The Medium tutorial "Learn liquid emotions" lets you try Contempt and Ferocity step by step. To start from your own jewel, use Liquid Emotions on an Emerald on the [crafting bench](/?base=Emerald).

**Related posts**

- [PoE2 crafting simulator built without exceptions](/en/blog/crafting-simulator-no-exceptions/)
- [PoE2 Sanctify vs Quality order: why +6 but never +5](/en/blog/sanctify-quality-order/)
