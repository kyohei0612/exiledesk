---
title: PoE2 Crafting AI Expected Cost: Right Total, Wrong Odds
description: We checked a PoE2 crafting AI expected cost against a stream's captions and ExileDesk's records. The 390 div total felt "about right" to the streamer, but the Cast Speed odds didn't, and the weight source explains why.
date: 2026-10-22
tags: expected cost, AI, Cast Speed, weight, Gold Ring
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
When a streamer asked an AI for a PoE2 crafting expected cost on a Gold Ring, **the total (390 div) matched their experience "roughly", but the individual odds, especially Cast Speed, did not**. Ring Cast Speed has weight 1 on poe2db (it looks like a placeholder) and 1,000 in ExileDesk and Craft of Exile, and which one gets read changes the odds a lot.

On a crafting stream, the streamer handed their own Gold Ring method to an AI and had it work out the odds and the cost. Then they went through the answer line by line: "that's right", "no, it's not that low".

The interesting part: they doubted the small numbers again and again, yet called the final total "basically correct". Wrong parts, right sum. How does that happen?

We lined up the stream's auto-generated captions with ExileDesk's weight research.

:::summary What you'll learn
- Where the AI's odds and the streamer's experience disagreed (with caption timestamps)
- The 390 div total was "basically correct", though the streamer also said the AI "overestimated Cast Speed"
- Ring Cast Speed weight is 1 on poe2db but 1,000 in ExileDesk and Craft of Exile. ExileDesk's record: Omen of Dextral Exaltation + Greater Exalted Orb lands T2+ 4.37% of the time
- Before trusting an AI's expected cost, check where its weights come from and how it treats Omens
:::

:::note These are auto-generated captions
Every number here comes from the stream's **auto-generated Japanese captions**. They mishear often, and one number could not be made out at all. The captions don't mark who is speaking, so speakers are inferred from context. Treat the figures as "what the captions showed", nothing more.
:::

## What the AI Said vs. What the Streamer Felt

The craft is a Gold Ring: build a Rarity T1 suffix first, then go for Cast Speed and all Elemental Resistances. Here is the AI's output next to the streamer's reaction, by caption timestamp.

| Time | Chance of | AI output (captions) | Streamer's take |
|---|---|---|---|
| [229:54] | Rarity T1 from a Greater Exalted Orb | 1 in 42.8 | "Feels about right" |
| [229:54] | Cast Speed from a Perfect Chaos Orb after Rarity T1 | number not audible | "Makes sense, no Catalyst on it" |
| [229:54] | all Elemental Resistances, same step | 1 in 14 | "I think it shows up a bit more" |
| [230:31] | Cast Speed from the second Perfect Chaos Orb | 3.6% | "I don't think it's that low" |
| [230:31] | Times you rebuild Rarity T1 | 15 to 25 | "It won't be 15 to 25" |
| [231:58] | A weight share the AI used | 7.251% | "Probably around 6%", but also "it lands about 1 in 8" and "Cast Speed lands about 1 in 5" |
| [234:54] | all Elemental Resistances weight | 5.3% plain, 7% with Catalyst | "Feels like it lands more" |
| [235:27] | Cast Speed and all-res in one go | 1 in 15 / 1 in 14 | "That's statistically off... well, maybe not, maybe that's normal" |

The captions don't say which mod the 7.251% at [231:58] belongs to, or what the "1 in 8" refers to.

The streamer accepted the Rarity T1 odds and felt Cast Speed and all-res show up more often. Among the rows with a clear direction, apart from the weight share at [231:58] ("probably around 6%"), the gap seems to run one way: the AI treating things as rarer. But some rows had no clear direction (agreement at [229:54], wavering at [235:27]), so this is a tendency, not a rule.

## The 390 div Total Was "Basically Correct"

The AI's final cost was built up like this ([242:33] to [243:10]):

| Cost item | AI output (captions) |
|---|---:|
| Chaos spam (2,300 ÷ 8) | 287 div → about 300 div |
| + Fracturing Orb | 50 div → 350 div |
| + Orb of Annulment | **390 div** |

