---
title: PoE2 Liquid Emotions Jewel Crafting: Contempt and Ferocity
description: PoE2 Liquid Emotions (Delirium) remove one mod from a jewel and add a set crafted mod. How Potent Liquid Contempt allows a third mod on one side, how Ferocity boosts the other side, and why ExileDesk picks their side at random (v0.1.533).
date: 2026-10-22
tags: Liquid Emotions, jewel, Delirium, Contempt, Ferocity
image: img/liquid-emotions-jewels-og.en.png
ready: true
draft: true
---
In PoE2, a Liquid Emotion (from Delirium) is a currency that **removes one random mod from a Rare jewel and adds one crafted mod set by that emotion**. Potent Liquid Contempt allows a third mod on one side, and Potent Liquid Ferocity boosts the numbers of the mods on the other side.

:::zundamon normal
Jewel crafting doesn't get talked about as much as rings or armour.
:::

:::metan normal
True. But Liquid Emotions let you add a known mod on purpose. Contempt even adds a mod slot.
:::

:::zundamon surprised
It adds a slot?! That's huge.
:::

:::metan troubled
The tricky part is whether you get the prefix version or the suffix version. ExileDesk got this wrong at first and fixed it later.
:::

:::summary What you'll learn
- A Liquid Emotion removes one mod from a jewel, then adds one set crafted mod
- Potent Liquid Contempt adds a mod like "+1 Prefix Modifier allowed" for a third mod on one side, and then an Exalted Orb can add a 5th mod. Potent Liquid Ferocity boosts the numbers on the opposite side
- Whether Contempt and Ferocity land as the prefix or suffix version is **random** in ExileDesk, because the description doesn't say how it's chosen (v0.1.533)
:::

:::tip New to this? Words used here
- **Liquid Emotion**: a Delirium currency that adds a set crafted mod to a jewel
- **Crafted mod**: a set mod added by a Liquid Emotion or similar
- **Prefix / suffix**: the two sides a mod can sit on
- **Version**: the same emotion has one that lands as a prefix and one that lands as a suffix
- **Exalted Orb**: a currency that adds one mod to a Rare item
- **Rejected**: the currency hits a side that is already over its limit, so nothing changes
:::

## What Do Liquid Emotions Do to a Jewel?

A Liquid Emotion removes and adds in the same use.

:::zundamon normal
What does a Liquid Emotion's description actually say?
:::

:::metan normal
For Potent Liquid Contempt, it removes a random modifier and adds a guaranteed crafted modifier to a Rare Basic Jewel. That's the text in ExileDesk's hover.
:::

:::zundamon normal
I also saw something called Ancient Potent Liquid Contempt.
:::

:::metan normal
The Ancient versions have the same text, but for Time-Lost Jewels.
:::

:::zundamon happy
So the removal is random, and the addition is guaranteed.
:::

:::metan normal
Right. What gets added depends on the emotion. Some names start with Diluted, plain, Concentrated or Potent.
:::

:::metan normal
ExileDesk made Liquid Emotions usable on jewels in v0.1.485.
:::

| Part of the description | What happens | How it's decided |
|---|---|---|
| Removes a random modifier | One existing mod disappears | Random |
| Adds a guaranteed crafted modifier | One mod set by the emotion is added | Guaranteed |
| Ancient versions | The same, on Time-Lost Jewels | Same |

Just remember: one use removes and adds at the same time.

## Why Is the Contempt and Ferocity Side Random?

Contempt and Ferocity each have a version that lands as a prefix and one that lands as a suffix. Which one you get changes the jewel a lot.

### At first, it followed the removed mod

:::zundamon normal
How did ExileDesk pick the version at first?
:::

:::metan normal
When we built it in v0.1.485, **you got the version on the side of the removed mod**. Lose a suffix, get the suffix version.
:::

:::zundamon happy
It just fills the gap. Makes sense!
:::

:::metan troubled
That's how it looked. But it was wrong.
:::

### The description doesn't say, so now it's random

:::zundamon surprised
What was wrong with it?
:::

:::metan normal
When we re-read the description, nothing said how the version is chosen.
:::

:::metan normal
ExileDesk runs currencies by what their descriptions say and adds no rules they don't state. More in [building the simulator without exceptions](/en/blog/crafting-simulator-no-exceptions/).
:::

:::zundamon normal
So "it goes on the side that lost a mod"...
:::

:::metan normal
That was a rule we'd invented with nothing to back it. So in v0.1.533, **whether you get the prefix or suffix version became random**.
:::

| Version | How the side is chosen | Why |
|---|---|---|
| v0.1.485 (first) | The version on the side of the removed mod | It fills the gap, so it looked natural |
| v0.1.533 (now) | Prefix or suffix version at random | The description doesn't say how |

Adding no unwritten rules is how ExileDesk is built.

## What Do Potent Contempt and Ferocity Change?

The Potent versions of Contempt and Ferocity both reshape one side of the jewel.

### Potent Liquid Contempt adds a slot

:::zundamon normal
What does Potent Liquid Contempt add?
:::

:::metan normal
Either "+1 Prefix Modifier allowed" or "+1 Suffix Modifier allowed".
:::

