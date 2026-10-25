# デザイン部長 のやる事

## 次の部長へ (6 本目 → 7 本目、10-25 夜)
- 今の状態: 本番は main をそのまま出す形 (v0.1.598 まで出た)。出していない物は src/web/release-flags.ts のスイッチの下、OK 待ちと日英の更新内容は docs/pending-release.md。手で止めた物・立てっぱなしの物は無し (確かめの Chrome 9334〜9337 は台本の中で止めた、dev 1440 はブラックの物)。
- 今日の済み (6 本目):
  - 5883ca99 (スマホのヘッダー 1 段・ブログはスマホで残す・ベースの一覧の展開の追従) を 375 日英で撮り直し、最終チェック長 2 本目へ知らせた → v0.1.598 で本番。
  - aecc19d4: ジン 10 の目録の付け替え (craft-stage-shelf → PRICE_KEYS・ESSENCE_TABLE、stage-mod-list-look → ESSENCE_KEYS を入口から。値は前の JSON と同じ)。
  - 8b145a7e・3784372b・4c5711b1: 「開き直し・ブクマ・打ち直し = そのページの最初 / リロード = 同じページの最初 / 戻る・記事から戻る・版替わりの自動の読み直し = 前の画面」(オーナー 10-25) を全部のページで。どれもスイッチ emuFresh の下 (本番は切れたまま、出すのはオーナーの OK の後)。洗い出しの表は共有メモ local_b4352604-…/design6-fresh-pages.md。
- 持ち物の増えた物:
  - public/sw.js (10-25 にジン部長から、701e97b5)。
  - src/state/stage-session.ts (エミュの作業中のアイテムの写し。29e4068a はジン 10 が入れた hasUsableSession、見分けは page-memo の cameBack に寄せた)。
  - src/web/page-memo.ts (新しい、3784372b): cameBack() = 戻る・同じサイトのリンク・版替わりの自動の読み直し (印 exiledesk-stale-reload の 1 分の窓)。remember(name, get) / forget(name) = 離れる時に各ページの要る物だけ sessionStorage へ写し、同じ URL に戻った時だけ 1 回返す。使っている所: page.ts (スパムシミュの狙いとルーン・コースの段)、SkinsPage (探す・絞る・出した数)、GemCorruptWebPanel (入力は cameBack の時も読む)。
  - page.ts の gemCorruptPage (?page=gem-corrupt、CraftStage はそれを見る)。
- 残り (頼まれていない・決めてほしい物): 戻るで画面の送りの位置 (スクロール) は戻さない、スパムシミュの結果の数字は同じ狙いで回し直すので変わる、要望の書きかけ・デイリーの中の選び (見本の作り) は写さない。シミュは cede3e93 の決め (戻るでも空から) のまま。MOD 表などの開いた段を見せる送り (keep-place の revealNext) はスマホの下の固定の帯の高さを数えていない (症状の報告は無い)。
- 台本: 共有メモ local_b4352604-…/design6/ (back-check = 4 ページの戻る / リロード / 打ち直し、NOBF=1 で bfcache を切る・fresh-check = エミュの写しの 6 通り・pages-check = 11 の URL の開く / リロード・catalog-check = 目録の値の比べと棚・段の表・gem-check)。どれも dev 1440 に窓なし Chrome (9335〜9337) を立てて最後に止める。
- 6 本目の記録と 5 → 6 の引き継ぎの写しは notes/2026-10-25-design6-handover.md。

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
