---
title: PoE2 Desecration: Which Side Does a Bone Land On?
description: Which side does a PoE2 desecration land on? We checked against Craft of Exile and fixed ExileDesk: 50/50 when both sides are open, and when both are full, one non-Fractured mod is removed at random. Plus the Necromancy omens.
date: 2026-10-22
tags: Desecration, Bone, Necromancy omens, Craft of Exile, correction
image: img/desecration-bone-sides-og.en.png
ready: true
draft: true
---
In PoE2 desecration, **a bone lands on either side 50/50 when both sides are open. When both sides are full, one non-Fractured mod is removed at random and the new mod goes on that side.** To choose the side yourself, use Omen of Sinistral Necromancy or Omen of Dextral Necromancy. ExileDesk switched to this behavior in v0.1.525.

:::zundamon normal
I've never cared which side a bone lands on.
:::

:::metan normal
Some slots, like gloves, only have the Desecrated mod you want as a suffix. If the side misses, your target can't even show up as an option.
:::

:::zundamon surprised
That's bad! So how is the side decided?
:::

:::metan troubled
Until recently, ExileDesk decided it its own way. We only noticed when we compared it with Craft of Exile.
:::

:::summary What you'll learn
- With both sides open, a bone lands on either side 50/50. With both full, one non-Fractured mod is removed at random and the bone goes on that side
- ExileDesk used to pick the side by the total weight of the mods. Fixed in v0.1.525 under the "if it isn't written, it's random" principle
- To pick the side, use Omen of Sinistral / Dextral Necromancy. They aren't used when a Mark of the Abyssal Lord is on the item
:::

:::tip New to this? Words used here
- **Desecration**: using a bone to add one Unrevealed Desecrated mod
- **Prefix / Suffix**: the two sides of an item's mods. Also called the left and right side
- **Fractured**: a locked mod. It is never removed by a bone, even when both sides are full
- **Omen of Sinistral / Dextral Necromancy**: sets the side of your next Desecration. Sinistral means prefix, Dextral means suffix
- **Weight**: how likely each mod is to roll. Bigger means more likely
- **Exalted Orb**: the price unit in this post
:::

## Which Side Does a Bone Land On?

If both prefixes and suffixes have room, it's 50/50.

:::zundamon normal
50/50? Where is that decided?
:::

:::metan normal
Craft of Exile (CoE) builds its desecration with a random 0 or 1 for the side.
:::

:::zundamon normal
Doesn't the game text say anything?
:::

:::metan normal
Neither the bones nor the Necromancy omens say how the side is picked without an omen.
:::

:::metan normal
Anything unwritten is equally random. That's how ExileDesk reads it now.
:::

## What Gets Removed When Both Sides Are Full?

Use a bone on a Rare with both sides full, and one mod is removed at random from all non-Fractured mods. The new Unrevealed mod goes on the side that just opened up.

:::zundamon normal
So it picks a side first, then removes one from that side?
:::

:::metan normal
The other way around. It picks what to remove first, then fills the gap.
:::

| Situation | Side it lands on | What happens |
|---|---|---|
| Both sides open | 50/50 | A random 0 or 1 in CoE's code |
| Both sides full | Wherever the removed mod was | One non-Fractured mod is removed at random, and the bone fills that gap |

Just remember: it isn't "pick a side, then remove." It's "pick what to remove, and that sets the side."

### What Did ExileDesk Get Wrong?

The old ExileDesk differed from CoE in both cases.

| Situation | Old ExileDesk | Now (v0.1.525, same as CoE) | Why we changed it |
|---|---|---|---|
| Both sides open | Side picked by the total weight of each side's mods | 50/50 | Nothing in the game says to pick by weight |
| Both sides full | Side picked by weight, then one mod on that side removed | One removed equally from all non-Fractured mods; the bone goes there | It contradicted our 10-10 note, "remove one equally from non-Fractured mods" |

:::zundamon normal
Picking by weight sounds reasonable, though.
:::

:::metan normal
It leans toward the side with more options, so it looks plausible. But nothing in the game says so.
:::

:::metan troubled
The full-sides case even contradicted our own note from 10-10. The note was right, and the code had drifted.
:::

:::zundamon normal
When did you notice?
:::

:::metan normal
On 2026-10-16. We took every rule that public information doesn't settle and compared each one with CoE's code.
:::

:::metan normal
We didn't call any API. We only read the code files CoE's page loads by itself, and these two were in there.
:::

## Why 50/50?

The deciding factor was the owner's principle: "if it isn't written, it's random."

:::zundamon normal
What did the owner say exactly?
:::

:::metan normal
Roughly: "if nothing is written, the effect just happens as stated, so anything unwritten is random."
:::

