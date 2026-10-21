---
title: PoE2 Crafting Simulator Custom Weights: Edit Mod Weights
description: Custom mod weights are coming to the ExileDesk PoE2 crafting simulator (in development). Cast Speed at weight 200 instead of 1,000 drops from 5.4% to 1.1%.
date: 2026-10-22
tags: weight, Cast Speed, Gold Ring, crafting simulator, in development
craft: /?base=Gold%20Ring
draft: true
---
ExileDesk, a PoE2 crafting simulator, now lets you set custom weights for mods on the crafting bench. **This is an in-development feature, available only on our dev build for now.** On a Gold Ring with an Orb of Augmentation, lowering Cast Speed from the default weight of 1,000 to 200 drops its chance from **5.4% to 1.1%**.

This started with ring Cast Speed, which we looked at in an earlier post. poe2db lists it at weight 1 on all five tiers (it looks like a placeholder), while Craft of Exile and ExileDesk use 1,000. On a stream, one crafter said it felt more like "about one in five".

Which one is right? Honestly, nobody knows. The game client doesn't ship PoE2 weights, so every tool borrows them from somewhere else.

So instead of locking in one number, it felt more honest to **ship a default and let you change it**. The owner's request was simple: "Put it at 1000, and make it editable."

:::summary What you'll learn
- Weights nobody can confirm now get a default (1,000 for Cast Speed) that you can edit (in development)
- Gold Ring + Orb of Augmentation: Cast Speed rolls 5.43% at weight 1,000, 1.14% at 200 and 22.30% at 5,000
- An edited weight changes both the actual rolls and the odds table, and it is kept when a craft is replayed or shared
- These checks are ExileDesk's own consistency checks, not compared with the game or Craft of Exile
:::

## Why Make Weights Editable?

When a mod is added, the weights of all eligible mods are summed and one is picked in proportion to its weight. Make a weight five times larger and that mod becomes roughly five times more likely.

For ring Cast Speed, the sources split between 1 and 1,000. The details are in [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/). Since 2026-09-23, ExileDesk has treated poe2db's 1 as a placeholder and used Craft of Exile's 1,000.

But there is no guarantee that 1,000 is correct, and someone could just as well read "one in five" as weight 200. So we decided: **we pick the default, you get the final say.**

## How Much Does the Weight Change the Odds?

Here is how often Cast Speed is added when you use an Orb of Augmentation on a Magic Gold Ring with one prefix. Only the Cast Speed weight changes.

| Cast Speed weight | Odds table | Mod list | 4,000 rolls |
|---:|---:|---:|---:|
| 1 | 0.01% | 0.01% | 0.03% |
| 200 | **1.14%** | 1.14% | 1.13% |
| 1,000 (default) | **5.43%** | 5.43% | 5.03% |
| 5,000 | 22.30% | 22.30% | 21.80% |

:::chart bar Chance to add Cast Speed (Gold Ring + Orb of Augmentation, odds table)
unit: %
labels: Weight 1, Weight 200, Weight 1,000 (default), Weight 5,000
Odds table: 0.01, 1.14, 5.43, 22.30
:::

The odds table and the mod list agree, and 4,000 real rolls land close to them.

At weight 1 (poe2db's value), Cast Speed basically never shows up. At 5,000, it shows up more than one time in five. The same ring looks very different depending on which weight you believe.

## The Result: One Change, Applied Everywhere

The main design goal was **no mismatched numbers**.

- The value you edit, W, is the weight of the mod's **heaviest tier**. Other tiers scale by the same ratio. All five Cast Speed tiers share one weight, so all five become W.
- The weight is applied in exactly one place: where candidate mods are drawn. Both the actual rolls and the odds table go through it, and the mod list's tier table uses the edited weight too.
- Your edits are saved in your browser.

That single code path is why the "Odds table" and "Mod list" columns above match.

### What Does It Look Like on Screen?

Open a row in the mod list and a bar appears above its tier table: "Weight [1000] Default 1000 ↺ Reset all (n)". Type 200 and Cast Speed drops from 5.4% to 1.1%, with each tier at 0.2%.

The row label changes too. Rows filled with estimated weights keep the existing "Est. weight" label; rows you have edited show "Weight edited". "Reset all" brings back 5.4% and "Est. weight", and clears the saved values from your browser.

Grouped rows (several mods bundled into one row) don't get this bar.

## Are Edited Weights Kept in Replays and Shares?

Yes. Edited weights are written into every step of the craft, and they replay and share the same way Omen settings do. Steps without them use the default weights.

To check this, we recorded a craft at weight 5,000 (Orb of Alchemy, then six Chaos Orbs) and replayed it with the on-screen weight set to 1. The replay matched the recording, it still matched after a share round trip, and it differed from a craft at the default weight. In other words, a replay uses **the weights written in the craft, not whatever is set on screen right now**.

So when you share a craft, "this assumes weight 5,000" travels with it.

:::note What we haven't verified
- The numbers above come from ExileDesk's own consistency script (comparing values inside the engine) and from the screen. They have not been compared with in-game results or Craft of Exile.
- The default of 1,000 for Cast Speed is borrowed from Craft of Exile; whether it is the game's real weight is unknown.
- This feature is **dev build only** and is not on the live crafting bench yet. No release date is set.
:::

:::tip When you can't decide on a weight
If you can't settle on one value, compare the odds at each candidate (say 200 and 1,000). That shows how much the mod actually drives your cost. (This is for once the feature is live.)
:::

## Where the Numbers Come From

- Augmentation odds (odds table, mod list, 4,000 rolls): ExileDesk engine, a consistency script run on 2026-10-22 (emulator team note 2026-10-22-mod-weight-edit). Label: **engine** (not external truth).
- 5.4% to 1.1% on screen, 0.2% per tier, and the label texts: checked on a local dev build at 1660×860 (same note). Label: **engine**.
- Weight sources (poe2db 1, Craft of Exile 1,000, ExileDesk 1,000 since 2026-09-23): the table in [our earlier post](/en/blog/poe2db-cast-speed-weight/). Label: **poe2db / CoE**. The game's real weight is an **estimate** (nobody knows it).

## Try It Yourself

On the live [crafting bench](/?base=Gold%20Ring), you can craft a Gold Ring at weight 1,000 today. Weight editing is still in development; we'll update this post when it goes live.

**Related posts**

- [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)
- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Catalysing Exaltation Multiplier: No One Knows It](/en/blog/catalysing-exaltation-multiplier/)
