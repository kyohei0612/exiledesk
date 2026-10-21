---
title: PoE2 Desecration Lords Fixed: 93 Mods Matched to poe2db
description: We checked every PoE2 Desecrated mod's lord (Amanamu, Ulaman, Kurgal) and tags against 9,455 tiers on poe2db. Mace Aftershock and Fissure mods sat under the wrong lord, skewing lord Omens. Here is what we fixed in v0.1.572.
date: 2026-10-22
tags: Desecration, desecration lords, poe2db, Mace, correction
image: img/desecration-lords-tag-audit-og.en.png
ready: true
draft: true
---
In PoE2, every Desecrated mod belongs to a lord: Amanamu, Ulaman or Kurgal. In ExileDesk, **some of them, including the mace Aftershock and Fissure mods, were filed under the wrong lord**. We checked lords and tags against 9,455 tiers on poe2db, and in v0.1.572 we matched 93 mods (counted per item class) to poe2db.

:::zundamon normal
I put a lord Omen on a mace and desecrated it, but Aftershock never showed up.
:::

:::metan troubled
Sorry, that one was our mistake. Aftershock was filed under the wrong lord.
:::

:::zundamon surprised
Wait, ExileDesk had it wrong?!
:::

:::metan normal
Yes. We checked everything against poe2db and fixed it in v0.1.572.
:::

:::summary What you'll learn
- Which Desecrated mods had a different lord from poe2db (mace Aftershock, Fissure and Empowered Attack, the wand Cast Speed while on Full Mana, and more)
- What we compared (9,455 normal, Desecrated and Essence tiers) and how the 34 kinds of mismatch break down
- That v0.1.572 matched 93 mods to poe2db, and the one thing still undecided
:::

:::tip New to this? Words used here
- **Desecration**: a craft that adds a Desecrated mod to an item
- **Lord**: the owner of a Desecrated mod. There are three: Amanamu, Ulaman and Kurgal
- **Lord Omen**: an Omen that limits a desecration to that lord's mods
- **Tag**: a label on a mod. It decides things like Quality scaling and list filters
- **Tier**: one strength level of a mod; the same mod splits into several by its numbers
:::

## Which Desecrated Mods Had the Wrong Lord?

The lords were the biggest mismatch. The audit counted 9 mods. The table shows the ones we could confirm as fixed in our data.

:::zundamon normal
So which ones were wrong?
:::

:::metan normal
Six on maces and one on wands. Here's the table.
:::

| Mod | Item class | poe2db | ExileDesk before | What happened |
|---|---|---|---|---|
| Aftershock | One / Two Hand Maces | Amanamu | Ulaman | In the wrong lord's pool |
| Armour Break | One / Two Hand Maces | Amanamu | Ulaman | In the wrong lord's pool |
| Damage against Enemies with Fully Broken Armour | One / Two Hand Maces | Amanamu | Ulaman | In the wrong lord's pool |
| Fissure | One / Two Hand Maces | Amanamu | Ulaman | In the wrong lord's pool |
| Empowered Attack | One / Two Hand Maces | Kurgal | Ulaman | In the wrong lord's pool |
| Warcry Cooldown | One / Two Hand Maces | Kurgal | Ulaman | In the wrong lord's pool |
| Cast Speed while on Full Mana | Wands | Kurgal | Ulaman | In the wrong lord's pool |

All six mace mods had piled up under Ulaman. On poe2db they split between Amanamu and Kurgal.

:::zundamon surprised
They were all Ulaman!
:::

:::metan troubled
They were. They really belong to Amanamu and Kurgal.
:::

### How This Hits the Lord Omens

In the ExileDesk engine, a lord Omen picks its candidates by the lord tag on each mod.

:::zundamon normal
Why does a wrong lord matter?
:::

:::metan normal
It changes which mods a lord Omen can give you.
:::

:::zundamon normal
Does it hit armour too?
:::

:::metan normal
No. Lord Omens only work on weapons, jewellery and quivers.
:::

:::metan normal
So it only affects weapon and jewellery mods, like these mace and wand ones.
:::

| Omen | Lord | Mace Aftershock / Fissure before | Now |
|---|---|---|---|
| Omen of the Liege | Amanamu | No | Yes |
| Omen of the Sovereign | Ulaman | Yes | No |
| Omen of the Blackblooded | Kurgal | No | No |

Before the fix, mace Aftershock and Fissure were in the Omen of the Sovereign pool. Now they follow poe2db and sit with Omen of the Liege.

