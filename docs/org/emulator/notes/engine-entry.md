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

## 貼り付けたアイテムを読む (2026-10-20、シミュレーター ① のために足した。item-text.ts・形は item-text-types.ts)
`parseItemText(data, text): ItemTextResult` — トレード (trade2) / poe.ninja / ゲームの Ctrl+C・Ctrl+Alt+C、日英。投げない (読めなければ `base: null`)。

```ts
interface ItemTextResult {
  source: "game" | "game-advanced" | "ninja" | "trade" | "unknown"; lang: "ja" | "en";
  name: string | null; base: { en: string; ja: string } | null; cls: string | null;   // cls = エンジンのクラス (Rings …)
  rarity: "normal" | "magic" | "rare" | "unique" | null; itemLevel: number | null;
  quality: { value: number; tag: string | null; label: string } | null;            // tag = カタリストの種類 (attack・caster …)
  implicits: { text; from: "base" | "rune" | "enchant" | "extra"; template; values }[]; // MOD に数えない
  mods: { text; modId: string | null; source: string; side: "prefix" | "suffix" | null; sideFrom: "engine" | "paste";
          tier: { index; of; label: "T1"…; name; fits: boolean } | null; values: number[];
          fractured; desecrated; crafted; unrevealed: boolean; pasteTierName?: string }[];
  count: { prefix; suffix; limit: { prefix; suffix } };   // 未発現を含む
  corrupted: 0 | 1 | 2; flags: string[]; sockets: { count: number | null; runes: string[] };
  grants: string[]; properties: string[]; price: string | null;
  skipped: { line; code: "noBase" | "unknownText" | "notInPool" | "dropOnly" | "hybridPart"; reason: { ja; en } }[];
}
```
- 暗黙: 注記 (`(implicit)` `(rune)` `(enchant)`)・Ctrl+Alt+C の見出しがあればそれ。無ければベースの暗黙 (`htcBaseInfo()[base].implicits` の en/ja) と数字を除いた文で照らし (暗黙 1 つにつき 1 行)、**最後に当たった暗黙より前の行**は、差したルーン・ソウルコアの効果 (部位は runeCategoryOf、「手袋として得る」指輪は手袋) と文が同じなら `rune`、コラプトした物なら `enchant` (コラプトの結果は poe2db の Vaal Orb で Corrupted Enchantment)、どちらでもなければ `extra` (10-20 夜、見本 3 のゴールド 10% と見本 5 のスピリット +30 はアズカパのソウルコア = 手袋: ゴールド 10%、マーシャル武器: スピリット +15 × 2)。
- コラプト / 二重コラプト (Corrupted / Twice Corrupted) は `corrupted` に読むだけ。MOD の数え方は変えない。
- コラプトの印 (10-20 J1b、オーナー「コラプトの MOD 一覧はエンジン部が持つ」): `ItemTextCorruption = { status: "table" | "unknown"; kind?: "enchant" | "upgrade"; id?; range?; fits? }`。コラプトした物の暗黙の前の行 (ルーンでない物) は `from: "corruption"` + `corruption` (表と照らす)、置き場に無い行は表にあれば暗黙側 `corruption`、無ければ skipped `corruptionUnknown`、値が段に入らない MOD は `mods[].corruption = { status: "unknown" }`。表は `corruptionRowsFor(cls)`・`matchCorruption(cls, text, template, values)` (mods/corruption.ts、poe2db の部位のページの corrupted = enchant / corruption_upgrade = upgrade を scripts/build-corruption-mods.mjs で写した corruption-mods.json、44 部位 1160 行、英語の型に当たらない 94 行は日本語の文で照らす。写しは 10-18、ジュエルのページは写しに無く空)。見本: 3・8 のダメージ 56% = CorruptionUpgradeAllDamage1 (40—60)、4 のクリダメ 31% = CorruptionUpgradeCriticalStrikeMultiplier1 (30—50)、4 の「コラプト状態のアイテム 1 個ごと…」「コラプト化は常に変化…」は unknown。
- 注油 (10-20 J4 ③): 「Allocates <ノータブル>」/「<ノータブル> を割り当てる」で、名前が注油の一覧 (`anointNotables`・`anointOfLine`、mods/anoint.ts) にある行は、どの形でも暗黙側の `enchant`。
- 「W」「P」の行・種類の名前の行 (「指輪」「Ring」) は読み飛ばす。`~b/o …` は `price`。`物理ダメージ: …` などの基本値は `properties`。`スキルを付与:` / `Grants Skill:` は `grants`。
- MOD: 計算機と同じ繋ぎ方 (`targetsFor`) で modId。置き場の索引に無い物 (液化した感情の MOD など) は同じクラスの MOD を文で引く。**段は打つ処理の表示の式を割り戻して引く**: 表示 = floor(素 × (1 + (品質 + 反対側の「側の効果」) / 100))、品質が効くかは `catalystBoosts` (指輪・アミュレットは MOD のタグ、ジュエルは中身のタグ)。`fits: false` = どの段にも収まらず ilvl の一番上とした。
- 未発現のプレ / サフィ (`未発現サフィックス` / `Unrevealed Suffix`) は `mods` に `unrevealed: true`・`modId: null`・`source: "desecrated"` で 1 つ。
- 見本 = notes/paste-samples/ (オーナーの 8 個)。確かめ (台本、scratchpad の使い捨て、10-20): 1 指輪 6 (P3/S3)・2 スピア 3 + 未発現 1・3 グラスピング 2 + 未発現 1 (暗黙の前 2 行は extra)・4 グラスピング 1 (extra 3)・5 クロスボウ 5 + notInPool 1 (グレネードのクールダウン使用回数)・6 鉄の指輪 6 (P3/S3)・7 サファイア 6 (P2/S4、枠 2/2 を超える。品質 20% + サフィの効果 60% を割り戻して全部 T1 に収まる)・8 = 3 と値段の行以外同じ。ほかに作り物で Ctrl+C (イージスクォータースタッフ 6 つ全部 T1)・poe.ninja の注記・Ctrl+Alt+C の見出し・マジックの名前。
- poe2db で確かめた (10-20): 3・8 の「品質の最大値 +20%」= エッセンス (of the Breach) の宝飾品の MOD で値は 20 固定 → 幅の無い段は文の数字と比べるようにして T1 (fits true)。5 の「グレネードのクールダウン使用回数 +1」はクロスボウの項に無い (MOD・ルーンとも) → notInPool のままで正しい。7 のサファイアの側はエンジンと poe2db で同じ (呪文ダメージ・サフィの効果 = プレ、呪文クリ率・クリダメ・呪文クリダメ・キャストスピード = サフィ)。サフィの効果 (獰猛) は枠を変えず、枠を足す感情 (侮蔑) も「+1 Suffix Modifier allowed」の 1 つだけなのでサフィ 4 つは poe2db の範囲では作れない形 (コラプトの結果の表 Jewel 11 件にも無い)。原因は推し量らず、count の P2/S4 (枠 2/2) をそのまま返す (画面で「枠を超えている」と出せる)。
- 残り: 日本語の Ctrl+Alt+C の見出しと日本語の注記の形は見本が無く未対応。ジュエルの枠 2/2 はエンジンの値 (poe2db の項には枠の数が書いていない)。

