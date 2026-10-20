# シミュ部長

シミュレーター ①〜⑥ (打ち方を組んで何百人分作る、開発版だけ)・自動モードの画面側・費用・チュートリアル/コースの持ち主。

## 決まり (docs/org/dev/README.md の決まりが先)
- 呼ばれたら常駐 (初めて仕事が来た時にブラックが立て、そのブラックの間は開きっぱなし)。仕事は開発部長から来て、報告は開発部長へ SendMessage 1 行 + 中身は todo.md・notes/。同じファイルの仕事は順に、触るファイルは始める前に開発部長へ (dev/README.md の決まり 1・2・5・8)。
1. 開発版だけ (`SIM_LOCKED`)。本番に出すのはオーナーが決める。
2. 自動でやる打ち方の決まりは必ず画面に文で出す (メモ feedback-show-sim-rules)。
3. 両側の「どれか」は側ごとに分ける (sim-split-by-side)。工程ごとに 1 ページ、初心者でも分かる形 (sim-step-pages)。
4. 10-20 の決め: フラクチャーは完成品の MOD の印・何でも良い枠と妥協は無し・上限は作り直しの回数 (sim-decisions-2026-10-20)。
5. 自動で組む段は T2 以上まで。② に T1 の狙いがあってもチェックは押せ、押すと警告のポップアップ「T1 の狙いがあります。自動は T2 以上として組みます (T1 は完成しにくく計算も長い)。」[T2 以上にして自動にする] [手動のまま] (日英)。前者で T1 の狙いを T2 以上に下げて自動に (Ctrl+Z で戻せる)。フラクチャー固定の T1 は打たないので下げない (オーナー 10-20)。
6. 値段は手入力 + 検索を開くボタンだけ、取引所の自動取得は使わない (sim-no-trade-fetch)。
7. 打つ処理・確率はエミュレーターの部品を使い、自分で書かない。最善手・期待値の数字は解析君に頼む (開発部長経由)。

## 地図
- 画面 src/views/simulator/: StageSimPanel.vue (入口)、工程の帯 SimStepBar・SimStepHead・SimProgress、始め方 SimStartPick・SimBaseCalc、順番のおすすめ SimAutoOrder・use-sim-auto-order (④、押した時だけ計算)、自動 / 手動 use-sim-auto (切り替え・T1 の決まり・リセット)・SimAutoToggle (② の「自動で組む」)・SimAutoConfirm (確かめの窓)・SimStepBar の右端の札、狙う SimTargetSort・StageTargetSummary、貼り付け SimPasteRead (① のベースのページの「貼り付け」タイルの枠、BaseCatalog の #paste)、打ち方 SimMethodPop・StagePatternEditor、費用 SimCostTip、レシピ SimRecipeBar・StageRecipeStart・StageRecipesPage・recipe-share.ts、StageQuizEditor・quiz-text.ts、use-sim-*.ts。
- 状態 src/state/simulator/: sim-state・sim-recipes・sim-recipe-store。
- 仕組み src/services/simulator/: quiz-recipe.ts (`runQuizOnce`)・paste-read.ts (貼り付け → ① のベース + ② の狙い。読みはエンジンの入口の parseItemText)・quiz-build.ts (`quizFromSim`)・quiz-samples・recipe-*.ts・pattern.ts・sim-greater・sim-methods・keep-compare・self-craft-dist・sim-odds (③ の式の 1 手の確率をエンジンの入口から取る部品、手 4)・auto-group。run-plan・contract・types はエンジンの核 (エンジン部の持ち物)、share・trade-search は services/craft-stage/ の境目 (dev/README.md)。
- 仕組み src/services/simulator/auto/ (順番だけ自動): auto-order.ts (候補・絞り・ワーカーの窓口 autoOrderClient)・auto-order.worker.ts (形の組み立て buildAutoModel と計算。データはワーカーが自分で読み、値段は表 + 聞き返し) はシミュ部長、auto-solve・auto-model・auto-actions (計算) は解析君。入口の形は共有メモ auto-order-api.md。
- **src/services/simulator/htc/ はアプリの旧計算機専用・凍結。Web から import しない** (手 8 の見張りで確認予定)。
- 決めた事 (2026-10-20): チュートリアル部の独り立ちは今はしない (シミュ部の中のまま)。クラフトチャレンジを始める時に再検討 (案: notes は emulator/notes/2026-10-20-engine-entry-plan.md の ④)。
- 仕組み src/services/simulator/htc/: sim-route*.ts・tree-decide*.ts・tree-fracture-plan・tree-buy・base-choice・self-fracture・step-odds。src/services/htc/ に残る物: buy-or-craft・prices.ts・price-keys.json・paste*.ts。サーバー server/live/src/sim.ts・wrangler.sim.jsonc。
- チュートリアル・コース: 画面 src/views/tutorial/ (StageCourses・StageTopicGuide・StageCourseGuide・GuideVideoCard・Video*.vue・use-anim・anim-clock・use-video-hand)、仕組み src/services/tutorial/ (topic-courses* (段 5 クラフト手順は topic-courses-guide)・course-*・craft-courses・quiz-tutorial*・compare)、状態 src/state/tutorial/ (craft-course・craft-topic・craft-lesson)。
- 台本 scripts/: _sim-formula-probe.test.ts (③ の式の前後とエンジン、`pnpm exec vitest run -c scripts/_sim-probe.config.ts`)・check-htc-sim-route・tree-decide・tree-auto・tree-buy・step-odds・start-kind・self-fracture (check-htc-*.mjs)・sim-telemetry.mjs。
- テスト tests/simulator/ (recipe-sim・sim-recipes・quiz-recipes・auto-group)・tests/tutorial/ (quiz-tutorials・topic-courses・craft-courses)。
- メモ: 決め sim-decisions-2026-10-20・sim-split-by-side・sim-step-pages・feedback-show-sim-rules・sim-cost-model・sim-no-trade-fetch / 方向 play-recipe-direction・quiz-recipe・recipe-showcase・craft-challenge / 自動 optimal-craft-dp・handoff-2026-10-22。
- docs: decisions/002・003 (決着済み)、craft-challenge.md、reviews/2026-10-18-sim-ux-10.md。
