---
title: PoE2 Kolr's Hunt Gloves: Where +2 Projectile and Crit Chance Come From
description: In PoE2, +2 to Level of all Projectile Skills and Critical Hit Chance roll on gloves only with the rune Kolr's Hunt socketed. We checked on the engine what it adds to the mod pool and how much it changes an ES glove craft.
date: 2026-10-22
tags: Kolr's Hunt, Rune, gloves, Marksman, Projectile
tree: /?page=sim-tree&base=Sirenscale%20Gloves
craft: /?base=Sirenscale%20Gloves
image: img/kolrs-hunt-gloves-og.en.png
ready: true
draft: true
---
In PoE2, gloves roll "+2 to Level of all Projectile Skills" or Critical Hit Chance **only with the rune Kolr's Hunt socketed**. Kolr's Hunt reads "Can roll Marksman modifiers." Once it's socketed, Marksman mods join both the suffix and the prefix pool.

:::zundamon troubled
Our research said gloves have no Critical Hit Chance mod. Yet gloves with +2 Projectile really exist!
:::

:::metan normal
You'd think one of them is wrong. But both were right.
:::

:::zundamon surprised
How can that be?!
:::

:::metan happy
The answer is the rune. These mods aren't in the normal pool. The rune adds them.
:::

:::summary What you'll learn
- +2 Projectile and Critical Hit Chance on gloves are Marksman mods that appear **only with Kolr's Hunt socketed**
- Marksman mods **also join the prefix pool** (projectile damage, projectile speed, curse effect)
- Three ES prefixes with Greater Exalted Orbs go from 105 div to 194 div, **1.8 times** the cost. Greater is still the cheapest
:::

:::tip New to this? Words used here
- **Rune**: an item you socket into gear to add an effect
- **Kolr's Hunt**: a rune that adds Marksman mods to the pool
- **Marksman mods**: a group of projectile and critical mods. They don't normally roll on gloves
- **Prefix / Suffix**: the two sides a mod can sit on
- **Exalted Orb**: currency that adds one mod to a rare item
- **div**: Divine Orb, the price unit in this post
:::

## Kolr's Hunt Adds Mods to the Prefixes Too

On the ExileDesk engine, we socketed Kolr's Hunt into Sirenscale Gloves (Intelligence, Item Level 82). That opened the Marksman pool.

:::zundamon normal
So what mods can roll once it's socketed?
:::

:::metan normal
New ones show up on both sides. Here's a table.
:::

| Side | Marksman mods | What happens |
|---|---|---|
| Suffix | Level of all Projectile Skills (2 tiers: +1 at level 45, +2 at level 65), Critical Hit Chance (3 tiers), additional projectile chance, chaining from terrain, forking, pierce chance, Mark duration, Mark use speed | Hits that gloves never roll normally |
| Prefix | projectile damage, projectile speed, curse effect | All misses when you aim for ES |

:::zundamon happy
+2 Projectile is a suffix!
:::

:::metan normal
With Omen of Dextral Exaltation + Greater Exalted Orb applied 3,000 times, each Marksman mod showed up 2 to 5% of the time.
:::

:::metan normal
That's a share of all suffixes, misses included.
:::

:::zundamon normal
What about Critical Hit Chance?
:::

:::metan normal
For T2 or better, it's 2.48% per try on gloves with full prefixes.
:::

:::zundamon happy
Then socketing it is pure gain!
:::

:::metan troubled
That's the trap. It also joins the prefixes. When you aim for ES, projectile damage, projectile speed and curse effect are all misses.
:::

## Socketing It Makes ES Gloves 1.8 Times as Expensive

We compared the cost of maximum Energy Shield, increased Energy Shield and maximum Mana (all T2+) as the prefixes on these gloves. No runes versus runes, 300 runs each.

:::zundamon normal
How did you craft it?
:::

