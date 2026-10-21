---
title: PoE2 Crafting Simulator Design: Why We Write No Exceptions
description: Our PoE2 crafting simulator design: 40 of ~130 hand-written rules had no source, and bugs came from exceptions. Now currencies run on their own description text.
date: 2026-10-22
tags: crafting simulator, emulator, Desecration, Bone, Craft of Exile
craft: /?base=Absent%20Amulet
draft: true
---
Our PoE2 crafting simulator design comes down to one rule: **every currency and Omen runs on a breakdown of its own description text, with no per-item exceptions**. When we audited ExileDesk, about 40 of our roughly 130 hand-written rules had no source, and every recent bug traced back to one of those exceptions.

If you use a crafting tool, the real question is simple: does it behave like the game?

To be honest, the old ExileDesk (the site calls its crafting simulator an "Emulator") was weak exactly there. Each currency was a function, and we kept patching in "on this item type", "with this Omen" and "can't be used when" one line at a time.

Within two days that produced bugs like "Talismans can't take the Omens of the Liege, Sovereign or Blackblooded" and "Sceptres don't get Bones". This post covers how we fixed it, and why the rebuilt version deserves more of your trust.

:::summary What you'll learn
- All five bugs would never have happened if we had simply read the description text
- About 40 of our roughly 130 hand-written rules had no source
- Each currency is now written as three parts from its description: what it targets, what it does, and when it can't be used
- Odds and roll behaviour come from Craft of Exile, names and level floors from poe2db, and the rest from the owner's in-game checks
:::

## Why Hand-Written Exceptions Break

Here are the bugs and the exception behind each one.

| Bug | The exception that caused it |
|---|---|
| Talismans couldn't take the lord Omens (Liege, Sovereign, Blackblooded) | Talismans were missing from the Bone item-type table, so they fell into the armour bucket |
| Orb of Transmutation added a mod to an Absent Amulet | Magic slots were hard-coded as 1 prefix / 1 suffix, ignoring the implicit ±1 |
| Sceptres didn't get Bones | We had decided "no exclusive desecrated mods, so hide it" |
| Runes couldn't be socketed into a Corona Amulet | We had decided "jewellery has 0 sockets" |
| Plain Catalysts worked on Jewels | We had decided "Jewels gain quality from Catalysts" without telling Catalyst types apart |

Each one is a line someone wrote because it "probably" worked that way. An exception looks fine when you write it, then breaks the moment an unexpected pairing shows up, like Talisman plus Omen.

So we listed every hand-written rule. Of roughly 130, about 40 had no backing in poe2db or in the game's own text.

## Rebuilding the Simulator Around Description Text

The fix was to stop adding exceptions and turn each currency's description into data. Every currency (and Omen) is written in three parts:

- **What it targets**: the description's own words. Rarity (Normal, Magic, Rare) plus groups like weapon, armour, jewellery, "a ring or amulet", quiver and Jewel. No individual item types.
- **What it does**: a small set of shared building blocks, such as change rarity, add n mods from a pool, remove n non-Fractured mods, add one Unrevealed desecrated mod, reroll values, fracture one mod. Nothing is written for a single currency.
- **When it can't be used**: limits taken from the description and the game's keyword text, such as "only one desecrated mod".

An Omen is written as a tweak to those same blocks: "change how the next action works". The Omen that makes Annulment hit a suffix just narrows "remove" to the suffix side. A lord Omen just guarantees that lord's mod among the Reveal options.

Item properties (one- or two-handed, slot counts with implicit ±N, sockets and so on) are read from item data, not typed by hand.

## Zero Exceptions, and Sceptre Bones Just Work

Bones show it best. The weapon Bone's description reads "Desecrates a Rare Weapon or Quiver". Broken down:

| Part | Content |
|---|---|
| Targets | Rare; weapon or quiver |
| Does | Adds one Unrevealed desecrated mod |
| Can't be used | Only one desecrated mod; not on items below its minimum Item Level |

A Sceptre is a weapon, so it qualifies. Sceptres have no exclusive desecrated mods, so the Reveal options come from the normal mod pool.

That matches poe2wiki: "Sceptres do not have exclusive desecrated prefixes or suffixes". We didn't write a single Sceptre-specific line to get there.

In the owner's words, read the Bone literally and it works on Sceptres. By deciding the rules too narrowly up front, we had removed uses the game allows.

