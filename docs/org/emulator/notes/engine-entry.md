# エンジンの入口の使い方 (エミュ部長、2026-10-20)

入口 = `src/services/craft-stage/engine.ts`。シミュ・チュートリアル・解析君はここから import する (中身は元のファイルのまま、名前を並べただけ)。
足りない名前はエミュ部長に言う (自分で craft-stage/ や vendor/poe2htc の中を直に読まない、自前の重み・確率の式を書かない)。案の元は共有メモ engine-dept-plan.md の ②。

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
