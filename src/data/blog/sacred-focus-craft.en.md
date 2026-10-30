---
title: PoE2 Sacred Focus vs Tasalian Focus: ES Crafting for ~18 div
description: PoE2 Sacred and Tasalian Focus with two ES mods and Cast Speed: an Essence for Cast Speed first cost 17.6 div. Same cost; Tasalian has ~6% more ES.
date: 2026-11-11
tags: Sacred Focus, Tasalian Focus, focus, Energy Shield, expected cost
craft: /?base=Tasalian%20Focus
ready: true
draft: true
---
Getting two Energy Shield mods (flat and increased) plus Cast Speed on a PoE2 Sacred Focus cost **17.6 Divine Orbs on average when we added Cast Speed first with a Greater Essence of Alacrity**. The Tasalian Focus, one step up, costs exactly the same to craft. The difference is base Energy Shield: the finished Tasalian Focus has about 6% more ES.

:::zundamon normal
Sacred Focus or Tasalian Focus, which one should I craft?
:::

:::metan normal
They're the top two foci, level 75 and 80. We checked in the engine whether the crafting or the cost changes.
:::

:::zundamon troubled
I want lots of Energy Shield, but I don't want it to be expensive.
:::

:::metan happy
Good news. With an Essence, it came in under 20 div.
:::

:::summary What you'll learn
- In the engine, the Sacred and Tasalian Focus have **the same** mod pool, weights and affix slots, and the same crafting cost
- The only differences are base Energy Shield (81 vs 91) and level / Intelligence requirements
- Add Cast Speed with a Greater Essence of Alacrity, then roll ES with Omen of Sinistral Exaltation: **17.6 div** on average
- The finished Tasalian Focus has about **6%** more Energy Shield
:::

:::tip New to this? Words used here
- **ES**: Energy Shield. A focus has separate mods for flat ES and increased ES%
- **Greater Essence**: upgrades a magic item to rare and adds a fixed mod
- **Transcendent Alloy**: removes one mod from a rare item and adds a fixed mod. If that side is full, the removed mod comes from that side
- **Omen of Sinistral Exaltation**: makes an Exalted Orb add a prefix only
- **Greater Exalted Orb**: an Exalted Orb with a Minimum Modifier Level of 35 that blocks low tiers
:::

## How Do the Sacred and Tasalian Focus Differ?

| | Sacred Focus | Tasalian Focus |
|---|---|---|
| Required level / Int | 75 / 107 | 80 / 115 |
| Base Energy Shield | 81 | 91 |
| Implicit | None | None |
| Mod pool, weights, slots | Same | Same |

In the engine, both have the same mods, tiers, weights and affix slots (3 prefixes, 3 suffixes). With the same random seed, the cost comes out identical to the decimal.

:::zundamon surprised
So one recipe works for both.
:::

:::metan normal
Yes. The Runeforged versions cost the same too, but their base ES is lower (Sacred 68, Tasalian 36). We didn't count the Runic Ward they get instead, but for base ES the normal versions win.
:::

### What Did We Aim For?

| Target | Side | Tier | Chance per Greater Exalted Orb (side set by omen) |
|---|---|---|---:|
| Increased ES% | Prefix | T2 or better (80-100%) | 9.48% |
| Flat ES | Prefix | T2 or better (+74-90) | 9.48% |
| Cast Speed | Suffix | 25% or more | 4.59% |

Foci only roll up to +2 to Level of all Spell Skills, so we chose Cast Speed for the suffix. No Essence guarantees ES on a focus, and Catalysts can't be used on foci.

## Results: About 18 div with Cast Speed First

Prices are ExileDesk's market data from 2026-10-22 (Forbidden Rites).

| Route | Rules | Per focus | How to read it |
|---|---|---:|---|
| Greater Essence | White → Orb of Transmutation → Greater Essence of Alacrity (rare with 25-28% Cast Speed) → Omen of Sinistral Exaltation + Greater Exalted Orb for ES. Prefixes full: Orb of Annulment. Cast Speed lost: Transcendent Alloy (with Omen of Dextral Crystallisation if there are suffixes) | **17.6 div** | Cheapest |
| Alloy | Orb of Alchemy → Transcendent Alloy (26-31% Cast Speed) → same as above | 18.5-18.8 div | About the same |
| Exalt + Annul | Orb of Alchemy → omen for the missing side + Greater Exalted Orb. No room: Orb of Annulment | 126-133 div | About 7x |
| Chaos only | Orb of Alchemy → Chaos Orb until done | 968-979 div | About 55x |

:::zundamon surprised
Just locking Cast Speed with an Essence or Alloy makes it a seventh of the price!
:::

