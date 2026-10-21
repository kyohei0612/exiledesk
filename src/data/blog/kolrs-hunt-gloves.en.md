---
title: PoE2 Kolr's Hunt Gloves: Where +2 Projectile and Crit Chance Come From
description: In PoE2, +2 to Level of all Projectile Skills and Critical Hit Chance roll on gloves only with the rune Kolr's Hunt socketed. We checked on the engine what it adds to the mod pool and how much it changes an ES glove craft.
date: 2026-10-22
tags: Kolr's Hunt, Rune, gloves, Marksman, Projectile
tree: /?page=sim-tree&base=Sirenscale%20Gloves
craft: /?base=Sirenscale%20Gloves
image: img/kolrs-hunt-gloves-og.en.png
draft: true
---
In PoE2, gloves roll "+2 to Level of all Projectile Skills" or Critical Hit Chance **only with the rune Kolr's Hunt socketed**. Kolr's Hunt reads "Can roll Marksman modifiers," and once socketed, Marksman mods join both the suffix and the prefix pool.

We were working backward from a finished ES glove. Our notes said "gloves have no Critical Hit Chance mod." Yet real gloves had +2 Projectile.

One of them has to be wrong, right? But both were true.

The answer was the rune. These mods aren't in the normal pool; the rune adds them.

:::summary What you'll learn
- +2 Projectile and Critical Hit Chance on gloves are Marksman mods that appear **only with Kolr's Hunt socketed**
- Marksman mods **also join the prefix pool** (projectile damage, projectile speed, curse effect)
- Three ES prefixes with Greater Exalted Orbs go from 105 div to 194 div, **1.8 times** the cost
- Greater is still cheapest. Catalysts don't work on gloves, so the extra misses go straight into the cost
:::

## Kolr's Hunt Adds Mods to the Prefixes Too

On the ExileDesk engine, we socketed Kolr's Hunt into Sirenscale Gloves (Intelligence, Item Level 82). That opened the Marksman pool.

| Side | Marksman mods |
|---|---|
| Suffix | Level of all Projectile Skills (2 tiers: +1 at level 45, +2 at level 65), Critical Hit Chance (3 tiers), plus additional projectile chance, chaining from terrain, forking, pierce chance, Mark duration and Mark use speed |
| Prefix | projectile damage, projectile speed, curse effect |

With Omen of Dextral Exaltation + Greater Exalted Orb applied 3,000 times, each Marksman suffix showed up 2 to 5% of the time (as a share of all suffixes, misses included). For Critical Hit Chance T2 or better, it was 2.48% per try on gloves with full prefixes.

The key point: **they also join the prefix pool**. When aiming for ES prefixes, projectile damage, projectile speed and curse effect are all misses.

## Socketing It Makes ES Gloves 1.8 Times as Expensive

We compared the cost of maximum Energy Shield, increased Energy Shield and maximum Mana (all T2+) on these gloves, with and without the runes. 300 runs each.

Method: Chaos Orbs while no target is present, annul a non-target prefix at once, add missing targets with Omen of Sinistral Exaltation + an Exalted Orb.

:::chart bar Cost per item (div, 300 engine runs each)
unit: div
labels: Exalted Orb, Greater Exalted Orb, Perfect Exalted Orb
No runes: 423, 105, 201
Serle's Triumph + Kolr's Hunt: 598, 194, 307
:::

| Omen of Sinistral Exaltation + | No runes | Serle's Triumph + Kolr's Hunt |
|---|---:|---:|
| Exalted Orb | 423 div | 598 div |
| Greater Exalted Orb | 105 div | 194 div |
| Perfect Exalted Orb | 201 div | 307 div |

With Greater Exalted Orbs, Chaos Orbs rose from 654 to 1,275 and Greater Exalted Orbs from 65 to 107.

That is because Marksman prefixes made targets harder to hit. Greater still came out cheapest.

:::tip Serle's Triumph doesn't matter for prefixes
Serle's Triumph adds a suffix slot. It made no difference to the prefix-only stage (exactly 105 div either way).
:::

### Sockets and Rune Prices

On the engine, Sirenscale Gloves took two sockets with two runes (Serle's Triumph and Kolr's Hunt). Rune prices from the ExileDesk server market: Kolr's Hunt 715.79 Exalted Orbs (about 1.0 div), Serle's Triumph 2,079.15 (about 3.0 div).

:::note Rune costs and in-game checks are not included
The table above excludes rune costs. The costs are engine results and have not been compared with Craft of Exile or in-game results.
:::

## Catalysts Can't Make Up for the Misses

Gloves also miss out on a ring technique. Catalysts are for "a ring or amulet" only (poe2db's description), and the engine refuses them on gloves.

So there is no Omen of Catalysing Exaltation to weight your target. The extra misses from Marksman mods go straight into the cost.

## Where the Numbers Come From

- Kolr's Hunt enabling Marksman mods: poe2db (our research notes) and the ExileDesk engine's mod pools.
- 2 to 5% and 2.48%: the engine, 3,000 and 20,000 tries.
- Cost table: the engine, 300 runs each, capped at 2,000 div per run. Market 2026-10-20 16:00 UTC. Not compared with Craft of Exile or in-game results.

## Try It Yourself

On the [crafting bench](/?base=Sirenscale%20Gloves), socket the runes into Sirenscale Gloves first and the Marksman mods appear in the mod list. To compare Exalted Orb types, try the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Energy Shield gloves craft](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)
