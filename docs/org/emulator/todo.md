# ジン部長 のやる事

10-23 からジン部長 = データベース (データと打った時の決まり。部品・見た目・画面の挙動 web/・composables・utils はデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
- **ジン 11 本目 (10-26、AI の見解 10-25「MOD 5 つのジュエルで 170 回空振り」の調べ) → 直しなし**: できた道は侮蔑 (Potent Liquid Contempt = サフィ +1 枠) → 冒涜でサフィ 3 つ → 左のお告げの無効化で侮蔑を外す → 高貴 2 回でプレ 2 + サフィ 3。決まりどおりの形 (サフィ 3 のジュエル)。カオスは上限を超えた側 (サフィ) に当たると不成立 = 2026-10-14 オーナーがゲームで確認済み (spec/parts.ts の overLimitVoids)。その人は 296 回中 126 回成功していて抜け出せない形ではない (ほか 2 人も同じ手順、サファイア 40/78・6/8 不成立)。今の版 (コードは同じ) でも同じに作れて、それが正。見解の「サファイア」は別の人の物と混ざっていた (170 回の人はエメラルド)。台本は scratchpad の j5.py・j5b.py (残していない)。
- **次のジンへ (10 本目 → 次、2026-10-26。オーナー 10-26: 整理が済んだらジンは常駐をやめて閉じる、パッチの決まりの変更・データの不具合の時だけ立てる)**:
  - 動く時の決まり: 立つのは MOD・カレンシーの決まりの変更 (パッチ) とエンジン・データの不具合の時だけ (オーナー 10-25 夜「ジンはMOD変更やカレンシールール変更等の修正でやっと動く」)。画面への指示・表示の決めはしない。画面はエンジンの関数を何でも直接呼んでよく、エンジンのファイルを書き換えない (書き換えはジンだけ、鍵の仕掛けの案は共有メモ side-session-notes/local_b4352604…/jin10-engine-lock-plan.md、オーナーに見せる前で入れていない)。
  - 持ち物の今の形 (owners.txt 53f3cfbc): データ (vendor/poe2htc/data・services/htc/*.json・craft-stage/stage-*.json・i18n の MOD の文)・カレンシーとお告げの効き方 (craft-stage/apply-*・omens・spec/・stage-core・stage-draw・boosts・defence)・確率と計算機の核 (held-odds・aim-odds・route-race・run-plan・mods/)・MOD の文から MOD を引く所 (htc/bridge・paste-parse・paste-targets)。よく使う名前の束 craft-stage/engine.ts (使われない名前は 10-26 に外した)。
  - 10-26 にエンジンから出した物 (もうジンの物ではない): シミュの services/simulator/sim-engine.ts・sim-engine/ (完成形の判定・結果の箱の割合・requiredRunes・規格外の打ち方 applyUnbounded ほか)・services/simulator/paste/ (貼り付けの読み item-text)、エミュの services/emulator/emu-engine.ts・emu-engine/、デザインの src/components/art/ (base・skill・rune-art)。テスト・golden・データの台本は解析・エミュ、見張り check-engine-entry はデザイン。経過は共有メモ side-session-notes/local_cbd85ab5…/jin-split-plan.md。
  - 見張り check-engine-entry (B 凍結の htc・C エンジンはシミュ・エミュ・画面の置き場を読まない・D エミュ ⇄ シミュ・E 画面の中のエンジンらしき物、控えから増えた時だけ落ちる)。
  - 10-25〜26 にジンが入れた物: 目録 data-catalog.md・outcomeOdds・貼り付けの読みの一般の解き方 (決め notes/2026-10-25-paste-hybrid-sum.md、見本 notes/paste-samples/)・足しの MOD の文を整える applyExtras の extraModText (b48d7f18)・完成形の規格外とルーン (93e81540・8824f3ef・403a3de7)。
  - 残り (データ・決まりの側): 10-28 に engine.md ⑦ で片付けた (タリスマン・段 0・ジュエル・英語の reduced・パペットマスター)。今の残りは engine.md ⑦ 12 (3 属性のベースが選び画面に出ない、案はブラック)・13 (golden の控えが 10-21 のまま)。テストの落ち 5 本はオーナーが言うまで触らない。
  - 送信の上限: ユーザーの書き込みなしで 10 通ほどで止まる。区切りだけ送り、止まったら共有メモに書く (docs/org/README.md)。
- 9 本目・10 本目への引き継ぎは notes/2026-10-26-todo-archive.md に移した。
- 済んだ物 (FAQ の入れ物・名前の突き合わせ・お告げの下の設定・golden の取り直し・J11) は notes/2026-10-23-todo-archive.md に移した (本番の OK 待ちは docs/pending-release.md)。
- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行はサーバー管理人、コメント欄はこれから。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit と OK 待ちはエミュ部長。
