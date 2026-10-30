---
title: Do PoE2 Crafting Odds Match Craft of Exile? 50k Rolls Each
description: PoE2 crafting odds in ExileDesk vs Craft of Exile's own math, 50k rolls each: all 15 Exalt and 11 of 12 Chaos cases matched. The one miss was luck.
date: 2026-10-31
tags: Craft of Exile, odds, Exalted Orb, Chaos Orb, testing
craft: /?base=Gold%20Ring
ready: true
---
We put ExileDesk's PoE2 crafting odds next to **Craft of Exile's own calculation, and all 15 Exalted Orb cases and 11 of 12 Chaos Orb cases fell inside the margin of error**. The one case that missed came back to Craft of Exile's number once we reran it with different random seeds. It was a lucky streak, not a bug.

:::zundamon normal
Are ExileDesk's odds actually right?
:::

:::metan normal
Until now we only said "we follow the same rules as Craft of Exile." We had never put the numbers side by side.
:::

:::zundamon surprised
You never checked?
:::

:::metan happy
So this time we ran Craft of Exile's own code and compared it against 50,000 crafts in ExileDesk.
:::

:::summary What you'll learn
- Exalted Orb with Omen of Dextral Exaltation: **all 15 cases** match Craft of Exile's exact odds within the margin of error
- Chaos Orb: **11 of 12** cases match. The miss averaged 1.019% over 12 seeds, against Craft of Exile's 1.015%
- We found and fixed a bug in our own checking script along the way
- What matched is "ExileDesk agrees with Craft of Exile." Whether both agree with the live game is still unknown
:::

:::tip New to this? Words used here
- **Craft of Exile**: an outside tool that calculates crafting odds. ExileDesk uses it as an answer key
- **Weight**: how likely a mod is to be picked. Bigger means more likely
- **Greater / Perfect**: stronger versions of Exalted and Chaos Orbs with a minimum modifier level (35 and 50) that blocks low tiers
- **Omen of Dextral Exaltation**: makes an Exalted Orb add a suffix only
- **Margin of error**: the natural wobble when you count 50,000 rolls. Inside it means "matches"
:::

## How Did We Compare Them?

On the Craft of Exile side we ran a local copy of its code as-is. We did not rewrite its formula. Craft of Exile itself produced the list of possible mods and their weights at the moment of the craft. For the "remove one mod" step of Chaos and Annulment, we read its code and averaged over every mod being equally likely to go.

:::zundamon normal
You used Craft of Exile's own math?
:::

:::metan normal
Yes. Divide the target tier's weight by the total weight of the pool, and you get Craft of Exile's exact odds.
:::

:::metan normal
On the ExileDesk side we used the same craft code as the crafting bench, rolled 50,000 times and counted the hits.
:::

| Side | How we got it | What it gives |
|---|---|---|
| Craft of Exile | Its own code lists the pool and weights, then we divide | Exact odds, no noise |
| ExileDesk | 50,000 crafts on the same item, counted | Measured odds with a margin of error |

At 50,000 rolls, even a 2% chance wobbles by about ±0.13%. So the test was simple: does Craft of Exile's number sit inside our margin?

## Exalted Orb: All 15 Cases Match

We used a Gold Ring at item level 82 with Omen of Dextral Exaltation. Five setups (Cast Speed and All Elemental Resistances with and without a catalyst, Rarity without), each with a regular, Greater and Perfect Exalted Orb, made 15 cases.

| Target (already on the ring) | Exalt | Craft of Exile | ExileDesk | Inside? |
|---|---|---:|---:|---|
| Cast Speed T2+ (Rarity T1) | Regular | 2.245% | 2.212% | Yes |
| Same | Greater | 4.464% | 4.482% | Yes |
| Same | Perfect | 6.400% | 6.346% | Yes |
| Same + 20% Skittering Catalyst + Omen of Catalysing Exaltation | Greater | 17.606% | 17.502% | Yes |
| All Elemental Resistances T2+ (Rarity T1) | Perfect | 5.120% | 5.122% | Yes |
| Rarity T1 (Cast Speed T1) | Regular | 1.148% | 1.220% | Yes |
| Same | Perfect | 3.306% | 3.340% | Yes |

This is 7 of the 15 cases. The other 8 were inside the margin too.

:::zundamon troubled
Rarity with a regular Exalt is 1.148% vs 1.220%. That's 6% off.
:::

:::metan normal
When the odds are small, a tiny gap looks big in percent terms. That row's margin is about ±0.1%, so a 0.07-point gap is inside it.
:::

:::metan happy
This also confirms the Greater and Perfect floors, the Omen of Catalysing Exaltation multiplier, and the rule that a mod group already on the item leaves the pool.
:::

## Chaos Orb and Annulment Match Too

Next we used Chaos Orbs on boots and a ring. A Chaos Orb removes one mod and then adds one, so more rules are in play than with an Exalt.

