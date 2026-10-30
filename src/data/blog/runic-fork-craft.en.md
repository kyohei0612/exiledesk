---
title: PoE2 Runic Fork Crafting: +3 Spells via Essence, ~39 div
description: PoE2 Runic Fork with T2+ Spell Damage and +3 Spell Skills: using a Perfect Essence of Sorcery cost 38.7 div on average, 1/77 of Exalt + Annul.
date: 2026-11-09
tags: Runic Fork, wand, Essence, Spell Damage, expected cost
craft: /?base=Runic%20Fork
ready: true
draft: true
---
Getting T2+ Spell Damage and +3 to Level of all Spell Skills on a PoE2 Runic Fork cost **38.7 Divine Orbs on average when we used a Perfect Essence of Sorcery for the +3**. With only omen-guided Exalts and Annuls it was about 3,000 div, and with only Chaos Orbs about 8,500 div. For crafting, the Runic Fork is the same as the other level 65 wands. The only difference is that it grants no skill.

:::zundamon normal
The Runic Fork is the wand that doesn't come with a skill.
:::

:::metan normal
Right. It's for people who bring their own spells.
:::

:::zundamon troubled
I want Spell Damage and Spell Skill levels on it. What does that cost?
:::

:::metan happy
We tried three routes and had the engine craft thousands of them.
:::

:::summary What you'll learn
- The Runic Fork has **the same** mod pool, weights and affix slots as the Dueling Wand and Twisted Wand
- A Perfect Essence of Sorcery **always** adds +3 to Level of all Spell Skills
- With the Essence, the average is **38.7 div** and the median **26.3 div**
- Exalt + Annul alone is about 3,000 div, and Chaos only about 8,500 div
:::

:::tip New to this? Words used here
- **Perfect Essence**: removes one mod from a rare item and adds a fixed mod. If that side is full, the removed mod comes from that side
- **Omen of Sinistral Exaltation**: makes an Exalted Orb add a prefix only
- **Orb of Annulment**: removes one mod. You can't choose which
- **Greater Exalted Orb**: an Exalted Orb with a Minimum Modifier Level of 35 that blocks low tiers
:::

## How Is the Runic Fork Different from Other Wands?

We compared four level 65 wands in the engine's data.

| | Runic Fork | Runemastered Runic Fork | Dueling Wand | Twisted Wand |
|---|---|---|---|---|
| Level / Int | 65 / 114 | 65 / 114 | 65 / 114 | 65 / 114 |
| Granted skill | **None** | **None** | Spellslinger | Coiling Bolts |
| Implicit | None | One of three (extra Projectiles for Spell Skills, Mana Regeneration Rate, maximum Runic Ward) | None | None |
| Mod pool, weights, slots | Same | Same | Same | Same |

All four have the same mods, tiers, weights and affix slots (3 prefixes, 3 suffixes). With the same random seed, the cost comes out identical to the decimal.

:::zundamon surprised
So every one of these wands crafts the same way?
:::

:::metan normal
Yes. The numbers here apply to any level 65 wand. In the engine, the Runemastered version's implicit doesn't change the mod rolls either.
:::

### What Did We Aim For?

The two strongest caster wand mods, one prefix and one suffix.

| Target | Side | Tier | Chance per Greater Exalted Orb (side set by omen) |
|---|---|---|---:|
| Spell Damage | Prefix | T2 or better (90-119%) | 0.949% (about 1 in 105) |
| +# to Level of all Spell Skills | Suffix | +3 or better | 0.470% (about 1 in 210) |

We left out element-specific Spell Skill levels, since readers split by element.

## Results: About 39 div with the Essence

Each run started from a white base, used an Orb of Alchemy, then followed one of three routes. Prices are ExileDesk's market data from 2026-10-22 (Forbidden Rites).

| Route | Rules | Per wand | vs Essence |
|---|---|---:|---|
| Essence | No +3: Perfect Essence of Sorcery. With +3: add Spell Damage with Omen of Sinistral Exaltation + Greater Exalted Orb. Prefixes full: Orb of Annulment | **38.7 div** | Cheapest |
| Exalt + Annul | Omen for the missing side + Greater Exalted Orb. No room: Orb of Annulment | ~2,950-3,000 div | ~77x |
| Chaos only | Chaos Orb until done | ~8,500-8,600 div | ~220x |

:::zundamon surprised
77 times cheaper!
:::

:::metan normal
A Perfect Essence of Sorcery always adds +3 to Level of all Spell Skills on a wand, in one use. It cost about 0.033 div that day.
:::

