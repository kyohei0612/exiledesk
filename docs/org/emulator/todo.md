# ジン部長 のやる事

10-23 からジン部長 = データベース (データと打った時の決まり。部品・見た目・画面の挙動 web/・composables・utils はデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
- 次の部長へ (9 本目 → 10 本目、10-25。会話 850 件超え・送信の上限でブラック 10 代目の頼み):
  - 役: データセンター (オーナー 10-25「核の情報をただ持ってるだけ」)。データと決まりの事実を答える・データの元 (トレード > poe2db) からの取り込み・エンジンの核 (engine*.ts ほか) を足す。ビルド・出し方・Web の土台・照らしの台本は受けず owner-of で持ち主へ (README の頭)。持ち物の移し 701e97b5: vite.web.config・robots.txt・build-seo-pages・preview-prod・compare-* = サーバー管理人、public/sw.js = デザイン、check-monkey-engine・_monkey-* = モンキー。
  - 目録 data-catalog.md (79c1b408): ① 目録は書けた (よく聞かれる答え 21 行・データ 11 種・入口の名前の全部と使っている部)。② engine.ts に PRICE_KEYS・ESSENCE_TABLE を出した。デザインの付け替え 2 か所 (state/for-share/craft-stage-shelf.ts → PRICE_KEYS・ESSENCE_TABLE、components/for-share/mod-list/stage-mod-list-look.ts → ESSENCE_KEYS) はブラックに未報告。③ README に目録の 1 行を足す部の一覧 (emu・simulator・design・skins・monkey・analytics・解析君) もブラックに未報告 → 共有メモ jin9-replies-2026-10-25.md の末尾をブラックへ。
  - 今夜の判定 (エンジンは直していない): カオス + 削減の当たるまで = エンジンが正しい (heldOdds と打った結果は同じ、削減で抜けられない形がある。残りのずれはツリーが多い側、止まった人のアイテム待ち、シミュ todo「24 → 25」)。無限のエッセンス = 筋力・器用さ・知性を 1/3 ずつ (ツリーが筋力 100% にしていた)。指名の無いフラクチャー = 新しく ✦ になった MOD が狙いなら当たりで 25% が正しい (ツリーの結果の分け方の側)。
  - ほかに入れた物: 「最大ルーンワード +#」の + 抜け (fa486fd4)。お告げ付きの spamRun は足して取り消した (9e4a8d51、オーナー「スパムシミュレーターは参照したらだめ」)。スキンの一覧のデータ (d518b552) はスキン部長へ渡した。
  - 返事の全文: 共有メモ C:/Users/kyohei/AppData/Roaming/Claude/side-session-notes/local_52fe22f9-cf1b-45a0-a390-c0d305e6b60a/jin9-replies-2026-10-25.md。途中の物・触っている行・立てた物は無し。
- 次の部長へ (8 本目 → 9 本目、10-24。詳しくは notes/2026-10-24-jin8-handover.md):
  - 今: 本番は v0.1.596 (main をそのまま出す形、OK 待ちは src/web/release-flags.ts のスイッチ)。途中の物・触っている行・立てた物 (Chrome・dev サーバー) は無し。
  - 照らしの台本 scripts/check-monkey-engine.mjs (+ _monkey-engine-entry.ts・_monkey-tree-walk.ts) は棚・お告げ・手の割合・完成と個数の 4 つ。隊長の all3・g3 ですべて幅の中。ずれたら先に台本を疑う。
  - 入口に足した口: essence (MOD 一覧)・cardTierName・craftedKindOf・fractureStart の avoid・goalBlock。画面はデザイン部長・シミュ部長の物 (スイッチの下)。
  - 待ち: タリスマンの物理の段 (トレード P6 / エンジンと poe2db は 9 段で T5、未決)・冒涜専用が貼り付けで段 0 かの見本。
  - 気を付ける: オーナー「ジンはデータベース、打ち方の見立ては出さない」。テストの落ち 5 本はオーナーが言うまで触らない。一時の worktree に node_modules をつながない。
- 済んだ物 (FAQ の入れ物・名前の突き合わせ・お告げの下の設定・golden の取り直し・J11) は notes/2026-10-23-todo-archive.md に移した (本番の OK 待ちは docs/pending-release.md)。
- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行はサーバー管理人、コメント欄はこれから。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit と OK 待ちはエミュ部長。
