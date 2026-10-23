# デイリー部長 (デイリークラフトチャレンジ)

毎日のお題をシミュレーターで組んで平均の費用で競う、デイリークラフトチャレンジの係 (オーナー 10-22)。別ページ (タブを 1 つ増やす)。構想はメモ craft-challenge の「10-22」の節が正。docs/org/dev/README.md の決まりが先。

## 決まり (10 行まで)
1. 持ち物は src/views/daily/ と docs/org/daily/。後から server/live のデイリーの所・D1 の表・src/state/daily*.ts も持つ (作る時に owners.txt に足す)。
2. 今の段は UI/UX のモック: データは手で書いた見本 (daily-mock.ts) だけ、サーバー・シミュ・エンジン・相場は使わない、開発版だけ。オーナーの OK まで次の段に進まない。
3. よその部の物はブラック経由で頼む (ページの入口・タブ・部品・見た目はデザイン部長、シミュの画面を開く口はシミュ部長、サーバーの共通の所は分析君)。
4. 画面はメモ MEMORY.md の「UI の決まり」と ads-page-model (両脇に縦長の枠) に従う。英語も一緒に作る (用語は GLOSSARY.md と poe2db)。
5. 構想は動かさない (全部は notes/2026-10-23-rules-archive.md): 投稿 → オーナーの精査 → 1 日 1 個、朝 7 時更新・月曜リセット、平均の費用で競い完成率 90% で解決。
6. 確かめは開発版を窓なし Chrome で撮る (1660×860 と mobile)。開発版のデプロイ・確認用の Chrome・dev サーバーは使う前と返す時にブラックへ 1 行。前後のスナップで報告し、見た目の OK はオーナー。
7. 迷った所 (見せ方の案が 2 つ以上) は、作る前に案をスナップか絵でブラックへ。勝手に決めて作り込まない。

## 地図
- 構想: メモ craft-challenge (10-22 の節)、docs/craft-challenge.md (古い 2 コースの記述は 10-22 に 1 本へまとまった、反映はシミュレーター完成後)。
- 書きかけ: ブランチ wip/craft-challenge (10-16 の古い形、今は使わない・参考だけ)。
- ページの作り: src/web/page.ts の頭のコメント (?page=○○ と題)、広告の枠 utils/ads.ts の pageTick。
- モックの作り (10-22): src/views/daily/DailyPage.vue (3 ページの出し分け、dailyPage を読んで openDailyPage で移る、入口・URL・題は web/page.ts = デザイン部長、10-23)・DailyTopicCard (大 / 小のカード)・DailyModList (MOD の行、フラクチャー選びにも)・DailyMine (自分の結果)・DailyStart (フラクチャー選び、枠の外・Esc で選ぶ前に戻す)・daily-mock.ts (見本のデータ、MOD の文は mod-lines-ja-en.json の写し、7 時と月曜 7 時の残り untilRefresh)。
- やる事・OK 待ちは todo.md、記録は notes/。
