---
title: PoE2 Gold Ring Craft: Decoding the Steps and the Breach Bait
description: We traced a PoE2 Gold Ring craft from a video, fixing misheard captions into poe2db names. Why the +20% to Maximum Quality from an Essence of the Breach is removed with an Omen of Whittling after reaching 40% Quality.
date: 2026-10-22
tags: Gold Ring, Essence of the Breach, Omen of Whittling, Quality, captions
tree: /?page=sim-tree&base=Gold%20Ring
craft: /?base=Gold%20Ring
draft: true
---
We decoded a PoE2 Gold Ring craft from a video, step by step, fixing misheard Japanese captions into poe2db names. The "+20% to Maximum Quality" added midway is **a ladder to 40% Quality and bait that an Omen of Whittling is sure to remove**.

We worked through a video that crafts a caster Gold Ring loaded with Rarity, naming every step. The Japanese auto-captions mishear a lot, so the steps can't be copied as they are. We rechecked every name against video frames (the in-game text on screen) and poe2db. Once the names are right, it also becomes clear why the video adds "+20% to Maximum Quality" only to remove it again.

## Fixing the Captions

The captions are Japanese, so the left column is what the auto-captions printed (romanised meaning in brackets).

| Caption (Japanese) | What it really is | Checked on |
|---|---|---|
| ち性 (garbled) | Intelligence (of the Savant, T2) | screen |
| 歴体勢 / レキ体制 (garbled) | Cold Resistance (of the Ice T2 / of the Polar Bear T3) | screen |
| 上級エグザ / 上級後期 | Greater Exalted Orb | poe2db |
| 冒ト / 冒徳 | Desecration (rings use Collarbones) | poe2db |
| マ消 | Omen of Sinistral Erasure | poe2db |
| 削減 | Omen of Whittling | poe2db |
| ブリーチエッセンス | Essence of the Breach | poe2db |
| アザーワールド ("other world") | otherworldly modifiers (Desecration with an Altered Collarbone) | poe2db |
| "Exalted Essence" (an earlier reading) | wrong: it is the Greater Exalted Orb | captions and screen |

The finished ring has six mods, and all six match the owner's screenshot of a finished copy. Prefixes: Spell Damage (Glyphic, Fractured), increased Rarity of Items found (Hoarder's, T1), and added Cold damage (Tempest Rider's, Desecrated). Suffixes: all Elemental Resistances (of the Rainbow, T1), increased Rarity of Items found (of Archaeology, T1) and Cast Speed (of Legerdemain, T1).

## The Steps

| Step | What was used | What it did |
|---|---|---|
| 1, 2 | Orb of Annulment | Clear extra mods from a base with Spell Damage |
| 3 | Divine Orb → Desecration → Fracturing Orb | Roll Spell Damage to 34, then fracture it (needs 4+ mods) |
| 4a | Chaos Orb | Spam on the two-mod item until suffix Rarity T1 rolls |
| 4b | Omen of Sinistral Exaltation + Greater Exalted Orb → Omen of Sinistral Crystallisation + Essence of the Breach | Add a bait prefix, then swap it for "+20% to Maximum Quality" |
| 4c | Skittering Catalyst → Omen of Catalysing Exaltation + Omen of Dextral Exaltation + Greater Exalted Orb | Aim Cast Speed at 40% Quality |
| 4d | Sibilant Catalyst | Switch the Quality to 40% Caster Modifiers |
| 5 | Omen of Whittling + Chaos Orb | Remove Maximum Quality and add one new mod |
| 7 | Omen of Sinistral Erasure + Perfect Chaos Orb | Turn the Evasion prefix into Rarity T1 |
| 8 | Altered Collarbone | Desecrate and pick Tempest Rider's (cold) |

The "Omen of Sinistral Crystallisation + Runic Alloy" step explained mid-video (step 6) was not used on this ring. We confirmed on screen that the finished ring has no mod from the Runic Alloy.

## Why Add "+20% to Maximum Quality" Just to Remove It

Steps 4b to 5 look like a detour: a whole mod slot is spent on "+20% to Maximum Quality," which is removed right after Quality is added. It works because of three properties together:

1. **Quality stays when the mod goes.** The normal Quality cap is 20%, but with "+20% to Maximum Quality" you can reach 40%. Removing the mod afterward leaves the 40% Quality in place.
2. **The mod is modifier level 1.** The "+20% to Maximum Quality" from an Essence of the Breach has modifier level 1.
3. **Omen of Whittling removes the lowest-level mod.** The next Chaos Orb removes the non-Fractured mod with the lowest modifier level. A level-1 mod is almost always the one chosen.

So "+20% to Maximum Quality" is both a ladder to 40% Quality and bait for the Omen of Whittling. You can try the Essence of the Breach and the Omen of Whittling on a Gold Ring on the [crafting bench](/?base=Gold%20Ring). In the video, step 5 used Whittling + Chaos, the Maximum Quality mod disappeared, and Evasion T2 appeared in its place.

We also ran on the engine whether 40% Quality makes the suffixes cheaper. In the calculation for the three suffixes (fill to three, then annul; Perfect Exalted Orb with the Catalysing Omen, Greater Exalted Orb otherwise), 20% Quality cost 528 div per ring and 40% Quality (bait, Crystallisation and Breach included) cost 492 div. With 50 runs each, the margin is ±25%, so the difference is within the noise. The value of 40% is in the finished numbers rather than the cost (another method from the same calculation is in [Don't Hoard Your Misses](/en/blog/dont-hoard-misses/)).

## How a Level-47 Mod Came from a Perfect Chaos Orb

At step 7, a Perfect Chaos Orb rolled Hoarder's (Rarity T1, modifier level 47). poe2db lists the Perfect Chaos Orb's minimum modifier level as 50, so read literally it shouldn't roll.

The game's keyword text for minimum modifier level explains it: added mods are at least that level "except if a specific Modifier type would be excluded entirely." Hoarder's is the top tier of prefix Rarity, and no tier reaches level 50. When the floor would remove a whole mod type, its top tier stays in. The ExileDesk engine handles it the same way.

## Where the Names and Numbers Come From

- Names, tiers and modifier levels: poe2db's ring pages (Japanese and English). The step order: video frames (in-game text) and captions. The moments of Desecration and fracturing are not shown on screen and remain unconfirmed.
- The 20% versus 40% comparison: the ExileDesk engine, 50 runs each. Not compared with Craft of Exile.

You can try the same route from a Gold Ring in the Craft route tree.

**Related posts**

- [PoE2 ring suffix craft: annul misses early](/en/blog/dont-hoard-misses/)
- [PoE2 Cast Speed weight on poe2db](/en/blog/poe2db-cast-speed-weight/)
- [PoE2 Sanctify and Quality order](/en/blog/sanctify-quality-order/)
