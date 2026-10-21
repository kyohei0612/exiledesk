---
title: PoE2 Catalysing Exaltation Multiplier: No One Knows It
description: The poe2 Catalysing Exaltation multiplier has no official number. ExileDesk defaults to Craft of Exile's 1 + 0.2 × quality (5x at 20%). Here is how that compares with two Reddit measurements, and why you can now set it yourself.
date: 2026-10-22
tags: Omen of Catalysing Exaltation, Catalyst, Quality, Exalted Orb, Gold Ring
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
image: img/catalysing-exaltation-multiplier-og.en.png
ready: true
draft: true
---
The poe2 Catalysing Exaltation multiplier **has no official number from the game**. ExileDesk defaults to Craft of Exile's formula, 1 + 0.2 × quality (5x weight at 20% quality), which doesn't contradict the two measurements posted on Reddit. The in-game value is still unconfirmed, so ExileDesk lets you set the multiplier yourself.

:::zundamon normal
Build Catalyst Quality, then use an Exalted Orb with Omen of Catalysing Exaltation. That's the standard ring craft!
:::

:::metan normal
It's a way to pull your target mod with extra weight. So at 20% quality, how much more likely is it?
:::

:::zundamon happy
Easy, I'll just look it up!
:::

:::metan troubled
Here's the thing: nobody knows the official number. poe2db's description gives none, and the theories going around all disagree.
:::

:::zundamon surprised
Nobody knows?! Then what number does ExileDesk use?
:::

:::metan normal
I'll be honest about the number we use now, and how solid its basis really is.
:::

:::summary What you'll learn
- The default multiplier is Craft of Exile's **1 + 0.2 × quality** (5x at 20%). poe2db's description only says it raises the chance. **There is no official number**
- The only measurements are two Reddit points (1.5% quality: 42 out of 100, 40%: 77 out of 100), and the formula sits inside their 95% intervals
- Because the in-game value is unconfirmed, since v0.1.589 **you can set the multiplier yourself**
:::

:::tip New to this? Words used here
- **Omen of Catalysing Exaltation**: an omen that makes an Exalted Orb more likely to add mods matching the item's quality
- **Catalyst**: a currency that adds quality to rings and amulets
- **Quality**: a number built up on an item. Each type of Catalyst quality has its own matching mods
- **Weight**: how easily a mod is rolled. Higher means more likely
- **Multiplier**: the number the omen multiplies the weight by
- **Odds table**: the table of chances that ExileDesk calculates
:::

## The Default Is CoE's 1 + 0.2 × Quality

First, here is how the ExileDesk engine handles Omen of Catalysing Exaltation.

:::zundamon normal
What happens inside the engine when I use an Exalted Orb with the omen?
:::

:::metan normal
It multiplies the weight of the mods matching the quality type. Then the quality is used up.
:::

:::zundamon normal
How does it decide which mods match?
:::

:::metan normal
On rings and amulets, it goes by mod tags.
:::

:::zundamon normal
And where does the multiplier come from?
:::

:::metan normal
It's the same formula Craft of Exile (CoE) uses. Here it is as a table.
:::

| Quality | Multiplier | What happens |
|---|---|---|
| 0–20% | 1 + 0.2 × quality (5x at 20%) | More quality means more weight on matching mods |
| Above 20% | +0.12 per extra 1% | The growth slows down |

:::metan normal
This formula went in with v0.1.525. On 2026-10-16 the owner decided to "match CoE."
:::

### Why Is There No Official Number?

:::zundamon normal
Surely poe2db lists the multiplier?
:::

:::metan normal
The weights on poe2db and CoE are worked out from community measurements.
:::

:::metan troubled
And poe2db's description only says it increases the chance. It never says by how much.
:::

:::zundamon troubled
Are there any other clues?
:::

:::metan normal
On the official forum, some suspect it doesn't work when stacked with other omens. There's also a bug report that it does nothing on jewels.
:::

:::metan troubled
There are a few theories about the multiplier, but none has clear backing.
:::

:::zundamon normal
So was CoE's formula read out of the game?
:::

:::metan normal
No, it wasn't. For now, it's honestly best seen as the most complete working estimate.
:::

## Only Two Data Points, From Reddit

The only outside measurements we found were two points posted on Reddit.

| Quality | Result | Compared with CoE's formula |
|---|---:|---|
| 1.5% | 42 out of 100 | Inside the 95% interval (no contradiction) |
| 40% | 77 out of 100 | Inside the 95% interval (no contradiction) |

