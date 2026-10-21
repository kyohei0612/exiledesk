---
title: PoE2 Crafting Simulator Custom Weights: Edit Mod Weights
description: Custom mod weights are coming to the ExileDesk PoE2 crafting simulator (in development). Cast Speed at weight 200 instead of 1,000 drops from 5.4% to 1.1%.
date: 2026-10-22
tags: weight, Cast Speed, Gold Ring, crafting simulator, in development
craft: /?base=Gold%20Ring
image: img/custom-mod-weights-og.en.png
ready: true
draft: true
---
ExileDesk, a PoE2 crafting simulator, now lets you change mod weights yourself on the crafting bench (**an in-development feature, on our dev build only for now**). On a Gold Ring with an Orb of Augmentation, lowering Cast Speed from the default weight of 1,000 to 200 drops its chance from **5.4% to 1.1%**.

:::zundamon normal
So what's the right weight for Cast Speed on rings?
:::

:::metan troubled
Honestly, nobody knows. poe2db lists 1 on all five tiers, while Craft of Exile and ExileDesk use 1,000.
:::

:::zundamon surprised
They don't even agree! Then which one should I trust?
:::

:::metan happy
That's why we ship a default you can edit. The owner put it simply: "Put it at 1000, and make it editable."
:::

:::summary What you'll learn
- Weights nobody can confirm now get a default (1,000 for Cast Speed) that you can edit (in development)
- Gold Ring + Orb of Augmentation: Cast Speed rolls 5.43% at weight 1,000, 1.14% at 200 and 22.30% at 5,000
- An edited weight changes both the actual rolls and the odds table, and it is kept when a craft is replayed or shared
:::

:::tip New to this? Words used here
- **Weight**: how likely a mod is to roll. Bigger means more likely.
- **Mod tier**: the same mod split into tiers by how strong its numbers are.
- **Orb of Augmentation**: a currency that adds one mod to a Magic item.
- **Odds table**: ExileDesk's table showing what your next click can add, and how often.
- **Mod list**: ExileDesk's list of the mods and tiers an item can roll.
- **Craft steps**: a record of every click in order. You can replay and share it.
:::

## Why Make Weights Editable?

The game data doesn't include PoE2 weights, so every tool borrows them from outside sources. That's why the numbers differ from source to source.

:::zundamon normal
What does a weight actually do?
:::

:::metan normal
When a mod is added, the weights of all eligible mods are summed. Then one is picked in proportion to its weight.
:::

:::metan normal
So a weight five times larger makes that mod roughly five times more likely.
:::

:::zundamon normal
Cast Speed was split between 1 and 1,000. Which one does ExileDesk use?
:::

:::metan normal
Since 2026-09-23, we treat poe2db's 1 as a placeholder and use Craft of Exile's 1,000.
:::

:::metan normal
The details are in [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/).
:::

:::zundamon happy
So 1,000 is the right answer!
:::

:::metan troubled
That's not guaranteed either. So we only pick the default, and you get the final say.
:::

## How Much Does the Weight Change the Odds?

Here is how often Cast Speed is added when you use an Orb of Augmentation on a Magic Gold Ring with one prefix. Only the Cast Speed weight changes.

:::zundamon normal
How big a difference does the weight make?
:::

:::metan normal
Let's line up the odds table, the mod list, and 4,000 real rolls for each weight.
:::

