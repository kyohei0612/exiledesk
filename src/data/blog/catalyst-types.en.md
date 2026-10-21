---
title: PoE2 Catalyst Types: Which Mods Each One Boosts
description: All 13 PoE2 catalyst types in one table, by the mod tag each one enhances: Neural for Mana, Sibilant for Caster, Skittering for Speed. Rings and amulets only, and a new type restarts quality from 0. Plus how to pick for a mana Gold Ring, and rough prices.
date: 2026-10-22
tags: Catalyst, Quality, Gold Ring, Neural Catalyst, Sibilant Catalyst
craft: /?base=Gold%20Ring
image: img/catalyst-types-og.en.png
ready: true
---
There are 13 PoE2 catalyst types, and **every one of them is for a ring or amulet only**. Each enhances mods with one tag: Neural Catalyst for Mana mods, Sibilant Catalyst for Caster mods, Skittering Catalyst for Speed mods. An item holds only one quality type, so a different catalyst restarts quality from 0.

:::zundamon troubled
I have no idea what a "Sibilant Catalyst" is supposed to boost.
:::

:::metan normal
The names don't give much away. Sibilant means Caster, and Carapace covers Armour, Evasion and Energy Shield.
:::

:::zundamon normal
How did you work that out?
:::

:::metan normal
When we researched a mana Gold Ring, I checked the poe2db tags of each target mod one by one. Then I put all 13 types into one table.
:::

:::summary What you'll learn
- All 13 catalysts and the mod tag each one enhances
- Which catalysts work on mana ring targets (maximum Mana, Cast Speed and more)
- Only one quality type at a time, and a new type starts from 0. No catalysts on gloves, and jewels use "Refined" catalysts
:::

:::tip New to this? Words used here
- **Catalyst**: a currency that adds quality to rings and amulets
- **Quality**: a value that raises the numbers on mods with a certain tag
- **Mod tag**: the category a mod belongs to (Mana, Caster and so on)
- **Refined catalyst**: the catalyst used on jewels
- **div**: Divine Orb, the price unit in this post
:::

## How Many Catalyst Types Are There in PoE2? 13, All for Jewellery

On poe2db, all 13 descriptions follow the same pattern. The only difference is the mod tag each one boosts.

:::zundamon normal
What does the description say?
:::

:::metan normal
"Adds quality that enhances ___ modifiers on a ring or amulet. Replaces other quality types."
:::

:::metan normal
Only the blank changes from type to type. Here it is as a table.
:::

| Catalyst | Enhances |
|---|---|
| Flesh Catalyst | Life |
| Neural Catalyst | Mana |
| Carapace Catalyst | Armour, Evasion and Energy Shield |
| Uul-Netol's Catalyst | Physical |
| Xoph's Catalyst | Fire |
| Tul's Catalyst | Cold |
| Esh's Catalyst | Lightning |
| Chayula's Catalyst | Chaos |
| Reaver Catalyst | Attack |
| Sibilant Catalyst | Caster |
| Skittering Catalyst | Speed |
| Adaptive Catalyst | Attribute |
| Necrotic Catalyst | Minion |

:::zundamon normal
So I can tell from a mod's name whether a catalyst works on it?
:::

:::metan normal
No, what counts is the **tag on the mod**, not its name.
:::

:::metan normal
A mod with two or more tags is boosted by a catalyst matching any of them.
:::

## Neural, Sibilant or Skittering for a Mana Ring?

These are our results for mana targets on a Gold Ring (Item Level 82). We checked the tags against poe2db's ring mod table.

| Target mod | Tags | Catalyst that works | How to pick |
|---|---|---|---|
| maximum Mana (Zaffre and others) | Mana | Neural | Neural only |
| (4–6)% increased maximum Mana | Mana | Neural | Neural only |
| Mana Regeneration Rate (of Nirvana) | Mana | Neural | Neural only |
| Spell Mana Cost Efficiency (Calculating) | Mana, Caster | Neural and Sibilant | Either one works |
| Cast Speed | Caster, Speed | Sibilant and Skittering | Either one works |
| all Elemental Resistances | Elemental, Fire, Cold, Lightning, Resistance | Not Neural, Sibilant or Skittering | Tul's, Xoph's or Esh's (engine behaviour) |

:::zundamon happy
So Cast Speed works with either Sibilant or Skittering!
:::

:::metan normal
Right. It has both tags, so either one adds quality to it.
:::

:::metan troubled
But if you also have Mana mods you want to boost with Neural, you have to pick one type based on which mods matter most.
:::

:::zundamon normal
What works on all Elemental Resistances?
:::

:::metan normal
It has the Fire, Cold and Lightning tags, so ExileDesk counts Tul's, Xoph's and Esh's Catalysts as boosting it.
:::

:::metan normal
In our mana ring calculations, we boosted all-res with Tul's Catalyst.
:::

:::metan troubled
That's how the engine reads the tags, though. We haven't confirmed it in game yet.
:::

:::zundamon normal
Is Spell Mana Cost Efficiency something you add by crafting, too?
:::

:::metan normal
No. It isn't in the ring's regular mod table. It only appears in the Genesis Tree table.
:::

## How Much Quality Can You Add? A New Type Starts From 0

A ring or amulet holds only one catalyst quality type. A different type wipes the old quality.

