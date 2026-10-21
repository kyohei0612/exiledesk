---
title: PoE2 Desecration and Omen of Necromancy: Which Side?
description: Which side does a PoE2 desecration land on? We checked against Craft of Exile and fixed ExileDesk: 50/50 when both sides are open, and when both are full, one non-Fractured mod is removed at random. Plus Omen of Necromancy.
date: 2026-10-22
tags: Desecration, Bone, Omen of Necromancy, Craft of Exile, correction
draft: true
---
In PoE2 desecration, without an Omen of Necromancy, **a bone lands on either side 50/50 when both sides are open. When both sides are full, one non-Fractured mod is removed at random and the new Unrevealed mod goes on that side.** To choose the side yourself, use Omen of Sinistral Necromancy or Omen of Dextral Necromancy. ExileDesk switched to this behavior in v0.1.525.

Most people don't think much about which side a bone hits. But if the Desecrated mod you want only exists as a suffix on that slot, a prefix landing means your target can't even show up among the options.

Until recently, ExileDesk decided the side its own way. We only noticed when we compared our engine with Craft of Exile (CoE). Here's what we got wrong, how we found it, and what changed.

:::summary What you'll learn
- With both sides open, a bone lands on either side **50/50**. With both full, **one non-Fractured mod is removed at random** and the bone goes on that side
- ExileDesk used to pick the side by the total weight of each side's mods, which differed from CoE
- The deciding principle came from the owner: "if it isn't written, it's random." Fixed in v0.1.525
- Omen of Sinistral / Dextral Necromancy picks the side, but not when a Mark of the Abyssal Lord is on the item
:::

## Which Side Does a Bone Land On?

If both prefixes and suffixes have room, it's a coin flip. CoE's desecration code (poe2_desecrate) picks the side with a random 0 or 1.

Neither the bones nor the Necromancy omens say how the side is chosen when no omen is used. ExileDesk now reads anything unstated as equally random.

## What Gets Removed When Both Sides Are Full?

Use a bone on a Rare with both sides full, and one mod is removed at random from every non-Fractured mod. The new Unrevealed mod goes on the side that just opened up.

So it isn't "pick a side, then remove something there." It's "pick what to remove, then fill that gap."

| Situation | Side it lands on |
|---|---|
| Both sides open | 50/50 |
| Both sides full | Wherever the randomly removed non-Fractured mod was |

### What Did ExileDesk Get Wrong?

Both cases differed from CoE.

| Situation | Old ExileDesk | Now (v0.1.525, same as CoE) |
|---|---|---|
| Both sides open | Side picked by the total weight of each side's mods | 50/50 |
| Both sides full | Side picked by weight, then one mod on that side removed | One mod removed at random from all non-Fractured mods; the bone goes there |

Picking by total weight leans toward the side with the bigger pool. It sounds reasonable, but nothing in the game says so. The full-sides case even contradicted our own note from 10-10, "remove one at random from non-Fractured mods." The note was right; the code had drifted.

We caught it on 2026-10-16. We took every rule that public information doesn't settle and compared it, one by one, with how CoE's emulator is built. We didn't call any API; we only read the code files CoE's own page loads. These two were on the list.

## Why 50/50?

The owner's answer, paraphrased: if nothing is written, the effect just happens as stated, so anything unwritten is random.

Choosing a side by weight was exactly that kind of added logic. Under this principle, both bone rules were changed to CoE's behavior in v0.1.525 (10-16); the owner confirmed keeping 50/50 that night and signed off on 10-17.

The same review brought other rules in line with CoE, such as the Omen of Catalysing Exaltation multiplier. But we didn't copy CoE everywhere:

- Omen of Light with Omen of Sinistral / Dextral Annulment: v0.1.525 let them stack, as in CoE. On 10-17 the owner chose differently ("Light is already in use"), and since v0.1.544 they can't be active together.
- Bones with a Mark of the Abyssal Lord: the bone replaces the Mark, so Necromancy omens aren't used and aren't consumed (v0.1.545). This matches CoE.

## Choosing the Side with Omen of Necromancy

As written, Omen of Sinistral Necromancy makes your next Desecration add only prefix modifiers, and Omen of Dextral Necromancy only suffix modifiers. If that side is full, one mod there is replaced (ExileDesk shows "replaces 1" since v0.1.511).

Omen of Dextral Necromancy was 7.29 Exalted Orbs on the ExileDesk server's market (2026-10-20).

On gloves, every Desecrated-only mod is a suffix (counted in [Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)). Here are the glove bones for reference:

| Bone | Condition | Market (Exalted Orbs) |
|---|---|---:|
| Gnawed Rib | Item Level 64 max | 6.39 |
| Preserved Rib | ― | 6.75 |
| Ancient Rib | Minimum Modifier Level 40 | 4,702 |

:::tip Suffix-only slots: settle the side first
On a slot like gloves, where Desecrated-only mods are suffixes only, a bone on an item with both sides open lands on the prefixes half the time. Use Omen of Dextral Necromancy first, and the side can't miss.
:::

:::note These are not in-game counts
Both the 50/50 split and the random removal follow CoE's code and the owner's "unwritten means random" principle. Nobody counted hundreds of bones in-game, and the game text gives no side odds. Our sources don't cover the case where only one side is open, or whether Unrevealed and Desecrated mods are among the removable ones when both sides are full.
:::

Any crafting cost that includes Desecration sits on top of this side rule. For working costs backward from the finished item, see [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/).

## Where the Numbers Come From

- 50/50 and "remove one non-Fractured mod at random, land on that side": CoE's code (poe2_desecrate, our 2026-10-16 comparison) and changelog v0.1.525 (poe2db / CoE, engine).
- The old behavior (total weight; pick side by weight, then remove): our Craft of Exile comparison notes (2026-10-16) (engine).
- The owner's principle and follow-up (10-16 night, 10-17 sign-off): the same notes and our crafting rule checklist (2026-10-17).
- Omen of Light with side Annulment (v0.1.525 to v0.1.544), Necromancy with a Mark (v0.1.545), "replaces 1" (v0.1.511): changelog (engine).
- What the Necromancy omens do: in-game descriptions.
- Prices (Omen of Dextral Necromancy 7.29 Exalted Orbs; Ribs 6.39 / 6.75 / 4,702): ExileDesk server market (2026-10-20). Rib conditions (item level up to 64, minimum modifier level 40) come from the analyst's handover note (the original screen is not recorded).

## Try It Yourself

Use a bone on gloves on the [crafting bench](/?base=Sirenscale%20Gloves) to see how the side changes with and without a Necromancy omen. To compare routes that include Desecration, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Desecration weights](/en/blog/desecration-weights/)
- [PoE2 crafting expected cost](/en/blog/optimal-move-vs-intuition/)
