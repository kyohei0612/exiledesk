---
title: PoE2 Crafting Simulator Design: Why We Write No Exceptions
description: Our PoE2 crafting simulator design: 40 of ~130 hand-written rules had no source, and bugs came from exceptions. Now currencies run on their own description text, checked against outside sources.
date: 2026-10-22
tags: crafting simulator, emulator, Desecration, Bone, Craft of Exile
craft: /?base=Absent%20Amulet
image: img/crafting-simulator-no-exceptions-og.en.png
ready: true
---
Our PoE2 crafting simulator design comes down to one rule: **every currency and Omen runs on a breakdown of its own description text, with no per-item exceptions**. When we audited ExileDesk, about 40 of our roughly 130 hand-written rules had no source, and every bug we found traced back to an exception someone wrote.

:::zundamon normal
Do crafting tools really give the same results as the game?
:::

:::metan troubled
Honestly, the old ExileDesk was weak there. For each currency we kept adding "on this item type" and "can't be used when", one line at a time.
:::

:::zundamon surprised
Did that cause trouble?
:::

:::metan troubled
Within two days we found bugs like "Sceptres don't get Bones". Here's how we fixed it, and why the fixed version deserves more trust.
:::

:::summary What you'll learn
- All five bugs would have worked correctly from the start if we had simply read the description text
- About 40 of roughly 130 hand-written rules had no source, and each currency is now built from its description in three parts: what it targets, what it does, and when it can't be used
- Odds and roll behaviour come from Craft of Exile, names and level floors from poe2db, and the rest from the owner's in-game checks
:::

:::tip New to this? Words used here
- **Emulator**: what ExileDesk calls its crafting simulator
- **Omen**: an item that changes how your next currency works
- **Bone**: a currency that adds an Unrevealed desecrated mod to a Rare item
- **Implicit ±1**: a property of some item types that raises or lowers their number of mod slots
- **Fractured**: a mod locked in place (for example by a Fracturing Orb) so it can't be removed
- **Shelf**: the row where you pick currencies on the crafting bench
:::

## Why Hand-Written Exceptions Break

Here are the bugs we found and the exception behind each one.

:::zundamon normal
What kind of bugs were there?
:::

:::metan normal
Five of them. Here's the table.
:::

| Bug | The exception that caused it | Reading the text as written |
|---|---|---|
| Talismans couldn't take the lord Omens (Omen of the Sovereign / Liege / Blackblooded) | Talismans were missing from the Bone item-type table, so they were treated as armour | Usable |
| Orb of Transmutation added a mod to an Absent Amulet | Magic slots were hard-coded as 1 prefix / 1 suffix, ignoring the implicit ±1 | Becomes Magic with no mods |
| Sceptres didn't get Bones | We had decided "no exclusive desecrated mods, so hide it" | Shown |
| Runes couldn't be socketed into a Corona Amulet | We had decided "jewellery has 0 sockets" | Can be socketed |
| Plain Catalysts worked on Jewels | We had decided "Jewels gain quality from Catalysts" without telling currency types apart | Not usable |

:::zundamon surprised
Every one came from a single line somebody decided on!
:::

:::metan normal
Right, a line written as "it's probably like this". It looks correct when you write it.
:::

:::metan troubled
But it breaks the moment an unexpected pairing shows up, like Talisman plus Omen.
:::

:::zundamon normal
Were there more lines like that?
:::

:::metan troubled
We listed every hand-written rule. Of roughly 130, about 40 had no backing in poe2db or in the game's own text.
:::

## Rebuilding the Simulator Around Description Text

The fix was to stop adding exceptions and turn each currency's description into data.

:::zundamon normal
What does turning a description into data mean?
:::

:::metan normal
Every currency (and Omen) is written in three parts.
:::