:::zundamon happy
Both inside the interval? Then the formula is proven right!
:::

:::metan troubled
We can't go that far. All we can say is that the formula doesn't contradict the measurements.
:::

:::zundamon normal
Why not?
:::

:::metan normal
Two points of 100 tries each leave a wide band. A different formula could fit inside it too.
:::

:::note fold Not yet verified (4)
- The real in-game multiplier is **unconfirmed**. The default 1 + 0.2 × quality is CoE's formula, not a number read from the game.
- The +0.12 per 1% above 20% quality also just keeps the shape of CoE's formula.
- The suspicion that it fails when stacked with other omens is not modeled in the engine.
- The odds table and 2,000-use results in the next section only check that the engine's table matches what the engine rolls. They were not compared with in-game results.
:::

## How Much Does the Multiplier Change Life Mods?

We put 20% Life quality on a Gold Ring and added one mod with an Exalted Orb and Omen of Catalysing Exaltation. Here is how often the engine gave a Life mod.

:::zundamon normal
If the multiplier is only a little off, the result barely changes, right?
:::

:::metan normal
Actually, it changes a lot. Take a look.
:::

| Setting (per 1% quality) | Odds table | 2,000 uses | What happens |
|---|---:|---:|---|
| No omen | 13.3% | — | Life keeps its normal weight |
| 0 | 13.3% | 13.2% | Same as no omen |
| **0.2 (default, 5x weight)** | **43.4%** | **43.4%** | Far more likely than no omen |
| 0.5 (11x weight) | 62.8% | 63.8% | More than half |
| 1 | 76.3% | 78.0% | The most likely in the table |

:::zundamon surprised
43.4% at the default 0.2, and 62.8% at 0.5!
:::

:::metan normal
That one number moves your craft cost estimate a lot.
:::

:::zundamon normal
The odds table and the 2,000 uses are almost the same.
:::

:::metan troubled
Yes. But that only checks the engine's table against the engine's own rolls. It wasn't compared with in-game results.
:::

## Bottom Line: You Set the Multiplier

Hard-coding one number when we don't know the right one wouldn't be honest. So since v0.1.589, you can change the setting under an omen's name once you apply it.

:::zundamon normal
What can I set?
:::

:::metan normal
Two things. Here they are.
:::

| Omen | What you can set | Default |
|---|---|---|
| Omen of Catalysing Exaltation | The multiplier per 1% quality | 0.2 (5x at 20% quality). At 0.5 the weight becomes 11x |
| Omen of Sanctification | Tick the checkbox to pick the multiplier yourself (0.78–1.22x) | Unticked |

:::zundamon normal
What about quality above 20%?
:::

:::metan normal
It keeps the shape of CoE's formula. Only the slope changes.
:::

:::metan happy
Crafting and the odds table read the same formula. So when you change the setting, the odds update right away.
:::

:::zundamon normal
Which number should I enter?
:::

:::metan normal
If you have your own results or a measurement you trust, enter that.
:::

:::metan troubled
I'm not confident in this number either. It's something I'd like to settle together with the people using the tool.
:::

:::tip Estimate with a range
Check a lower and a higher multiplier too, not just the default 0.2. If a method is cheap under both, a wrong multiplier won't cost you much.
:::

The Catalysing Exaltation multiplier has no official number, and the default is a working estimate from CoE's formula. Since you can change it yourself, the quickest path is to estimate with a range.

## Where the Numbers Come From

:::fold Show sources (6)
- The formula 1 + 0.2 × quality, +0.12 per 1% above 20%: Craft of Exile's data (adopted in v0.1.525). **poe2db / CoE** (CoE's formula; unconfirmed in game)
- The "increases the chance" description: poe2db. **poe2db / CoE**
- 1.5% quality: 42 out of 100, 40%: 77 out of 100: Reddit measurements. **In game** (two points only; consistent with the formula within 95% intervals)
- The stacking suspicion and the jewel bug: official forum posts. **Estimate** (not verified)
- Life mod chances (13.3%, 43.4%, 62.8%, 76.3%) and the 2,000-use results: the ExileDesk engine's odds table and 2,000 engine uses. **Engine**
- The multiplier setting: v0.1.589 release notes
:::

## Try It Yourself

On the Gold Ring [crafting bench](/?base=Gold%20Ring), apply Omen of Catalysing Exaltation and change the multiplier under its name. To compare costs across methods, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 cast speed weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)

VOICEVOX: Zundamon / Shikoku Metan
