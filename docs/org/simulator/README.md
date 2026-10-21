# シミュ部長

シミュレーター ①〜⑥ (打ち方を組んで何百人分作る、開発版だけ)・自動モードの画面側・費用・チュートリアル/コースの持ち主。

## 決まり (docs/org/dev/README.md の決まりが先)
- 呼ばれたら常駐 (初めて仕事が来た時にブラックが立て、そのブラックの間は開きっぱなし)。仕事はブラックから直接来て、結果の報告もブラックへ直接 SendMessage 2〜5 行 + 中身は todo.md・notes/ (オーナー 10-21)。同じファイルの仕事は順に、触るファイルは始める前に dev/todo.md の「触っている」に自分で書く。自分の commit の push と開発版 (deploy:web-dev) は自分で、本番は最終チェック長 (dev/README.md の決まり 1・2・5・8)。
1. 開発版だけ (`SIM_LOCKED`)。本番に出すのはオーナーが決める。
2. 自動でやる打ち方の決まりは必ず画面に文で出す (メモ feedback-show-sim-rules)。
3. 両側の「どれか」は側ごとに分ける (sim-split-by-side)。工程ごとに 1 ページ、初心者でも分かる形 (sim-step-pages)。
4. 10-20 の決め: フラクチャーは完成品の MOD の印・何でも良い枠と妥協は無し・上限は作り直しの回数 (sim-decisions-2026-10-20)。
5. 自動で組む段は T2 以上まで。② に T1 の狙いがあってもチェックは押せ、押すと警告のポップアップ「T1 の狙いがあります。自動は T2 以上として組みます (T1 は完成しにくく計算も長い)。」[T2 以上にして自動にする] [手動のまま] (日英)。前者で T1 の狙いを T2 以上に下げて自動に (Ctrl+Z で戻せる)。フラクチャー固定の T1 は打たないので下げない (オーナー 10-20)。
6. 関門の打ち止めはベース 1 個ごとに数え、買い直したら 0 に戻す。買い直しは N 回まで (N は解析君が見本で 99% の人が収まる回数を丸めて決める)、超えた人は未完成で費用は入る (オーナー 10-20)。
7. 値段は手入力 + 検索を開くボタンだけ、取引所の自動取得は使わない (sim-no-trade-fetch)。
8. 打つ処理・確率はエミュレーターの部品を使い、自分で書かない。最善手・期待値の数字は解析君に頼む (ブラック経由)。
9. ツリーは「誰もがクラフトを試しやすい」ためのユーザー体験が芯で妥協しない (オーナー 10-22)。確かめは開発版にデプロイした物を本物のマウスの入力で一手ずつ触り、そのたびにスナップを見て普通の良いアプリと比べる (zoom が 1 でない 1280・1920・2560 幅も)。台本の数え (交差 0・24px 以上など) は足しで、数字が 0 でも見て汚ければ直す。報告には何で確かめたか (本物のマウス / 台本、開発版 / 手元) を書く。見た目はリサーチ長のノードエディターの見本 (research/notes/2026-10-22-tree-ui-references.md) に合わせて作り直す前提。