| Part | Content | Not written here |
|---|---|---|
| What it targets | The description's own words. Rarity (Normal, Magic, Rare) plus groups like "weapon", "armour", "jewellery", "a ring or amulet", "quiver" and "Jewel" | Individual item types |
| What it does | A few shared building blocks: change rarity, add n mods from a pool, remove n non-Fractured mods, add one Unrevealed desecrated mod, reroll values, fracture one mod, and so on | Code for a single currency |
| When it can't be used | Limits written in the description and the game's keyword text, such as "only one desecrated mod" | Caps or floors we made up |

:::zundamon normal
How are Omens written?
:::

:::metan normal
As a tweak to those same blocks: "change how the next action works".
:::

:::metan normal
Omen of Dextral Annulment just narrows "remove" to the suffix side. A lord Omen just guarantees that lord's mod among the Reveal options.
:::

:::zundamon normal
Where do the differences between item types come in?
:::

:::metan normal
One- or two-handed, slot counts with implicit ±N, socket counts and so on are read from item data, not typed by hand.
:::

## Zero Exceptions, and Sceptre Bones Just Work

Bones show it best. The weapon Bone's description reads "Desecrates a Rare Weapon or Quiver".

:::zundamon normal
What happens when you break that text down?
:::

:::metan normal
This.
:::

| Part | Content | On a Sceptre |
|---|---|---|
| What it targets | Rare; Weapon or Quiver | It's a weapon, so it qualifies |
| What it does | Adds one Unrevealed desecrated mod | No exclusive desecrated mods, so the Reveal options come from the normal mod pool |
| When it can't be used | Only one desecrated mod; not on items below its minimum Item Level | Same as any other weapon |

:::zundamon surprised
There's no Sceptre line at all, and it still works!
:::

:::metan happy
Exactly. It also matches poe2wiki: "Sceptres do not have exclusive desecrated prefixes or suffixes".
:::

:::metan normal
In the owner's words, read the Bone literally and it works on Sceptres.
:::

:::metan troubled
By deciding the rules too narrowly up front, we had removed uses the game allows.
:::

### "Remove" and "add" stay separate

The building blocks keep "remove" and "add" apart, to match how the game behaves.

:::zundamon normal
If it removes and then adds, isn't one "replace" block enough?
:::

:::metan normal
Then you couldn't see the difference between Chaos and Bones. So we deliberately don't have one.
:::

| Currency | Remove | Add | Source |
|---|---|---|---|
| Chaos Orb | Removes | Picked by weight from whichever side has room (prefix and suffix both count), regardless of what was removed | — |
| Bone | If full, removes one non-Fractured mod | Adds to **the side it removed from** | poe2wiki ("If it removes a Prefix, it will add a Prefix") |
| Perfect Essence | If the side it adds to is full, a mod on that side is always removed | Adds afterwards | Owner's in-game check |

:::zundamon normal
Same "remove and add", but the side it lands on is decided differently.
:::

### "Can't Use It" Follows the Game's Text Too

The second rule: **whether a currency shows on the shelf depends only on whether the game accepts it**.

:::zundamon normal
Did something go wrong with the shelf?
:::

:::metan troubled
Liquid Emotions vanished from it. The tool had test-applied them in the background, seen them rejected, and hidden them.
:::

:::metan normal
Peeking at the result first isn't how the game works, so we stopped. Now we only check conditions that don't depend on randomness: item type, rarity, Corrupted, open slots and Omen prerequisites.
:::

:::zundamon normal
So what happens when a move is rejected?
:::

:::metan normal
You get the same message as the game, the currency isn't spent, and the step log records the rejection. We don't invent our own caps or floors either.
:::

:::metan normal
Our rule is to treat anything unknown as "rule unconfirmed" instead of hiding it.
:::

:::zundamon normal
Did the odds tables change too?
:::

:::metan normal
They now come from the same parts. Before, some tables showed odds for moves you couldn't even make.
:::

