# シミュが自前で持っているゲームの中身の一覧 (2026-10-22 夜、シミュ部長 14 本目)

決まり 8 (オーナー 10-22 深夜「シミュに自我はいらない、足すのは UI/UX だけ、中身はエンジン。シミュ用の違いは入口の設定で」) に向けた洗い出し。読むだけ、直しはまだ。
範囲: src/services/simulator/tree/・start-cost.ts・src/views/simulator/ (52 本)。サブエージェント 2 本で全部読み、食い違いの指摘 2 点 (下の ※) は自分で確かめた。木の箱・枝・並べ・1 つ戻す・値段の足し算・中央値などの集計はシミュの仕事として外した。
「寄せる先」は engine.ts (入口) の名前。「足す設定」はジン部長に入口へ足してもらう案。

## A. 入口にもう有る物へ寄せるだけ (設定を足さずにできる)
| ファイル:行 | 関数 | 自前でしている事 | 寄せる先 |
|---|---|---|---|
| tree/tree-sample.ts:22-32 | `tierNo`・`aimHeld` | 狙いの当たり (同じ系統・同じ文・未発現を除く・段は tierName の T)。木のほぼ全部から呼ぶ | `aimHits(m, t, { data, sameText: true })` (9abbd784 で足し済み)。段 T → minTierIndex = tiers.length − T の換算は要る (下の B1) |
| tree/tree-hands.ts:9 | `isCatalyst` | `catalyst_` で始まるか。※ エンジンの kindOf は `jcatalyst_` もカタリスト (apply-currency.ts:85) で食い違う | `kindOf(key) === "catalyst"` |
| tree/tree-sample.ts:211-217 | `startItemOf` | マジックはノーマルから・フラクチャーがあればレア・ルーンのソケット数 | `startFrom` (StartSpec.rarity・sockets・runes) |
| tree/TreeStartPick.vue:46・use-tree.ts:179 | | フラクチャー済みはレア / ノーマルは MOD 無し | `startFrom` |
| tree/TreeStartPick.vue:67 | `RANDOM_MAX = 5` | レアは 6 つまでの決め打ち | `limitOf` / `room` |
| start-cost.ts:93・135 | `fside`・`fracSide` | 側を `m.type === "suffix"` で判定 | `sideOfMod` |
| start-cost.ts:91 | `abyss` | 深淵のエッセンスの鍵を手書き | `ESSENCE_KEYS` |
| use-sim-targets.ts:70・71 | | 側を生の type から / CRAFTED_SOURCES を vendor から直に import | `sideOfMod`・入口の `CRAFTED_SOURCES` |
| use-sim-targets.ts:178-186 | `runeChoices` | ソケットの残りでルーンが差せるか | `runeEffectFor` / `socketCapOf` |