## スパムの道の平均 (2026-10-20 J3、シミュ部長の ③ の白から作る費用のため。spam-counts.ts)
`spamCounts(data, item, route, grade, targets, { runs?, maxSteps?, seed? }): SpamCounts` — `{ off, hitRate, uses (鍵 → 1 人あたりの個数、お告げも), avgSteps, runs }`。
- route = augment / chaos / exalt、grade = base / greater / perfect (`RouteKind`・`RouteGrade`)。item = 始めのアイテム (白・ルーンを差した白・固定 1 つ + 外れのレアなど)。targets = 側ごとに 1 つまで (両側なら両方付くまで)。
- 打ち方は route-race の routeRun と同じ: 増強 = ノーマルなら変成 → 狙いの側に外れ (固定でない・当たっていない) があれば消去、無ければ増強。カオス = レアから狙いが全部付くまで。高貴 = 消せる MOD があれば消去、無ければ偉大な高貴のお告げで高貴 (空きが 2 つ無ければお告げ無し)。
- 打って数える (既定 300 人)。確かめ (台本、scratchpad の使い捨て): 鉄の指輪 ilvl 82・ライフ上から 3 段で、増強・高貴 (無印・上級) は raceOne 300 人と使った物の数が同じ、カオスは始めの 1 MOD の違いの分だけ (55.4 / 54.1、25.7 / 27.0)。1 回 60〜190ms。
- 解析君の頼み (K4) で `occupiedFamiliesOf`・`ANCIENT_BONE_FLOOR`・`REVEAL_SPEC` も並べた。

