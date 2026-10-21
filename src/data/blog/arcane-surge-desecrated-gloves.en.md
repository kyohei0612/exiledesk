---
title: PoE2 Arcane Surge Desecrated Gloves: Where It Rolls and How Often
description: In PoE2, the Desecrated Arcane Surge mod (of Kurgal) only rolls on gloves with Intelligence; on Intelligence gloves it is one of 15 Desecrated mods. It appears among the 3 reveal options 7.4% of the time on the ExileDesk engine. Which bone to use, and why Craft of Exile can't calculate it either.
date: 2026-10-22
tags: Desecration, Arcane Surge, gloves, Rib, Kurgal
craft: /?base=Sirenscale%20Gloves
image: img/arcane-surge-desecrated-gloves-og.en.png
ready: true
---
In PoE2, the Desecrated Arcane Surge mod (of Kurgal: "(10–15)% chance to Gain Arcane Surge when you deal a Critical Hit") rolls only on **gloves with Intelligence** (Intelligence, Strength/Intelligence and Dexterity/Intelligence). On Intelligence gloves it is one of 15 Desecrated mods, and on the ExileDesk engine it appeared among the three reveal options 7.4% of the time.

:::zundamon normal
There's an ES glove craft that fills one suffix with a Desecrated Arcane Surge.
:::

:::metan normal
There is. But when we looked into it, we found claims like "only on Intelligence gloves" and "nine Desecrated mods."
:::

:::zundamon surprised
Which one is true?! Please count them again.
:::

:::metan happy
We recounted on poe2db and Craft of Exile. Let's go through it step by step.
:::

:::summary What you'll learn
- Arcane Surge rolls only on gloves with Intelligence (Intelligence, Strength/Intelligence, Dexterity/Intelligence). Intelligence gloves have 15 Desecrated mods
- You pick one of three options on Reveal, so the odds are not 1/15 but "shows up among the options": **7.40%** on the engine
- A Preserved Rib (6.75 Exalted Orbs) is enough. Craft of Exile can't calculate Desecration weights either
:::

:::tip New to this? Words used here
- **Desecration**: a craft that uses a bone to add one Unrevealed mod
- **Reveal**: turning an Unrevealed mod into a real mod by picking one of three options
- **Amanamu / Kurgal / Ulaman**: the three names Desecrated mods are grouped under. Arcane Surge is a Kurgal mod
- **Rib**: the bone used to Desecrate armour such as gloves
- **Minimum Modifier Level**: a floor; mods below this modifier level can't roll
- **Omen of Light**: makes your next Orb of Annulment remove only Desecrated mods
:::

## Arcane Surge Rolls Only on Gloves with Intelligence

Every Desecrated mod on gloves is a suffix with modifier level 65. The count depends on the glove's attributes.

:::zundamon normal
I heard it only rolls on Intelligence gloves.
:::

:::metan normal
Close. It rolls on any gloves that *include* Intelligence, so Strength/Intelligence and Dexterity/Intelligence gloves get it too.
:::

| Glove attributes | Desecrated mods | Breakdown (Amanamu / Kurgal / Ulaman) | Arcane Surge |
|---|---:|---|---|
| Intelligence | 15 | 3 / 5 / 7 | yes |
| Strength | 11 | 3 / 3 / 5 | no |
| Dexterity | 13 | 5 / 3 / 5 | no |
| Strength + Intelligence | 15 | 3 / 5 / 7 | yes |
| Dexterity + Intelligence | 17 | 5 / 5 / 7 | yes |
| Strength + Dexterity | 13 | 5 / 3 / 5 | no |

Only gloves with Intelligence get five Kurgal mods, and Arcane Surge is one of them.

:::zundamon surprised
Not nine at all. Intelligence gloves have 15!
:::

:::metan normal
Right. Kurgal's five are Arcane Surge, Cast Speed while on Full Life, Mana Cost Efficiency, Dexterity and Intelligence, and Cold and Chaos Resistance.
:::

:::metan normal
Craft of Exile also lists 15 Desecrated suffixes for Intelligence gloves (Item Level 82). That matches poe2db.
:::

:::zundamon normal
There's an Omen that guarantees a Kurgal mod. Can't we just use that?
:::

:::metan troubled
That's the Omen of the Blackblooded. Its poe2db text says "weapon or jewellery," so it can't be used on gloves (armour).
:::

:::metan normal
So on gloves, you draw from all 15.
:::

## The Odds Are Not 1/15 but 7.4% to Show Up Among the Options

An Unrevealed mod from Desecration lets you **pick one of three options** when you Reveal it. So the odds are "how often Arcane Surge is among the three options."

:::zundamon normal
One out of 15 means 1/15, right?
:::

:::metan normal
That's the catch. Three options are shown, and you can pick it if it's any one of them.
:::

:::zundamon normal
Are all three options Desecrated mods?
:::

:::metan normal
The engine shows 1, 2 or 3 Desecrated-only mods at 85% / 14% / 1%. That's a community count of 563 tries on rings.
:::

:::metan normal
The other options are normal mods picked by weight. Two mods from the same group never appear together.
:::

| Desecrated-only mods among the options | Share | What happens |
|---|---:|---|
| 1 | 85% | The usual case. The other two are normal mods |
| 2 | 14% | More chances for Arcane Surge to show up |
| 3 | 1% | All three are Desecrated-only mods |

Most of the time, only one Desecrated-only mod is among the options.