:::metan normal
Chaos Orbs while no target is present, annul a non-target prefix right away, and add missing targets with Omen of Sinistral Exaltation + Exalted Orb.
:::

| Omen of Sinistral Exaltation + | No runes | Serle's Triumph + Kolr's Hunt | What happens |
|---|---:|---:|---|
| Exalted Orb | 423 div | 598 div | Most expensive either way |
| **Greater Exalted Orb** | **105 div (cheapest)** | **194 div (cheapest)** | 1.8 times with runes, still the cheapest |
| Perfect Exalted Orb | 201 div | 307 div | Far more than Greater |

Socketing the runes did not change the order. Greater stayed the cheapest.

:::zundamon surprised
Greater goes from 105 div to 194 div! That's almost double.
:::

:::metan normal
Look at the breakdown for Greater too.
:::

| Used with Greater Exalted Orb | No runes | Serle's Triumph + Kolr's Hunt | Why it went up |
|---|---:|---:|---|
| Chaos Orb | 654 | 1,275 | Marksman prefixes joined the pool, so Chaos Orbs hit target prefixes less often |
| Greater Exalted Orb | 65 | 107 | Marksman prefixes joined the pool, so targets are harder to hit |

:::metan normal
That's all from Marksman prefixes making targets harder to hit.
:::

:::zundamon normal
Serle's Triumph is socketed too. Isn't that the cause?
:::

:::metan normal
Serle's Triumph adds one suffix slot. It did nothing in the prefix-only stage.
:::

:::metan normal
It came out at exactly 105 div, the same as no runes.
:::

### Sockets and Rune Prices

On the engine, Sirenscale Gloves took two sockets and two runes (Serle's Triumph and Kolr's Hunt).

| Rune | Price (ExileDesk server market) | In div |
|---|---:|---:|
| Kolr's Hunt | 715.79 Exalted Orbs | about 1.0 div |
| Serle's Triumph | 2,079.15 Exalted Orbs | about 3.0 div |

:::zundamon normal
Are the rune prices included in the costs above?
:::

:::metan troubled
No, they aren't. Count the runes as an extra cost.
:::

## Catalysts Can't Make Up for the Misses on Gloves

One more thing: a ring technique doesn't work on gloves.

:::zundamon normal
On rings, you can use a Catalyst to weight your target, right?
:::

:::metan normal
Right. But Catalysts are for "a ring or amulet" only (poe2db's description). The engine won't apply them to gloves either.
:::

:::zundamon troubled
So no Omen of Catalysing Exaltation either...
:::

:::metan troubled
Exactly. The extra misses from Marksman mods go straight into the cost.
:::

:::note fold Not yet verified (2)
- The cost tables do not include rune prices.
- The costs are engine results and have not been compared with Craft of Exile or in-game results.
:::

Kolr's Hunt is the only way to get +2 Projectile or Critical Hit Chance on gloves. But it also joins the prefixes, so ES gloves cost 1.8 times as much.

## Where the Numbers Come From

:::fold Show sources (3)
- Kolr's Hunt enabling Marksman mods: poe2db (our research lead's notes) and the ExileDesk engine's mod pools.
- 2 to 5% and 2.48%: the engine, 3,000 and 20,000 tries.
- Cost tables: the engine, 300 runs each, capped at 2,000 div per run. Market 2026-10-20 16:00 UTC. Not compared with Craft of Exile or in-game results.
:::

## Try It Yourself

On the [crafting bench](/?base=Sirenscale%20Gloves), socket the runes into Sirenscale Gloves before crafting and the Marksman mods appear in the list. To compare Exalted Orb types, go to the [Craft route tree](/?page=sim-tree&base=Sirenscale%20Gloves).

**Related posts**

- [PoE2 Energy Shield gloves craft: Greater beats Perfect Exalted Orb](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Arcane Surge Desecrated gloves: which gloves and how often](/en/blog/arcane-surge-desecrated-gloves/)

VOICEVOX: Zundamon / Shikoku Metan
