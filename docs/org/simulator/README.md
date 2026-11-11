# シミュ部長

シミュレーター = クラフトの道 (ツリー。ベース選び ?page=sim-base → 完成の MOD ?page=sim-mods → ツリー ?page=sim-tree、レシピ ?page=recipes)・費用・チュートリアル / コースの画面の持ち主。作る・確かめるは手元 1440 (Y-70)。

## 決まり (正は設計図 docs/spec/sim-tree.md・sim-tree-k.md の S-xx、チュートリアルは docs/spec/tutorial.md の T-xx。ここは番号を指すだけ)
- 新しい事は 設計図に書く → オーナーの OK → 作る → 同じ commit で設計図を直す (G-20)。出す前は最終チェック長の猿の結果報告 (G-21・R-18)、フルチェックはオーナーの指示の時だけ (sim-tree.md ⑤)。
- よく指す番号: 打つ手は自由・☑ だけ当たり (G-03・S-20・S-22)、起こりうる結果を全部箱で (S-21)、同じ形 (S-60〜S-64)、表示はその箱の見本と作った手から (S-81)、名前はエンジン参照 (G-05・S-84)、シミュに自我はいらない (S-110)、スマホは読むだけ (S-94)、開く木の順 (S-02)、レシピは消さない (S-100)、ツリーの体験は妥協しない (S-88)。
- ゲームの中身 (打てるか・結果・当たり外れ・確率・MOD の文) はエンジンの関数を呼ぶだけで自前で作らない (G-06・G-40)。共有の部品にするかの線は U-01。
- 組織の回し方 (常駐しない・報告) は G-26b と dev/README.md。触るファイルは dev/touching/simulator.md。

## 地図 (ファイルの並びは書かない。持ち主は `node scripts/owner-of.mjs <パス>`、今のスイッチは src/web/release-flags.ts の RELEASED)
- データとエンジンの答えの呼び方: docs/org/emulator/data-catalog.md。JSON を直に読まずエンジンの関数で。
- 画面 src/views/simulator/
  - tree/ = ツリーの画面 (入口 SimTreePage.vue、状態の入口 use-tree.ts、箱 TreeBox.vue、打つ手の棚 TreeHandShelf.vue、重ね窓 TreeOverlays.vue)。設計図 sim-tree.md の ③ 決まり・④ 表示。
  - phone/ = スマホの全体図 (S-94)。
  - tutorial/ = ツリーのチュートリアル (画面の目印は T-13。目印を変える時はチュートリアル係に一言)。
  - 直下 = レシピの一覧 StageRecipesPage.vue・共有 URL recipe-share.ts・カード絵の値 recipe-card.ts。
  - ページの入口 (treePage・page.ts・WebApp.vue)・棚・カード・MOD 一覧 (src/components/for-share・src/state/for-share) はデザイン部長。エミュの画面 (src/views/craft-stage・src/state/emulator) は import しない (見張り check-engine-entry の D)。
- 仕組み src/services/simulator/
  - tree/ = 木の形と辿り方 (tree-model.ts = 箱と枝・整列、tree-sample.ts = 箱の見本、tree-run.ts = 100 人回し、tree-check.ts = ルート精査、tree-hands.ts = 打つ手と名前)。
  - sim-engine.ts・sim-engine/ = シミュだけが使う計算。持ち主はジン (owners.txt)、ここは呼ぶだけ。
  - auto/ = 順番だけ自動 (計算は解析、呼ぶ側 auto-order*.ts はシミュ)。paste/ = 貼り付けの読み。
  - htc/ と src/views/htc-craft/ = アプリの旧計算機専用・凍結。Web から import しない、決まりの直しは Web 側だけ (S-113)。
- 状態 src/state/simulator/ (木のレシピ tree-recipes)。サーバー server/live/src/sim.ts。
- チュートリアル・コース: 画面 src/views/tutorial/ (差し込み口 CourseHost.vue)・仕組み src/services/tutorial/・状態 src/state/tutorial/ (判定は course-host.ts 1 か所)・テスト tests/tutorial/。設計図 tutorial.md。
- 台本: scripts/_tree-*-probe・_sim-formula-probe (回し方は各 .config.ts を `pnpm exec vitest run -c`)、scripts/sim-telemetry.mjs。出す前の見張りは scripts/sim-watch/ (手引き docs/org/dev/sim-watch.md、最終チェック長の道具)。AI 自動ツリー (S-170〜S-176) は scripts/ai-tree/README.md。
- 設計の記録 (notes/): 2026-10-22-manual-sim-design.md (ツリーの元の設計)・2026-10-22-tree-memo-window.md・2026-10-22-tree-look-remake.md・2026-10-23-tree-vueflow.md (Vue Flow の見え方)・2026-10-22-sim-own-logic.md (エンジンへ寄せた物の一覧)。いつ何を消したかは git の履歴。