## B. 入口に関数・設定を足してもらう (ジン部長へ)
| # | 足す物 (案) | 消える自前の所 |
|---|---|---|
| B1 | 段の換算 `tierIndexOf(data, modId, T)` / `tierRankOf(data, modId, index)` (+ ilvl)、`aimLabel` を入口に | tree-base-cost.ts:35 `ixOf`・use-tree-search.ts:24-26・use-tree.ts:194-200 `fitIlvl` (→ `minIlvlFor(data, aims)`)・use-tree.ts:226-239 `aimLabel`・`startModLabel`・TreeModPick.vue:45・56・TreeHandShelf.vue:117-121 (tierName の正規表現)・use-sim-targets.ts:73・79 |
| B2 | 外れの数え `junkOf(data, item, targets, { sameText })` (側ごとの数も) | tree-sample.ts:50 `junkCount`・tree-run.ts:105-107 `splitTo`・192-197 `itemKey`・tree-check.ts:245・tree-row-tags.ts:14-19 |
| B3 | 「付いている狙いの組」`heldSetOf(data, item, aims)` | tree-run の `matchTargets`・`heldSets` (tree-merge.ts・SimTreePage の自動でつなぐ) |
| B4 | 手の働き `effectOf(key)` = add / remove / swap / quality… | tree-hands.ts:11-16 `kindOfCurrency`・tree-run.ts:244・TreeHandShelf.vue:42・47・106・`canSpam` (カオス決め打ち) |
| B5 | カタリストを最大まで `applyCurrency(…, { fillQuality: true })`・`qualityFull(item, key)`・`catalystForMod(data, modId)` | tree-sample.ts:122-132 `fillCatalyst` (※ 止める条件が `quality` だけ、指輪などはエンジンでは `catalystQuality` に入る (apply-currency.ts:193)。今は打てなくなった時の break で止まっている見込み)・159・165・TreeHandShelf.vue:68-82・158 |
| B6 | 触媒のお告げの前のカタリスト `applyCurrency(…, { catalyst: key })` / `prereqOf(key, omens)` | tree-sample.ts:163・SimTreePage.vue:165 (手を自動で差し込む)・tree-check.ts:77 |
| B7 | フラクチャーで固定する MOD `applyCurrency(…, { fractureOf: modId })`・結果に「今回固定された MOD」 | tree-sample.ts:57-73 `outcomeOf` の差分探し・170-176 の force で打ち直し |
| B8 | 発現で選ぶ条件 `applyCurrency(…"reveal", { pick, echo })`・反響を骨の側へ分ける `splitOmens` | tree-sample.ts:191-201 `reveal`・tree-hands.ts:20-29 `ECHO`・`engineOmens`・TreeHandShelf.vue:91 |
| B9 | お告げの許し `omensAllowedFor(key)` (発現込み)・`CATALYSING_OMEN`・`isCatalystKey` | TreeHandShelf.vue:63 (views/craft-stage/held-omens を使用)・tree-names.ts:53・56・TreeHandChip.vue:18 |
| B10 | 始まりの乱数の MOD `StartSpec.random?: number`・フラクチャーは 1 つまでを startFrom が断る | tree-sample.ts:226・231 (高貴 / 増強の決め打ち)・use-tree.ts:170 `goalItem`・TreeStartPage.vue:17・TreeStartPick.vue:34・49・74・TreeMemoFloat.vue:65 |
| B11 | 打てるか `canUse(data, item, key, omens, { randomOk, catalystFill })` | tree-sample の `handProblem`・TreeHandShelf.vue:161・use-tree-link.ts:18-24・use-sim-shelf.ts:21-26 |
| B12 | この手で付きうる狙い `reachableAims(…)`・結果を狙いで分ける `stepOutcomes(…, { classify: aims })` | TreeHandShelf.vue:130-140 (見本 4・8 つで判定)・tree-sample.ts:97 `singleOutOf` (force の鍵を手で組む → `forceKey` も) |
| B13 | MOD の群れ `modListFor(…, { use: "hit" \| "start" })`・ListTier に数の tier | TreeModPick.vue:29・45 |
| B14 | ルーン `runesFor(data, item)`・`runesNeededFor(data, targets)`・`socketCapOf(…, { overcap })` | TreeStartPick.vue:58 (sockets: 1 で試し打ち)・use-sim-targets.ts:96-122・272-273 |
| B15 | 1 人分の要約 `itemSummary(data, item, targets)` | use-sim-targets.ts:197-216 `patternStart` |
| B16 | 貼り付けの素の値の文 (parseItemText に rawText) | SimPasteRead.vue:42-49 |

## C. 丸ごとの計算 (入口へ移すか、決めが要る)
- 100 人回す tree-run (`runTreeSteps`、use-tree-run.ts:51)・ルート精査 tree-check (`checkTreeAsync`)・見本 tree-sample (`sampleOf`・`playHand`): 打つ処理はエンジンの applyCurrency / stepOutcomes を呼んでいるが、上の B の決まりを中に持つ。B を入口に足して中身を寄せれば、残るのは「木を辿る」だけ (= シミュの仕事) になる見込み。入口に `runTree(data, doc)` を作るかはブラックの判断。
- start-cost.ts (③ の式、ツリーのベースの値段 tree-base-cost・use-sim-calc が使う): 75-76 `pAt` (候補の確率を足して 1 で切る)・78-83 等級の表と落とし方・98 `magicLoopCounts` (sim-greater.ts、「仮」)・113 高貴の数 1 − pHit。寄せる先 `addHitOdds`・`spamCounts`・`orbFloor`。入口に「どれか 1 つの候補の組」を受ける形が要る。確率の式なので解析君の確かめも要る。
- 取引所の検索 use-tree-search.ts:31 (`tradeFiltersFor`、htc/buy-or-craft): 取引の側、急ぎではない。

## 入口を通らない import
- 木の 8 本・start-cost.ts の craft-stage の import は全部 engine.ts 経由。
- 間接: sim-methods.ts (tree-base-cost が使う) → craft-stage/run-plan・stage-core・vendor/poe2htc/engine/types。pattern.ts (start-cost が使う) → vendor の probability・runes・htc/essence-key-table・craft-stage/stage-runes (入口に同じ名前あり)。
- views: use-sim-targets.ts:7-14 (htc/sockets・htc/mod-text・mods/stat-scale・vendor の pool・craft-stage/stage-runes・simulator/pattern・quiz-build)、use-sim-calc.ts:7 (start-cost)、TreeHandShelf.vue:15 (views/craft-stage/held-omens)、use-tree-search.ts:8 (htc/buy-or-craft)。
- 旧 ③ の use-sim-targets・use-sim-calc は今は台本 (scripts/_start-cost-probe) だけが使う (README の地図)。寄せるより消すかの判断が先。

## 進め方の案
1. A は今すぐシミュ部長でできる (振る舞いが変わる所は isCatalyst の jcatalyst_ だけ)。
2. B は B1 (段の換算) → B2・B3 (外れ・狙いの組) → B4・B5 の順が効く (呼ばれる所が多い順)。ジン部長に足してもらい、足した物から置き換える。
3. C はブラックが決める (tree-run・tree-check を入口へ移すか、B で中身だけ寄せるか)。