| Cast Speed weight | Odds table | Mod list | 4,000 rolls | What it looks like |
|---:|---:|---:|---:|---|
| 1 (poe2db's value) | 0.01% | 0.01% | 0.03% | Almost never |
| 200 | **1.14%** | 1.14% | 1.13% | Rare |
| 1,000 (default) | **5.43%** | 5.43% | 5.03% | ExileDesk today |
| 5,000 | 22.30% | 22.30% | 21.80% | More than 1 in 5 |

The odds table and the mod list agree, and the 4,000 rolls land close to them.

:::zundamon surprised
At weight 1 it almost never shows up, but at 5,000 it's more than one in five!
:::

:::metan normal
The same ring looks completely different depending on which weight you believe.
:::

## The Result: One Change, Applied Everywhere

The main design goal was no mismatched numbers.

:::zundamon normal
Which tier's weight do you edit?
:::

:::metan normal
The weight of the mod's heaviest tier. The other tiers scale by the same ratio.
:::

:::metan normal
All five Cast Speed tiers share one weight, so all five take the value you enter.
:::

:::zundamon normal
Could the rolls and the odds table end up with different numbers?
:::

:::metan happy
The weight is applied in exactly one place, where candidate mods are drawn. Rolls and the odds table both go through it, so both change the same way.
:::

:::metan normal
The mod list's tier table uses the edited weight too. That single path is why the odds table and mod list match in the table above.
:::

:::zundamon normal
Does my edit disappear when I close the page?
:::

:::metan normal
No, your browser remembers it.
:::

### What Does It Look Like on Screen?

Open a row in the mod list and a bar appears above its tier table: "Weight [1000] Default 1000 ↺ Reset all (n)".

:::zundamon normal
What happens if I type 200 there?
:::

:::metan normal
Cast Speed drops from 5.4% to 1.1%, and each tier in the tier table shows 0.2%.
:::

:::metan normal
The row label changes too. Rows with estimated weights keep the existing "Est. weight" label, and rows you edited show "Weight edited".
:::

:::zundamon normal
How do I put it back?
:::

:::metan normal
Press "Reset all". You get 5.4% and "Est. weight" back, and the saved values are cleared from your browser.
:::

:::metan normal
One catch: grouped rows (several mods bundled into one row) don't get this bar.
:::

## Are Edited Weights Kept in Replays and Shares?

Yes. Edited weights are written into every step of the craft, and they replay and share the same way Omen settings do.

:::zundamon normal
What about steps that don't have a weight written in?
:::

:::metan normal
They roll with the default weights.
:::

:::zundamon normal
Does a replay really use the weights in the craft?
:::

:::metan normal
We recorded an Orb of Alchemy plus six Chaos Orbs at weight 5,000, then replayed it with the on-screen weight left at 1.
:::

:::metan happy
The replay matched the recording. It still matched after a share round trip, and it differed from a craft at the default weight.
:::

:::zundamon surprised
So it uses the weights written in the craft, not the ones on screen!
:::

:::metan normal
Right. When you share a craft, "this assumes weight 5,000" travels with it.
:::

:::note fold Not yet verified (3)
- The numbers above come from ExileDesk's own consistency script (comparing values inside the engine) and from the screen. They have not been compared with in-game results or Craft of Exile.
- The default of 1,000 for Cast Speed is borrowed from Craft of Exile; whether it is the game's real weight is unknown.
- This feature is **dev build only** and is not on the live crafting bench yet. No release date is set.
:::

:::zundamon normal
What should I do if I can't decide which weight to trust?
:::

:::metan happy
Check the odds once at each candidate weight. That shows how much the mod actually drives your cost.
:::

:::tip When you can't decide on a weight
If you can't settle on one value, compare the odds once at each candidate weight (say 200 and 1,000). That shows how much the mod actually drives your cost. (This is for once the feature is live.)
:::

Weights nobody can confirm now get a default that you can edit. An edited weight applies the same way to rolls, the odds table and replays.

## Where the Numbers Come From

:::fold Show sources (3)
- Augmentation odds (odds table, mod list, 4,000 rolls): ExileDesk engine, a consistency script run on 2026-10-22 (emulator team note 2026-10-22-mod-weight-edit). Label: **engine** (not external truth).
- 5.4% to 1.1% on screen, 0.2% per tier, and the label texts: checked on a local dev build at 1660×860 (same note). Label: **engine**.
- Weight sources (poe2db 1, Craft of Exile 1,000, ExileDesk 1,000 since 2026-09-23): the table in [our earlier post](/en/blog/poe2db-cast-speed-weight/). Label: **poe2db / CoE**. The game's real weight is an **estimate** (nobody knows it).
:::

## Try It Yourself

On the live [crafting bench](/?base=Gold%20Ring), you can craft a Gold Ring at weight 1,000 today. Weight editing is still in development; we'll update this post when it goes live.

**Related posts**

- [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)
- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Catalysing Exaltation Multiplier: No One Knows It](/en/blog/catalysing-exaltation-multiplier/)

VOICEVOX: Zundamon / Shikoku Metan
