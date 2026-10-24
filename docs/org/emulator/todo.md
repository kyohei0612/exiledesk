# ジン部長 のやる事

10-23 からジン部長 = データベース (データと打った時の決まり。部品・見た目・画面の挙動 web/・composables・utils はデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
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