:::metan normal
You skip rolling for Cast Speed, so only the two ES prefixes are left. With a Greater Exalted Orb, the first ES mod hit about 1 in 5 times, and the second about 1 in 9.
:::

The median was 12.2 div and 1 in 10 runs went past 40.4 div. With 50 div, 94% of runs finished.

## Lost Cast Speed? Put It Back with an Alloy

On the Greater Essence route, the Annulments used to make room for ES removed Cast Speed 6.9 times per run. Putting it back each time took 6.9 Alloys, about 2 div.

| Used per run | Count | Cost |
|---|---:|---:|
| Orb of Annulment | 27.8 | 11.5 div (65% of the cost) |
| Omen of Sinistral Exaltation | 29.8 | 3.44 div |
| Transcendent Alloy | 6.9 | 1.97 div |
| Greater Exalted Orb | 29.8 | 0.60 div |
| Greater Essence of Alacrity | 1 | 0.04 div |
| Omen of Dextral Crystallisation | 0.12 | 0.05 div |

:::zundamon normal
Doesn't the Alloy remove an ES mod when it puts Cast Speed back?
:::

:::metan normal
ES was lost only 2.0 times (ES%) and 1.7 times (flat) per run. Omen of Dextral Crystallisation was used just 0.12 times per run, and dropping it changed the cost by only 0.4%.
:::

## Sacred or Tasalian: Which Should You Pick?

The cost is the same, so it comes down to Energy Shield. At 0% quality, with mid-T1 rolls (+85 flat, 96% increased):

| | Sacred Focus | Tasalian Focus | Difference |
|---|---:|---:|---|
| No ES mods | 81 | 91 | +10 |
| +85 flat, 96% increased | 325 | 345 | +20 (about 6%) |
| Average of 2,000 Alloy-route foci, base swapped | 322.9 | 342.8 | +19.9 (about 6%) |

The base gap of 10 roughly doubles with increased ES%. If you meet level 80 and 115 Intelligence, take the Tasalian Focus. Until then, craft the Sacred Focus the same way for the same cost.

:::tip Going for ES? Don't forget quality
In our numbers, raising quality to 20% added more ES than switching from Sacred to Tasalian. 20% quality took 13.6 Armourer's Scraps on average (about 0.16 div).
:::

:::note fold What we haven't verified (5 items)
- These costs come from engine runs. We have not checked them against Craft of Exile or against crafting in game.
- Prices are ExileDesk's market data from 2026-10-22. The main cost driver is the Orb of Annulment price. Base item prices are not included.
- ES at 20% quality changes by about 10% depending on whether quality multiplies separately or adds to increased ES%. Either way, 20% quality adds more than the base swap (about +20). We have not checked the in-game formula.
- The routes are simple rules based on the item's current state, not a search for the cheapest route. We did not try protecting ES with a fracture or Annulment omens.
- A third prefix with ES% and Mana raises ES further (23% of 2,000 foci). We did not count it as a target.
:::

The Sacred and Tasalian Focus cost the same to craft. Lock Cast Speed first with an Essence or an Alloy, then roll the two ES prefixes with Omen of Sinistral Exaltation, and the set comes to 17.6 div on average.

## Where the Numbers Come From

:::fold Show sources (5 items)
- Costs, currency used, median, 90th percentile and finished ES: docs/org/math/notes/2026-10-31-sacred-focus.md, script scripts/analysis/sacred-focus-ev.mjs (Greater Essence route 10,000 runs, seed 7; other routes 2,000 runs on 2 seeds). Engine
- Four-focus comparison and chance per roll: same notes (mod pool and weight comparison, 200,000 engine rolls per case). Engine
- Greater Essence of Alacrity adds 25-28% Cast Speed to foci; Transcendent Alloy adds 26-31% Cast Speed plus extra Cold Damage: poe2db pages (checked 2026-10-31). poe2db
- Base Energy Shield 81 and 91, level and Intelligence requirements: poe2db base pages (checked the same day) and the engine data. poe2db
- Prices: ExileDesk market data (2026-10-22 04:00 UTC, Forbidden Rites). Market
:::

## Try It Yourself

Pick the Tasalian Focus on the ExileDesk [crafting bench](/?base=Tasalian%20Focus) and try adding Cast Speed with a Greater Essence of Alacrity before rolling ES, one click at a time.

**Related posts**

- [PoE2 Runic Fork Crafting: +3 Spells via Essence, ~39 div](/en/blog/runic-fork-craft/)
- [PoE2 Omen of Dextral & Sinistral Exaltation (+ Greater)](/en/blog/exaltation-omens-guide/)
- [PoE2 Catalyst Types: Which Mods Each One Boosts](/en/blog/catalyst-types/)

VOICEVOX: Zundamon / Shikoku Metan
