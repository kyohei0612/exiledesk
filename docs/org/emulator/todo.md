# ジン部長 のやる事

10-22 深夜からジン部長 = エンジンの管理者 + 境目の小物 (38982ef3。部品・見た目は 10-23 からデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
- 引き継ぎ (10-22 深夜、6 本目): 入口に足した物の一覧と突き合わせは notes/2026-10-22-sim-logic-to-engine.md (B1〜B16・C・reachableAims を heldOdds の窓口に)。3〜5 本目の履歴は notes/2026-10-22-handoff-3.md。宛先: ブラック 7 代目 local_ec583720-946a-486d-bfad-d7fe083898b3 (部長どうしで直に頼まない)。立てた物は無し。確かめの方針 (オーナー 10-22): 数え上げ・総当たりはやめ、クラフト台の同じ所の答え (heldOdds など) と同じかを小さく見るだけ。
- OK 待ち: 入口を出した側だけに分ける案 (notes/2026-10-22-entry-split-plan.md、9572f784。engine.ts 核 + engine-sim.ts / engine-emu.ts、見張りにエミュと C)。ブラックがオーナーに聞いている。
- エミュの画面が入口を通さず読む 108 個 (emu/notes/2026-10-22-engine-direct-imports.md) は、エミュ部長の要望がブラック経由で来た所から入口に足す。
- 済んだ物 (FAQ の入れ物・名前の突き合わせ・お告げの下の設定・golden の取り直し・J11) は notes/2026-10-23-todo-archive.md に移した (本番の OK 待ちは docs/pending-release.md)。
- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行は分析君、コメント欄はこれから。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit と OK 待ちはエミュ部長。
