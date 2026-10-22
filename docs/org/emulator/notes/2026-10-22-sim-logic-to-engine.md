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