### "Remove" and "add" stay separate

The blocks split "remove" and "add" to match how the game behaves:

- **Chaos Orb**: remove, then add. The new mod goes to whichever side has room (prefix and suffix both count), picked by weight, regardless of what was removed.
- **Bone**: if the item is full, remove one non-Fractured mod and add to **the same side** (poe2wiki: "If it removes a Prefix, it will add a Prefix").
- **Perfect Essence**: if the Essence mod's side is full, a mod on that side is always removed first (checked in game by the owner).

We deliberately have no single "replace" block, because it would hide the difference between Chaos and Bones.

### "Can't Use It" Follows the Game's Text Too

The second rule: **whether a currency shows on the shelf depends only on whether the game accepts it**. We only check conditions that don't depend on randomness: item type, rarity, Corrupted, open slots, Omen prerequisites.

This came from Liquid Emotions vanishing from the shelf. The tool had test-applied it in the background, seen it fail, and hidden it. Peeking at the result first isn't how the game works, so we stopped.

Now a rejected move shows the same message as the game, the currency isn't spent, and the step log records the rejection. We don't invent our own caps or floors, and our rule is to treat anything unknown as "rule unconfirmed" instead of hiding it.

The odds tables now come from the same parts. Before, some tables showed odds for moves you couldn't make (Corrupted items, Omen of Catalysing Exaltation with no quality, a Gnawed bone on Item Level 65+). Those are all 0% now, and a Bone that doesn't fit the item shows no table at all.

## Where the Right Answers Come From

The description tells you what a currency can do, but not how likely each result is. For that we lean on outside sources.

| What | Source |
|---|---|
| Names, tiers, level floors | poe2db |
| Weights, ratios, roll behaviour | Craft of Exile |
| Behaviour the text doesn't settle | The owner's in-game checks |

For example, "if the roll hits a mod on a side that's over its limit, the whole move fails and the orb isn't spent" was checked in game by the owner. It's written as a limit on "remove", not as an exception.

For values we have to choose ourselves (assumed values), the plan is to keep them in one place with a source and date, and to mark them as assumed in the in-tool help. They aren't gathered in one place yet; that work is still ahead.

:::note What's assumed, stated plainly
- Every rule compared with Craft of Exile was settled on 2026-10-16 to 10-17, but in three places the owner chose to differ from Craft of Exile: how the desecrated-only removal Omen combines with the side Annulment Omens, whether resistance Flux changes mods outside its table, and how much quality a Catalyst-type item adds.
- During the rebuild we replayed every combination against the old code and got identical results. That shows the rebuild didn't change behaviour, not that it matches the game. Our current tests only watch for changes.
:::

:::tip How to judge a crafting tool
Check whether "can't use this" messages match the game, and whether assumed values are labelled as assumed. A tool that doesn't hide its unknowns lets you notice when it's wrong.
:::

## Where the Numbers Come From

- The five bugs, ~130 hand-written rules and ~40 without a source: ADR-004 (docs/decisions/004-currency-as-description.md, audit of 2026-10-14). Record
- The switch (v0.1.523, 2026-10-16), 390,000 targeted-pick cases matching, about 860 lines of exception code removed, about 170,000 odds-table cases matching the old tables: the progress log in the same ADR. Engine
- Craft of Exile comparison and the three deliberate differences: docs/reviews/2026-10-17-rule-checklist.md. poe2db / CoE
- Perfect Essence and over-limit side rules: owner's in-game check (2026-10-14). Game
- Shelf rules and the Liquid Emotions case (2026-10-12): ExileDesk rule notes (feedback-game-rules-as-written). Record
- Sceptre and Bone side behaviour: poe2wiki text (as quoted on 2026-10-14)

## Try It Yourself

Use an Orb of Transmutation on an Absent Amulet on the [crafting bench](/?base=Absent%20Amulet) to see how the implicit ±1 changes the slot count. Moves the game rejects show the reason as text.

**Related posts**

- [PoE2 crafting calculator mistakes: 3 bugs we caught](/en/blog/crafting-calculator-mistakes/)
- [PoE2 Desecration: which side does the Bone hit?](/en/blog/desecration-bone-sides/)
- [PoE2 Fracturing Orb: desecrated mods can't be fractured](/en/blog/fracture-desecrated/)
