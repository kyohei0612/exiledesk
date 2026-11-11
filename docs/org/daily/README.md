# デイリー部長 (デイリークラフトチャレンジ)

毎日のお題をシミュレーターで組んでスコア (D-02b) で競う、デイリークラフトチャレンジの係 (オーナー 10-22)。別ページ (タブを 1 つ増やす)。決まりの正は設計図 docs/spec/daily.md (D-xx、構想の元はメモ craft-challenge の「10-22」の節)。docs/org/dev/README.md の決まりが先。

## 決まり (10 行まで)
1. 持ち物は src/views/daily/・server/live/src/daily/・docs/org/daily/ (owners.txt)。
2. 決まりの正は設計図 docs/spec/daily.md (D-xx)。v0.1.688 から本番 (状態は daily.md の頭の行)。開発版だけの物と作りの残りは D-90 と daily.md の ⑦。よその部の物は D-91 の一覧にして返す。
3. よその部の物はブラック経由で頼む (ページの入口・タブ・部品・見た目はデザイン部長、シミュの画面を開く口はシミュ部長、サーバーの共通の所はサーバー管理人)。
4. 画面は shared-ui.md (U-xx)、広告の枠は Y-20 (別のページ・両脇に縦長の枠)、英語は U-60〜62。
5. 構想は動かさない: 中身の正は設計図 daily.md の D-01〜04。
6. 確かめは手元の dev サーバー (1440、Y-70) を窓なし Chrome で撮る (幅は U-53b = 1920・1440・390)。前後のスナップで報告し、見た目の OK はオーナー (G-08)。
7. 迷った所 (見せ方の案が 2 つ以上) は、作る前に案をスナップか絵でブラックへ。勝手に決めて作り込まない。

## 地図
- 構想: メモ craft-challenge (10-22 の節)、docs/craft-challenge.md (古い 2 コースの記述は 10-22 に 1 本へまとまった、反映はシミュレーター完成後)。
- 書きかけ: ブランチ wip/craft-challenge (10-16 の古い形、今は使わない・参考だけ)。
- ページの作り: src/web/page.ts の頭のコメント (?page=○○ と題)、広告の枠 utils/ads.ts の pageTick。
- 作り: 画面 src/views/daily/ (入口 DailyPage.vue、サーバーの口は daily-api.ts)・サーバー server/live/src/daily/ (D-56)。設計図 daily.md の ③ 決まり・④ 表示。
- やる事・OK 待ちは todo.md、記録は notes/。
