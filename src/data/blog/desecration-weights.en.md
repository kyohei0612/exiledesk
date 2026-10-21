---
title: PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal
description: PoE2 desecration weights for Desecrated-only mods are all 1 on poe2db's crafting data and in Craft of Exile. Where the 85/14/1% reveal split comes from (563 ring reveals), and why ExileDesk now treats every mod as equal.
date: 2026-10-22
tags: Desecration, weight, Reveal, Craft of Exile, poe2db
image: img/desecration-weights-og.en.png
ready: true
draft: true
---
PoE2 desecration weights for Desecrated-only mods are **all 1 on poe2db's crafting data and in Craft of Exile** (CoE's data has all 247 at 1). Nobody has worked out the real numbers. So ExileDesk now makes every Desecrated-only mod **equally likely** (v0.1.528). The one measured figure we keep is how many Desecrated-only mods show up among the three reveal options (one 85%, two 14%, three 1%), from a community count of 563 ring reveals.

:::zundamon normal
How often does my target Desecrated mod show up? Can I just look it up?
:::

:::metan troubled
That's the thing: it isn't listed anywhere. When I went looking, I found a blank.
:::

:::zundamon surprised
Nobody knows?! Then what does ExileDesk do?
:::

:::metan troubled
Until recently, it ran on a guess built on a guess: ring measurements stretched over every other slot. I'll be honest about that part too.
:::

:::summary What you'll learn
- Desecrated-only mod weights are all 1 on poe2db's crafting data and in Craft of Exile. **Nobody knows** the real values
- The **85/14/1%** reveal split comes from a Reddit user who revealed 563 rings and counted the options
- In v0.1.528, ExileDesk made the weights **all equal**. On Intelligence gloves, any one Desecrated mod is about 1 in 15 (about 6.7%) as a rule of thumb
:::

:::tip New to this? Words used here
- **Desecration**: Using a bone to add an Unrevealed mod to an item
- **Reveal**: Turning an Unrevealed mod into a real one by picking one of three options
- **Desecrated-only mod**: A mod that only Desecration can add. These are the Amanamu, Kurgal and Ulaman mods
- **Weight**: A number for how likely each mod is. Bigger means more likely
- **Measured**: A number counted by actually crafting in the game
:::

## Are Desecration Weights Published Anywhere?

No. Both poe2db's crafting data and Craft of Exile put every Desecrated-only mod at weight 1.

:::zundamon normal
If they're all 1, doesn't that mean they're all equally likely?
:::

:::metan normal
No. That 1 is a placeholder meaning "no real value here."
:::

:::metan normal
It isn't a number that shows differences between mods.
:::

:::zundamon normal
But Craft of Exile calculates odds for you, right?
:::

:::metan normal
I opened Intelligence gloves there (Sirenscale Gloves, Item Level 82). The Desecrated suffix table listed 15 mods.
:::

:::metan troubled
But it has no weight column, unlike the normal mod tables.
:::

:::metan troubled
When I picked a bone and tried to Desecrate, it said "No handler for crafting this method." No odds were calculated either.
:::

| Where we looked | Desecrated-only mod weights | What it tells us |
|---|---|---|
| poe2db crafting data | all 1 | no real values |
| Craft of Exile data | all 247 at 1 | no real values |
| Craft of Exile glove table | no weight column | no calculation either |

:::zundamon troubled
Wherever we look, the real weights just aren't there...
:::

## Where Does 85/14/1% Come From?

From a Reddit user, u/Civil-Bee-f (the author of craftgaz), who revealed 563 rings and counted the options. The rings were Item Level 65+, using a Preserved Collarbone.

:::zundamon normal
We don't know the weights, but we do know 85/14/1%?
:::

:::metan normal
That's the share of how many Desecrated-only mods land among the three reveal options. It's a different number from the weights.
:::

| Desecrated-only mods among the 3 reveal options | Share | What happens |
|---|---:|---|
| zero | never | all three options are never normal mods |
| one | 85% | almost always this |
| two | 14% | sometimes two |
| three | 1% | all three Desecrated-only is rare |

:::metan normal
ExileDesk used a different split here before: 80/15/5%.
:::

:::metan normal
On 2026-10-09 the owner decided to switch to the measured 85/14/1%. We still use it today.
:::

:::zundamon normal
Does the ring count also tell us how likely each mod is?
:::

:::metan normal
There is an estimate. It's a per-draw estimate, corrected for the attribute mods dropping out together.
:::

| Desecrated-only ring mod | Per-draw estimate | Where it sits |
|---|---:|---|
| Strength and Dexterity (suffix) | 11.8% | most common suffix |
| Cooldown Recovery Rate (suffix) | 1.2% | rarest suffix |
| Remnant Effect (prefix) | 19.4% | near the top of prefixes |
| Ignite Magnitude (prefix) | 9.8% | near the bottom of prefixes |

:::zundamon normal
Are there any other theories?
:::

:::metan normal
One says that at Item Level 65+, at least one of the three options is Desecrated-only, and the rest are each about 50%.
:::

