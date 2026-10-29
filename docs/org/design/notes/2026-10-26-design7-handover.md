# デザイン部長 7 本目の記録 (10-25 夜〜10-26)、6 → 7 の引き継ぎの写し

session local_797596dc-2485-48a1-95ad-4ea2093a5017。ブラック 10 → 11 → 12 代目、シミュ 28〜30 の頼みが主。全部 push 済み、v0.1.609 までに本番。

## した事 (commit・頼んだ人)
| commit | 何 | 頼み |
|---|---|---|
| da386c21・607fa29d | ModeTabs のシミュのタブ: スマホは隠す、スイッチ simPhone の時は出す | シミュ 28 |
| 265c8bbd | ModTable の段の行: スマホは折り返し、tier-actions の td (data-tier-end より後ろ) を 2 段目いっぱいに | シミュ 29 |
| 6c20f336 | track.ts: sim:run・sim:test を D1 の screen へ | シミュ 29 |
| a7bb8565・84d5d0cf | page.ts・LeaveConfirm: setLeaveGuard(fn, { save })・leaveCanSave・answerLeave("save")・askLeave(go, save?) = 「保存して進む / 保存せず進む / やめる」 | シミュ 29 |
| 0eb8f468 | スマホのヘッダーの絵だけのボタン (ブログ・使い方・要望) の下に名前 (幅 36px 決め打ち、英語の Feedback は 8px) | 猿 14 (シミュ 29) |
| 576e2847 | スマホのツリーのページ (treePage) では下の欄 (記事・チャンネル) を出さない | シミュ 30 |
| 166ce7ee | ShelfButton の 2 行の切りをスマホで外す、ToTop は sticky の帯 (data-phone-bar) も数える (下から 24px まで) | 猿 7 の 14・15 (ブラック 12) |
| 97e0d93b | page.ts の beforeunload: window.__staleGo (新しい版の自動の読み直し) の時は聞かない | シミュ 30 |
| 77e82fd7 | スマホは省略しない: ベースの一覧・カードの一言・記事・配信・相場のエラーを全文、MOD 表の節・ベースの「もっと見る」・棚の畳み (使えない物以外) は開いた状態から、段の表の重みの割合の列をスマホでも | ブラック 12 (オーナー「省略の直しは OK」) |
| 305c4bb4 | 持ったカレンシーの説明 (エミュの StagePhoneBar) は全部の行、スマホのヘッダーは版を消して本日の人数だけ | ブラック 12 (オーナーの A) |
| 4e6a6a8a | 共有の部品 HeldCursor.vue (持った物の絵をカーソルに、props src、スマホは出さない)。エミュの CraftStage を置き換え、シミュの手の窓も使う (24b31017) | シミュ 30 |
| bd016b18・b7ec5e8d | StageItemCard の modsOnly (MOD の行だけ、左の列 w-7・右の列は確率 / × のある行だけ・px-1) | シミュ 30 |
| 5e8990a7・b31bdb06・a58559d6 | design/README の決まり 1 (エンジンの関数を直に)・5 (スマホは省略・飛ばしなし = メモ feedback-phone-no-truncate) | ブラック 11・12 |

## 決め (オーナー 10-26)
- スマホは省略しない・タップで別のページへ飛ばさない (メモ feedback-phone-no-truncate)。例外は MOD を複数まとめた「n つ」。エッセンスの段の名前は今の形 (文の下に並べる) のまま。
- 前 / 後のスナップは共有メモ local_feea72b4…/design7-phone-omit/ (1〜9、-before / -after)。

## 残り・気づき (頼まれていない)
- 320 幅のスマホはヘッダーの右がはみ出す (中身 361/320、前から)。
- 洗い出しで「相場のエラーの文」は画面で見ていない (エラーを起こせなかった)。
- しくじり: push の前に `git pull --rebase --autostash` を使いシミュ 29 の書きかけを一度しまった (戻った)。メモ feedback-no-autostash。表の commit にほかの人の書きかけの行が混ざりかけた時は、push 前に自分の行だけで入れ直した (git update-index --cacheinfo)。

## 台本 (共有メモ local_b4352604…/design7/、どれも dev 1440 に窓なし Chrome 9338 を立てて最後に止める)
tabs-check (ModeTabs)・tier-row-check (段の行 375 / 1660)・leave-save-check・ask-leave-check・header-check (3 つの幅)・channel-check・monkey7-check (棚の line-clamp・上へ戻る)・stale-unload-check・omit-snaps / held-header-snaps (前 / 後のスナップ、引数 before|after と出し先)・omit-pc-check・held-cursor-check・mods-only-check (StageItemCard を createApp で組んで比べる。部品は ?vue&type= の無い URL で import)。

## 6 本目 → 7 本目の引き継ぎ (todo.md の頭からそのまま移した)
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
- 台本: 共有メモ local_b4352604-…/design6/ (back-check・fresh-check・pages-check・catalog-check・gem-check)。
- 6 本目の記録と 5 → 6 の引き継ぎの写しは git の履歴 (10-29 の md の整理で消した): 2026-10-25-design6-handover.md。