| Move you can't make | Old odds table | Odds table now |
|---|---|---|
| A Corrupted item | Showed odds | 0% |
| Omen of Catalysing Exaltation on an item with no quality | Showed odds | 0% |
| Gnawed bones on Item Level 65+ | Showed odds | 0% |
| A Bone that doesn't fit the item type | — | No table at all |

:::zundamon happy
Moves you can't make really show 0% now.
:::

## Where the Right Answers Come From

The description tells you what a currency can do, but not how likely each result is. For that we lean on outside sources.

:::zundamon normal
So what counts as the right answer for odds?
:::

:::metan normal
It depends on what kind of answer you need.
:::

| Answer for | Source | Why |
|---|---|---|
| Names, tiers, level floors | poe2db | Our reference for names and numbers |
| Weights, ratios, roll behaviour | Craft of Exile | Descriptions don't give odds |
| Behaviour the text doesn't settle | Owner's in-game checks | No other source exists |

:::zundamon normal
What rules were checked in game?
:::

:::metan normal
One is "if the roll hits a mod on a side that's over its limit, the whole move fails and the orb isn't spent".
:::

:::metan normal
That one is also written as a limit on "remove", not as an exception.
:::

:::zundamon normal
What about values no source gives?
:::

:::metan normal
Values we have to choose ourselves go in one place with a source and date, and the in-tool help labels them as assumed. That's the plan.
:::

:::metan troubled
They aren't gathered in one place yet, though. That work is still ahead.
:::

:::note fold Not yet verified (2)
- Every rule compared with Craft of Exile was settled on 2026-10-16 to 10-17, but in three places the owner chose to differ from Craft of Exile: how Omen of Light stacks with Omen of Sinistral / Dextral Annulment, whether Flux also changes mods outside its table, and how much quality Catalysts and similar items add.
- During the rebuild we replayed every combination against the old code and got identical results. That shows the rebuild didn't change behaviour, not that it matches the game. Our current tests also only watch for changes.
:::

:::zundamon normal
How can I tell if a crafting tool is trustworthy?
:::

:::metan happy
Check whether its "can't use this" messages match the game, and whether assumed values say they're assumed.
:::

:::tip How to judge a crafting tool
A tool that doesn't hide its unknowns lets you notice when it's wrong.
:::

Code built from piled-up exceptions breaks on combinations nobody expected. Running currencies on their broken-down descriptions, with odds taken from outside sources, makes any gap with the game easier to spot.

## Where the Numbers Come From

:::fold Show sources (6)
- The five bugs, ~130 hand-written rules and ~40 without a source: ADR-004 (docs/decisions/004-currency-as-description.md, audit of 2026-10-14). Record
- The switch (v0.1.523, 2026-10-16), 390,000 targeted-pick cases matching, about 860 lines of exception code removed, about 170,000 odds-table cases matching the old tables: the progress log in the same ADR. Engine
- Craft of Exile comparison and the three deliberate differences: docs/reviews/2026-10-17-rule-checklist.md. poe2db / CoE
- Perfect Essence and over-limit side rules: owner's in-game check (2026-10-14). Game
- Shelf rules and the Liquid Emotions case (2026-10-12): ExileDesk rule notes (feedback-game-rules-as-written). Record
- Sceptre and Bone side behaviour: poe2wiki text (as quoted on 2026-10-14)
:::

## Try It Yourself

Use an Orb of Transmutation on an Absent Amulet on the [crafting bench](/?base=Absent%20Amulet) to see how the implicit ±1 changes the slot count. Moves the game rejects show the reason as text.

**Related posts**

- [PoE2 crafting calculator mistakes: 3 bugs we caught](/en/blog/crafting-calculator-mistakes/)
- [PoE2 Desecration: which side does the Bone hit?](/en/blog/desecration-bone-sides/)
- [PoE2 Fracturing Orb: desecrated mods can't be fractured](/en/blog/fracture-desecrated/)

VOICEVOX: Zundamon / Shikoku Metan
