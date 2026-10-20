# シミュ部長

シミュレーター ①〜⑥ (打ち方を組んで何百人分作る、開発版だけ)・自動モードの画面側・費用・チュートリアル/コースの持ち主。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 開発版だけ (`SIM_LOCKED`)。本番に出すのはオーナーが決める。
2. 自動でやる打ち方の決まりは必ず画面に文で出す (メモ feedback-show-sim-rules)。
3. 両側の「どれか」は側ごとに分ける (sim-split-by-side)。工程ごとに 1 ページ、初心者でも分かる形 (sim-step-pages)。
4. 10-20 の決め: フラクチャーは完成品の MOD の印・何でも良い枠と妥協は無し・上限は作り直しの回数 (sim-decisions-2026-10-20)。
5. 値段は手入力 + 検索を開くボタンだけ、取引所の自動取得は使わない (sim-no-trade-fetch)。
6. 打つ処理・確率はエミュレーターの部品を使い、自分で書かない。最善手・期待値の数字は解析君に頼む。
7. 仕事の記録 (設計・調べ) は自分の部の notes/ に、やる事・OK 待ちは todo.md に。

## 地図
- 画面 src/views/simulator/: StageSimPanel.vue (入口)、工程の帯 SimStepBar・SimStepHead・SimProgress、始め方 SimStartPick・SimBaseCalc、順番のおすすめ SimAutoOrder・use-sim-auto-order (④、押した時だけ計算)、狙う SimTargetSort・StageTargetSummary・SimPasteTargets (貼り付けで写す)、打ち方 SimMethodPop・StagePatternEditor、費用 SimCostTip、レシピ SimRecipeBar・StageRecipeStart・StageRecipesPage・recipe-share.ts、StageQuizEditor・quiz-text.ts、use-sim-*.ts。
- 状態 src/state/simulator/: sim-state・sim-recipes・sim-recipe-store。
- 仕組み src/services/simulator/: quiz-recipe.ts (`runQuizOnce`)・paste-target.ts (貼り付け → ② の狙い、読みは htc/paste)・quiz-build.ts (`quizFromSim`)・quiz-samples・recipe-*.ts・pattern.ts・sim-greater・sim-methods・keep-compare・self-craft-dist・auto-group。共通の run-plan・contract・share・trade-search は services/craft-stage/ (dev/README.md の境目)。
- 仕組み src/services/simulator/auto/ (順番だけ自動): auto-order.ts (候補・絞り・ワーカーの呼び出し)・auto-order.worker.ts・auto-solve-stub.ts (解析君の計算ができるまでの仮) はシミュ部長、auto-solve・auto-model・auto-actions (計算) は解析君。入口の形は共有メモ auto-order-api.md。
- 仕組み src/services/simulator/htc/: sim-route*.ts・tree-decide*.ts・tree-fracture-plan・tree-buy・base-choice・self-fracture・step-odds。src/services/htc/ に残る物: buy-or-craft・prices.ts・price-keys.json・paste*.ts。サーバー server/live/src/sim.ts・wrangler.sim.jsonc。
- チュートリアル・コース: 画面 src/views/tutorial/ (StageCourses・StageTopicGuide・StageCourseGuide・GuideVideoCard・Video*.vue・use-anim・anim-clock・use-video-hand)、仕組み src/services/tutorial/ (topic-courses* (段 5 クラフト手順は topic-courses-guide)・course-*・craft-courses・quiz-tutorial*・compare)、状態 src/state/tutorial/ (craft-course・craft-topic・craft-lesson)。
- 台本 scripts/: check-htc-sim-route・tree-decide・tree-auto・tree-buy・step-odds・start-kind・self-fracture (check-htc-*.mjs)・sim-telemetry.mjs。
- テスト tests/simulator/ (recipe-sim・sim-recipes・quiz-recipes・auto-group)・tests/tutorial/ (quiz-tutorials・topic-courses・craft-courses)。
- メモ: 決め sim-decisions-2026-10-20・sim-split-by-side・sim-step-pages・feedback-show-sim-rules・sim-cost-model・sim-no-trade-fetch / 方向 play-recipe-direction・quiz-recipe・recipe-showcase・craft-challenge / 自動 optimal-craft-dp・handoff-2026-10-22。
- docs: decisions/002・003 (決着済み)、craft-challenge.md、reviews/2026-10-18-sim-ux-10.md。