:::metan troubled
But its basis is a weak approximation. So ExileDesk doesn't use it.
:::

### We Used to Stretch the Ring Count Over Other Slots

Only rings have been measured. From 2026-10-09 to 10-16, ExileDesk borrowed those ratios for every other slot too.

:::zundamon normal
So what did it do for gloves and weapons?
:::

:::metan troubled
It applied the ring ratios to the same mods. We just borrowed the ring numbers.
:::

:::zundamon happy
A number is better than no number!
:::

:::metan troubled
Borrowed numbers are dangerous because they look real.
:::

:::metan troubled
If gloves show "Strength and Dexterity rolls more often," nobody has actually counted that on gloves.
:::

:::metan normal
So on 2026-10-16, the owner decided to make all Desecrated-only mod weights equal, rings included.
:::

:::metan normal
It shipped in v0.1.528. The ring measurement table is kept on file for reference.
:::

| Period | Rings | Other slots | Why |
|---|---|---|---|
| 2026-10-09 to 10-16 | measured ratios | estimate borrowed from rings | only rings were measured |
| from 2026-10-16 (v0.1.528) | all equal | all equal | borrowed numbers mislead |

## With Equal Weights, What Decides the Odds?

With equal weights, your odds depend on how many Desecrated-only mods the slot can roll.

:::zundamon normal
What about Intelligence gloves?
:::

:::metan normal
Intelligence gloves have 15 Desecrated mods, all suffixes: Amanamu 3, Kurgal 5, Ulaman 7.
:::

:::metan normal
So any one of them comes up 1 in 15 of the time, about 6.7%, as a rule of thumb.
:::

| Desecrated mods on Intelligence gloves | Count | Chance of one mod (equal weights) |
|---|---:|---|
| Amanamu | 3 | — |
| Kurgal | 5 | — |
| Ulaman | 7 | — |
| Total | 15 | 1 in 15 (about 6.7%) |

:::zundamon happy
So my target Desecrated mod shows up 6.7% of the time!
:::

:::metan troubled
Only if the weights really are equal.
:::

:::metan normal
Also, Reveal lets you choose from three options. The chance your target is among them has to be counted separately.
:::

:::metan normal
We counted that on the engine in [Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/).
:::

:::note fold Not yet verified (4)
- We made them equal because the game doesn't publish the weights and no counts exist outside rings. There's no guarantee they really are equal.
- How often Desecrated glove mods roll hasn't been checked.
- Whether the bone you use changes the options isn't listed on poe2db or Craft of Exile.
- The 85/14/1% split was measured on rings only. Whether other slots match hasn't been checked.
:::

:::tip Read Desecration costs as "depends on the weights"
Any crafting cost that includes Desecration rests on the assumption that all weights are equal. When you're chasing one specific Desecrated mod, it's safer to treat the calculated number as having some range.
:::

## Do Attribute Mods Really "All Disappear"?

The Reddit post also said that if an item already has an attribute, Desecrated attribute mods stop appearing entirely.

:::zundamon surprised
So if there's an attribute, every Desecrated attribute mod is wiped out?!
:::

:::metan normal
I checked the trade site on 2026-10-09. There were 576 rings with both a Desecrated "Strength and Dexterity" and a normal Intelligence mod.
:::

:::zundamon normal
If they all disappeared, those rings couldn't exist.
:::

:::metan normal
Exactly. The owner's call was: "they just can't overlap."
:::

:::metan normal
Only mods in the same group (Strength with Strength, Dexterity with Dexterity) are blocked, and the engine stays that way.
:::

Right now, no real weights for Desecrated-only mods exist anywhere. ExileDesk treats what's unknown as unknown, so it keeps the weights all equal.

## Where the Numbers Come From

:::fold Show sources (7)
- 85/14/1% and ring mod shares (11.8% to 1.2%, 19.4% to 9.8%): a community count on Reddit r/PathOfExile2 (563 ring reveals, Preserved Collarbone). In-game data, but rings only and not recounted by ExileDesk (estimate).
- Switching from 80/15/5% to 85/14/1%: the owner's decision (2026-10-09), our crafting rule checklist (2026-10-17).
- All Desecrated-only weights at 1: poe2db crafting data and Craft of Exile data (247 mods in a 2026-10-09 copy) (poe2db / CoE).
- No weight column in the glove table, the "No handler for crafting this method" message, and the 15 Desecrated mods on Intelligence gloves: Craft of Exile and poe2db glove pages (2026-10-21) (poe2db / CoE).
- Making them all equal: the owner's decision (2026-10-16), changelog v0.1.528 (engine).
- 1 in 15 (about 6.7%): a rule of thumb assuming equal weights (estimate).
- 576 listings: a trade site search (2026-10-09) (in-game).
:::

## Try It Yourself

Put a bone on a Gold Ring on the [crafting bench](/?base=Gold%20Ring) and Reveal it to see the options.

**Related posts**

- [PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often](/en/blog/arcane-surge-desecrated-gloves/)
- [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)

VOICEVOX: Zundamon / Shikoku Metan
