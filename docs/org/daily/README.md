# デイリー部長 (デイリークラフトチャレンジ)

毎日のお題をシミュレーターで組んで平均の費用で競う、デイリークラフトチャレンジの係 (オーナー 10-22)。別ページ (タブを 1 つ増やす)。構想はメモ craft-challenge の「10-22」の節が正。docs/org/dev/README.md の決まりが先。

## 決まり (10 行まで)
1. 持ち物は src/views/daily/ と docs/org/daily/。後から server/live のデイリーの所・D1 の表・src/state/daily*.ts も持つ (作る時に owners.txt に足す)。
2. 決まりの正は設計図 docs/spec/daily.md (D-xx)。今の段は D-90 = 持ち場の中で動く形 (サーバーは daily-api.ts の localStorage の仮)、開発版だけ。よその部の物は D-91 の一覧にして返す。
3. よその部の物はブラック経由で頼む (ページの入口・タブ・部品・見た目はデザイン部長、シミュの画面を開く口はシミュ部長、サーバーの共通の所はサーバー管理人)。
4. 画面は shared-ui.md (U-xx)、広告の枠は Y-20 (別のページ・両脇に縦長の枠)、英語は U-60〜62。
5. 構想は動かさない (全部は notes/2026-10-23-rules-archive.md): 投稿 → オーナーの精査 → 1 日 1 個、朝 7 時更新・月曜リセット、平均の費用で競い完成率 90% で解決。
6. 確かめは手元の dev サーバー (1440、Y-70) を窓なし Chrome で撮る (1660×860 と mobile)。確認用の Chrome は使う前と返す時にブラックへ 1 行。前後のスナップで報告し、見た目の OK はオーナー (G-08)。
7. 迷った所 (見せ方の案が 2 つ以上) は、作る前に案をスナップか絵でブラックへ。勝手に決めて作り込まない。

## 地図
- 構想: メモ craft-challenge (10-22 の節)、docs/craft-challenge.md (古い 2 コースの記述は 10-22 に 1 本へまとまった、反映はシミュレーター完成後)。
- 書きかけ: ブランチ wip/craft-challenge (10-16 の古い形、今は使わない・参考だけ)。
- ページの作り: src/web/page.ts の頭のコメント (?page=○○ と題)、広告の枠 utils/ads.ts の pageTick。
- 作り (11-01): src/views/daily/DailyPage.vue (出し分け)・DailyHero (お題の顔)・DailyRank (順位)・DailyName (名前とタグ)・DailyNick (名前の窓)・DailyPost (投稿)・DailyPlay (挑戦、SimTreePage を中に置く)・DailySkins (皮の見比べ)・daily-api.ts (サーバーの口の形)・daily-gen.ts (毎朝の生成)・daily-types.ts (型の辞書)・daily-aims.ts (読み・お題の木)・daily-samples.ts (順位の見本)・skin/skin.ts (皮、1 行 1 色)・daily-skin.css (形だけ、色を書かない)。
- やる事・OK 待ちは todo.md、記録は notes/。
