# フォルダー分けの案 (開発部長、2026-10-20)

目的: 部ごとに持ち場のフォルダーを分け、部長のセッションが同時に動いてもぶつからないようにする。
やり方: `git mv` で移すだけ (中身は相対 import のパスだけ書き換え)。リファクタ・機能の変更は混ぜない。1 手ごとに vue-tsc + `pnpm build:web` + 全部の相対 import が解決するかの台本 → commit。
線引き: docs/org/*.md の地図どおり。ただし**他の部の物から import されていて、中身が部の物とも言い切れない物は共通に残す** (下の「迷った物」)。

## 部ごとのフォルダー (移した後)

| 部 | 画面 | 仕組み | 状態 | テスト |
|---|---|---|---|---|
| 開発 (共通) | src/web/・src/components/・src/utils/ | src/i18n/・src/services/money.ts・telemetry/ ほか | src/state/ の直下 (craft-stage.ts・web-page.ts・display-currency.ts ほか) | tests/ の直下の一部 |
| エミュレーター | src/views/craft-stage/ (残り全部) | src/services/craft-stage/ (残り全部)・spec/・htc/ (エンジンの橋)・mods/・src/vendor/poe2htc | **src/state/emulator/** | tests/ の直下 (今のまま) |
| シミュレーター | **src/views/simulator/** | **src/services/simulator/** (+ htc/ = 自動モードの木) | **src/state/simulator/** | **tests/simulator/** |
| チュートリアル (シミュレーター部の持ち物) | **src/views/tutorial/** | **src/services/tutorial/** | **src/state/tutorial/** | **tests/tutorial/** |
| 解析君 | (持ち物なし。読むだけ) | — | — | — |
| 分析君 | server/live (今のまま) | src/utils/log-record.ts ほか (今のまま) | — | — |

解析君: コードの持ち主ではない (docs/org/math/README.md)。scratchpad の台本 (dp.mjs など) をリポジトリに残す時の置き場は **scripts/analysis/** にする (今は作らない、物が来た時に)。
scripts/: 出力先などを文字列で持つ物・package.json から呼ぶ物が多く、深さを変えると `__dirname/..` が壊れるので**今回は動かさない**。持ち主は docs/org の各部の地図で決める。

## 今の置き場 → 新しい置き場

### 手 1: シミュレーター
- src/views/craft-stage/ → src/views/simulator/:
  StageSimPanel.vue・SimBaseCalc.vue・SimCostTip.vue・SimMethodPop.vue・SimProgress.vue・SimRecipeBar.vue・SimStartPick.vue・SimStepBar.vue・SimStepHead.vue・SimTargetSort.vue・StageTargetSummary.vue・StagePatternEditor.vue・StageQuizEditor.vue・StageRecipeStart.vue・StageRecipesPage.vue・recipe-share.ts・quiz-text.ts・use-sim-*.ts (8)
- src/services/craft-stage/ → src/services/simulator/:
  quiz-recipe.ts・quiz-build.ts・quiz-samples.ts・recipe-sim.ts・recipe-defs.ts・recipe-pattern-run.ts・recipe-card.ts・pattern.ts・sim-greater.ts・sim-methods.ts・keep-compare.ts・self-craft-dist.ts・auto-group.ts
- src/services/htc/ → src/services/simulator/htc/ (自動モードの木、中で閉じている):
  sim-route.ts・sim-route-run.ts・sim-route-helpers.ts・sim-route-types.ts・tree-decide.ts・tree-decide-types.ts・tree-fracture-plan.ts・tree-buy.ts・base-choice.ts・self-fracture.ts・step-odds.ts
- src/state/ → src/state/simulator/: sim-state.ts・sim-recipes.ts・sim-recipe-store.ts
- tests/ → tests/simulator/: recipe-sim・sim-recipes・quiz-recipes・auto-group (.test.ts)

### 手 2: チュートリアル (シミュレーター部)
- src/views/craft-stage/ → src/views/tutorial/: StageCourses.vue・StageTopicGuide.vue・StageCourseGuide.vue・GuideVideoCard.vue・Video*.vue (19)・use-anim.ts・anim-clock.ts・use-video-hand.ts
- src/services/craft-stage/ → src/services/tutorial/: topic-courses.ts・topic-courses-adv.ts・course-recipes.ts・course-release.ts・craft-courses.ts・quiz-tutorials.ts・quiz-tutorial-run.ts・compare.ts (使うのは VideoCompare だけ)
- src/state/ → src/state/tutorial/: craft-course.ts・craft-topic.ts・craft-lesson.ts
- tests/ → tests/tutorial/: quiz-tutorials・topic-courses・craft-courses (.test.ts)

### 手 3: エミュレーター
- src/state/ → src/state/emulator/: craft-stage-shelf.ts・shelf-context.ts・aim-state.ts・stage-steps.ts・stage-extra.ts・craft-stage-help.ts・craft-stage-help-mods.ts・craft-stage-help-text.ts・spam-share-open.ts
- src/views/craft-stage/・src/services/craft-stage/ は手 1・2 の後はエミュレーターの物 (+ 下の共通) だけになるので名前はそのまま (import 2,000 か所の書き換えを避ける)。

### 手 4: docs/ARCHITECTURE.md の地図を直す

手の数: 4 (移動 3 + 地図 1)。

## 迷った物 (共通に残す)
- services/craft-stage/run-plan.ts・contract.ts … 打つ処理の土台。エミュレーター・シミュレーター・チュートリアル・アプリ・テスト 70 か所が使う。エミュレーターの物として craft-stage/ に残す。
- services/craft-stage/share.ts … エミュレーターの URL シェア (CraftStage.vue・state/craft-stage.ts)。シミュレーターの一覧 (simulator/README.md) にあったが craft-stage/ に残す。
- services/craft-stage/trade-search.ts … 検索を開くボタン。StageSettings (エミュレーター) と use-sim-search (シミュレーター) の両方。残す。
- services/htc/buy-or-craft.ts・prices.ts・price-keys.json・paste*.ts … アプリ (craft-v2・pob-check・build-copy)・エミュレーターの棚 (price-keys.json)・シミュレーターの検索がまたがって使う。htc/ に残す。
- services/craft-stage/types.ts・state/craft-stage.ts … 境目 (開発部の持ち物)。state/craft-stage.ts はシミュレーターの状態 (sim-state・sim-recipes) やお告げの quiz-recipe を import して束ねている。
- 使い手が他の部にもいるがシミュレーターに移した物: sim-methods.ts・quiz-build.ts (StageModList.vue = エミュレーターの MOD 一覧が型と `methodsFor` を読む)、quiz-recipe.ts・pattern.ts (state/craft-stage.ts が読む)。中身はシミュレーターの回し方なので持ち主はシミュレーター。エミュレーターが直す時はシミュレーター部長に知らせる。
- auto-group.ts … src から使われていない (tests/auto-group.test.ts だけ)。消すかは別の話なので移すだけ。
- tests/htc-*.test.ts (sim-route・tree-decide を試す) … 古いアプリの計算機 (views/htc-craft) のテスト。tests/ の直下に残す。

## 実施 (2026-10-20、main に push 済み)
- c5ec9825 手 1 シミュレーター (56 ファイル移動) / caa2d5ae 手 2 チュートリアル (37) / 902609e2 手 3 エミュレーターの状態 (9) / 2c7a5ef0 ARCHITECTURE.md
- 各手で: vue-tsc OK・`pnpm build:web` OK・相対 import の解決の台本 (未解決は前からの 2 件だけ: CenterContent.vue の EconDashboard・mod-text-lang.test.ts)。手 1 は scripts/_htc-bridge-entry.ts も書き換えたので `node scripts/check-htc-bridge.mjs` を回して「全部 OK」。
- テストは回していない (オーナーが言った時だけ)。tests/ の import は台本で解決を確かめただけ。main への push で CI が回る。
- 版上げ・deploy なし (出力は変わらない)。
- 道具: scratchpad の mv-tool.mjs (`git mv` + 相対 import の書き換え + 解決の確かめ)。

## 直す所 (docs/org・CLAUDE.md。後で別に回す)
台本で 2026-10-20 夜の版を洗った結果 (行番号はその時点)。
- **CLAUDE.md**: 直す所なし (22 行の quiz-recipe は ADR の名前 003-quiz-recipe.md でパスではない)。
- **docs/org/emulator/README.md**
  - 「状態」の行 (15 行あたり): craft-stage-shelf.ts・shelf-context.ts・aim-state.ts・stage-steps.ts・stage-extra.ts・craft-stage-help*.ts・spam-share-open.ts → **src/state/emulator/**。
  - 「画面 (src/views/craft-stage/)」「仕組み (src/services/craft-stage/)」の見出しはそのままでよい (残りはエミュレーターの物)。
- **docs/org/simulator/README.md**
  - 画面の見出し `src/views/craft-stage/` → **src/views/simulator/** (Sim*.vue・StageSimPanel・StageTargetSummary・StagePatternEditor・StageQuizEditor・StageRecipeStart・StageRecipesPage・recipe-share.ts・use-sim-*.ts)。quiz-text.ts もここ (使い手は StageQuizEditor・use-sim-result だけなのでチュートリアルではなくシミュレーターに置いた)。
  - 状態 sim-state・sim-recipes・sim-recipe-store → **src/state/simulator/**。
  - 仕組み: quiz-recipe・quiz-build・quiz-samples・recipe-sim・recipe-defs・recipe-pattern-run・recipe-card・pattern・sim-greater・sim-methods・keep-compare・self-craft-dist・auto-group → **src/services/simulator/**。
    **craft-stage/ に残した物** (地図から外すか「共通」と書く): run-plan.ts・contract.ts・share.ts・trade-search.ts。compare.ts は **src/services/tutorial/**。
  - htc: sim-route*・tree-decide*・tree-fracture-plan・tree-buy・base-choice・self-fracture・step-odds → **src/services/simulator/htc/**。**htc/ に残した物**: buy-or-craft.ts・prices.ts・price-keys.json・paste*.ts。
  - チュートリアル: 画面 (StageCourses・StageTopicGuide・StageCourseGuide・GuideVideoCard・Video*.vue・use-anim・anim-clock・use-video-hand) → **src/views/tutorial/**、仕組み (topic-courses*・course-recipes・course-release・craft-courses・quiz-tutorials・quiz-tutorial-run) → **src/services/tutorial/**、状態 craft-course・craft-topic・craft-lesson → **src/state/tutorial/**。
  - テスト: recipe-sim・sim-recipes・quiz-recipes・auto-group → **tests/simulator/**、quiz-tutorials・topic-courses・craft-courses → **tests/tutorial/**。
- **docs/org/math/README.md**
  - 「回し方」の行: quiz-recipe.ts・quiz-build.ts → src/services/simulator/、sim-route*.ts・tree-decide.ts・step-odds.ts → src/services/simulator/htc/。
  - 解析君の台本を残す時の置き場は scripts/analysis/ (この案で決めた。まだ無い)。
- **docs/org/dev/README.md**: 直す所なし (境目の state/craft-stage.ts・services/craft-stage/types.ts は動かしていない)。「境目」に共通の土台 run-plan.ts・contract.ts を足すかは開発部長の判断。
- docs/org/analytics/README.md・black/README.md: 直す所なし。
- (参考) メモの中の古いパス (memory/*.md) と docs/decisions・docs/reviews の中のパスは今回は直していない。
