# デザイン部長 のやる事

## 次の部長へ (5 本目 → 6 本目、10-25)
- 今の状態: 本番は main をそのまま出す形。出していない物は src/web/release-flags.ts のスイッチの下、OK 待ちと日英の更新内容は docs/pending-release.md。最終チェック長 (local_d3a3659e) がコスメティックの本番を進めている最中。
- 本番待ちで残っている 2 つ (オーナー 10-25 スマホの見え方、ブラック「同じ本番に」): **スマホの展開の追従**と**スマホはヘッダーのブログを残す**。どちらも 5883ca99 で commit 済み・dev 1440 の 375 日英で確かめ済み (台本 design5/phone-header-follow.mjs)。**まだ最終チェック長へ知らせていない** (送信の上限)。最初に最終チェック長へ 1 行: 「5883ca99 = スマホのヘッダー 1 段・ブログはスマホで残す・ベースの一覧の展開の追従 (開いた時・属性を替えた時・もっと見る / たたむ、帯は上へ戻るに隠れない下 64px)。本番の形での撮り直しを」。同じ本番の 9412354b (タブ 2 列)・5c8f70a6 (題の札・上へ戻る) は送れている。
- 洗い出しの結果: PC で付いていてスマホで付いていなかった展開の追従はベースの一覧 (BaseCatalog、エミュのベースのページとシミュの完成形の設定で共通) の 3 つだけ。ほかの開く所 (keep-place・revealOpened・revealNext) はスマホも同じ作り。
- 持ち物の足し: public/sw.js (10-25 にジン部長から、701e97b5。FILE_RE に mtx-art 入り)、src/web/ToTop.vue・LeaveConfirm.vue。コスメティックの中身 (views/skins・データ・絵) はスキン部長、入口・題・page.ts・スイッチ skins はデザイン。スイッチの下の私の物は notes の 4 → 5 の列 (sim・daily・dismiss … firstVisit1024) + skins・noHeaderBlog。
- 気を付ける事: 題の札の幅は game-ui.css の :has で各画面のファイルに触らず効かせている (h1.g-tabbar.g-brush と、それを包む段)。ヘッダーの間はスマホと PC で分けて書く (共通の gap-3 がスマホの gap-1 に勝っていた)。セッションどうしの送信は、オーナーが打ってから 10 通で止まる。大事な物から送る。
- 台本: 共有メモ side-session-notes/local_52fe22f9-…/design5/ (leave-check・row-remove-check・tier-check・skins-check・tabs-check・tabs-phone-check・blog-check・phone-title-top・totop-bar・phone-header-follow.mjs、報告の写し report-2026-10-25-skins.md)。ブラックの組の所 local_b4352604-…/design5-handover-skins.md にも同じ報告。5 本目の記録と 4 → 5 の引き継ぎは notes/2026-10-25-design5-handover.md。

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
