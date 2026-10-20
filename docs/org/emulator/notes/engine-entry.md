# エンジンの入口の使い方 (ジン部長、2026-10-20)

入口 = `src/services/craft-stage/engine.ts`。シミュ・チュートリアル・解析君はここから import する (中身は元のファイルのまま、名前を並べただけ)。
足りない名前はジン部長に言う (自分で craft-stage/ や vendor/poe2htc の中を直に読まない、自前の重み・確率の式を書かない)。案の元は共有メモ engine-dept-plan.md の ②。

## 1 手の確率 (新しく外に出した物、spec/odds.ts)
| 関数 | 引数 | 返す物 |
|---|---|---|
| `addHitOdds(data, item, key, omens, targets)` | key = 棚のキー (`augment_perfect`・`exalt`・`chaos_greater` …)、omens = お告げのキー、targets = `{ modId, minTierIndex }[]` (その段以上、どれか 1 つで当たり) | `{ p, n, side, total }` または null (MOD を足さない手)。p = 付く 1 つ目が狙いに当たる割合、n = この手で付く数、side = 付く 1 つ目がプレ / サフィに行く割合 (`{ prefix, suffix }`、両側が空の時の「候補の側に付く割合」はこれ)、total = 候補の重みの和 (0 なら打てない) |
| `fractureHit(data, item, targets)` | 今のアイテムと狙い | `{ p, pool }`。p = フラクチャー 1 回で狙いのどれかが固定される割合、pool = 固定できる MOD の数 (未発現の枠・冒涜の MOD は数えない)。壁つき 4 MOD・当たり 1 なら 1/3 |
| `addOddsBySpec(data, item, key, omens)` | 同上 | `{ cands, n }` (候補の MOD・側・段ごとの重み)。細かく見たい時 |
| `hitShare(cands, targets)` | addOddsBySpec の cands と狙い | 狙いの割合 (addHitOdds の p と同じ計算) |

- どれも **打つ処理と同じ候補** (空きのある側・下限・系統の塞ぎ・お告げの側・触媒・ルーンの置き場は item に差したルーンから)。アイテムレベルは item の物。
- 付け替えの目安: keep-compare・sim-greater・use-sim-calc の `wAt`/`totalAt` で割る所 → 狙いの状態のアイテムを作って (`freshItem` → `applyCurrency` で変成など) `addHitOdds(...).p`。「3 つに 1 つ」 → `fractureHit(...).p`。StageTargetSummary の shareOf → 白 (またはルーンを差した白) に `addHitOdds`。数字が変わったら解析君が並べる。
- n が 2 以上の手 (大いなる高貴・錬金) の p は 1 つ目だけ。全部の当たりは `aimOdds` (打って数える) を使う。

## 1 手の行き先 (2026-10-20、解析君の手 5 のために足した。spec/outcomes.ts)
| 関数 | 引数 | 返す物 |
|---|---|---|
| `stepOutcomes(data, item, key, omens, { merge? })` | key・omens は applyCurrency と同じ。merge = 行き先の区別の鍵 (同じ鍵は p を足して 1 つに、最初のアイテムを代表に) | `StepOutcome[]` (`{ p, item, added, removed, void? }`、p の和 = 1)。打てない時は `[]`、行き先で表せない手は `null` |

- 打つ処理と同じ planSpec・部品の選び方を、乱数で選ぶ代わりに枝に分ける: 消す (等しく・お告げの側・削り・光・未発現が先)、付ける (candidates の段ごとの重み、n 個付ける手は 1 つずつ)、骨 (側は unrevealedPlan、満杯の側は 1 つ消して)、フラクチャー (等しく)。エッセンスの MOD・レアリティは部品そのまま。
- `void: true` = 当たり所で不成立 (カオスが上限を超えた側に当たる・重みで選んだ側が固定だけ)。item は打つ前のまま。
- `null` の手: 発現 (候補から選ぶ = 選択。`revealOffers` を使う)、神・品質・ルーン・感情・フラックス・聖別、無限のエッセンス。
- 付いた MOD の数値は段の真ん中 (行き先の区別に数値は使わない)。区別は `merge` で決める (例: 札の状態・外れの数)。大いなる高貴のお告げ (2 つ付く) は merge を渡すと枝が掛け算で増えない (最後の 1 つを付けた所でまとめる)。
- 使い方 (解析君): 形ごとに代表のアイテムを 1 つ組み (startFrom で札の MOD、外れは置き場から)、`stepOutcomes(..., { merge: 形に戻す関数 })` の p を形の移り先の確率に。外れの中身で変わる分は近似として auto/ のコメントに。
- 確かめ (台本、scratchpad の使い捨て): 手袋・靴の 4 MOD・冒涜あり・満杯のアイテムで 19 手 × 2 = 38 通り、p の和が 1、打つ処理 (applyCurrency) を 2 万回打った頻度と行き先ごとに 4.5σ 以内 (最大 3.6σ)。速さは解析君が測る (1 回 0〜20ms、大いなる高貴が一番重い)。

## 段の下限 (2026-10-20 解析君の頼み事で足した)
- `orbFloor(kind, strength)`: kind = `transmute`・`augment`・`regal`・`exalt`・`chaos`、strength = `OrbStrength` (`base`・`greater`・`perfect`)。打つ処理 (spec/orb-specs) が使う下限そのもの。
- `CHAOS_FLOOR`: カオスの段の下限の表 (0 / 35 / 50、poe2db の Minimum Modifier Level)。`CURRENCY_FLOOR` にカオスは無いので、カオスはこちらか orbFloor で取る。

## ほかに並べた物 (グループ)
- 形: StageItem・StageMod・StageSide・PlayedStep・CraftStagePlan・PatchData・ItemBase・Mod・Force・Candidate・PobBlock
- 作る・打つ: freshItem・startFrom・startItem・playStep・playPlan・runPlan・applyCurrency・kindOf (カレンシーの種類)・omensFor・revealOffers・unrevealedOf
- 今を読む: allMods・listOf・room・limitOf・effectiveCls・maxQualityOf・catalystOf・SIDES・unfracturable・socketCapOf・dpsText・DEF
- 置き場・重み・段: loadHtcPatch・htcBaseInfo・htcBaseLimits・classOfBase・candidates・modTierWeight・floorKeepIndex・CURRENCY_FLOOR・CRAFTED_SOURCES・familiesOf・familyBlocked・occupiedKeysOf・modListFor・tierDisplayRanges・inGroup・isRemovedBase・classLabel
- 確率の表: heldOdds・heldAnyOf・aimTierKey・aimCombos・aimOdds・aimChain・aimDone・DESECRATION_EXCLUSIVE_COUNT・bossOmenAllowed・desecrationOmenForMod
- 名簿: OMEN_FOR・RUNES (stage-runes の物)・runeOf・isRune・runeEffectFor・withRunes・runeIdByName・ESSENCE_KEYS・essenceLevelOf・CATALYSTS・isEmotion・isShard・isGem
- 文: fillModText・jaUniqueText・tagLabel / 乱数: mulberry32

入口は `export *` を使わない (ワーカーを重くしない)。名前を足す・形を変える時はシミュ・チュートリアル・解析君に知らせる。
