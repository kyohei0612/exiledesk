# デザイン部長 のやる事

## 次の部長へ (7 本目 → 8 本目、10-26 夜、全セッションの切り替え)
- 今の状態: 7 本目の commit は全部 push 済みで、v0.1.609 までに本番に出た (OK 待ちの残り無し)。手で止めた物・立てっぱなしの物は無し (確かめの Chrome 9338 は台本の中で止め、使用表は空き。dev 1440 はブラックの物)。作業場所の書きかけはほかの部長の物だけ。
- 7 本目の済み (詳しくは notes/2026-10-26-design7-handover.md): ModeTabs のシミュのタブ (スマホ / simPhone)・ModTable の段の行のスマホの折り返し・離れる時の 3 択 (setLeaveGuard の save・askLeave)・自動の読み直しで「離れますか」を出さない・スマホのヘッダーの名前つきボタン / 版を消して人数だけ・スマホは省略しない (棚・ベースの一覧・カードの一言・記事・配信・MOD 表の節・棚の畳み・持ったカレンシーの説明)・共有の部品 HeldCursor.vue・StageItemCard の modsOnly。
- 決め (オーナー 10-26): スマホは省略しない・タップで別のページへ飛ばさない (メモ feedback-phone-no-truncate、例外は MOD の「n つ」のまとめ、エッセンスの段の名前は今の形)。前 / 後のスナップは共有メモ local_feea72b4…/design7-phone-omit/。
- 持ち物の増えた物: src/components/for-share/shelf/HeldCursor.vue (エミュの CraftStage・シミュの TreeHandShelf が使う)、StageItemCard の modsOnly (シミュのツリーの箱)、page.ts の askLeave・leaveCanSave、LeaveConfirm の 3 つのボタン。
- 残り (頼まれていない): 320 幅のスマホはヘッダーの右がはみ出す (361/320、前から)。相場のエラーの文の折り返しは画面で見ていない。
- 気を付ける: 本体の作業場所にはほかの部長の書きかけがいつもある。commit は自分のファイルだけ、pull で止まっても stash・--autostash は使わない (メモ feedback-no-autostash)。表 (pending-release・dev/todo) にほかの人の書きかけの行がある時は、自分の行だけを commit に入れる。
- 台本: 共有メモ local_b4352604…/design7/ (一覧は notes の記録)。6 → 7 の引き継ぎの写しも notes/2026-10-26-design7-handover.md の末尾。

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)。10-23 夜に 3 本目が fitZoom・先読み・シミュの初手・BasePickBody・ModeTabs・モンキー 4・14・15・モンキー 3・2・9 も移した (OK 待ちは上の引き継ぎに commit で並べてある)

## 10-24 の済んだ節 (アイテムの枠の取り下げ・段の表の行のボタン b6b7fea2・高速のタブ替え 2affeeeb) は notes/2026-10-24-todo-archive.md にそのまま移した

## 本番で隠すスイッチ (オーナー 10-24「今本番に出てるやつそっくり出す」) — 3d616bd1・338c1c25
- src/web/release-flags.ts。使い方・入れた物・確かめは docs/org/dev/notes/2026-10-24-main-release.md の「スイッチの使い方」と「進み」。OK が出たら RELEASED に 1 行。
- 残り: TREE_ON・DAILY_ON・SIM_LOCKED のスイッチ寄せは済み (18e66905、craft-stage.ts・web-page.ts)。見えない裏の直し (履歴・音・?lang=) を隠すかはブラックの判断。

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、オーナーの OK 待ち
- 表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。
