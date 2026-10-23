# デザイン部長 のやる事

## 引き継ぎ (1 本目 → 2 本目 local_d9a6380b-ff4e-49da-99e5-cfc1f662a6d0、10-23) — 2 本目が受け取った。シミュの opacity は 120d0c9e で済み
- 持ち物: for-share・共通の部品・見た目 (src/styles・style.css)・言語の切り替え・画面の挙動 (src/web・composables・utils)。README の地図・notes/2026-10-23-components-map.md。
- 使用表 (dev/todo.md): 開発版・確認用 Chrome 9333 は返してある (空き)。手元の dev サーバーも止めた。立てた Chrome は profile ごと消した。
- 確かめの台本はブラックの共有メモ (side-session-notes/local_ec583720-…) の design-cdp.mjs (CDP の小物、各手 15 秒の上限) と m*.mjs・d12-*.mjs・mback.mjs・mbtn.mjs。開発版は `?k=8ZlDQtkU9siTTMXD-qDzj50w` を 1 回開いてから。出した直後は JS が 404 の事がある (出し直し、同じ profile の古い読み込みも 404 に見える)。
- オーナーの OK 待ち (見た目・操作、pending-release へ載せる物): 3a250a59 (窓の閉じた直後のクリック・列の見出しの固定・ベースのカード名 1 行)、60a880d3 (押せないボタンのカーソル)、ec25866e (押せない g-btn の opacity 0.45、全部の画面)。
- 返事待ち: シミュ部長 17 本目に 51908d81 の SimTreePage の `disabled:opacity-40` を外す頼み (共通で効くので要らない)。エミュの RevealPanel.vue:125 の `disabled:opacity-40` も同じく要らない (まだ誰にも頼んでいない、急がない)。
- 残り・気づき: 下の各節の「見ていない」。ModTable の列の見出しに差し込み口が無い (要望待ち)。for-share が engine.ts を通さず核を直に読む所 (控え)。

## 済んだ節 (前の版の塊を残す・404 が 3 回・入口の塊の 404・古い塊の読み直し・StageItemCard の D1・D2・エミュ部長の頼み) は notes/2026-10-23-todo-archive.md にそのまま移した。各節の「見ていない」もそこ (10-23 夜 ホワイト)

## 上のタブの帯 ModeTabs (オーナー 10-23) — ad68e08b + エミュ 0d19fb26・シミュの差し込み、オーナーの OK 待ち (見た目と操作)
- for-share/ModeTabs.vue: エミュレーター / シミュレーター β (TREE_ON = 開発版だけ)。今いる方が選ばれた見た目、押すとツリーのページへ行き来。画面だけのタブは slot。CraftStage・StageBasePage・SimTreePage が使う。
- 確かめ (開発版 599e76b4・窓なし Chrome 9333・本物のマウス、台本はブラックの共有メモ tabs-check.mjs・tabs-base.mjs): PC 1660×860 とスマホ 375×812 で エミュ → シミュのタブ → ← 戻る → シミュのタブ → エミュのタブ → ブラウザの戻る ×2 の 7 手、毎回タブ 2 つとも見え今いる方が選ばれる。ベースのページでシミュを押すとツリー、戻るでベースのページ。PC の 3 ページを撮って同じ位置・同じ見た目。エラー 0。
- 本番 (SIM_LOCKED) はベースのページにもエミュレーターのタブ 1 つが出る (前は帯ごと隠していた。クラフトの画面と同じ形、エミュ部長の気づき)。

## 開く・畳むの揃え (オーナー 10-23) — 994b95b8・6d535cbd・fb69342b + エミュ 1d6fa62b・シミュ 990f12ad、オーナーの OK 待ち
- 表と確かめは notes/2026-10-23-expand-collapse.md。

