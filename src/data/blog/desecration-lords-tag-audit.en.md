---
title: PoE2 Desecration Lords Fixed: 93 Mods Matched to poe2db
description: We checked every PoE2 Desecrated mod's lord (Amanamu, Ulaman, Kurgal) and tags against 9,455 tiers on poe2db. Mace Aftershock and Fissure mods sat under the wrong lord, skewing lord Omens. Here is what we fixed in v0.1.572.
date: 2026-10-22
tags: Desecrated, Amanamu, Ulaman, Kurgal, poe2db
draft: true
---
In PoE2, every Desecrated mod belongs to one of the desecration lords: Amanamu, Ulaman or Kurgal. In ExileDesk, **some of them, including the mace Aftershock and Fissure mods, were filed under the wrong lord**. We checked our tags against 9,455 tiers on poe2db and, in v0.1.572, matched 93 mods (counted per item class) to poe2db.

To be clear, this was our mistake. A Desecrated mod's lord decides which mods an Omen of the Liege, Sovereign or Blackblooded can give you. If the lord is wrong, a lord Omen on a weapon or piece of jewellery gives the wrong results too.

Take the Aftershock and Fissure mods on One Hand and Two Hand Maces. On poe2db they are Amanamu mods. ExileDesk had them under Ulaman. If you tested lord Omens on a mace with us, you were shown the wrong pool.

It surfaced when the owner asked for a full tag check against poe2db. Below is what was off, what we changed, and what is still open.

:::summary What you'll learn
- Which Desecrated mods had the wrong lord (mace Aftershock, Fissure and Empowered Attack mods, the wand Cast Speed while on Full Mana mod, and more)
- What we compared (9,455 normal, Desecrated and Essence tiers) and how the 34 mismatches break down
- What changed in v0.1.572 (93 mods) and the one case left undecided
:::

## Which Desecrated Mods Had the Wrong Lord?

The lord mismatches mattered most. The audit counted 9 mods; the ones we can confirm as fixed in our data are below (short names from the audit, with the mod id). The audit and the Japanese changelog spell Kurgal's Japanese name as カーガル; the site uses クルガル.

| Mod | Item class | poe2db | ExileDesk before |
|---|---|---|---|
| Additional Aftershock with Mace Slams (Desecrated_AftershockChance) | One / Two Hand Maces | Amanamu | Ulaman |
| Armour Break (Desecrated_ArmourPenetration) | One / Two Hand Maces | Amanamu | Ulaman |
| Damage against Enemies with Fully Broken Armour (Desecrated_DamagevsArmourBrokenEnemies) | One / Two Hand Maces | Amanamu | Ulaman |
| Additional Fissure (Desecrated_FissureChance) | One / Two Hand Maces | Amanamu | Ulaman |
| Empowered Attack damage (Desecrated_ExertedAttackDamage) | One / Two Hand Maces | Kurgal | Ulaman |
| Warcry Cooldown Recovery Rate (Desecrated_WarcryCooldownSpeed) | One / Two Hand Maces | Kurgal | Ulaman |
| Cast Speed while on Full Mana (Desecrated_IncreasedCastSpeed) | Wands | Kurgal | Ulaman |

All six mace mods had piled up under Ulaman. On poe2db they split between Amanamu and Kurgal.

### How This Hits the Lord Omens

In the ExileDesk engine, a lord Omen picks candidates by the lord tag on each mod. Lord Omens can only be used on weapons, jewellery and quivers, so a wrong lord changes Omen results for weapon and jewellery mods like the mace and wand ones above, not for armour.

| Omen | Lord |
|---|---|
| Omen of the Liege | Amanamu |
| Omen of the Sovereign | Ulaman |
| Omen of the Blackblooded | Kurgal |

So before the fix, the mace Aftershock and Fissure mods showed up under Omen of the Sovereign and never under Omen of the Liege. Now they follow poe2db and sit on the Liege side.

## What Else Was Off?

Besides lords, we compared the tags shown on screen. Counting the lord mismatches, there were 34 kinds of difference.

| Kind of mismatch | Count | Example |
|---|---:|---|
| Wrong Desecrated lord | 9 mods | mace Aftershock, Fissure |
| Wrong Desecrated tag contents | 4 mods | body armour reduced chance to be Critically Hit: poe2db says critical, we had speed |
| block / flask tags only on our side | 16 mods | block mods, belt flask mods |
| Essences | 5 mods | Perfect Essence mods with or without tags |

poe2db has no block or flask tag at all (it uses 27 tags). We had added those ourselves, so we removed them to match poe2db.

## Why Do Wrong Tags Matter?

Tags drive more than the lord Omens:

- which mods grow with Catalyst Quality (rings, amulets, jewels)
- the labels and search in the mod list
- the lord Omens (through the lord tag)

A wrong tag can change whether a mod scales with quality or shows up in a filter. Small as they look, these errors reached real results.

## How We Checked and What Changed

We re-fetched poe2db on 2026-10-18 and ran a script that compares our data with it tier by tier: 9,455 normal, Desecrated and Essence tiers (Perfect included).

On our side we compared only tags shown on screen, and compared the Desecrated lords separately. Internal-only tags never appear on screen, so we left them out.

Then the owner said to match everything to poe2db, and v0.1.572 did that: 93 mods when counted per item class.

:::note What is still open
- Essence defence % on Str/Dex/Int Body Armours stays as it was (Armour, Evasion and Energy Shield), because poe2db has no row with all three.
- The Essence defence % mismatch may come from how the two sides were paired up; the audit marks it as needing a check.
- We did not test lord Omens in game for this fix. poe2db is the reference.
- We have not measured how much the fix changes lord Omen results.
:::

:::tip Aiming for a lord on a mace
If you tried lord Omens on a mace in ExileDesk before v0.1.572, take another look. Aftershock and Fissure belong to Omen of the Liege (Amanamu).
:::

## Where the Numbers Come From

- Tag audit: docs/reviews/2026-10-18-tag-audit.md (9,455 tiers, 34 kinds of mismatch, 93 mods, the lord table). Label: poe2db / CoE (checked against poe2db).
- The fix: ExileDesk changelog v0.1.572 (93 mods matched to poe2db).
- Omen-to-lord mapping: ExileDesk engine data. Label: engine.
- Not checked in game.

## Try It Yourself

On the [crafting bench](/?base=Marauding%20Mace), put a lord Omen on a mace and desecrate it to see which lord's mods come up.

**Related posts**

- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often](/en/blog/arcane-surge-desecrated-gloves/)