:::zundamon normal
So how often does Arcane Surge show up among the options?
:::

:::metan normal
We Desecrated Intelligence gloves with full prefixes (Sirenscale Gloves, Item Level 82) using a Preserved Rib.
:::

:::metan happy
Counting the reveal options 5,000 times, Arcane Surge was there **7.40%** of the time.
:::

| How to count | Odds | Why |
|---|---:|---|
| One of 15 (1/15) | not used | You pick from three options on Reveal, so this doesn't fit |
| Among the three options (engine, 5,000 times) | **7.40%** | Assumes all Desecrated-only mods have equal weight |

:::zundamon troubled
Is 7.40% an actual count on gloves?
:::

:::metan troubled
No. Nobody has published the weights between Desecrated-only mods, so the engine treats them all as equal. It isn't a measurement on gloves.
:::

:::zundamon normal
What if it doesn't show up?
:::

:::metan normal
An Omen of Abyssal Echoes lets you draw one more set of options.
:::

### When It Misses, Remove It with Omen of Light

If it still misses, remove the unwanted Desecrated mod and Desecrate again.

:::zundamon normal
Just remove it with an Orb of Annulment.
:::

:::metan troubled
With Omen of Dextral Annulment, it can also take out a target mod sitting next to it. In the [ES gloves article](/en/blog/es-gloves-greater-exalt/), that changed the cost a lot.
:::

:::metan happy
With Omen of Light, your next Orb of Annulment removes only Desecrated mods. You take off just the miss.
:::

| How to remove | What gets removed | Which is better |
|---|---|---|
| Omen of Dextral Annulment | Can take out a target mod next to it | You may lose a target mod |
| Omen of Light | Desecrated mods only | **Better** (removes only the unwanted Desecrated mod) |

## A Preserved Rib Is Enough

Gloves (armour) are Desecrated with Ribs. Craft of Exile showed this for Item Level 82 Intelligence gloves.

:::zundamon normal
If I use the most expensive bone, do I hit more often?
:::

:::metan normal
Look at the table. The price gap is huge.
:::

| Bone | Shown | Market (Exalted Orbs) | Verdict |
|---|---|---:|---|
| Gnawed Rib | unusable (Item Level 64 max) | 6.39 | Can't be used on these gloves |
| Preserved Rib | usable | 6.75 | **The natural pick** |
| Ancient Rib | usable (Minimum Modifier Level 40) | 4,702 | Removes none of the Desecrated mods |

:::zundamon surprised
The Ancient Rib costs 4,702 Exalted Orbs!
:::

:::metan normal
And every Desecrated mod is level 65. A Minimum Modifier Level of 40 removes none of them.
:::

:::zundamon normal
So changing the bone doesn't change what's in the options?
:::

:::metan troubled
Neither poe2db nor Craft of Exile says, and we haven't checked it.
:::

:::metan happy
Given the price gap, a Preserved Rib is the natural pick for gloves at Item Level 65 or above.
:::

### Which Side It Lands On

Which side a Desecrated mod lands on follows Craft of Exile, and the engine does the same.

:::zundamon normal
Does Desecration go on the prefix side or the suffix side?
:::

:::metan normal
If both sides are open, it's half and half. If both are full, one non-Fractured mod is removed at random and it goes on that side.
:::

:::metan normal
Glove Desecrated mods are suffixes only. So with full prefixes, it lands in the suffixes.
:::

## Craft of Exile Can't Calculate Desecration Weights Either

We also checked whether an outside calculator can confirm the odds.

:::zundamon normal
Craft of Exile should give the right odds.
:::

:::metan troubled
Here's the thing: Craft of Exile's Desecrated table has no weight column.
:::

:::metan troubled
Pick Desecration and a bone, and it shows "No handler for crafting this method." The odds calculation doesn't run.
:::

:::zundamon troubled
So there are no numbers for Desecration weights anywhere...
:::

:::note fold Not yet verified (2)
- 7.40% comes from the engine's assumption that all Desecrated-only mods have equal weight. It is not a count on gloves.
- Whether the bone changes what appears in the reveal options is not stated on poe2db or Craft of Exile, and is unverified.
:::

Arcane Surge rolls only on gloves with Intelligence, and it shows up among the three reveal options 7.40% of the time on the engine. A Preserved Rib is enough, and Omen of Light is the shortcut for removing misses.

## Where the Numbers Come From

:::fold Show sources (3)
- Counts and names by attribute: poe2db's six glove pages. The 15 on Intelligence gloves also match Craft of Exile's screen.
- 7.40%: the ExileDesk engine, 5,000 tries. It assumes equal weights for Desecrated-only mods; it is not a measurement on gloves.
- Bones: Craft of Exile's screen. Prices: ExileDesk server market (2026-10-20 16:00 UTC).
:::

## Try It Yourself

You can Desecrate gloves on the [crafting bench](/?base=Sirenscale%20Gloves) to see how the options come up.

**Related posts**

- [PoE2 Energy Shield Gloves Craft: Greater Exalt Beats Perfect](/en/blog/es-gloves-greater-exalt/)
- [PoE2 Kolr's Hunt Gloves: Where +2 Projectile and Crit Chance Come From](/en/blog/kolrs-hunt-gloves/)
- [PoE2 Desecration Weights: Nobody Knows, So We Made Them Equal](/en/blog/desecration-weights/)

VOICEVOX: Zundamon / Shikoku Metan
