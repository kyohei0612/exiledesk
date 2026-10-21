---
title: PoE2 Crafting Simulator Wishes: 3 Questions From a Stream
description: Three PoE2 crafting simulator wishes from a Japanese stream: expected cost for your own route, regular vs Ancient bones, settle for T2 or chase T1. What our records answer, and what they don't. Loosening T1 cut one ring from 1,991 to 643 div.
date: 2026-10-22
tags: expected cost, simulator, Desecration, bones, stream
draft: true
---
On one Japanese crafting stream, the PoE2 crafting simulator wishes boiled down to three questions: **"What's the expected cost of my own route?", "Are regular bones or Ancient bones cheaper?" and "Should I settle for T2, or chase T1?"** ExileDesk's records can answer the first one and part of the third. For the bones, we don't have an answer yet.

On a crafting stream, a comment was read aloud asking what people actually want from a simulator (we believe the ExileDesk owner wrote it, but that is an estimate). The answers weren't flashy features. They were the plain questions every crafter faces before spending a single orb.

"If I follow this route, how much will it cost to finish?" If you craft by hand, you've asked that yourself. On stream, the answer today was to write the route out for an AI in a long prompt and ask it for the numbers.

So we took each question and answered as far as our existing posts and records go. Where there is no answer, we say so.

:::summary What you'll learn
- The three questions from the stream, and what ExileDesk's records can and can't say
- The average alone isn't enough: half of crafters pay about 70% of it, one in ten pays more than twice
- No record anywhere yet compares regular and Ancient bones on cost
- Loosening two T1 targets to T2+ took one mana ring from 1,991 to 643 div (about a third)
:::

## What Did the Stream Ask?

Our source is the stream archive's **auto-generated Japanese captions**. They don't separate speakers: the streamer, the ExileDesk owner and comments read aloud are all mixed together. "Who said it" below is our estimate from context.

| Question | Gist of the caption | Who (estimated) |
|---|---|---|
| Expected cost of a route I choose | "What would the expected cost be?" | streamer |
| Regular or Ancient bones, which is cheaper | "Which one ends up cheaper?" | streamer |
| Settle for T2, or go for all T1 | "Should I settle for tier 2?" | streamer |

Other wishes came up too: the average over 100 finished runs, costs tied to live prices, and omen multipliers in the math. They all point the same way: a human picks the route, and the tool tells you what it costs.

## Expected Cost of Your Own Route: What We Can Say

ExileDesk posts take a fixed method, run it 300 times on the engine, and lay out the costs. On stream, the right number of runs wavered between "10 isn't enough", 30 and 100. Our posts use 300 to 1,000 runs per method (the cap differs by post: some stop a run at 2,000 div, one limits the number of moves instead).

Someone also suggested trimming the top three and bottom three runs before averaging. But as [our cost variance post](/en/blog/crafting-cost-variance/) shows, crafting costs have a long tail: a few unlucky runs drag the average up.

| Measure | Three examples where every run finished |
|---|---|
| Half of runs (median) | 0.68–0.75x the average |
| One in ten (90th percentile) | 2.0–2.4x the average |

Trimming outliers deletes exactly the unlucky runs and makes a craft look cheaper. So we don't trim; we show average, median and 90th percentile side by side.

### What About Runs That Never Finish?

The stream asked this too and didn't settle it. Our posts cap each run at 2,000 div and report "cost per item": total spend, including unfinished runs, divided by finished items.

For the mana ring, finished runs averaged 865 div, but only 64% finished, so cost per item was 1,991 div. When the finish rate is low, looking only at finished runs undercounts by more than half.

### Branching Routes Aren't Supported Yet

The route shown on stream branched constantly: win and move on, lose and take a recovery route, fail badly and start over. Writing your own branches like that and getting an expected cost is not something ExileDesk can do today. Our numbers only cover methods we fixed ourselves.

## Regular vs Ancient Bones: No Answer Yet

On stream it was called "something the current emulator could easily show." Honestly, ExileDesk has no record of this comparison yet. What we can give are the ingredients.

| Bone | Condition | Market (Exalted Orbs) |
|---|---|---:|
| Gnawed Rib | Item Level 64 max | 6.39 |
| Preserved Rib | ― | 6.75 |
| Ancient Rib | Minimum Modifier Level 40 | 4,702 |

On gloves, every Desecrated-only mod is level 65, so the Ancient Rib's minimum of 40 removes none of them ([Arcane Surge Desecrated gloves](/en/blog/arcane-surge-desecrated-gloves/)). For gloves at least, the pool size shows nothing that would justify the price gap.

