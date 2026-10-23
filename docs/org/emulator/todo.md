# ジン部長 のやる事

10-23 からジン部長 = データベース (データと打った時の決まり。部品・見た目・画面の挙動 web/・composables・utils はデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
- 済み (7 本目、10-23): モンキー 12 は開発版で直っていた。3 の連打の守り (e643ee9a)・2 routes (96bb584d)・9 sfx (a96ebff8) は直して push、src/web・utils がデザイン部長の物になったので確かめごと渡した (notes/2026-10-23-monkey-web-handover.md)。fractureStart (J1)・placeMods (J2) は engine-sim.ts に入れてシミュ部長 17 本目に知らせ済み。
- 引き継ぎ (10-23、6 本目 → 7 本目): 宛先は dev/todo.md の表。途中の物・触っている行・立てた物 (Chrome・dev サーバー) は無し、開発版と 9333 は空きに戻した。
  - 次の仕事 (ブラック 8 代目の頼み、オーナー OK 10-23): エンジンの中だけの死蔵の洗い出し。対象 = services/htc のアプリの名残・旧シミュの run-plan / contract・使われない export と JSON など、エンジンの持ち場の中だけ (画面の部長の持ち場には触れない)。形: まず「poe2db 由来のデータと決まり / それ以外」に分けた一覧を emulator/notes/ に書き、ブラックに 2〜5 行で報告。消すのは一覧を見せてから。確かめは型チェック・小さく (エミュの画面の同じ所の答えと同じか)。シミュの死蔵の一覧 docs/org/simulator/notes/2026-10-22-dead-code.md の作り (import のグラフ・export の名前の数え) が参考。
  - 返事待ち (ブラック): 見張り D の残り 4 行 = クラフト台 → views/tutorial/course-entry.ts (チュートリアルの差し込み口)。for-share へ移すか見張りで許すか。
  - 6 本目の分 (全部 push 済み、経過は notes/2026-10-22-entry-split-plan.md の「進み」):
    - エンジンの形: 核 (services/craft-stage) / engine-emu/ (preview・spam-race・chaos-spam・route-runes) / engine-sim/ (hand-effect = fillCatalyst 一式・magic-odds・spam-counts・outcomes・essence-parts)。窓口 engine.ts・engine-emu.ts・engine-sim.ts。核は engine-*/ を読まない、engine-emu/ と engine-sim/ は互いを読まない。見張り check-engine-entry: A 入口の外 (今 96 行 = シミュ・チュートリアル・解析、付け替えの対応表 notes/2026-10-23-sim-import-map.md、エミュは 0 行)・C よその窓口 0・D エミュ ⇄ シミュ 4。
    - シミュ由来の包みは消した (0689aa28): tree-play.ts を消し、打てるかは核の useReason に 1 つ (クラフト台と棚)。木の中の打ち方はシミュの tree-sample・当たりの判定は tree-aim.ts。
    - 画面の部品は共通管理 for-share (デザイン部長の物、渡した): 棚・アイテムのカード・MOD 表の土台 ModTable (エミュは views/craft-stage/StageModList、シミュは TreeGoalPage が slot で足す)。クラフト台の中の旧シミュの形は死蔵として消した (37d1bdcf)。
    - 気付き: git rm / git mv で先に index に積むと他の人の引数なしの commit に混ざる (4f97fc8e)。mv してすぐ `git commit -- <パス>`。Bash では \ が 1 段消える (台本の正規表現は Write / Edit で)。移しの台本の作り (移した先へ相対 import を直す) は notes の「進み」に書いた手順で。
- 済んだ物 (FAQ の入れ物・名前の突き合わせ・お告げの下の設定・golden の取り直し・J11) は notes/2026-10-23-todo-archive.md に移した (本番の OK 待ちは docs/pending-release.md)。
- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行はサーバー管理人、コメント欄はこれから。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit と OK 待ちはエミュ部長。