The streamer's verdict: "basically correct", followed by "but it overestimated Cast Speed".

That's the odd bit. If Cast Speed is treated as rarer than it is, its share of the cost should come out high. The total may have landed close because errors in other parts cancelled out. The captions don't let us check item by item, so this is a guess.

## Cast Speed Is Off Because the Weight Sources Disagree

The streamer named the cause too: "We don't know the exact Cast Speed weight. poe2db is broken" ([243:44]). Also: "AI is good at probability, bad at reading weights" ([245:29]), and "it's doubtful how much it multiplies Omen of Catalysing Exaltation each time" ([246:06]).

ExileDesk's research backs this up.

| Source | Ring Cast Speed (5 tiers) |
|---|---:|
| poe2db ring page (checked 2026-10-22) | **1** (all five tiers) |
| Craft of Exile (local copy, 2026-10-09) | 1,000 |
| ExileDesk engine (since 2026-09-23) | 1,000 |

On poe2db, other mods sit around 1,000 while Cast Speed alone is 1. It looks like a placeholder for an unknown weight on a mod new in PoE2. Whether an AI reads that 1 or some other value changes its answer a great deal.

### ExileDesk's Record: Dextral + Greater Lands T2+ 4.37%

ExileDesk has a record of how often Cast Speed rolls with weight 1,000, counted over 20,000 engine runs. The setup: a Gold Ring with Fractured Spell Damage and Rarity T1, hit with Omen of Dextral Exaltation + Greater Exalted Orb.

| Cast Speed weight | T2 or better | Any tier |
|---|---:|---:|
| 1,000 (ExileDesk, Craft of Exile) | **4.37%** | 6.52% |
| 1 (poe2db) | 0.00% | 0.01% |
| 200 (reference: reading "1 in 5" as 1/5 of weight 1,000) | 0.97% | 1.48% |

The AI's 3.6% is for a Perfect Chaos Orb. ExileDesk's 4.37% is for Dextral + Greater Exalted Orb, so **they use different currency and can't be compared directly**. What the table does show is the range: use poe2db's 1 as-is and Cast Speed basically never rolls (0.00%); use 1,000 and you're in the few-percent range.

Whether the streamer's "about 1 in 5" means the weight or the hit rate can't be settled from the words alone.

:::tip Before asking an AI for expected cost
- Make it state its weight source (poe2db or Craft of Exile). A mod at weight 1 is likely a placeholder
- Make it state the multiplier it used for Omen of Catalysing Exaltation
- Read "1 in N" only after checking whether it means T1 or any tier
:::

## Averages and Experience Drift Apart Anyway

One more thing: expected cost is an average. One person's history, like the streamer's "I've done it in 23", can swing lucky or unlucky. How the average and most players' experience differ is covered in [Crafting Cost Variance](/en/blog/crafting-cost-variance/).

This one stream can't tell us whether the feel or the AI is right. But the more a mod's weight sources disagree, the more likely an AI's odds for it are off.

## Where the Numbers Come From

- AI output and the streamer's words: **auto-generated captions** of a crafting stream ([229:54] to [246:06]). Mishearing and speaker mix-ups are possible (estimate). The streamer's "feel" is personal experience, not a record.
- Cast Speed weight: poe2db's ring page (public page read once on 2026-10-22) and a local copy of Craft of Exile data (2026-10-09) (poe2db / CoE).
- 4.37% and the other rates: ExileDesk engine, 20,000 runs each, with weights changed only inside the script (engine). Not compared with in-game results.

## Try It Yourself

On the [crafting bench](/?base=Gold%20Ring) you can craft a Gold Ring while seeing the odds at weight 1,000. To compare the cost of different methods, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 Cast Speed weight: 1 on poe2db, 1,000 in CoE](/en/blog/poe2db-cast-speed-weight/)
- [PoE2 crafting cost variance: average, median and unlucky 10%](/en/blog/crafting-cost-variance/)