But the stream was talking about a boots route and weighing it against the price of Omen of Light. Whether a bone changes which options appear is not stated on poe2db or Craft of Exile, and nobody knows the Desecrated mod weights, so we made them all equal ([Desecration weights](/en/blog/desecration-weights/)). Which side a bone lands on is covered in [our Desecration side post](/en/blog/desecration-bone-sides/); the cost comparison is still to come.

### Settle for T2 or Chase T1? About a Third on One Mana Ring

We have exactly one example. On the [mana ring](/en/blog/mana-ring-craft/), two of the five targets (all Resistances and Mana Regeneration) were loosened from T1 to T2+.

| Targets | Finished | Cost per item |
|---|---:|---:|
| Resistances T1, Mana Regeneration T1 | 64.0% | 1,991 div |
| Both loosened to T2+ | 95.3% | 643 div |

A single try hit all Resistances T1 7.13% of the time, and T2+ 14.47%. The hit rate nearly doubled, and losing every target and starting over dropped from 45 to 25 times per item.

This is one build, though. We have no T3 comparison and no other slots. We can't yet tell you, slot by slot, how much commitment chasing all T1 takes.

:::tip Loosen the hardest target first
On the mana ring, the win came from loosening the two targets that hit less than 10% per try. When deciding where to compromise, check each target's single-try hit rate first.
:::

## Why Not Generate the Route From the Finished Item?

A comment suggested a feature where you name the item and the tool gives you the route. The streamer pushed back: it's "trying to cram in too much," and "a simple, focused tool is fine." The streamer also called fully automatic route planning "100% impossible."

The ExileDesk owner reached the same decision: automatic route generation is not a site feature, and the focus is on routes people choose and craft by hand. The optimal move in [our expected cost post](/en/blog/optimal-move-vs-intuition/) is a calculation experiment on one pair of gloves, not a feature.

One more point from the stream: "AI is good at the probability math but bad at reading the weights." We've covered two cases of that: Cast Speed's placeholder weight of 1 on poe2db ([Cast Speed weight](/en/blog/poe2db-cast-speed-weight/)), and the Omen of Catalysing Exaltation multiplier having no official number ([Catalysing Exaltation multiplier](/en/blog/catalysing-exaltation-multiplier/)).

:::note Captions and speakers are estimates
The questions come from auto-generated Japanese captions, which mishear often and don't separate speakers. "Streamer" and "owner" are estimated from context, not confirmed, and the quotes are shortened and translated. Figures mentioned on stream, such as "a cost of 500," were spoken estimates not checked on the ExileDesk engine, so we didn't use them here.
:::

## Where the Numbers Come From

- Stream questions, caption wording and speakers: our notes from reading the stream's auto-generated Japanese captions (research/notes/2026-10-21-owner-stream-wishes.md, 2026-10-22) (estimated).
- Median 0.68–0.75x, 90th percentile 2.0–2.4x, 865 / 1,991 div and 64%: [cost variance post](/en/blog/crafting-cost-variance/) (engine, 300 to 1,000 runs per example; capped at 2,000 div per run or by a move limit, depending on the example).
- 1,991 / 643 div, 64.0% / 95.3% finished, single-try hits 7.13% / 14.47%, restarts 45 / 25: [mana ring post](/en/blog/mana-ring-craft/) (engine, 300 runs each; single-try rates from 20,000 tries).
- Rib prices 6.39 / 6.75 / 4,702 Exalted Orbs: ExileDesk server market (2026-10-20). Rib conditions (Item Level 64 max, Minimum Modifier Level 40): our analyst's handover notes and the CoE screen ([Desecration side post](/en/blog/desecration-bone-sides/); not checked on poe2db). Desecrated mods at level 65: [Arcane Surge post](/en/blog/arcane-surge-desecrated-gloves/).

## Try It Yourself

Craft the same moves a few times on the [Gold Ring crafting bench](/?base=Gold%20Ring) and the T1 vs T2+ gap becomes obvious. To compare methods, try the [Craft route tree](/?page=sim-tree&base=Gold%20Ring).

**Related posts**

- [PoE2 crafting cost variance: average, median and unlucky 10%](/en/blog/crafting-cost-variance/)
- [PoE2 Desecration and Omen of Necromancy: which side?](/en/blog/desecration-bone-sides/)
- [PoE2 mana ring craft: five targets cost 1,991 div](/en/blog/mana-ring-craft/)
