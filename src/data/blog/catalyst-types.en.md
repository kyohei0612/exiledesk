---
title: PoE2 Catalyst Types: Which Mods Each One Boosts
description: All 13 PoE2 catalyst types and the mod tag each one enhances: Neural for Mana, Sibilant for Caster, Skittering for Speed. Rings and amulets only, and a new type restarts quality from 0.
date: 2026-10-22
tags: Catalyst, Quality, Gold Ring, Neural Catalyst, Sibilant Catalyst
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
There are 13 PoE2 catalyst types, and **every one of them is for a ring or amulet only**. Each enhances mods with one tag: Neural Catalyst for Mana mods, Sibilant Catalyst for Caster mods, Skittering Catalyst for Speed mods, and so on. An item holds only one quality type, so switching catalysts restarts quality from 0.

The names don't give much away. Few players would guess that "Sibilant" means Caster, or that "Carapace" covers Armour, Evasion and Energy Shield.

When we researched a mana Gold Ring, we checked the poe2db tags of every target mod to see which catalyst applied. Here is the full list of 13, plus what we found on the ring.

:::summary What you'll learn
- All 13 catalysts and the mod tag each one enhances
- Which catalyst works on mana ring targets (maximum Mana, Cast Speed and more)
- Only one quality type at a time; a new type starts from 0 (ExileDesk adds +1% or +2% per catalyst)
- Catalysts don't work on gloves, and jewels use "Refined" catalysts
:::

## How Many Catalyst Types Are There? 13, All for Jewellery

On poe2db, all 13 descriptions follow the same pattern: "Adds quality that enhances ___ modifiers on a ring or amulet. Replaces other quality types." Only the blank changes, meaning the mod tag each one boosts.

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

What counts is the **tag on the mod**, not its name. A mod with two or more tags is boosted by a catalyst matching any of them.

## Neural, Sibilant or Skittering for a Mana Ring?

These are the tags and matching catalysts for the mana targets on a Gold Ring (Item Level 82), checked against poe2db's ring mod table.

| Target mod | Tags | Catalyst that works |
|---|---|---|
| maximum Mana (Zaffre and lower tiers) | Mana | Neural |
| (4–6)% increased maximum Mana | Mana | Neural |
| Mana Regeneration Rate (of Nirvana) | Mana | Neural |
| Spell Mana Cost Efficiency (Calculating) | Mana, Caster | Neural or Sibilant |
| Cast Speed | Caster, Speed | Sibilant or Skittering |
| all Elemental Resistances | Elemental, Fire, Cold, Lightning, Resistance | none of Neural, Sibilant, Skittering |

Two-tag mods like Cast Speed take quality from either Sibilant or Skittering. If the same ring also has Mana mods you'd rather boost with Neural, you have to decide which mods get the one quality type.

All Elemental Resistances carries the Fire, Cold and Lightning tags, so ExileDesk, which judges by tags, counts Tul's (Cold), Xoph's (Fire) and Esh's (Lightning) as boosting it. Our mana ring calculations aimed all-res with Tul's Catalyst. That's engine behaviour and not yet confirmed in game.

Note that Spell Mana Cost Efficiency (Calculating) isn't in the ring's regular mod table. It only appears in the Genesis Tree table, so it's not something you add later by crafting.

## How Does Quality Build Up? A New Type Starts From 0

A ring or amulet holds only one catalyst quality type. As the description says, it "replaces other quality types": a different catalyst wipes the old quality and you build from 0 again.

In ExileDesk, **each catalyst you use by hand adds +1% or +2% quality (50/50)**. That's the owner's call (2026-10-17), in place since v0.1.540. Before that, picking a catalyst type filled quality to the cap in one step (v0.1.509). The usual cap is 20%.

Switching catalyst types midway throws away the quality you built. In our mana ring runs, two parts dominated the cost: Perfect Exalted Orbs (376–418 div) and re-applying Skittering Catalysts for Cast Speed (228–391 div) ([Mana Ring Craft](/en/blog/mana-ring-craft/)).

:::tip Quality does more than raise numbers
Mod values boosted by quality round down on display ([Quality Rounding](/en/blog/quality-rounding-down/)). Quality is also what Omen of Catalysing Exaltation uses to favour mods with the matching tag ([the multiplier](/en/blog/catalysing-exaltation-multiplier/)).
:::

### Can You Use Catalysts on Gloves or Jewels?

**No catalyst works on gloves.** Carapace (Energy Shield) and Neural (Mana) match ES glove targets, but they only go on rings and amulets. Glove quality comes from a different, armour currency.

Jewels use "Refined" catalysts instead (for example, Refined Neural Catalyst). ExileDesk switched jewel catalysts to the Refined versions in v0.1.508. Regular catalysts are for rings and amulets.

## What Do Catalysts Cost?

These are the trade rates shown on each currency's poe2db page, as we read them on 2026-10-21.

| Catalyst | poe2db listing | Trades in 24 h |
|---|---|---:|
| Neural Catalyst | 1 Divine Orb = 21.5 | 279 |
| Sibilant Catalyst | 1 Divine Orb = 3.02 | 935 |
| Skittering Catalyst | 1 Divine Orb = 3.93 | 267 |

Read this way, Neural Catalysts are far cheaper than Sibilant or Skittering. The direction ("1 div = n" vs "n div = 1") is our reading, though.

:::note What we haven't verified
- Tul's, Xoph's and Esh's boosting all Elemental Resistances is how the engine reads the tags; not confirmed in game.
- +1% or +2% per catalyst is ExileDesk's setting, not a confirmed in-game value.
- The price direction is estimated. Check it on the poe2db page before relying on it.
:::

## Where the Numbers Come From

- Names and tags of all 13 catalysts: each catalyst's description on poe2db (the same text as ExileDesk's currency tooltips), English names as in ExileDesk's catalysts.json. Certainty: poe2db/CoE
- Mana ring mod tags and matching catalysts: research/notes/2026-10-21-mana-ring-mods.md (poe2db ring mod table). Certainty: poe2db/CoE
- Tul's for all-res and the mana ring cost breakdown: math/notes/2026-10-21-gold-ring-suffix-ev.md and 2026-10-21-mana-ring-ev.md. Certainty: engine
- No catalysts on gloves: research/notes/2026-10-21-es-gloves-mods.md (poe2db descriptions). Certainty: poe2db/CoE
- +1% or +2% per catalyst: ExileDesk changelog v0.1.540 (owner's decision); the earlier behaviour is v0.1.509, and the equipment quality currency change is v0.1.529. Certainty: engine
- 13 types and restarting from 0: the "Learn catalysts and quality" tutorial (v0.1.561) and poe2db's wording. Certainty: poe2db/CoE
- Refined catalysts for jewels: v0.1.508. Certainty: poe2db/CoE
- Prices: trade rates on poe2db's pages (2026-10-21), direction estimated. Certainty: estimate

## Try It Yourself

To swap catalysts and compare which mods quality changes, try a Gold Ring on the [crafting bench](/?base=Gold%20Ring). To compare routes to your target mod, use the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 Catalysing Exaltation Multiplier](/en/blog/catalysing-exaltation-multiplier/)
- [PoE2 Quality Rounding: Round Down](/en/blog/quality-rounding-down/)
- [PoE2 Mana Ring Craft](/en/blog/mana-ring-craft/)
