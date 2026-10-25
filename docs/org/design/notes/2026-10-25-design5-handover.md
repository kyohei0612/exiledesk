# デザイン 5 本目の記録と 4 → 5 の引き継ぎ (10-24 夜〜10-25)

## 5 本目のした事 (commit 順)
- 引き継ぎの答え (70abb7df)、pending-release に cd82fc4a の 1 行 (62b5fb25)
- シミュのページ 3 つ (?page=sim-base / sim-mods / sim-tree、treeStep・openTreePage(step)) と離れる時の確かめ (setLeaveGuard(to => bool)・LeaveConfirm.vue・戻る / 進むは history.state の edIdx で元の位置へ戻して聞く・beforeunload) b042f6c2、レシピのページからも聞く 2099294b
- StageItemCard の口 rowRemove (行のホバーで × 、2099294b) と tierAtLeast (「S2 以上」/「S2+」、386dd690)、どちらも TreeGoalPage につないだ
- コスメティック (?page=skins): 下書き 0fbd1f70 → 中身はスキン部長 (views/skins) へ、入口と題 390b4879・06a77714、用語集に コスメティック = Cosmetics
- 上のタブ (ModeTabs) の並び: エミュレーター / シミュレーター / デイリー / ジェムコラプト (slot) / コスメティック。ヘッダーにあった入口 2 つを移した 2758a5ca・b26c850b・e160608e、スマホは 1 段に 3 つまで折り返して余りを広げる 9412354b
- ヘッダーのブログ: PC の開発版は外す (スイッチ noHeaderBlog、b26c850b)、スマホは残す (5883ca99)。dev でも /blog/ を配る差し込みはサーバー管理人 6a78fe35 (案は共有メモ design5/dev-blog-plugin.md)
- スマホ: 題の札を横幅いっぱい (game-ui.css の :has で全部の画面) と「上へ戻る」(ToTop.vue) 5c8f70a6、ヘッダー 1 段・ベースの一覧の展開の追従 (BaseCatalog の revealPhoneHead・panelEl・もっと見る / たたむ) 5883ca99
- pending-release の 3 行 (コスメ・タブの並び・ノーヘッダーブログ) facc14ab、地図に sw.js ba35f2d3

## 4 → 5 の引き継ぎ (todo.md の頭にあった物をそのまま)
## 次の部長へ (4 本目 → 5 本目、10-24 夜)
- 今の状態: 本番は v0.1.596 (main をそのまま出す形)。本番に出していない物は src/web/release-flags.ts のスイッチの下 (使い方 docs/org/dev/notes/2026-10-24-main-release.md)。OK 待ちの一覧と日英の更新内容は docs/pending-release.md。
- スイッチの下にある私の物: sim・daily・dismiss・tierClose・modeTabs・fitZoom・omenRow・monkey1023・baseValues・weights・essTier (段の表のエッセンスの名前)・essCard (カードの P0 / S0 と「エッセンス」「合金」の札)・firstVisit1024 (ベースの一覧の押しの守り・説明はマウスが動いた時だけ、隊長が本物のマウスで確かめ済み 17e0fbf3)。
- 裏方で済み・本番待ち: 古い塊の読み直しを静的な版の印 /version.txt に (cd82fc4a)。次の本番と一緒に出す (ブラック 10 代目 10-24 夜、先に deploy:web しない。pending-release.md の 1 行は最終チェック長の持ち物なのでブラックへ返した)。
- やりかけ: 無し (頼みは全部返した)。public/ui-art/head-l・head-r.webp は残す (ブラック 10 代目 10-24 夜)。
- 他の部へ渡した物: 段ごとの出やすさが全段同じ (兜など) はエンジンの重みのデータ (ジン)。release-flags の外の開発版の判定 (utils/ads.ts の AD_FRAMES・エミュ CraftStage の GEM_CORRUPT_SHOWN・シミュ use-tree.ts:77) を寄せるかはブラック。
- 気を付ける事: 共通 (ジン) の hover-stack.ts は触らず、私の側 (ShelfButton・BaseCardGrid・utils) で直す。窓なし Chrome は画面が動いても mouseenter を出さないので、止まったマウスの確かめは本物のマウス (モンキー隊長) に頼む。
- 気を付ける事 2: 確認用 Chrome は 9333 が他の部長の物 → 自分は 9334 と自分の profile で立て、台本の中で Browser.close。preview:prod は --port で番号を替え、止める時は wrangler と workerd を根から (TaskStop だけでは workerd が残る)。PC の Web はいつもベースのページから (?base= か hands= の録画の口で進める)。
- 台本: 共有メモ side-session-notes/local_52fe22f9-…/design4/ (stale-ver-check・ess-tier-check・ess-card-check・ess-card-sim・hover-check・still-check・move-probe.mjs)、前の分は local_20eeeb19-… の物。4 本目の詳しい記録と 3 → 4 の引き継ぎは notes/2026-10-24-design4-handover.md。