## 今 (10-23)
- for-share はジン部長から受け取った (e7c697ef・9f46ef0b)。地図は README と notes/2026-10-23-components-map.md に書いた。
- ModTable の見立て: エミュ (StageModList)・シミュ (TreeGoalPage) とも今の口で作れている。問いは閉じた (ブラック 8 代目 10-23、オーナー): 「シミュ = % 無し」は % の列ではなく、エミュ専用の「次の手で狙う」ボタン (段の表) がシミュに要らないという事。「狙う」は StageModList の tier-actions の差し込みのまま、土台に入れない。ModTable は今のまま。
- 気になる所 (要望待ち): 列の見出し (出やすさ・段・Lv) に差し込み口が無い。
- 控え (10-23、急がない): エンジンが核 / engine-emu / engine-sim に分かれた (809039db)。for-share は engine-emu・engine-sim を読んでおらず影響なし。ただ engine.ts を通さず核の中 (apply-*・stage-runes・stage-bases・mod-list・htc/patch・mods/mod-rules など 20 本ほど) を直に読む所が残る (前の views/craft-stage の頃のまま)。決まり 1 に合わせて寄せるなら、入口に足すのはジン部長 (ブラック経由)。数え方 `grep -rhoE "from \"[^\"]*services/[^\"]*\"" src/components/for-share src/state/for-share | sort | uniq -c`。

## モンキー 4・14・15 (シミュ 17 本目の頼み 10-23) — 3a250a59、オーナーの OK 待ち (見た目と操作の変更)
- (4) ModalShell: 閉じた直後 350ms は document の click を捕まえて止める (閉じたクリックは止まらない)。全部の窓に効く。
- (14) ModTable: 列の見出し (出やすさ・段・Lv) を sticky、top = 目次の帯の高さ (ResizeObserver、スマホは帯が留まらないので 0)。
- (15) BaseCardGrid: 名前は 1 行で … (title に全部)。1660×860 の完成形の窓ではアミュレット・指輪・鎧の多くが「前兆のアミュ…」になる (区別の頭は残る、ホバーのカードで全部)。
- 確かめの記録は notes/2026-10-23-todo-archive.md へ移した (10-23 夜 ホワイト)。
- 開発版はまだ出していない (モンキー隊長がエミュを触る間は止めてと待ちに書いてある、使用表の待ちに自分を足した)。
- 気づき (シミュの持ち物、ブラックへ): スマホの「2 完成の MOD」で完成形のカード (幅 340 固定) が表の横に並び、表が 1 文字幅に潰れる (TreeGoalPage の並び)。

## モンキー 3・2・9 (ジン部長 7 本目から引き継ぎ: e643ee9a・96bb584d・a96ebff8) とカーソル (60a880d3) — 残す
- 確かめの記録は notes/2026-10-23-todo-archive.md へ移した (10-23 夜 ホワイト)。
- 見ていない: 2 の「狙う MOD を選ぶ」の文は台本の正規表現に当たらず、題で見た。前の版との並べ比べ (直す前の数) はジン部長の数 (8 連打 3/3・0.45 秒 2/3 でブログ) を使った。
- シミュのモンキー 2 回目: ツリーを出る時に URL の sample を消す (page.ts の urlFor、e1444f4b)。開発版 c64adafc・9333 で ?page=sim-tree&sample=amulet-4aims → Esc → 「← 戻る」が 2/2 で `/` (sample 無し)、エラー 0 (台本 msample.mjs)。気づき: その後のブラウザの戻るはツリーでなく ?page=base へ (別件、頼まれていない)。
- 「← 戻る」→ ブラウザの戻るで前のページへ (ブラックの頼み、メモ feedback-basic-flow): page.ts の autoBase を「今のページが自分で出たベース選び」だけに (ada034a6)、ページと autoBase を組で見張って移る直前の値で積む / 置き換えるを決める (13cd3429)。原因 = ベース未選択の時、ツリーなどから出る移りを「自分で出たベース選びからの移り」と見なして置き換えていた・?page=base を直に開いた時の「自分で出た → 人が開いた」を取りこぼしていた。
  - 確かめの記録は notes/2026-10-23-todo-archive.md へ移した (10-23 夜 ホワイト)。
  - 見ていない: 白に戻した後に自分で出るベース選びが今までどおり積まれないか (置き換えの条件は残した)。最初の profile で本当にベース未選択だったかは確かめていない (直す前の飛び方は同じ手順で出ていた)。
- 押せない g-btn の字が押せる物と同じ色に見える (モンキー ツリー 10、ブラックの頼み): game-ui.css の .g-btn:disabled・.g-btn-red:disabled に opacity 0.45 (ec25866e、全部の画面)。src/web/FeedbackDialog.vue の個別の disabled:opacity-40 は外した。
  - 確かめの記録は notes/2026-10-23-todo-archive.md へ移した (10-23 夜 ホワイト)。