## 地図
- 画面 src/views/simulator/: SimHost.vue (CraftStage.vue の差し込み口: header / tools / main。シミュの画面はここから。CraftStage.vue は触らない、R4 2026-10-20)、StageSimPanel.vue (入口)、工程の帯 SimStepBar・SimStepHead・SimProgress、始め方 SimStartPick・SimBaseCalc、順番のおすすめ SimAutoOrder・use-sim-auto-order (④、押した時だけ計算)、自動 / 手動 use-sim-auto (切り替え・T1 の決まり・リセット)・SimAutoToggle (② の「自動で組む」)・SimAutoConfirm (確かめの窓)・SimStepBar の右端の札、狙う SimTargetSort・StageTargetSummary (並べるだけ。行 use-target-rows・付け方の ▾ use-target-plans・確率の % use-target-share、R3)、貼り付け SimPasteRead・SimBaseExtras (① のベースのページに差すシミュの物: レシピから始める・貼り付けの枠、R2)、打ち方 SimMethodPop・StagePatternEditor、費用 SimCostTip、レシピ SimRecipeBar・StageRecipeStart・StageRecipesPage・recipe-share.ts、StageQuizEditor・quiz-text.ts、use-sim-*.ts。
- クラフトの道 (ツリー、10-22 表面だけ・開発版、設計 notes/2026-10-22-manual-sim-design.md): 画面 src/views/simulator/tree/ (SimTreePage.vue = ?page=sim-tree の中身、入口の treePage・page.ts・WebApp.vue はジン部長。TreeBox・TreeHandShelf (次の手をクラフト台の棚から、カオススパム)・TreeModPick・TreeTrial (試し打ち: 棚で見本にエンジンで打つ)・TreeMemoFloat (欲しい MOD・使うカレンシーの札とツリーのメモの浮かぶ窓。動きは Windows の窓と同じ、notes/2026-10-22-tree-memo-window.md)・TreeNote (箱のメモ)・TreeCanvasTools (右下に浮かぶ道具とミニマップ、選択 / 手、10-22 見た目の作り直し notes/2026-10-22-tree-look-remake.md)・use-tree.ts = 1 つ戻す・localStorage・金の指輪の MOD 一覧・use-tree-view.ts = 拡大縮小・全画面・送り)、形 src/services/simulator/tree/ (tree-model.ts = 箱と枝・組み替え、tree-hands.ts = 打つ手と名前、tree-sample.ts = 箱の見本 (親の見本に親の手をエンジンで打ち、その箱の結果が出るまで引く)・結果の分け方・カタリストを最大まで、tree-check.ts = ルート精査、tree-model の tidy = 整列)。計算はまだ繋いでいない。
- 状態 src/state/simulator/: sim-state・sim-recipes・sim-recipe-store。
- 仕組み src/services/simulator/: quiz-recipe.ts (`runQuizOnce`)・paste-read.ts (貼り付け → ① のベース + ② の狙い。読みはエンジンの入口の parseItemText)・quiz-build.ts (`quizFromSim`)・quiz-samples・recipe-*.ts・pattern.ts・sim-greater・sim-methods・keep-compare・self-craft-dist・sim-odds (③ の式の 1 手の確率をエンジンの入口から取る部品、手 4)・auto-group。run-plan・contract・types はエンジンの核 (エンジン部の持ち物)、share・trade-search は services/craft-stage/ の境目 (dev/README.md)。
- 仕組み src/services/simulator/auto/ (順番だけ自動): auto-order.ts (候補・絞り・ワーカーの窓口 autoOrderClient)・auto-order.worker.ts (形の組み立て buildAutoModel と計算。データはワーカーが自分で読み、値段は表 + 聞き返し) はシミュ部長、auto-solve・auto-model・auto-actions (計算) は解析君。入口の形は共有メモ auto-order-api.md。
- **src/services/simulator/htc/ はアプリの旧計算機専用・凍結。Web から import しない** (手 8 の見張りで確認予定)。
- 決めた事 (2026-10-20): チュートリアル部の独り立ちは今はしない (シミュ部の中のまま)。クラフトチャレンジを始める時に再検討 (案: notes は emulator/notes/2026-10-20-engine-entry-plan.md の ④)。
- 仕組み src/services/simulator/htc/: sim-route*.ts・tree-decide*.ts・tree-fracture-plan・tree-buy・base-choice・self-fracture・step-odds。src/services/htc/ に残る物: buy-or-craft・prices.ts・price-keys.json・paste*.ts。サーバー server/live/src/sim.ts・wrangler.sim.jsonc。
- チュートリアル・コース: 画面 src/views/tutorial/ (CourseHost.vue = 差し込み口 header / main / under-item / above-shelf / overlay、判定は state/tutorial/course-host.ts 1 か所、StageCourses・StageTopicGuide・StageCourseGuide・GuideVideoCard・Video*.vue・use-anim・anim-clock・use-video-hand)、仕組み src/services/tutorial/ (topic-courses* (段 5 クラフト手順は topic-courses-guide)・course-*・craft-courses・quiz-tutorial*・compare)、状態 src/state/tutorial/ (craft-course・craft-topic・craft-lesson)。
- 台本 scripts/: _sim-formula-probe.test.ts (③ の式の前後とエンジン、`pnpm exec vitest run -c scripts/_sim-probe.config.ts`)・check-htc-sim-route・tree-decide・tree-auto・tree-buy・step-odds・start-kind・self-fracture (check-htc-*.mjs)・sim-telemetry.mjs。
- テスト tests/simulator/ (recipe-sim・sim-recipes・quiz-recipes・auto-group)・tests/tutorial/ (quiz-tutorials・topic-courses・craft-courses)。
- メモ: 決め sim-decisions-2026-10-20・sim-split-by-side・sim-step-pages・feedback-show-sim-rules・sim-cost-model・sim-no-trade-fetch / 方向 play-recipe-direction・quiz-recipe・recipe-showcase・craft-challenge / 自動 optimal-craft-dp・handoff-2026-10-22。
- docs: decisions/002・003 (決着済み)、craft-challenge.md、reviews/2026-10-18-sim-ux-10.md。
