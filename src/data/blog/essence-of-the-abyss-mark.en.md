---
title: PoE2 Essence of the Abyss Mark: Setting Up Desecration
description: In PoE2, the Mark of the Abyssal Lord from an Essence of the Abyss is always replaced by a higher-tier Unrevealed Desecrated mod on your next desecration. We checked the Crystallisation Omen trick and where it fits in a 4-mod Gold Ring craft.
date: 2026-10-22
tags: Essence of the Abyss, Mark of the Abyssal Lord, Desecration, Crystallisation, Gold Ring
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/essence-of-the-abyss-mark-og.en.png
draft: true
---
In PoE2, an **Essence of the Abyss** removes a random modifier and adds the **Mark of the Abyssal Lord**. When you desecrate an item with the Mark, the Mark is always removed and replaced by a **higher-tier Unrevealed Desecrated mod**. Add an Omen of Dextral or Sinistral Crystallisation and you choose whether a suffix or a prefix is removed.

While tracing a Gold Ring craft from a video, the owner of ExileDesk asked us about an idea: "At the Fracturing step, couldn't you use an Omen of Dextral Crystallisation with an Essence of the Abyss to set up desecration almost for free?"

Normally, desecration adds an Unrevealed mod to an open slot. With the Mark in between, you can delete an unwanted suffix and hand that very slot to desecration. We checked each name and effect on poe2db to see whether it really works that way.

Short answer: **the move is real**. Whether it is "almost free" depends on what the Essence and the Omen cost, and we have not checked that yet.

:::summary What you'll learn
- Essence of the Abyss removes a random mod and always adds the Mark of the Abyssal Lord (on rings it can be a prefix or a suffix)
- Desecrating an item with the Mark always replaces the Mark with a higher-tier Unrevealed Desecrated mod
- Omen of Dextral Crystallisation limits the removal to suffixes; Sinistral to prefixes
- On a Gold Ring at 4 mods before Fracturing, this turns an unwanted suffix into the desecration slot. Cost is unverified
:::

## What Does Essence of the Abyss Add?

Essence of the Abyss works like a Perfect Essence. poe2db describes it as removing a random modifier and adding a new modifier to a Rare item. The mod it adds is the Mark of the Abyssal Lord.

On rings the Mark can roll as a prefix or a suffix, at modifier level 0. It does nothing on its own; it is a placeholder for your next desecration.

| Item | Effect (poe2db) |
|---|---|
| Essence of the Abyss | Removes a random modifier and adds the Mark of the Abyssal Lord to a Rare |
| Mark of the Abyssal Lord | Desecrating an item with this mod always removes it and replaces it with a higher-tier Unrevealed Desecrated mod |
| Omen of Dextral Crystallisation | Your next Perfect or Corrupted Essence removes only a suffix |
| Omen of Sinistral Crystallisation | Same, but removes only a prefix |

## What Happens When You Desecrate a Marked Ring?

Rings are desecrated with Collarbones (Gnawed, Preserved or Ancient Collarbone; Ancient has minimum modifier level 40). For otherworldly modifiers, use an Altered Collarbone.

A normal desecration adds one Unrevealed mod, which you then pick from a set of options when you reveal it. With the Mark present, the bone **replaces the Mark instead of adding a mod**. The mod count stays the same; the Mark's slot becomes the Unrevealed Desecrated mod.

The ExileDesk engine works the same way: with a Mark on the item, a bone always replaces the Mark. Since v0.1.545, Sinistral / Dextral Necromancy omens are not used (and not consumed) while a Mark is present.

There is also an ordering rule (v0.1.532, confirmed in game). Essence of the Abyss is still usable when the item already has an Unrevealed Desecrated mod, and the Mark replaces that Unrevealed mod. It cannot be used while the item has a revealed Desecrated mod.

### Choosing the Side With a Crystallisation Omen

On its own, Essence of the Abyss removes a random mod, which might be one you want to keep.

That is what the Crystallisation Omens are for. With an Omen of Dextral Crystallisation, the Essence removes only a suffix; with Sinistral, only a prefix. The natural reading is that the Mark lands on the side that was cleared, though poe2db's text doesn't spell that out.

:::tip Pick the side opposite what you keep
A Crystallisation Omen sets which side the removed mod comes from. If the mods you want to keep are prefixes, use Dextral; if they are suffixes, use Sinistral.
:::

## Where It Fits in a Gold Ring Craft

In the video, the Gold Ring's Spell Damage was rolled to 34 with Divine Orbs, the ring was desecrated to reach 4 mods, and then a Fracturing Orb locked the Spell Damage. Fracturing needs a Rare with at least 4 mods, so the desecration is there to fill the count.

The owner's idea swaps in an Omen of Dextral Crystallisation + Essence of the Abyss at that step. An unwanted suffix is removed and becomes the Mark, and the next desecration turns the Mark into an Unrevealed Desecrated mod. In other words: delete one suffix and prepare it for desecration.

| Step | What happens to the slot |
|---|---|
| Omen of Dextral Crystallisation + Essence of the Abyss | One suffix → Mark of the Abyssal Lord |
| Desecrate with a Collarbone | Mark → higher-tier Unrevealed Desecrated mod |
| Reveal | Unrevealed → the Desecrated mod you pick |

The video itself doesn't use this move. Which Collarbone it used, and the Fracturing moment, aren't shown on screen, so those remain unconfirmed.

## Is It "Almost Free"? Not Known Yet

What we confirmed: the names and effects exist as poe2db describes, and the slot moves suffix → Mark → Unrevealed Desecrated mod.

Whether it is "almost free" comes down to the prices of the Essence of the Abyss and the Crystallisation Omen, and to how the desecration options land. We haven't looked into either, so this post doesn't call it cheap or expensive.

:::note Not verified
- Prices of Essence of the Abyss and the Crystallisation Omens, and the cost of this move (no engine runs)
- Whether the Mark lands on the side narrowed by the Omen (not stated on poe2db)
- How much higher "higher-tier" actually is
- Parts of ExileDesk's Japanese screens and update notes still use other Japanese names for these items (a fix is planned). This post uses poe2db's names
:::

## Where the Numbers Come From

- Effects of Essence of the Abyss, Mark of the Abyssal Lord, the Crystallisation Omens and Collarbones; the Mark's level 0; Ancient Collarbone's minimum modifier level 40; the 4-mod requirement for Fracturing: poe2db English and Japanese pages (poe2db)
- The video's Gold Ring steps (Spell Damage 34, Fracturing at 4 mods): our read of video kQROcbbeR1M's footage and captions (in-game footage; the Collarbone used and the Fracturing moment are unconfirmed)
- Essence of the Abyss with an Unrevealed Desecrated mod present: ExileDesk v0.1.532 (confirmed in game)
- Bones and Necromancy omens with a Mark present: ExileDesk v0.1.545 (engine)
- Cost: unverified (no estimate made)

## Try It Yourself

Open a Gold Ring on the [crafting bench](/?base=Gold%20Ring) to apply a Crystallisation Omen + Essence of the Abyss, then desecrate, and watch the slots move. To compare routes with desecration, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 Gold Ring craft: decoding the steps and the Breach bait](/en/blog/gold-ring-video-decoded/)
- [PoE2 Arcane Surge desecrated gloves: where it rolls and how often](/en/blog/arcane-surge-desecrated-gloves/)