Rolling the +3 naturally takes about 210 Greater Exalted Orbs per hit. The Essence does it in one. And when the suffixes are full, it removes a suffix before adding the +3, so in that case your Spell Damage prefix stays.

## Lost the +3? Putting It Back Is Cheap

On the Essence route, the Annulments used to make room for Spell Damage removed the +3 17 times per run. Even so, each run used only 18 Essences in total, including the first, about 0.6 div.

| Used per run | Count | Cost |
|---|---:|---:|
| Orb of Annulment | 69.2 | 28.7 div (74% of the cost) |
| Omen of Sinistral Exaltation | 69.3 | 8.0 div |
| Greater Exalted Orb | 69.3 | 1.4 div |
| Perfect Essence of Sorcery | 18.0 | 0.59 div |

:::zundamon troubled
The +3 got wiped 17 times...
:::

:::metan normal
Protecting it with an Omen of Sinistral Annulment costs about 21 div each time; putting it back with an Essence costs 0.033 div. We didn't run a protecting route, but putting it back is very cheap. The hard part is hitting T2+ Spell Damage.
:::

Exalt + Annul is expensive because Annulments remove targets too. On that route, Spell Damage was removed 40.4 times and the +3 11.5 times per run, and 81% of the cost was Annulments.

## How Much Should You Budget?

Cost spread on the Essence route (10,000 runs).

| Measure | Value | How to read it |
|---|---:|---|
| Average per wand | 38.7 div | Use this for estimates |
| Median | 26.3 div | Average luck costs less than the average |
| 1 in 10 runs went past | 89.0 div | Bad luck costs over 2x the average |
| Done within 50 div | 72.7% | About 3 in 4 |
| Done within 100 div | 92.4% | Almost everyone |

:::tip Building a spell Runic Fork?
Add the +3 with a Perfect Essence of Sorcery, then aim for Spell Damage with an Omen of Sinistral Exaltation. If the +3 gets annulled, put it back with another Essence.
:::

:::note fold What we haven't verified (5 items)
- These costs come from engine runs. We have not checked them against Craft of Exile or against crafting in game.
- Prices are ExileDesk's market data from 2026-10-22. The Perfect Essence of Sorcery price is a single snapshot; even at 10x, we expect the cost to rise by only about 5 div. The main cost driver is the Orb of Annulment price.
- The routes are simple rules based on the item's current state. We did not search for the cheapest possible route, and did not try protecting the +3 or the Spell Damage with omens or a fracture.
- We counted the Spell Damage-only mod. The hybrid Spell Damage and Mana mod is not counted.
- That the Runemastered version's implicit doesn't affect mod rolls is the engine's answer.
:::

For crafting, the Runic Fork is the same as other level 65 wands. Add +3 to Level of all Spell Skills with a Perfect Essence of Sorcery, and the pair costs 38.7 div on average.

## Where the Numbers Come From

:::fold Show sources (5 items)
- Costs, currency used, median and 90th percentile: docs/org/math/notes/2026-10-31-runic-fork.md, script scripts/analysis/runic-fork-ev.mjs (Essence route 10,000 runs, seed 7; other routes 2,000 runs on 2 seeds). Engine
- Four-wand comparison and chance per roll: same notes (mod pool and weight comparison, 200,000 engine rolls per case). The three Runemastered implicits are from our poe2db copy. Engine / poe2db
- Perfect Essence of Sorcery adds +3 to Level of all Spell Skills on wands: poe2db's Essence page (checked 2026-10-31) and the engine data. poe2db
- If that side is full, a Perfect Essence removes a mod from that side first: an ExileDesk rule the owner checked in game (2026-10-14). In game
- Prices: ExileDesk market data (2026-10-22 04:00 UTC, Forbidden Rites). Market
:::

## Try It Yourself

Pick the Runic Fork on the ExileDesk [crafting bench](/?base=Runic%20Fork) and watch a Perfect Essence of Sorcery replace a suffix with the +3 when suffixes are full, one click at a time.

**Related posts**

- [PoE2 Omen of Dextral & Sinistral Exaltation (+ Greater)](/en/blog/exaltation-omens-guide/)
- [PoE2 Absent Amulet Crafting: Why 2/2 Affixes Cost More](/en/blog/absent-amulet-craft/)
- [PoE2 Crafting Budget: How Many Times the Average?](/en/blog/crafting-cost-variance/)

VOICEVOX: Zundamon / Shikoku Metan
