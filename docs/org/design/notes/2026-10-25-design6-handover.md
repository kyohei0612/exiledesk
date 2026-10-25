# デザイン 6 本目の記録と 5 → 6 の引き継ぎ (10-25)

## (写し) 次の部長へ (5 本目 → 6 本目、10-25)
- 今の状態: 本番は main をそのまま出す形。出していない物は src/web/release-flags.ts のスイッチの下、OK 待ちと日英の更新内容は docs/pending-release.md。最終チェック長 (local_d3a3659e) がコスメティックの本番を進めている最中。
- 本番待ちで残っている 2 つ (オーナー 10-25 スマホの見え方、ブラック「同じ本番に」): **スマホの展開の追従**と**スマホはヘッダーのブログを残す**。どちらも 5883ca99 で commit 済み・dev 1440 の 375 日英で確かめ済み (台本 design5/phone-header-follow.mjs)。**まだ最終チェック長へ知らせていない** (送信の上限)。最初に最終チェック長へ 1 行: 「5883ca99 = スマホのヘッダー 1 段・ブログはスマホで残す・ベースの一覧の展開の追従 (開いた時・属性を替えた時・もっと見る / たたむ、帯は上へ戻るに隠れない下 64px)。本番の形での撮り直しを」。同じ本番の 9412354b (タブ 2 列)・5c8f70a6 (題の札・上へ戻る) は送れている。
- 洗い出しの結果: PC で付いていてスマホで付いていなかった展開の追従はベースの一覧 (BaseCatalog、エミュのベースのページとシミュの完成形の設定で共通) の 3 つだけ。ほかの開く所 (keep-place・revealOpened・revealNext) はスマホも同じ作り。
- 持ち物の足し: public/sw.js (10-25 にジン部長から、701e97b5。FILE_RE に mtx-art 入り)、src/web/ToTop.vue・LeaveConfirm.vue。コスメティックの中身 (views/skins・データ・絵) はスキン部長、入口・題・page.ts・スイッチ skins はデザイン。スイッチの下の私の物は notes の 4 → 5 の列 (sim・daily・dismiss … firstVisit1024) + skins・noHeaderBlog。
- 気を付ける事: 題の札の幅は game-ui.css の :has で各画面のファイルに触らず効かせている (h1.g-tabbar.g-brush と、それを包む段)。ヘッダーの間はスマホと PC で分けて書く (共通の gap-3 がスマホの gap-1 に勝っていた)。セッションどうしの送信は、オーナーが打ってから 10 通で止まる。大事な物から送る。
- 台本: 共有メモ side-session-notes/local_52fe22f9-…/design5/ (leave-check・row-remove-check・tier-check・skins-check・tabs-check・tabs-phone-check・blog-check・phone-title-top・totop-bar・phone-header-follow.mjs、報告の写し report-2026-10-25-skins.md)。ブラックの組の所 local_b4352604-…/design5-handover-skins.md にも同じ報告。5 本目の記録と 4 → 5 の引き継ぎは notes/2026-10-25-design5-handover.md。

