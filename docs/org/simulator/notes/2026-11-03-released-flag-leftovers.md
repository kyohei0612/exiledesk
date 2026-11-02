# 開け終わったスイッチの残り (シミュ) — 11-03 シミュ部長 68

オーナー 11-03「整理していつでも消せるように」(ブラック 36 経由)。**今は src を変えない** (1440 でオーナーが確認中)。合図 1 つで下の「消す段取り」から始められる形にした。

## 数え方と数
- 台本: RELEASED (src/web/release-flags.ts) の名前 × `src/views/simulator`・`src/services/simulator`・`src/state/simulator` の `flag("名前")` / `flag('名前')` (.ts・.vue) / `data-flag-名前`。simTutorial は外した (閉じたまま)。
- **48 種類・126 か所** (同じ行に 2 つは 2 と数える)。36 の「45 種類・約 150 か所」とずれるのは、一重引用 (`flag('…')`、vue の template) を足したことと、`flag(` の行数でなく呼びの数で数えたため。数え直す時は同じ台本で (下の「確かめ」)。
- 場所の頭字: `v/` = src/views/simulator、`s/` = src/services/simulator、`st/` = src/state/simulator。

## 先に知っておく危うい所 (全部に掛かる)
1. **旧の側は「本番でも 1440 でも通らない」が、開発版では `?off=名前` で通せる** (release-flags.ts の OFF)。見張りの道具が旧の側を基準に使っている:
   - `scripts/sim-watch/light.mjs`・`light-edit.mjs` = `off=treeLight` と比べて「軽くしても結果が同じ」を見る道具。treeLight の旧の側を消すとこの 2 本は比べる相手を失う → **道具ごと退役 (archive へ) を先に決める** (メモ feedback-keep-verify-tools: 消さずに archive)。
   - `scripts/sim-watch/v1-dry.mjs` = `off=recipeV1`。同じく退役の扱い。
   - `judge.mjs`・`build.mjs`・`lines.mjs`・`place.mjs`・`fullcheck.mjs` は `--off 任意` の口があるだけ (既定では使わない)。口は残してよい。
   - docs/org/simulator/notes の 10-28・10-29 の handoff に `off=judgeOne` の手順が残る (経緯なので直さない)。
2. **保存済みの木・レシピ**: recipeV1・oldBone・goalQuality・fracMulti は保存の形の読み方に掛かる。旧の側は「古い保存を読む時の形」でなく「今の形で書く・読む時の別ルート」だったかを、消す前に 1 本ずつ見る (oldBone の `oldVeil` は**新の側**が古い保存を読む口なので残る)。
3. **シミュの外でも同じ名前を使う物**: phoneView (craft-stage/StageSettings.vue)・simPhone (for-share/ModeTabs.vue)・firstVisit1024 (for-share/shelf/ShelfButton.vue・items/BaseCardGrid.vue・items/BaseCatalog.vue)・clickFracture (craft-stage/CraftStage.vue)。シミュの中だけ消すと RELEASED / FLAGS から名前を抜けない (下の ③)。
4. 設計図 (docs/spec/) の行で「スイッチ 名前」と書いている所: sim-tree.md 58・86・99・107・164・173・276・296・435・436・458・471、shared-ui.md 47・92、tutorial.md 95、release.md 36、emu.md 81・sim-tree.md 69 (clickFracture)。決まりの中身は替わらないので、「(スイッチ 名前)」の括弧を外すだけ。⑤ の確かめの記録 (435・436) は経緯なので残す。

## スイッチごと (多い順)
旧の側 = そのスイッチが無い時の動き (FLAGS の説明の逆)。「一緒に消える」は今の読みで、消す時に `vue-tsc` と使い手の grep で決める。

