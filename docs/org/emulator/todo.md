# ジン部長 のやる事

10-23 からジン部長 = データベース (データと打った時の決まり。部品・見た目・画面の挙動 web/・composables・utils はデザイン部長)。画面の仕事はエミュ部長 (docs/org/emu/todo.md) とシミュ部長。エンジンへの要望はブラック経由で受けて入口に足す。

## やる事
- シミュ部長 19 本目へ渡す (10-24、隊長の 4 回目の照らしの残り、エンジンは直さないと決めた): エッセンスの MOD を狙いにすると tierIndexOf は -1 になるが、同じ文の当たりあり (sameText) の aimHits は普通の MOD の段の T 以上だけを当てる (m-602 b6 でツリーの aimHeldOn が 8.25%、エンジン 8.5%)。ツリーの 0% は回す道筋の側。m-8 b6 (冒涜、ツリーが未発現を当たりに 3.5%)・m-56 b6 (完全エッセンスで全部「狙いが消えた」、エンジンは当たりで他の狙いも消えない割合が 75%) もツリーの側。記録は隊長の scratchpad の monkey/all1/。sameText 無しの aimHits ではエッセンスの狙いがどの段でも当たる (今の呼び手は全部 sameText あり)。
- 次の部長へ (7 本目 → 8 本目、10-24。詳しくは notes/2026-10-24-jin7-handover.md):
  - 今: 本番は v0.1.596 (main をそのまま出す形、OK 待ちは src/web/release-flags.ts のスイッチ)。ジンの OK 待ち 5 つは全部 RELEASED。途中の物・触っている行・立てた物 (Chrome・dev サーバー・preview) は無し。
  - 待ち: 隊長の 3 回目 (rarity 入り) を scripts/check-monkey-engine.mjs で照らす。残りの差はレアの武器・兜の骨 (シミュ部長へ渡し済み) と、マジックの手袋・矢筒の戦闘のグレーターエッセンスは決着 (10-24 ブラック: 古い読み込みの残り、立て直した dev サーバーで出て打てた。3 回目で再び出たら言う)。テストの落ち 5 本はオーナーが言うまで触らない。
  - 返した物: views/daily の 6 ファイルが読まれていない (デイリー部)、../ExileDesk-devbuild を消すか (ブラック)。テストの落ち 5 本は前から。
  - 気を付ける: 一時の worktree に node_modules をつながない (本体が消えた)。web/・utils はデザイン部長の物。正規表現の書き換えは台本ファイルで。
- 済んだ物 (FAQ の入れ物・名前の突き合わせ・お告げの下の設定・golden の取り直し・J11) は notes/2026-10-23-todo-archive.md に移した (本番の OK 待ちは docs/pending-release.md)。
- 貼り付けの読み取り parseItemText (item-text.ts) の残り: 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本が来たら notes/paste-samples/ に足して対応)。ジュエルの枠 2/2 はエンジンの値で poe2db では確かめていない。

## OK 待ち
- サイトの体裁 (1adfb648、開発版。docs/pending-release.md に OK 待ち、【要確認】5 か所はオーナーに)。ブログの部品 (d306fea0、README 4b)。
- ブログの入れ物 (開発版だけ、notes/2026-10-22-blog.md)。本番は記事を読んでもらってから (build:web に build-blog-pages.mjs を足し、BLOG_ON を外す)。日報の行はサーバー管理人、コメント欄はこれから。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit と OK 待ちはエミュ部長。
