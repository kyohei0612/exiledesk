# シミュの自前の式を入口へ (2026-10-22 夜、ジン部長 5 本目、ブラック 7 代目の頼み)

元: docs/org/simulator/notes/2026-10-22-sim-own-logic.md の B1〜B5 と C。振る舞いはシミュの今の式と同じ (台本で突き合わせ、台本は消した)。シミュのファイルは触っていない、置き換えはシミュ部長。

| 段 | 入口 (services/craft-stage/engine.ts) | 中身 | 突き合わせ |
|---|---|---|---|
| A の続き | `aimHits(m, t, { data, sameText: true })` (9abbd784) | 同じ系統で文も同じ別の modId も当たり、段は段の名前の T | aimHeld と見本の木 10,340 回・組 800 組の総当たり 347 万回で 0 |
| B1 | `tierIndexOf`・`tierRankOf`・`tierNoOf`・`minIlvlFor`・`tierRankLabel` (tier-rank.ts) | 段の番号 ↔ T、適正のレベル (= fitIlvl)、「T2 以上」の札 | 全 MOD の 20,218 段・適正 25 通りで 0。aimLabel は画面の仕事なので残す |
| B2・B3 | `junkOf`・`heldSetOf`・`isAimMod` (aim-odds.ts) | 外れ (固定でも狙いでもない、側ごと)・付いている狙い | 見本 1,900 個 (外れあり 1,002) で 0。heldSets・matchTargets は木をたどる仕事なので残す |
| B4・B5 | `effectOf`・`catalystTagOf`・`catalystFull`・`fillCatalyst`・`catalystForMod` (hand-effect.ts) | 手の働き・カタリストを最大まで | 鍵 37 本・936 回で 0。catalystForMod は 378 回中 144 回違う = 全部「その装備に品質が乗らない」(靴・鎧) でエンジンは null (catalystBoosts)。シミュは null の時に並びの 1 つ目へ。canSpam は画面の決めなので残す |
| C | `magicAddOdds`・`anyOfAddOdds`・`addGradeFor`・`ADD_GRADES` (magic-odds.ts) | start-cost の magicAugOdds・pAt・等級の落とし方 | 見本の木のベースと狙いの 1 つ・2 つの組 37 通りで 0 |

## C で残る物と解析君への材料
- magicLoopCounts (候補 2 つ以上の【仮】の式): 入口の `spamCounts(data, white, "augment", grade, [], { anyOf: members })` がもう「どれか」を受ける (J9)。シミュがそれに置き換えれば仮の式は消せる。数字が変わるので解析君の突き合わせ (今の式とエンジンは 3% 以内と step4-formula-entry.md にある)。
- pHit (= pAt): 候補ごとの「自分の側に付いた時の割合」の和で、側の割合 (share) で重みを付けていない。側の割合込みで 1 回で候補のどれかが付く割合 `pAny` も返すようにした。見本で pAny ÷ pHit = 0.31〜0.70 (真ん中 0.60)。pHit は magicLoopCounts と「高貴 × (1 − pHit)」に入っているので、どちらが正しいかで費用が変わる。解析君に確かめてもらう。
- 高貴の数 1 − pHit は費用の組み方 (シミュ) なので入口には足していない。

## B6〜B16 (10-22 深夜、ジン部長 6 本目)
振る舞いはシミュの今の式と同じ (台本で突き合わせ、台本は消した)。シミュのファイルは触っていない、置き換えはシミュ部長 15 本目。

| 段 | 入口 | 中身 | 突き合わせ |
|---|---|---|---|
| B11 | `canUse(data, item, key, { omens, catalyst })`・`handOmens`・`CATALYSING_OMEN` (can-use.ts) | 打てるか (お告げの omenBlock → 触媒の前のカタリスト → 手)、反響は骨に掛けず発現の側へ | handProblem と 42,804 通りで 0 |
| B12 | `aimDiff`・`outcomesByAim`・`reachableAims`・`forceKey` (aim-reach.ts) | 前後の狙いの付いた・消えた・外れ減・新しい ✦ と、この手で付きうる狙い | outcomeOf と 17,451 通り (フラクチャー 1,701)、付きうる狙いと 1,152 通りで 0 |
| B6〜B8 | `applyHand(data, item, key, rng, { omens, catalyst, fractureOf, reveal })`・`revealBy`・`ABYSSAL_ECHO_OMEN` (hand-use.ts) | playHand の 1 回分 (触媒の前のカタリスト・フラクチャーで固定・骨の後の発現、反響の引き直し) | playHand と 62,400 通り (フラクチャー指名 1,260・骨 6,948) で 0 |
| 上限 | `STEP_OUTCOMES_MAX` (5 万)・`stepOutcomesOrTooMany`・`stepPool` (spec/outcomes.ts) | 1 部品の枝が上限を超えたら stepOutcomes は null ("tooMany")。reachableAims は数え上げずに最後の足す部品の候補の池で答える (ブラックの頼み) | 前の答えと 9,252 通り (何個も足す 1,476) で 0。錬金 ilvl 82 は 0.2 秒 |
| B9 | `omensAllowedFor`・`isCatalystKey` (can-use.ts) | 持った物に掛けられるお告げ (views/craft-stage/held-omens の中身、held-omens は同じ名前で出すだけ) | 中身を移しただけ |
| B10 | `startWith(data, base, ilvl, { rarity, mods (T), runes, random }, rng)`・`START_FRACTURE_MAX` (start-with.ts) | startItemOf と同じ組み方 (force の鍵)。フラクチャー 2 つ以上は断る (startFrom は今のまま) | startItemOf と 6,480 通りで 0 |
| B13 | `modListForUse(data, item, "hit" \| "start")`・`MOD_USE_GROUPS`・ListTier.tier (mod-list.ts) | 当たり / 始まりの MOD の群れと並び | TreeModPick と 64 一覧・段 4,798 で 0 |
| B14 | `runesFor(data, item)` (rune-choice.ts) | ベースに差せる今のルーンと効果 | runeChoices と 242 で 0 |
| B16 | `modRawText` (item-text.ts) | 貼り付けの MOD の素の値の文 | rawText と見本 63 行 (上乗せ 8) で 0 |
| B15 | — | use-sim-targets.ts が消えた (665bfe7b) ので要らない | — |

気付き: stepOutcomes は前は錬金など 3 つ以上足す手で枝が掛け算に増えて固まった (台本でメモリ切れ)。今は上限で null。解析君の auto-engine も stepOutcomes を直に呼ぶので、上限を超える手では null が返る。