| スイッチ | 数 | 旧の側がしていた事 | 一緒に消える物 (見込み) | 危うい所 |
|---|---|---|---|---|
| keepOutside | 20 | 消えない MOD を残したい MOD に数えない・外れが消えた箱は手に関係なく前へ自動で戻す・出ない結果の手は判定を返さない | tree-veil.ts の `blockHand` の flag の項、tree-judge-link.ts:144 の早帰り | 判定 (tree-judge・tree-model・tree-outcome) に掛かる。消した後に見張りの 100 人の比べ |
| treeLight | 17 | 早送り・覚え (contentsOf・boxKeyOf・chipSeen) を使わず毎回全部数え直す | tree-sample.ts の旧の数え直しの塊 (220〜260)、tree-sample-key.ts の id 入りの鍵 | 上の 1: light.mjs・light-edit.mjs が旧の側を比べの相手に使う |
| keepAll | 7 | 残したい MOD は消去の手だけ (カオス・パーフェクトエッセンス・満杯の骨では選べない) | use-hand-keep.ts の isRemove の分かれ | tutorial.md 95 も同じ名前を書いている |
| attachWay | 6 | 付け方 3 択のボタン・クラフト MOD の上限超えは「決めた」を押せない (wayUndecided) | tree-way-mods.ts の `wayUndecided` (常に null になる) と TreeGoalPage.vue の使い手 | — |
| judgeOne | 6 | 箱の判定を形 (shapeFit) で見る | tree-sample-shape.ts の `shapeFit` の呼び (使い手 1 つだけ → 関数ごと消える見込み) | 10-29 の handoff の off=judgeOne の手順は経緯として残す |
| recipeV1 | 4 | レシピを木そのまま (clone) で保存・比べる | tree-recipes.ts の clone の分かれ | 上の 1・2: v1-dry.mjs。古い保存 (形が v1 前) の読みは toRecipeV1 側にあるかを先に見る |
| phoneResult1027 | 3 | スマホの結果の画面の古い作り (結果を 1 つずつ送らない・手を替えるボタン) | PhoneAsk.vue の `!P27` の要素 | — |
| sim1031 | 3 | 失敗の箱も「✓ 完成」と出る・フラックスを隠さない | — | — |
| phoneMap | 3 | スマホの全体図・箱の重ね窓が無く、行き先は一覧 (listOpen) で選ぶ | PhoneOutRow.vue の listOpen と data-phone-other の一覧 | — |
| freeNoHit | 3 | 狙い無しの手・ルーンの手にも当たりの箱を出す | — | — |
| goalAskFix | 3 | 完成形の設定の Esc・品質の上限の古い動き | TreeGoalQuality.vue の cap-limit を渡さない側 | — |
| fracMulti | 3 | ✦ は 1 つだけ (付けるとほかの印を外す) | use-tree.ts:332 の外す塊 | fracOne と組み (✦ が 2 つ以上の時の始め方) |
| mergeOpen | 3 | 同じ形の手の無い箱を先の箱へまとめない | — | — |
| phone1027 | 2 | スマホの進み具合の帯が上 (古い位置)・箱の窓の覗きが無い | PhoneTreePage.vue の `!P27` の帯 | — |
| holeButton | 2 | 穴チェックを木が変わるたびに自動で走らせる | — | — |
| phoneView | 2 (+外 1) | 768 未満もスマホの質問の形 (PhoneTreePage) | — (PhoneTreePage は 768〜1280 で今も使う) | 外: StageSettings.vue |
| lineShort | 2 | 段の間を決まった高さ・線は箱から | — | — |
| qualityAsk | 2 | 品質の 2 択の窓を出さない | — | — |
| backRoute | 2 | 戻りの線を箱の角から直に | — | — |
| goalNeedMod | 2 | MOD 0 個でも注意無しで進む | — | — |
| rowNear | 2 | 兄弟の間を木全体の箱で決める | tree-place.ts の near を使わない側 | — |
| oldBone | 2 | 前の版の骨の手を「発現させる」に読み替えない | — | 上の 2: 新の側 (oldVeil) が古い保存を読む口なので消さない |
| boneLater | 2 | 骨の手に「発現させる」☑ が無い (いつも発現まで) | — | — |
| failEnd | 1 | スマホの答えに「失敗 (ここで終わり)」が無い | — | — |
| simPhone | 1 (+外 1) | スマホは「PC で開いてください」(SimPcOnly) | `SimPcOnly.vue` (StageRecipesPage・SimTreePage の使い手を見てから) | 外: ModeTabs.vue |
| holeCheck | 1 | 「穴チェック」でなく「テスト / テストで回す」の字 | hole-check.ts の `HOLE_CHECK` (使い手 5 か所、チュートリアルを含む) | チュートリアル (tut-route.ts・use-sim-tutorial.ts) も読む |
| goWord | 1 | 戻りの札がいつも「n 段目へ」 | — | — |
| backQuality | 1 | 戻りの札に品質の違いを書かない | — | — |
| goalQuality | 1 | 貼り付けで品質を取り込まない | — | 上の 2 (貼り付けの読み) |
| pickOff | 1 | 人が選ぶ「まとめる」「戻り先を選ぶ」を常に出す | — | — |
| goalBig | 1 | 完成形の窓を 1.2 倍にしない | — | — |
| clickFracture | 1 (+外 1) | 完成形のカードの左クリックでフラクチャーしない | — | 外: CraftStage.vue (エミュ部の持ち物) |
| qualityLimit | 1 | 品質の上限を絞らない | — | — |
| qualityFit | 1 | 品質の欄の幅の直し無し | `goal-q-fit` の CSS | — |
| noSpam | 1 | カオススパムオーブを手の札に出す | TreeHandChip.vue の SPAM の分かれ | — |
| goalShape | 1 | 消去の手の「外れ」の注意の字を出す | — | — |
| hoverLines | 1 | 合流の線をいつも全部描く | — | — |
| retryHover | 1 | 再挑戦の線をいつも描く | — | — |
| settleStrict | 1 | 止まりの文の古い書き方 | — | — |
| stopPill | 1 | 止まりの赤い札を箱のカードに被せる | — | — |
| fracOne | 1 | ✦ が 2 つ以上でもフラクチャーから始められる | — | fracMulti と組み |
| revealGrey | 1 | 発現の窓で発現できない MOD も灰色にしない | — | — |
| resetOnEdit | 1 | 前提を替えても木を消さない | — | — |
| goalDesecRow | 1 | 冒涜の狙いの行の印を出さない | — | — |
| firstVisit1024 | 1 (+外 3) | 札の窓を押した瞬間に開く | — | 外: ShelfButton・BaseCardGrid・BaseCatalog |
| junkSide | 1 | 外れの箱を側ごとに分けない | tree-junk-side.ts の早帰り | — |
| rowPack | 1 | 横の置き場を段ごとの帯で詰めない | — | — |
| whittleRank | 1 | 削減のお告げの手を MOD レベルで分けない | — | — |

