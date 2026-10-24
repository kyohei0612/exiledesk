# エミュ部長 のやる事

## 次の部長へ (2 本目 local_4123d2c2 から、10-24 昼)
- 今: 本番 v0.1.596 は main の作り。OK 待ちのエミュの物は src/web/release-flags.ts のスイッチの下 (sanctifyBar・monkeyEmu1023・baseChosen、cd4586ec)。OK が出たら RELEASED に名前を 1 行。中身と commit は docs/org/dev/notes/2026-10-24-main-release.md の「進み」。
- やりかけ: 無し。段 5 (古い作りを消す) のエミュ分は済み (8b661220・565dfebd)。mode の型の "sim" を外すのはジン部長 (565dfebd の後)。
- 待っている返事: 無し。ベースの印 (baseChosen) は「人が自分で選んだベース」1 つで選んだ見た目・帯とすぐ試す・入口の行き先を決める (exiledesk.stage.chosenBase、すぐ試すも選んだ扱い)。本番の形は FIRST_BASE_KEY。
- 気を付ける: 長く動いた dev 1440 は HMR の残りで同じモジュールが 2 つ読まれ (?t= 付きと無し)、use-stage-base の様な 1 つだけの物が割れて「押しても進まない」に見える。変だったら dev を立て直してから疑う (10-24 モンキー 3 番)。
- 気を付ける: devtools の Chrome は前の人の物が動いたままの事がある。自分で立てていなければ止めずにブラックへ。preview:prod は TaskStop だけだと中の wrangler が残るので、1460 が閉じたか見て木ごと止める。
- 本番の形は 561ddbe7 の空の箱 (flag("sim") の下、シミュを出す時に消える) でスマホの 6px を合わせている。

## 引き継ぎ (10-22 深夜、ジン部長からエミュの画面を分けた)
- 1 本目 (local_e86c6527-e247-441a-bc94-1bb5cfbbd498) が docs/org/emulator/todo.md と docs/pending-release.md から画面の仕事を下に写した (ジン部長の todo からは、ジン部長が消す)。立てた物 (Chrome・dev サーバー) は無し。
- 入口を通らずに読んでいる所の一覧: notes/2026-10-22-engine-direct-imports.md (147 行、入口にもうある名前 46・まだ無い 108。ジン部長が入口に足した後に寄せる)。

## やる事
- 済み (10-23): モンキーテスト (notes/2026-10-23-monkey.md) 9 件を開発版 9eae3311 で確かめた。直した 1・3・5・6 (c069970b)・8 (5ff2778a・9eae3311)、頼んだ 2・9 (ジン部長 96bb584d・a96ebff8)・4 (デザイン部長 396f447a)、7 は 2 回目の猿でも気付かれず、0 個で押したら「狙う MOD にチェックしてください」と出す形に直した (f261b842)・「回す」で持ち物が外れる (枠の外の決まりどおり)、再現せず 9 (タップ 21 回で 0)・CSP。気付き: 共通の style.css の button の cursor が層の外で勝つので、押せないボタンが全部指カーソル (デザイン部長に知らせた)。
- 済み (10-23): 入口だけに寄せた。ジン部長の対応表 (emulator/notes/2026-10-23-emu-import-map.md) で 51 個・14 ファイルを engine.ts / engine-emu.ts に付け替え、見張りの A (入口の外) はエミュ 0 行。残りは入口でない共通 8 行 (share・trade2・market・currency など、決まりの外)。
- 済み (10-23): エミュの画面がチュートリアルを読む 6 行は、シミュ部長の入口 src/views/tutorial/course-entry.ts (bfe9d291) からに付け替えた (ブラック 8 代目の決め: エミュはそこだけを読む)。見張りの D は course-entry も数えるので 4 行残る (入口を例外にするかはジン部長・ブラック)。
- クラフト画面 1440 幅で元からはみ出している 1 件 (DIV.flex flex-col、overflow-guard の判定で見つけた、10-22 ジン部長の記録) を直す。
- 返事待ち (オーナー、スパムシミュ。FROM_ON・ROUTES_MULTI_ON は v0.1.593 で本番に出て、どちらも今は true): 今のアイテムからの時に高貴の道も灰色 (増強だけでよいか)・この形の X のシェア (開いた人は同じアイテムを持っていないので今は出さない)・既定の始めの状態を今のアイテムにするか。複数の当たりのシェアは a に全部入る、両方揃うまでの数字はシェアに入れていない。スナップ 共有メモ routes-from/・multi-aim/。

## OK 待ち (エミュの画面の物。行は docs/pending-release.md、出し方もそこ)
本番の作りでは src/web/release-flags.ts のスイッチで隠す。OK が出たら RELEASED に名前を 1 行足す (revert・v-show で抜く旧手順はやめた、10-24)。
- baseChosen: 人が自分でベースを選んだかを 1 つの印 (exiledesk.stage.chosenBase) に (2aa2d268・3cbda7e4、デザイン部長の BasePickBody の quick 7cde43ad・b1b22818 と組)。選んだ見た目・帯とすぐ試す・入口の行き先をこれで決め、すぐ試すは選んだ扱い。開発版 2fae18a4 でオーナーと同じ状態から 4 通りを PC・スマホとも本物のクリックで確かめ済み。使う所 StageBasePage.vue・use-stage-base.ts。
- monkeyEmu1023: モンキーテスト 10-23 のエミュの直し。スパムシミュ (c069970b: Esc は運試しの欄だけ閉じる・運試しの間は「当たった形で戻る」を出さない・スマホの札のボタンを折り返す・狙いの文を当たりの幅全部で)、品質の帯の押せないボタンは普通のカーソル (5ff2778a・9eae3311・0beb110a)、狙いの窓で 0 個のまま押すと一言 (f261b842)。使う所 StageRoutesPage.vue・StageQualityBar.vue・StageAimPicker.vue。
- sanctifyBar: 聖別の帯 (e61bb9ab、StageSanctifyBar)。使う所 CraftStage.vue の SANCTIFY_BAR。
- gemCorrupt: ジェムコラプトのタブ (23f1d1d9、オーナー 10-16「内緒」、OK 待ちではなく出す時期はオーナー)。10-24 に自前の DEV 判定から寄せた (2a55e6b9、手元の開発版 1461 にも出るようになった)。使う所 CraftStage.vue の GEM_CORRUPT_SHOWN。
- 開発版だけの印 (スイッチの外、自前の DEV 判定): MOD の数字を素の値で + 盛った値を小さく (afa0b266・86b42bb4・ada62af7・2d301a1a、for-share の base-values.ts の BASE_VALUES_ON、スナップ 共有メモ j11/)・MOD の重みを直せる (StageWeightEdit、for-share の stage-tuning.ts の WEIGHTS_ON、docs/org/emulator/notes/2026-10-22-mod-weight-edit.md)。どちらも持ち主はデザイン部長の for-share、スイッチに寄せるかはブラックの決め。
- 他の部のスイッチでエミュの画面に出る物 (持ち主が出す、画面の見え方だけ一緒に見る): omenRow (お告げの欄を札の行の下に + 打てないお告げは灰色、ff5c6f8c)・dismiss (枠の外・Esc で選ぶ前に戻す、490989fb・30760e05)・tierClose・modeTabs・monkey1023・fitZoom。

## 済み (ジン部長の時代、画面の物) は notes/2026-10-23-todo-archive.md に移した
