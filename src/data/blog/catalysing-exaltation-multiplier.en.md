---
title: PoE2 Catalysing Exaltation Multiplier: No One Knows It
description: The poe2 Catalysing Exaltation multiplier has no official number. ExileDesk defaults to Craft of Exile's 1 + 0.2 × quality (5x at 20%). Here is how that compares with two Reddit measurements, and why you can now set it yourself.
date: 2026-10-22
tags: Omen of Catalysing Exaltation, Catalyst, Quality, Exalted Orb, Gold Ring
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/catalysing-exaltation-multiplier-og.en.png
draft: true
---
The poe2 Catalysing Exaltation multiplier **has no official number**. ExileDesk defaults to Craft of Exile's formula, 1 + 0.2 × quality (5x weight at 20% quality), which agrees with the only two measurements we found on Reddit. The in-game value is still unconfirmed, so ExileDesk now lets you set the multiplier yourself.

Omen of Catalysing Exaltation is the standard way to weight your target on rings and amulets: build Catalyst Quality, then use an Exalted Orb.

So how much more likely is your target at 20% quality? When we went looking, it turned out nobody actually knows. poe2db's description gives no number, and the theories going around disagree with each other.

This post lays out which number ExileDesk uses today, and how sure we really are about it.

:::summary What you'll learn
- The default Omen of Catalysing Exaltation multiplier is Craft of Exile's **1 + 0.2 × quality** (5x at 20%)
- poe2db's description only says it raises the chance. **There is no official number**
- The only measurements are two Reddit data points (1.5% quality: 42/100, 40%: 77/100), and the formula falls inside their 95% intervals
- Because the in-game value is unconfirmed, since v0.1.589 **you can set the multiplier yourself**
:::

## The Default Is Craft of Exile's 1 + 0.2 × Quality

In the ExileDesk engine, using an Exalted Orb with Omen of Catalysing Exaltation multiplies the weights of the mods matching the quality type, then consumes the quality. On rings and amulets, matching mods are picked by mod tag.

The default multiplier is the same formula Craft of Exile (CoE) uses.

| Quality | Multiplier |
|---|---|
| 0–20% | 1 + 0.2 × quality (5x at 20%) |
| Above 20% | +0.12 per extra 1% |

We switched to this formula in v0.1.525, after the owner decided on 2026-10-16 to "match CoE."

### Why Is There No Official Number?

The weights on poe2db and CoE come from community measurements. And for this omen, poe2db's description only says it increases the chance. It never says by how much.

On the official forum there is also a suspicion that it doesn't work when stacked with other omens, and a bug report that it does nothing on jewels. Several theories about the multiplier exist, but none has solid backing.

CoE's formula wasn't read out of the game either. The honest way to see it is as the most complete working estimate we have.

## Only Two Data Points, From Reddit

The only outside measurements we found were two points posted on Reddit.

| Quality | Result |
|---|---:|
| 1.5% | 42 out of 100 |
| 40% | 77 out of 100 |

CoE's formula sits inside the 95% interval at both points. So we can say the formula doesn't contradict the measurements.

But two points of 100 tries each leave a wide band, and other formulas could fit too. We can't say the formula has been confirmed.

:::note What is not confirmed
- The real in-game multiplier is **unconfirmed**. The default 1 + 0.2 × quality is CoE's formula, not a number read from the game.
- The +0.12 per 1% above 20% quality also just follows CoE's formula.
- The suspicion that it fails when stacked with other omens is not modeled in the engine.
:::

## How Much Does the Multiplier Change Life Mods?

To see how much the multiplier matters, we ran it through the engine: a Gold Ring with 20% Life quality, adding one mod with an Exalted Orb and Omen of Catalysing Exaltation. This is the share of results that got a Life mod.

:::chart bar Chance of a Life mod (Gold Ring, 20% Life quality)
unit: %
labels: No omen, Per 1% 0, Per 1% 0.2 (default), Per 1% 0.5, Per 1% 1
Odds table: 13.3, 13.3, 43.4, 62.8, 76.3
:::

| Setting | Odds table | 2,000 engine uses |
|---|---:|---:|
| No omen | 13.3% | — |
| Per 1% 0 | 13.3% | 13.2% |
| Per 1% 0.2 (default, weight 5x) | 43.4% | 43.4% |
| Per 1% 0.5 (weight 11x) | 62.8% | 63.8% |
| Per 1% 1 | 76.3% | 78.0% |

At the default 0.2 the chance is 43.4%; at 0.5 it's 62.8%. One number moves your cost estimate a lot.

Note that this table and the 2,000 uses only check that the engine's odds table matches what the engine actually rolls. They were not compared with in-game results.

## Bottom Line: You Set the Multiplier

Hard-coding a single number we can't back up didn't feel honest. So since v0.1.589, omens have settings under their name once you apply them.

- Omen of Catalysing Exaltation: the multiplier per 1% quality (default 0.2 = 5x at 20%). At 0.5 the weight becomes 11x.
- Omen of Sanctification: tick the checkbox to pick the multiplier yourself (0.78–1.22x).

Above 20% quality, the formula keeps CoE's shape and only the slope changes. Crafting and the odds table read the same formula, so the odds update as soon as you change the setting.

If you have your own results or a measurement you trust, plug it in. I'm not confident in this number either, and it's something I'd like to settle together with the people using the tool.

:::tip Estimate with a range
Check a lower and a higher multiplier, not just the default 0.2. If a method is cheap under both, a wrong multiplier won't hurt you much.
:::

## Where the Numbers Come From

- The formula 1 + 0.2 × quality, +0.12 per 1% above 20%: Craft of Exile's data (adopted in v0.1.525). **poe2db / CoE** (CoE's formula; unconfirmed in game)
- "Increases the chance" description: poe2db. **poe2db / CoE**
- 1.5% quality: 42/100, 40%: 77/100: Reddit measurements. **In game** (two points only; consistent with the formula within 95% intervals)
- Stacking suspicion and the jewel bug: official forum posts. **Estimate** (not verified)
- Life mod chances (13.3%, 43.4%, 62.8%, 76.3%) and the 2,000-use results: the ExileDesk engine's odds table and 2,000 engine uses. **Engine**
- The multiplier setting: v0.1.589 release notes

## Try It Yourself

On the Gold Ring [crafting bench](/?base=Gold%20Ring), apply Omen of Catalysing Exaltation and change the multiplier under its name. To compare costs across methods, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 cast speed weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)
