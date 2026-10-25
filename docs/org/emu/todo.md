# エミュ部長 のやる事

## 次の部長へ (3 本目 local_ff576711 から、10-25 昼)
- 今: エミュのスイッチは gemCorrupt (オーナー 10-16「内緒」、出す時期はオーナー) 以外、全部本番に出た。sanctifyBar・monkeyEmu1023・baseChosen は v0.1.598 (c82ef4b8)、emuFresh は v0.1.599 (043a0083、オーナー「emuFresh も本番出して OK」)。本番は今 v0.1.600。
- emuFresh の形: リロード・アドレスの打ち直し・外のサイトから来た時はベース選びの空から、ブラウザの戻る・記事のロゴやヘッダーなど同じサイトのリンクは前の画面 (10-22 の決めは残す)。エミュ側は use-stage-base.ts (スマホの選んだ事のある人もベース選びから、4c49ebd9)、写しの分け方は stage-session.ts の hasUsableSession (29e4068a ジン 10、版替わりの自動の読み直しでは消さない 8b145a7e デザイン 6)。stage-session.ts の持ち主はデザインに移る (ブラック 10 代目)。手元 1440 で 4 通り確かめ済み、スマホの幅は見ていない。
- 10-24〜25 に寄せた物: ジェムコラプトのタブの自前の DEV 判定をスイッチ gemCorrupt へ (2a55e6b9。前は手元 dev だけ、今は手元の開発版 1461 にも出る)。
- やりかけ・待っている返事: 無し (下の「やる事」の返事待ち 1 件は前からの物)。立てた物 (Chrome・サーバー) は止めた。
- 気を付ける (2 本目から): 長く動いた dev 1440 は HMR の残りで同じモジュールが 2 つ読まれ、use-stage-base の様な 1 つだけの物が割れて「押しても進まない」に見える。変だったら dev を立て直してから疑う。devtools の Chrome は自分で立てていなければ止めずにブラックへ。preview:prod は TaskStop だけだと中の wrangler が残る。
- 確かめの台本のこつ: アイテムに打つのは [data-stage-card] の click、棚の札は aria-label / title に名前。ベースのページは部位のボタン (aria-expanded) を開いてからベースのボタン。

## やる事
- 10-22 深夜の引き継ぎと 10-23 の済み 3 つ (モンキーテスト 9 件・入口だけに寄せた・チュートリアルの入口) は notes/2026-10-23-todo-archive.md に移した (10-25 ホワイト)。
- クラフト画面 1440 幅で元からはみ出している 1 件 (DIV.flex flex-col、overflow-guard の判定で見つけた、10-22 ジン部長の記録) を直す。
- オーナーの答え (10-25 夜、ブラック 11 代目経由): X のシェアは出さない・既定の始めの状態は今のまま。高貴の道の灰色は説明の後に「それなら灰色でおｋ」= 決着。元の返事待ち (スパムシミュ。FROM_ON・ROUTES_MULTI_ON は v0.1.593 で本番に出て、どちらも今は true): 今のアイテムからの時に高貴の道も灰色 (増強だけでよいか)・この形の X のシェア (開いた人は同じアイテムを持っていないので今は出さない)・既定の始めの状態を今のアイテムにするか。複数の当たりのシェアは a に全部入る、両方揃うまでの数字はシェアに入れていない。スナップ 共有メモ routes-from/・multi-aim/。

## OK 待ち (エミュの画面の物。行は docs/pending-release.md、出し方もそこ)
本番の作りでは src/web/release-flags.ts のスイッチで隠し、OK が出たら RELEASED に名前を 1 行 (revert・v-show で抜く旧手順はやめた、10-24)。
- gemCorrupt: ジェムコラプトのタブ (23f1d1d9、オーナー 10-16「内緒」、OK 待ちではなく出す時期はオーナー)。使う所 CraftStage.vue の GEM_CORRUPT_SHOWN。
- 済み (本番に出た): baseChosen・monkeyEmu1023・sanctifyBar (v0.1.598)、emuFresh (v0.1.599)。他の部のスイッチでエミュの画面に出る物 (omenRow・dismiss・tierClose・modeTabs・monkey1023・fitZoom・baseValues・weights) も v0.1.598 で出た。

## 済み (ジン部長の時代、画面の物) は notes/2026-10-23-todo-archive.md に移した