:::metan normal
We don't add our own logic where the text says nothing. Picking a side by weight was exactly that kind of added logic.
:::

:::zundamon normal
So when was it fixed?
:::

:::metan normal
In v0.1.525 (10-16), we switched to CoE's behavior. That night the owner confirmed keeping 50/50, and signed off on 10-17.
:::

:::zundamon happy
So you matched CoE on everything?
:::

:::metan normal
Not everything. We matched things like the Omen of Catalysing Exaltation multiplier, but some rules went the other way.
:::

| Rule | ExileDesk now | Compared with CoE | Since |
|---|---|---|---|
| Bone side (50/50, remove one equally) | Same as CoE | Matches | v0.1.525 |
| Omen of Light with Omen of Sinistral / Dextral Annulment | Can't be active together | Differs (the owner decided on 10-17: "Light is already in use") | v0.1.544 (v0.1.525 allowed both) |
| Bones with a Mark of the Abyssal Lord | The bone replaces the Mark; Necromancy omens aren't used or consumed | Matches | v0.1.545 |

We decide whether to follow CoE one rule at a time.

## Choosing the Side with a Necromancy Omen

To pick the side yourself, activate a Necromancy omen before using the bone.

:::zundamon normal
How does the omen change the side?
:::

:::metan normal
Just as written. Omen of Sinistral Necromancy makes your next Desecration prefix only, and Omen of Dextral Necromancy makes it suffix only.
:::

:::zundamon normal
What if that side is already full?
:::

:::metan normal
It replaces one mod on that side. ExileDesk has shown "replaces 1" since v0.1.511.
:::

:::zundamon normal
How much does the omen cost?
:::

:::metan normal
Omen of Dextral Necromancy was 7.29 Exalted Orbs (ExileDesk server market, 2026-10-20).
:::

:::metan normal
On gloves, Desecrated-only mods are suffixes only. We counted them in [Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/). Here are the glove bones (Ribs) too.
:::

| Bone | Condition | Market (Exalted Orbs) | Note |
|---|---|---:|---|
| Gnawed Rib | Item Level 64 max | 6.39 | Cheap, with a limit |
| Preserved Rib | ― | 6.75 | No limit shown |
| Ancient Rib | Minimum Modifier Level 40 | 4,702 | In a different league |

:::zundamon surprised
Only the Ancient Rib has a totally different price!
:::

:::tip Suffix-only slots: settle the side first
On a slot like gloves, where Desecrated-only mods are suffixes only, a bone on an item with both sides open lands on the prefixes half the time. Use Omen of Dextral Necromancy first, and the side can't miss.
:::

:::note fold Not yet verified (3)
- Both the 50/50 split and the equal removal follow CoE's code and the owner's "unwritten means random" principle. Nobody counted hundreds of bones in-game.
- The game text doesn't give the side odds either.
- Our sources don't cover the case where only one side is open, or whether Unrevealed and Desecrated mods can be removed when both sides are full.
:::

:::metan normal
Any crafting cost that includes Desecration sits on top of this side rule. Working costs backward is covered in [crafting expected cost vs. intuition](/en/blog/optimal-move-vs-intuition/).
:::

A bone lands 50/50 when both sides are open, and on the side of the equally removed non-Fractured mod when both are full. If your target only exists on one side, settle the side with a Necromancy omen first.

## Where the Numbers Come From

:::fold Show sources (6)
- 50/50 and "remove one non-Fractured mod equally, land on that side": CoE's code (poe2_desecrate, our 2026-10-16 comparison) and changelog v0.1.525 (poe2db / CoE, engine).
- The old behavior (total weight; pick side by weight, then remove): our Craft of Exile comparison notes (2026-10-16) (engine).
- The owner's principle and follow-up (10-16 night, 10-17 sign-off): the same notes and our crafting rule checklist (2026-10-17).
- Omen of Light with side Annulment (v0.1.525 to v0.1.544), Necromancy with a Mark (v0.1.545), "replaces 1" (v0.1.511): changelog (engine).
- What the Necromancy omens do: in-game descriptions.
- Prices (Omen of Dextral Necromancy 7.29 Exalted Orbs; Ribs 6.39 / 6.75 / 4,702 Exalted Orbs): ExileDesk server market (2026-10-20). Rib conditions (Item Level 64 max, Minimum Modifier Level 40) come from the analyst's handover note (the original screen is not recorded).
:::

## Try It Yourself

Use a bone on gloves on the [crafting bench](/?base=Sirenscale%20Gloves) to see how the side changes with and without a Necromancy omen. To compare the costs of routes that include Desecration, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Desecration weights](/en/blog/desecration-weights/)
- [PoE2 crafting expected cost vs. intuition](/en/blog/optimal-move-vs-intuition/)

VOICEVOX: Zundamon / Shikoku Metan
