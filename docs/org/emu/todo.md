# エミュ部長 のやる事

決まりの正は docs/spec/emu.md (M-xx)。済み (ジン部長の時代、画面の物)・10-22 深夜の引き継ぎ・10-23 の済みは git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md。10-25〜28 の記録は 11-10 の棚卸しで下の「閉じた物」に 1 行ずつ (全文は git の履歴)。

## 覚え (3 本目 local_ff576711 から、10-25 昼)
- emuFresh の形: リロード・アドレスの打ち直し・外のサイトから来た時はベース選びの空から、ブラウザの戻る・記事のロゴやヘッダーなど同じサイトのリンクは前の画面 (10-22 の決めは残す)。エミュ側は use-stage-base.ts (スマホの選んだ事のある人もベース選びから、4c49ebd9)、写しの分け方は stage-session.ts の hasUsableSession (29e4068a ジン 10、版替わりの自動の読み直しでは消さない 8b145a7e デザイン 6)。stage-session.ts の持ち主はデザインに移る (ブラック 10 代目)。手元 1440 で 4 通り確かめ済み、スマホの幅は見ていない。
- 気を付ける (2 本目から): 長く動いた dev 1440 は HMR の残りで同じモジュールが 2 つ読まれ、use-stage-base の様な 1 つだけの物が割れて「押しても進まない」に見える。変だったら dev を立て直してから疑う。devtools の Chrome は自分で立てていなければ止めずにブラックへ。preview:prod は TaskStop だけだと中の wrangler が残る。
- 確かめの台本のこつ: アイテムに打つのは [data-stage-card] の click、棚の札は aria-label / title に名前。ベースのページは部位のボタン (aria-expanded) を開いてからベースのボタン。

## やる事

## OK 待ち (エミュの画面の物。行は docs/pending-release.md、出し方もそこ)
本番の作りでは src/web/release-flags.ts のスイッチで隠し、OK が出たら RELEASED に名前を 1 行 (revert・v-show で抜く旧手順はやめた、10-24)。

## 閉じた物 (11-10 棚卸し)
- 3 本目の「今」(10-25: エミュのスイッチは gemCorrupt 以外全部本番、sanctifyBar・monkeyEmu1023・baseChosen は v0.1.598、emuFresh は v0.1.599) と gemCorrupt の寄せ — 済み (gemCorrupt は 10-28 にタブごとコードから外した = M-08 撤回・Y-17、75151d72b)
- スパムシミュの返事待ち 3 つ (今のアイテムからの時の高貴の道の灰色・この形の X のシェア・既定の始めの状態) — 決着 (10-25 夜オーナー: X のシェアは出さない・既定は今のまま・「それなら灰色でおｋ」)
- tierWord (画面の「段」→「ティア」、M-49) と、スイッチ無しの狙い 0 個の灰色 (M-60)・工程の共有を消した (M-65) — v0.1.637 で本番 (fc7f1578b)
- 他の部のスイッチでエミュの画面に出る物 (omenRow・dismiss・tierClose・modeTabs・monkey1023・fitZoom・baseValues・weights) — v0.1.598 で本番