## 済み (シミュ部長 69、11-03)
- commit 1 (28 種) 済み: 旧の側は全部「消す」(新とかち合う物・要らない物)。「残す」にした旧の部品は 0。FLAGS・RELEASED の名前を抜く差分は release-flags.ts (デザイン部) でフックが止めたので、ブラック 36 の共有メモ sim69-flags-commit1.patch に置いた (当てると型 0 = 使い手 0 は確かめ済み)。説明の「スイッチ 名前」と設計図の括弧も外した (⑤ の確かめの記録・shared-ui 92・sim-tree 460 は経緯なので残す)。
- 確かめ: 見張り = 型 0・build:web 通過だけ。見張りの fullcheck・画面は未。push はしていない (出しが済むまで止める、ブラック 36)。
- commit 2 (rowNear・rowPack・mergeOpen) 済み: 前の置き方 strip は使い手 0 で消す。place.mjs・lines.mjs の比べは未。
- commit 3 (keepOutside・keepAll・attachWay・judgeOne・freeNoHit・junkSide・whittleRank・fracMulti・fracOne) 済み: 旧の側は全部「消す」。一緒に消えた物 = wayUndecided (いつも null)・TreeStartAsk の ✦ 複数と 1 つ選びの節 (fracOne が開いて通らない)・shapeSampleWithNote の形の比べ (shapeFit の関数は残す)。start-cost の fracMulti の引数はエンジン側なので true を渡すだけで残す。確かめ: 型 0・build:web 通過 (vue-tsc は template の重なった属性を見ないので、build で 1 つ見つけて直した)。judge.mjs・見本の木の 100 人の比べは未。