## MOD の値の上乗せと素の値 (2026-10-20 J8、オーナー「MOD の数字は上乗せを全部抜いた素の値と段で出す」。boosts.ts)
- `boostsOf(item)` → アイテムにある上乗せ `ItemBoost[]` (`{ kind: "quality" | "sideEffect" | "sanctify"; pct; tag?; side? }`)。
- `modBoostsOf(item, mod, data?)` → その MOD に掛かる上乗せ `ModBoost[]`。`baseValueOf(item, mod, data?)` → `{ base (素の値), shown (画面に出ている盛った値), boosts }`。
- `unboost(shown, pct)` → 盛った値から素の値 (切り捨ての表示なので、整数は同じ表示になる一番小さい整数)。
- 表示 = floor(素 × 聖別の倍率 × (1 + (品質 + 反対側の効果) / 100))。画面・シミュは自前で割り戻さずここを呼ぶ。
- parseItemText の `mods[].values` は素の値、`shownValues` は貼り付けのまま、`boosts` は割り戻した上乗せ (`ItemTextBoost`、品質で盛られた印を兼ねる)。

## ほかに並べた物 (グループ)
- 形: StageItem・StageMod・StageSide・PlayedStep・CraftStagePlan・PatchData・ItemBase・Mod・Force・Candidate・PobBlock
- 読む: parseItemText (上)
- 作る・打つ: freshItem・startFrom・startItem・playStep・playPlan・runPlan・applyCurrency・kindOf (カレンシーの種類)・omensFor・revealOffers・unrevealedOf
- 今を読む: allMods・listOf・room・limitOf・effectiveCls・maxQualityOf・catalystOf・SIDES・unfracturable・socketCapOf・dpsText・DEF
- 置き場・重み・段: loadHtcPatch・htcBaseInfo・htcBaseLimits・classOfBase・candidates・modTierWeight・floorKeepIndex・CURRENCY_FLOOR・CRAFTED_SOURCES・familiesOf・familyBlocked・occupiedKeysOf・modListFor・tierDisplayRanges・inGroup・isRemovedBase・classLabel
- 確率の表: heldOdds・heldAnyOf・aimTierKey・aimCombos・aimOdds・aimChain・aimDone・DESECRATION_EXCLUSIVE_COUNT・bossOmenAllowed・desecrationOmenForMod
- 名簿: OMEN_FOR・RUNES (stage-runes の物)・runeOf・isRune・runeEffectFor・withRunes・runeIdByName・ESSENCE_KEYS・essenceLevelOf・CATALYSTS・isEmotion・isShard・isGem
- 文: fillModText・jaUniqueText・tagLabel / 乱数: mulberry32

入口は `export *` を使わない (ワーカーを重くしない)。名前を足す・形を変える時はシミュ・チュートリアル・解析君に知らせる。