There were four setups. The boots are Drakeskin Boots at item level 82, all with a fractured Movement Speed T1.

- **Boots A**: Fire Res T1, Life T3 and Dexterity T2. Target: Cold or Lightning Res T1
- **Boots B**: Boots A plus one more suffix, so suffixes are full. Same target
- **Boots C**: Dexterity T2 only. Target: Fire, Cold or Lightning Res T1
- **Ring**: a Gold Ring with Rarity T1 and Cast Speed T1. Target: All Elemental Resistances T2+

| Setup | Regular (CoE / ExileDesk) | Greater | Perfect |
|---|---:|---:|---:|
| Boots A | 2.201 / 2.194% | 4.050 / 4.046% | 6.871 / 6.694% |
| Boots B | 1.810 / 1.830% | 3.406 / 3.502% | 5.671 / 5.488% |
| Boots C | 2.789 / 2.832% | 5.168 / 5.114% | 8.708 / 8.758% |
| Ring | **1.015 / 1.134%** | 2.076 / 2.022% | 3.022 / 3.006% |

Only the bold row missed. The other 11 were inside the margin.

:::zundamon normal
Which Chaos rules does this confirm?
:::

:::metan normal
The removed mod is picked evenly, the removed mod group goes back into the pool, nothing is added to a full side, and the Greater and Perfect floors work.
:::

:::metan normal
Orb of Annulment matched too, plain and with Omen of Dextral or Sinistral Annulment. As in its code, every mod was equally likely to go (within 2%), and the fractured Movement Speed never did.
:::

## The One Miss Was Luck

On the Gold Ring with a regular Chaos Orb, Craft of Exile says 1.015% and our first run said 1.134%, 11.7% high. So we reran it with different random seeds.

| Run | ExileDesk | How to read it |
|---|---:|---|
| 50,000 rolls (first run) | 1.134% | Outside the margin |
| 400,000 rolls × 3 seeds | +4.4% / −4.3% / +1.5% vs CoE | Swings both ways |
| Average of 12 seeds × 100,000 rolls | 1.019% | Nearly the same as CoE's 1.015% |

New seeds pushed it both up and down, and the average landed back on Craft of Exile. There was no sign that ExileDesk rolls this case high.

:::zundamon surprised
So the first run was just a hot streak!
:::

:::metan normal
With almost 30 rows, one or two falling outside a 95% margin is normal. When one misses, rerun it with new seeds before calling it a bug.
:::

### Our Checking Script Had a Bug Too

Halfway through we found a mistake in the script that does the checking. It told Craft of Exile the item was rare in the wrong format, so Craft of Exile treated it as an item with no affix limit.

:::zundamon troubled
If the checking tool is wrong, the check means nothing.
:::

:::metan troubled
The 15 Exalt cases all added to an open side, so their numbers didn't change. When we tried Chaos on boots with full suffixes, it looked 20% off, and that's how we caught it.
:::

:::metan normal
After the fix we reran all 15 Exalt cases and got the same values. The tables above are after the fix.
:::

:::note fold What we haven't checked (3)
- What matched is "ExileDesk agrees with Craft of Exile." We have not compared against thousands of crafts in the live game. Both tools may simply share the same weight sources, such as poe2db.
- Desecration could not be compared because Craft of Exile does not calculate its odds. Essences simply have not been compared yet.
- We only tested a Gold Ring and Drakeskin Boots.
:::

ExileDesk gives the same single-craft odds as Craft of Exile for Exalted Orbs, Chaos Orbs and Annulment. The one miss turned out to be luck once we reran it with new seeds.

## Where the Numbers Come From

:::fold Show sources (4)
- 15 Exalt cases: analyst notes docs/org/math/notes/2026-10-23-coe-odds.md, script scripts/analysis/check-coe-odds.mjs (50,000 rolls). Craft of Exile, engine
- Chaos and Annulment: 2026-10-23-coe-chaos.md, script scripts/analysis/check-coe-chaos.mjs (50,000, 400,000, and 12 seeds × 100,000). Craft of Exile, engine
- Craft of Exile code: a local copy of the beta PoE2 code (fetched 2026-10-16) and data (fetched 2026-10-09). Craft of Exile
- The script bug and fix: the notes section of 2026-10-23-coe-chaos.md. Engine
:::

## Try It Yourself

Pick a Gold Ring on the ExileDesk [crafting bench](/?base=Gold%20Ring) and the mod list shows the odds of your held currency before you click.

**Related posts**

- [PoE2 Cast Speed Weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)
- [PoE2 Greater vs Perfect Orb Difference: Min Mod Levels](/en/blog/greater-perfect-orb-difference/)
- [PoE2 Chaos Spam Odds: How Many Orbs at 0.3% per Try](/en/blog/chaos-spam-odds/)