## 消す段取り (合図 1 つで始める)
オーナーの確認が終わってから (1440 が空いてから)。シミュ部長 1 人で、worktree で。commit ごとに `pnpm -s exec vue-tsc --noEmit -p tsconfig.json` (型 0)。

1. **commit 1 — 見た目だけの 1 か所物 (28 種)**: phoneResult1027・sim1031・phoneMap・phone1027・failEnd・goalAskFix・lineShort・qualityAsk・backRoute・goalNeedMod・goWord・backQuality・pickOff・goalBig・qualityLimit・qualityFit・noSpam・goalShape・hoverLines・retryHover・settleStrict・stopPill・revealGrey・resetOnEdit・goalDesecRow・holeButton・holeCheck・boneLater。確かめ: 型 + `pnpm build:web` + 見張りの fullcheck (dev のスナップが前と同じ)。
2. **commit 2 — 置き場・線 (3 種)**: rowNear・rowPack・mergeOpen。確かめ: 型 + 見張りの place.mjs・lines.mjs (前と同じ置き場)。
3. **commit 3 — 判定・結果 (9 種)**: keepOutside・keepAll・attachWay・judgeOne・freeNoHit・junkSide・whittleRank・fracMulti・fracOne。確かめ: 型 + 見張りの judge.mjs と、保存してある見本の木 (アミュ B・ジュエル) の 100 人が前と同じ数。
4. **commit 4 — 保存の形 (3 種)**: recipeV1・oldBone・goalQuality。確かめ: 型 + 古い保存 (localStorage の見本・共有 URL) を読めるか。v1-dry.mjs は退役 (archive へ) を同じ commit で。
5. **commit 5 — 軽くする (1 種)**: treeLight。light.mjs・light-edit.mjs の退役 (archive へ) を同じ commit で。確かめ: 型 + build:web + 100 人の時間が前と同じくらい。
6. **commit 6 — 外と共有 (4 種)**: phoneView・simPhone・clickFracture・firstVisit1024 のシミュの中の分かれ。シミュの外の分かれはデザイン部・エミュ部の物なので、その部長に同じ形で頼む (下の ③)。
- 各 commit で設計図の「(スイッチ 名前)」の括弧も外す (G-20 のフック対策で commit の文に S-xx を書く)。
- 出す前の確かめは G-21 どおり最終チェック長のモンキー 2 匹 × 20 手の報告だけ。UI の見た目は替わらない (旧の側は通らない) ので、版上げはシミュの UI 以外の扱いで良いかはブラックが決める。

## スイッチの名前 (FLAGS・RELEASED) を抜くか — release-flags.ts はデザイン部の物
- **抜いて良い**: 上の 48 種のうち、シミュの外に使い手の無い 44 種は、commit 1〜5 で `flag("名前")` が 0 になった時点で `FLAGS` の行と `RELEASED` の名前を抜ける (`Flag` 型が名前から作られるので、抜いた後に型で取りこぼしが出る)。
- **抜かない (外に使い手)**: phoneView・simPhone・clickFracture・firstVisit1024 は、外の部が分かれを消すまで残す。
- `markFlags()` の `data-flag-名前` を CSS で使う物は今のシミュには 0 (台本で見た)。外の CSS は抜く前に `data-flag-` で grep。
- 触る範囲: release-flags.ts の FLAGS の該当行と RELEASED の該当の名前だけ (OFF・DEV_BUILD・flag・markFlags は替えない)。デザイン部長に「抜く名前の一覧」を渡して、デザイン部が抜く (または OK をもらってシミュ部が同じ commit で抜く) のどちらかをブラックが決める。