:::metan normal
In ExileDesk, the named side can then hold a third mod (v0.1.485). With "+1 Prefix Modifier allowed", that's the prefix side.
:::

:::zundamon normal
Once you have the extra slot, what's next?
:::

:::metan happy
The v0.1.561 tutorial "Learn liquid emotions" takes you from adding the slot with Contempt to adding a 5th mod with an Exalted Orb.
:::

| Potent Liquid Contempt | What ExileDesk does | What to watch for |
|---|---|---|
| On use | Removes 1 mod, adds "+1 Prefix Modifier allowed" or "+1 Suffix Modifier allowed" | The version is random |
| Afterwards | The named side can hold a 3rd mod; an Exalted Orb adds the 5th | You can't choose which side grows |
| After Contempt is removed | A Chaos Orb that hits the side still holding 3 mods is rejected | Depends on where it hits |

Contempt is a rare way to raise the mod count itself.

### Potent Liquid Ferocity boosts the other side

:::zundamon normal
What about Potent Liquid Ferocity?
:::

:::metan normal
It adds "increased Effect of Suffixes" or "increased Effect of Prefixes". This mod **raises the numbers of the mods on the opposite side** (v0.1.485).
:::

:::zundamon troubled
The opposite side? What does that mean?
:::

:::metan normal
Say "increased Effect of Prefixes" lands in a suffix slot. Then it's the prefix numbers that go up.
:::

:::zundamon normal
Then just pick the side you want to boost.
:::

:::metan troubled
You can't. Like Contempt, the version is random, so the side you wanted may not be the one that grows.
:::

| Ferocity mod added | Lands on | Boosts |
|---|---|---|
| increased Effect of Prefixes | Suffix | Prefix numbers |
| increased Effect of Suffixes | Prefix | Suffix numbers |

Ferocity doesn't add mods. It pushes up the numbers on the other side.

## When Can't You Use One, and When Is It Rejected?

Sometimes a Liquid Emotion can't be used, and sometimes it is rejected when you click it.

:::zundamon normal
I'll just stack emotions one after another.
:::

:::metan troubled
You can't. **They can't be used while a crafted mod is on the jewel** (v0.1.493). If a mod added by a Liquid Emotion is still there, the next emotion won't work.
:::

:::zundamon normal
And what does "rejected" mean?
:::

:::metan normal
Some hits get rejected depending on where they land. For example, after Contempt is removed, a Chaos Orb that hits the side still holding 3 mods is rejected.
:::

:::zundamon troubled
If it's rejected, do I lose the currency?
:::

:::metan normal
ExileDesk keeps currencies that are "only rejected by where they hit" on the shelf. If one is rejected, **it isn't used up and stays in your steps** (v0.1.493).
:::

:::metan happy
That way you can click freely, just like in the game.
:::

| Situation | What happens | Why |
|---|---|---|
| A crafted mod is on the jewel | The next emotion can't be used | No emotion works while its crafted mod remains |
| Chaos Orb on the side with 3 mods after Contempt is removed | Rejected | That side is over its limit (the 3rd mod left after Contempt is removed) |
| ExileDesk after a rejection | Not used up, stays in your steps | Kept on the shelf so you can click freely |

:::tip Plan the order of emotions
Liquid Emotions can't be used while a crafted mod is on the item (v0.1.493). Once Contempt or Ferocity is on, no further emotion works while that crafted mod remains, so decide which emotion you want first.
:::

:::note fold Not yet verified (2)
- Everything here describes how the ExileDesk engine works. We did not re-read the poe2db description for this post (the quoted text is the site's own hover).
- Whether the two versions of Contempt and Ferocity are equally likely is not published by the game. The engine assumes random because the description doesn't say.
:::

A Liquid Emotion removes one mod, then adds one set mod. Contempt adds a slot on one side and Ferocity boosts the other side, but which version you get is random.

## Where the Numbers Come From

:::fold Show sources (5)
- Behavior when Liquid Emotions were added (remove then add, Contempt's third mod, Ferocity boosting the other side, the Chaos Orb after removal): ExileDesk update notes v0.1.485 (engine)
- No emotion while a crafted mod is present; rejected currencies aren't used up and stay in the steps: v0.1.493 (engine)
- Why the Contempt / Ferocity version became random: v0.1.533 (engine; the description doesn't say how it's chosen)
- Tutorial "Learn liquid emotions" (5th mod with an Exalted Orb): v0.1.561 (engine)
- The quoted description: ExileDesk's hover text, not re-checked on poe2db for this post (unverified)
:::

## Try It Yourself

The Medium tutorial "Learn liquid emotions" lets you use Contempt and Ferocity in turn. To start from your own jewel, use Liquid Emotions on an Emerald on the [crafting bench](/?base=Emerald).

**Related posts**

- [PoE2 crafting simulator built without exceptions](/en/blog/crafting-simulator-no-exceptions/)
- [PoE2 Sanctify vs Quality order: why +6 but never +5](/en/blog/sanctify-quality-order/)

VOICEVOX: Zundamon / Shikoku Metan