:::zundamon normal
Can't I stack two kinds of catalyst?
:::

:::metan normal
You can't. Just as the description says, it "replaces other quality types," so you build again from 0.
:::

:::zundamon normal
How much quality does one catalyst add?
:::

:::metan normal
In ExileDesk, **each catalyst you use by hand adds +1% or +2% quality (50/50)**.
:::

:::metan normal
That's the owner's call (2026-10-17), in place since v0.1.540. The usual cap is 20%.
:::

:::zundamon surprised
Was it different before?
:::

:::metan normal
In v0.1.509, picking a type filled quality to the cap in one step.
:::

| What you do | What happens | Result |
|---|---|---|
| Add the same type | Quality stacks up | You can raise it to the cap (usually 20%) |
| Add a different type | The old quality is wiped | Back to 0, and the quality you built is wasted |

:::zundamon troubled
That hurts if my target changes halfway through.
:::

:::metan troubled
It does. In our mana ring calculations, two parts made up most of the cost.
:::

:::metan normal
Perfect Exalted Orbs (376–418 div) and re-applying Skittering Catalysts for Cast Speed (228–391 div). The details are in [Mana Ring Craft](/en/blog/mana-ring-craft/).
:::

:::tip Quality does more than raise numbers
Mod values boosted by quality round down on display ([Quality Rounding](/en/blog/quality-rounding-down/)). Quality also matters for Omen of Catalysing Exaltation, which makes mods with the matching tag more likely ([the multiplier](/en/blog/catalysing-exaltation-multiplier/)).
:::

### Can You Use Catalysts on Gloves or Jewels?

Gloves and jewels are two different stories.

:::zundamon normal
I want to put Carapace or Neural Catalysts on my ES gloves too.
:::

:::metan troubled
**No catalyst works on gloves.** Some have tags that match your targets, but they only go on rings and amulets.
:::

:::metan normal
Glove quality comes from a different currency, the one for armour.
:::

:::zundamon normal
What about jewels?
:::

:::metan normal
Jewels use "Refined" catalysts, such as the Refined Neural Catalyst.
:::

:::metan normal
ExileDesk switched jewel catalysts to the Refined versions in v0.1.508. Regular catalysts are for rings and amulets.
:::

## What Do Catalysts Cost?

These are the trade rates shown on each currency's poe2db page, as we read them on 2026-10-21.

| Catalyst | poe2db listing | Trades in 24 h | Price (our reading) |
|---|---|---:|---|
| Neural Catalyst | 1 Divine Orb = 21.5 | 279 | Cheapest of the three, if the direction is right |
| Sibilant Catalyst | 1 Divine Orb = 3.02 | 935 | Pricier than Neural, if the direction is right |
| Skittering Catalyst | 1 Divine Orb = 3.93 | 267 | Pricier than Neural, if the direction is right |

:::zundamon happy
Neural Catalysts are way cheaper!
:::

:::metan troubled
If you read it this way. The direction ("1 div = n" or "n div = 1") is our own reading.
:::

:::note fold Not yet verified (3)
- Tul's, Xoph's and Esh's boosting all Elemental Resistances is how the engine reads the tags. We haven't confirmed it in game.
- +1% or +2% per catalyst is ExileDesk's setting. We haven't confirmed the in-game value.
- The price direction is estimated. Check it on the poe2db page before you rely on it.
:::

The basic rule: look at your target mod's tags first, then pick one catalyst type. Switching types restarts quality from 0, so plan a route where you don't have to switch midway.

## Where the Numbers Come From

:::fold Show sources (8)
- Names and tags of all 13 catalysts: each catalyst's description on poe2db (the same text as ExileDesk's currency tooltips). English and Japanese names from ExileDesk's catalysts.json. Certainty: poe2db/CoE
- Mana ring mod tags and matching catalysts: research/notes/2026-10-21-mana-ring-mods.md (poe2db ring mod table). Certainty: poe2db/CoE
- Tul's for all-res and the mana ring cost breakdown: math/notes/2026-10-21-gold-ring-suffix-ev.md and 2026-10-21-mana-ring-ev.md. Certainty: engine
- No catalysts on gloves: research/notes/2026-10-21-es-gloves-mods.md (poe2db descriptions). Certainty: poe2db/CoE
- +1% or +2% per catalyst: ExileDesk changelog v0.1.540 (owner's decision). The earlier behaviour is v0.1.509, and other quality changes such as Blacksmith's Whetstone are v0.1.529. Certainty: engine
- Restarting from 0 and the 13 types: the "Learn catalysts and quality" tutorial (v0.1.561) and poe2db's wording. Certainty: poe2db/CoE
- Refined catalysts for jewels: v0.1.508. Certainty: poe2db/CoE
- Prices: trade rates on poe2db's pages (2026-10-21), direction estimated. Certainty: estimate
:::

## Try It Yourself

To swap catalysts and compare which mods quality changes, try a Gold Ring on the [crafting bench](/?base=Gold%20Ring).

**Related posts**

- [PoE2 Catalysing Exaltation Multiplier](/en/blog/catalysing-exaltation-multiplier/)
- [PoE2 Quality Rounding: Round Down](/en/blog/quality-rounding-down/)
- [PoE2 Mana Ring Craft](/en/blog/mana-ring-craft/)

VOICEVOX: Zundamon / Shikoku Metan