## 確かめ (この notes の数)
- 見張り: 台本 (scratchpad の flags-inv.mjs、下の場所の一覧を作った物) で数えただけ。画面・外の正解では見ていない。「一緒に消える物」は grep の読みで、消す時に型で決まる。

## 場所の一覧 (file:line)
| スイッチ | 数 | 場所 |
|---|---|---|
| keepOutside | 20 | v/phone/use-phone-quiz.ts:246, v/tree/tree-hand-plan.ts:117, v/tree/tree-rebuild.ts:110, v/tree/tree-rebuild.ts:159, v/tree/tree-row-tags.ts:55, v/tree/TreeHandShelf.vue:162, v/tree/TreeHandShelf.vue:227, v/tree/TreeVeilCheck.vue:72, v/tree/use-hand-keep.ts:46, v/tree/use-tree-check.ts:28, s/tree/tree-judge-link.ts:32, s/tree/tree-judge-link.ts:144, s/tree/tree-judge.ts:42, s/tree/tree-judge.ts:104, s/tree/tree-model.ts:406, s/tree/tree-outcome.ts:222, s/tree/tree-recipe-v1.ts:63, s/tree/tree-veil.ts:32, s/tree/tree-veil.ts:35 |
| treeLight | 17 | v/tree/SimTreePage.vue:269, v/tree/tree-lines-grid.ts:47, v/tree/tree-lines-grid.ts:58, v/tree/tree-odds.ts:113, v/tree/tree-side-aims.ts:25, v/tree/use-tree-check.ts:91, v/tree/use-tree-merge.ts:25, v/tree/use-tree-merge.ts:36, v/tree/use-tree-run.ts:104, s/tree/tree-judge.ts:201, s/tree/tree-place.ts:122, s/tree/tree-run.ts:130, s/tree/tree-sample-key.ts:19, s/tree/tree-sample.ts:220, s/tree/tree-sample.ts:240, s/tree/tree-sample.ts:257, s/tree/tree-sample.ts:361 |
| keepAll | 7 | v/tree/tree-hand-plan.ts:96, v/tree/tree-hand-plan.ts:115, v/tree/TreeHandShelf.vue:224, v/tree/use-hand-keep.ts:27, s/tree/tree-keep.ts:17, s/tree/tree-keep.ts:46, s/tree/tree-sample.ts:364 |
| attachWay | 6 | v/tree/tree-goal-cap.ts:22, v/tree/tree-way-mods.ts:45, v/tree/TreeGoalPage.vue:51, v/tree/use-goal-shown.ts:42, v/tree/use-goal-shown.ts:44, v/tree/use-goal-shown.ts:83 |
| judgeOne | 6 | v/tree/tree-odds.ts:65, v/tree/tree-odds.ts:66, v/tree/tree-odds.ts:71, s/tree/tree-recipe-v1.ts:66, s/tree/tree-sample-shape.ts:24, s/tree/tree-sample.ts:364 |
| recipeV1 | 4 | s/tree/tree-judge-link.ts:159, st/tree-recipes.ts:75, st/tree-recipes.ts:77 |
| phoneResult1027 | 3 | v/phone/PhoneAsk.vue:29, v/phone/PhoneMap.vue:87, v/phone/PhoneTreePage.vue:45 |
| sim1031 | 3 | v/phone/PhoneBoxSheet.vue:42, v/phone/PhoneBoxSheet.vue:92, v/use-sim-shelf.ts:31 |
| phoneMap | 3 | v/phone/PhoneIssues.vue:27, v/phone/PhoneOutRow.vue:71, v/phone/PhoneTreePage.vue:41 |
| freeNoHit | 3 | v/tree/tree-hand-plan.ts:182, v/tree/tree-hand-plan.ts:212, v/tree/tree-rebuild.ts:19 |
| goalAskFix | 3 | v/tree/TreeGoalPage.vue:86, v/tree/TreeGoalPage.vue:87, v/tree/TreeGoalQuality.vue:109 |
| fracMulti | 3 | v/tree/TreeStartAsk.vue:50, v/tree/use-tree.ts:332, s/tree/tree-base-cost.ts:46 |
| mergeOpen | 3 | s/tree/tree-merge-open.ts:27, s/tree/tree-merge-open.ts:58, s/tree/tree-row-tops.ts:24 |
| phone1027 | 2 | v/phone/PhoneBoxSheet.vue:67, v/phone/PhoneTreePage.vue:43 |
| holeButton | 2 | v/phone/PhoneViewPage.vue:39, v/tree/use-tree-check.ts:76 |
| phoneView | 2 | v/StageRecipesPage.vue:32, v/tree/SimTreePage.vue:70 |
| lineShort | 2 | v/tree/tree-fail.ts:20, v/tree/use-tree-edges.ts:25 |
| qualityAsk | 2 | v/tree/tree-goal-quality.ts:12, v/tree/TreeGoalPage.vue:379 |
| backRoute | 2 | v/tree/tree-lines.ts:56, v/tree/tree-merge.ts:74 |
| goalNeedMod | 2 | v/tree/TreeGoalPage.vue:251, v/tree/use-goal-shown.ts:59 |
| rowNear | 2 | v/tree/use-tree-merge.ts:34, s/tree/tree-place.ts:79 |
| oldBone | 2 | s/tree/tree-veil.ts:23, s/tree/tree-veil.ts:26 |
| boneLater | 2 | s/tree/tree-veil.ts:28, s/tree/tree-veil.ts:30 |
| failEnd | 1 | v/phone/PhoneOutRow.vue:66 |
| simPhone | 1 | v/StageRecipesPage.vue:147 |
| holeCheck | 1 | v/tree/hole-check.ts:10 |
| goWord | 1 | v/tree/tree-fail.ts:28 |
| backQuality | 1 | v/tree/tree-fail.ts:82 |
| goalQuality | 1 | v/tree/tree-paste.ts:102 |
| pickOff | 1 | v/tree/TreeBox.vue:79 |
| goalBig | 1 | v/tree/TreeGoalCard.vue:24 |
| clickFracture | 1 | v/tree/TreeGoalPage.vue:379 |
| qualityLimit | 1 | v/tree/TreeGoalQuality.vue:51 |
| qualityFit | 1 | v/tree/TreeGoalQuality.vue:84 |
| noSpam | 1 | v/tree/TreeHandChip.vue:14 |
| goalShape | 1 | v/tree/TreeKeepList.vue:28 |
| hoverLines | 1 | v/tree/TreeMergeLayer.vue:14 |
| retryHover | 1 | v/tree/TreeMergeLayer.vue:23 |
| settleStrict | 1 | v/tree/TreeRunLayer.vue:18 |
| stopPill | 1 | v/tree/TreeRunLayer.vue:21 |
| fracOne | 1 | v/tree/TreeStartAsk.vue:31 |
| revealGrey | 1 | v/tree/TreeVeilCheck.vue:41 |
| resetOnEdit | 1 | v/tree/use-edit-reset.ts:27 |
| goalDesecRow | 1 | v/tree/use-goal-shown.ts:64 |
| firstVisit1024 | 1 | v/tree/use-shelf-card.ts:27 |
| junkSide | 1 | s/tree/tree-junk-side.ts:12 |
| rowPack | 1 | s/tree/tree-place.ts:89 |
| whittleRank | 1 | s/tree/tree-whittle.ts:17 |
