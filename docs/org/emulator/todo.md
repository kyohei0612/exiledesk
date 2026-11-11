# ジン部長 のやる事

10-23 からジン部長 = データベース (データと打った時の決まり。部品・見た目・画面の挙動 web/・composables・utils はデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
- **次のジンへ (10 本目 → 次、2026-10-26。オーナー 10-26: 整理が済んだらジンは常駐をやめて閉じる、パッチの決まりの変更・データの不具合の時だけ立てる)**:
  - 動く時の決まり: 立つのは MOD・カレンシーの決まりの変更 (パッチ) とエンジン・データの不具合の時だけ (オーナー 10-25 夜「ジンはMOD変更やカレンシールール変更等の修正でやっと動く」)。画面への指示・表示の決めはしない。画面はエンジンの関数を何でも直接呼んでよく、エンジンのファイルを書き換えない (書き換えはジンだけ、鍵の仕掛けの案は共有メモ side-session-notes/local_b4352604…/jin10-engine-lock-plan.md、オーナーに見せる前で入れていない)。
  - 持ち物の今の形 (owners.txt 53f3cfbc): データ (vendor/poe2htc/data・services/htc/*.json・craft-stage/stage-*.json・i18n の MOD の文)・カレンシーとお告げの効き方 (craft-stage/apply-*・omens・spec/・stage-core・stage-draw・boosts・defence)・確率と計算機の核 (held-odds・aim-odds・route-race・run-plan・mods/)・MOD の文から MOD を引く所 (htc/bridge・paste-parse・paste-targets)。よく使う名前の束 craft-stage/engine.ts (使われない名前は 10-26 に外した)。
  - 10-26 にエンジンから出した物 (sim-engine.ts・sim-engine/・emu-engine/ は 11-07 に持ち主をジンへ戻した = owners.txt、ほかはもうジンの物ではない): シミュの services/simulator/sim-engine.ts・sim-engine/ (完成形の判定・結果の箱の割合・requiredRunes・規格外の打ち方 applyUnbounded ほか)・services/simulator/paste/ (貼り付けの読み item-text)、エミュの services/emulator/emu-engine.ts・emu-engine/、デザインの src/components/art/ (base・skill・rune-art)。テスト・golden・データの台本は解析・エミュ、見張り check-engine-entry はデザイン。経過は共有メモ side-session-notes/local_cbd85ab5…/jin-split-plan.md。
  - 見張り check-engine-entry (B 凍結の htc・C エンジンはシミュ・エミュ・画面の置き場を読まない・D エミュ ⇄ シミュ・E 画面の中のエンジンらしき物・F ゲームの仕様の自前 (11-07、G-40)、控えから増えた時だけ落ちる)。
  - 10-25〜26 にジンが入れた物: 目録 data-catalog.md・outcomeOdds・貼り付けの読みの一般の解き方 (決め notes/2026-10-25-paste-hybrid-sum.md、見本 notes/paste-samples/)・足しの MOD の文を整える applyExtras の extraModText (b48d7f18)・完成形の規格外とルーン (93e81540・8824f3ef・403a3de7)。
  - 残り: テストの落ち 5 本はオーナーが言うまで触らない。
  - 送信の上限: ユーザーの書き込みなしで 10 通ほどで止まる。区切りだけ送り、止まったら共有メモに書く (docs/org/README.md)。
- 9 本目・10 本目への引き継ぎは git の履歴 (10-29 の md の整理で消した): 2026-10-26-todo-archive.md に移した。
- 済んだ物 (FAQ の入れ物・名前の突き合わせ・お告げの下の設定・golden の取り直し・J11) は git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md に移した (本番の OK 待ちは docs/pending-release.md)。
- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行はサーバー管理人、コメント欄はこれから。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit と OK 待ちはエミュ部長。

## 閉じた物 (11-10 棚卸し)
- ジン 11 本目 (10-26) の調べ「MOD 5 つのジュエルで 170 回空振り」 — 直しなし (決まりどおりの形、カオスは上限を超えた側に当たると不成立 = spec/parts.ts の overLimitVoids、170 回の人はエメラルド)
- engine.md ⑦ の残り (タリスマン・段 0・ジュエル・英語の reduced・パペットマスター・⑦12 3 属性 = E-98)・⑦13 golden の控えが 10-21 のまま — 片付いた (10-28 に ⑦ で片付け、⑦13 は 11-10 棚卸しで落とした。頼まれたら洗って取り直す)
- 貼り付けのジュエルの枠 2/2 を poe2db で確かめていない — 古い (10-28 に E-24 で片付いた)
- 本番待ちのスイッチ triAttr (E-98) と英語の reduced / less を正の数で出す直し 0967dfa33 (E-92) — v0.1.637 で本番 (fc7f1578b)