:::zundamon troubled
So aiming for Aftershock with Omen of the Liege never worked...
:::

:::metan troubled
Right. Anyone testing lord Omens on a mace was shown the wrong pool.
:::

## What Else Was Off?

Besides lords, we compared the tags shown on screen. Counting the lords, there were 34 kinds of mismatch.

:::zundamon normal
There was more than the lords?
:::

:::metan normal
Some tags themselves were different too. Take a look.
:::

| Kind of mismatch | Count | Example | How we fixed it |
|---|---:|---|---|
| Wrong Desecrated lord | 9 mods | mace Aftershock, Fissure | Matched poe2db's lord |
| Wrong Desecrated tag contents | 4 mods | body armour reduced chance to be Critically Hit: poe2db says critical, we had speed | Matched poe2db's tags |
| block / flask tags only on our side | 16 mods | block mods, belt flask mods | Removed the tags |
| Essences | 5 mods | Perfect Essence mods with or without tags | Matched poe2db (only defence % on Str/Dex/Int Body Armours kept as is) |

The biggest group was the block and flask tags we had added ourselves.

:::zundamon normal
Why remove block and flask?
:::

:::metan normal
poe2db has no such tags at all. It uses 27 tags.
:::

:::metan normal
We had added them ourselves, so we removed them to match poe2db.
:::

## Why Do Wrong Tags Matter?

Tags are used in more places than the lord Omens.

:::zundamon normal
Tags are used for more than Omens?
:::

:::metan normal
They are. Here's where.
:::

| Where tags are used | What a wrong tag changes |
|---|---|
| Mods that grow with Catalyst Quality (rings, amulets, jewels) | Whether the mod scales with Quality |
| Mod list labels and search | Whether a filter finds the mod |
| Lord Omens (the lord tag) | Whether the mod is in the Omen's pool |

:::zundamon surprised
So even a small slip shows up in your results!
:::

:::metan normal
Exactly. That's why we matched everything to poe2db.
:::

## How We Checked and What Changed

We re-fetched poe2db on 2026-10-18 and ran a script that compares it with our data tier by tier.

:::zundamon normal
How did you compare all of it?
:::

:::metan normal
A script went through 9,455 normal, Desecrated and Essence tiers (Perfect included), one by one.
:::

:::zundamon normal
Did you compare every tag?
:::

:::metan normal
On our side, only the tags shown on screen. The Desecrated lords were checked separately.
:::

:::metan normal
Internal-only tags never appear on screen, so we left them out.
:::

:::zundamon normal
What started all this?
:::

:::metan normal
The owner asked us to check poe2db and do a full tag check for differences.
:::

:::metan happy
Then the owner said to match everything to poe2db, and v0.1.572 did that. Counted per item class, that's 93 mods.
:::

:::note fold Not yet verified (4)
- Essence defence % on Str/Dex/Int Body Armours stays as it was (Armour, Evasion and Energy Shield), because poe2db has no row with all three.
- The Essence defence % mismatch may come from how the two sides were paired up; the audit marks it as needing a check.
- We did not test lord Omens in game for this fix. poe2db is the reference.
- We have not measured how much the fix changes lord Omen results.
:::

:::zundamon normal
What if I already tried this on a mace before?
:::

:::metan normal
Please take another look. Aftershock and Fissure belong to Omen of the Liege (Amanamu).
:::

:::tip Aiming for a lord on a mace
If you tried lord Omens on a mace in ExileDesk before v0.1.572, take another look. Aftershock and Fissure belong to Omen of the Liege (Amanamu).
:::

In v0.1.572, all Desecrated lords and tags were matched to poe2db. When aiming for a lord on a mace, remember that Aftershock and Fissure sit with Omen of the Liege.

## Where the Numbers Come From

:::fold Show sources (4)
- Tag audit: docs/reviews/2026-10-18-tag-audit.md (9,455 tiers, 34 kinds of mismatch, 93 mods, the lord table). Label: poe2db / CoE (checked against poe2db).
- The fix: ExileDesk changelog v0.1.572 (93 mods matched to poe2db).
- Omen-to-lord mapping: ExileDesk engine data. Label: engine.
- Not checked in game.
:::

## Try It Yourself

On the [crafting bench](/?base=Marauding%20Mace), put a lord Omen on a mace and desecrate it to see which lord's mods come up.

**Related posts**

- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)
- [PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often](/en/blog/arcane-surge-desecrated-gloves/)

VOICEVOX: Zundamon / Shikoku Metan
