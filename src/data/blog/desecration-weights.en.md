---
title: PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal
description: PoE2 desecration weights for Desecrated-only mods are all 1 on poe2db's crafting data and in Craft of Exile. Where the 85/14/1% reveal split comes from (563 ring reveals), and why ExileDesk now treats every mod as equal.
date: 2026-10-22
tags: Desecration, weight, Reveal, Craft of Exile, poe2db
draft: true
---
PoE2 desecration weights for Desecrated-only mods are **all 1 on poe2db's crafting data and in Craft of Exile** (CoE's data has all 247 at 1). Nobody has worked out the real numbers. So ExileDesk now makes every Desecrated-only mod **equally likely** (v0.1.528). The one measured figure we keep is how many Desecrated-only mods show up among the three reveal options: one 85%, two 14%, three 1%, from a community count of 563 ring reveals.

You know the loop: a bone puts an Unrevealed mod on the item, and on Reveal you pick one of three options. Mods from Amanamu, Kurgal and Ulaman that only exist through Desecration are mixed in.

How often your target Desecrated mod shows up is exactly the number you need to price a craft. When we went looking for it, there was nothing there.

And until recently, ExileDesk itself was filling that gap by stretching a ring measurement over every other slot. Here's that story too.

:::summary What you'll learn
- Desecrated-only mod weights are all 1 on poe2db's crafting data and in Craft of Exile. **Nobody knows** the real values
- The **85/14/1%** reveal split comes from a Reddit user's count of 563 ring reveals
- ExileDesk used to apply ring ratios to other slots; v0.1.528 made them **all equal**
- With equal weights, any one of the 15 Desecrated mods on Intelligence gloves is about 1 in 15 (about 6.7%), with no guarantee
:::

## Are Desecration Weights Published Anywhere?

No. Both poe2db's crafting data and Craft of Exile put every Desecrated-only mod at weight 1. That 1 is a placeholder meaning "no real value here," not a statement that the mods are equal.

Open Intelligence gloves in Craft of Exile (Sirenscale Gloves, Item Level 82) and the "Desecrated Suffixes" table lists 15 mods, but without the Weight column the normal tables have. Pick a bone and try to Desecrate, and it says "No handler for crafting this method"; no odds are calculated.

| Where we looked | Desecrated-only mod weights |
|---|---|
| poe2db crafting data | all 1 |
| Craft of Exile data | all 247 at 1 |
| Craft of Exile glove table | no weight column (no calculation) |

## Where Does 85/14/1% Come From?

From a Reddit post by u/Civil-Bee-f (the author of craftgaz), who revealed 563 rings and counted the options. The rings were Item Level 65+, using a Preserved Collarbone.

| Desecrated-only mods among the 3 reveal options | Share |
|---|---:|
| zero | never |
| one | 85% |
| two | 14% |
| three | 1% |

ExileDesk used a different split, 80/15/5%, before this. On 2026-10-09 the owner decided to switch to the measured 85/14/1%, and we still use it.

The same count was also used to estimate how often each Desecrated-only ring mod appears (a per-draw estimate, corrected for the attribute mods dropping out together). On suffixes, Strength and Dexterity was most common at 11.8% and cooldown recovery least at 1.2%. On prefixes, remnant effect led at 19.4% and ignite magnitude trailed at 9.8%.

There's also a claim that at Item Level 65+ at least one of the three options is Desecrated-only and the rest are each about 50%. Its basis is a weak approximation, so ExileDesk doesn't use it.

### What We Got Wrong: Stretching the Ring Count

From 2026-10-09 to 10-16, ExileDesk used the measured ratios for rings, and for every other slot applied the ring ratios to the same mods. Only rings had been measured. The numbers for gloves and weapons were simply borrowed.

Borrowed numbers are dangerous because they look real. If the tool says Strength and Dexterity rolls more often than other glove mods, nobody has actually counted that on gloves.

So on 2026-10-16 the owner decided to make Desecrated-only mod weights **all equal, rings included**. It shipped in v0.1.528. The ring measurements are kept on file for reference.

## With Equal Weights, What Decides the Odds?

The number of Desecrated-only mods the slot can roll. Intelligence gloves, for example, have 15, all suffixes (Amanamu 3, Kurgal 5, Ulaman 7). Any one of them is about 1 in 15, roughly 6.7%.

That figure only holds if the weights really are equal. And since you choose from three options, the chance your target appears among them has to be counted separately (we did that on the engine in [Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)).

:::note "All equal" means "unknown," not "correct"
We made them equal because the game doesn't publish the weights and no counts exist outside rings. There's no guarantee they really are equal. How often Desecrated glove mods roll is unverified, and whether the bone you use changes the options isn't listed on poe2db or Craft of Exile. The 85/14/1% split was measured on rings only and hasn't been checked on other slots.
:::

:::tip Read Desecration costs as "depends on the weights"
Any crafting cost that includes Desecration sits on the equal-weight assumption. When you're chasing one specific Desecrated mod, expect the real number to differ.
:::

## Do Attribute Mods Really "All Disappear"?

The Reddit post also said that if an item already has an attribute, Desecrated attribute mods stop appearing entirely. But on 2026-10-09 the trade site had 576 rings with both a Desecrated "Strength and Dexterity" and a normal Intelligence mod.

The owner's call: they just can't overlap. Only mods sharing a group (Strength with Strength, Dexterity with Dexterity) are blocked, and the engine stays that way.

## Where the Numbers Come From

- 85/14/1% and ring mod shares (11.8% to 1.2%, 19.4% to 9.8%): a community count on Reddit r/PathOfExile2 (563 ring reveals, Preserved Collarbone). In-game data, but rings only and not recounted by ExileDesk (estimate).
- Switching from 80/15/5% to 85/14/1%: the owner's decision (2026-10-09), recorded in our crafting rule checklist (2026-10-17).
- All Desecrated-only weights at 1: poe2db crafting data and Craft of Exile data (247 mods in a 2026-10-09 copy) (poe2db / CoE).
- No weight column, "No handler for crafting this method," and the 15 Desecrated mods on Intelligence gloves: Craft of Exile and poe2db glove pages (2026-10-21) (poe2db / CoE).
- Making them all equal: the owner's decision (2026-10-16), changelog v0.1.528 (engine).
- 1 in 15 (about 6.7%): a rule of thumb assuming equal weights (estimate).
- 576 listings: a trade site search (2026-10-09) (in-game).

## Try It Yourself

Put a bone on a Gold Ring on the [crafting bench](/?base=Gold%20Ring) and Reveal it to see the options. To compare crafting routes that include Desecration, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Cast Speed weight on poe2db](/en/blog/poe2db-cast-speed-weight/)
