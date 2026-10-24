# デザイン部長 4 本目の引き継ぎの控え (2026-10-24 夜)

todo.md の頭から移した物をそのまま。今の引き継ぎは todo.md の「次の部長へ (4 本目 → 5 本目)」。

## 次の部長へ (3 本目 local_1e0c8dab-f968-48a2-b867-04e5816e7dac → 4 本目、10-24)
- 今の状態: v0.1.596 で本番も main の作り。本番に出していない物は src/web/release-flags.ts のスイッチで隠す (本番のビルドで切れ・開発版 / dev で入る、OK が出たら RELEASED に 1 行、CSS は :root[data-flag-…] の下)。使い方と入れた物は docs/org/dev/notes/2026-10-24-main-release.md。
- 私の名前: sim・daily・dismiss・tierClose・modeTabs・fitZoom・omenRow・monkey1023・baseValues・weights・essTier・essCard (baseValues・weights は 10-24 4 本目が自前の判定から寄せた b35b5826。エミュ 3 つ・ジン 5 つは各部)。確かめは本番の作りを WEB_OUT で scratchpad に vite build → vite preview (preview:prod は出し先が 1 つで 1 人ずつ、使用表を見る)。
- 10-24 にした事 (詳しくは notes/2026-10-24-todo-archive.md と commit): 段の表を閉じる b6b7fea2・押せない札 178daf1b・タブ替えの守り 2affeeeb・分析を送らない (手元の dev) 00551d1f・スイッチ 3d616bd1・338c1c25・古いコードを消す 37839454 ほか・棚と for-share はアイテムを渡された物で引く 4194c728・8cb0a906。アイテムの枠の A/B 案は取り下げ。
- 待っている返事: ブラック — 見た目に出ない裏の直し (履歴の戻り方・音・?lang=) を隠すか。オーナー判断 — 使われなくなった絵 public/ui-art/head-l・head-r.webp を消すか。
- やりかけ: 無し (頼みは全部返した)。古い塊の読み直しの index.html の取り直しを静的な版の印にする案は notes/2026-10-23-stale-reload-requests.md (明日やる予定だった、ブラックに確かめて)。
- 気を付ける事: 確認用 Chrome 9333 は他の部長も使う → 空いていなければ自分の番号 (9334 など) と自分の profile で、台本の小物は CDP_PORT で番号を替える (scratchpad の cdp.mjs の形)。立てた物は根から止める (preview:prod は wrangler と workerd が残る)。
- 気を付ける事 2: Bash の heredoc・node -e で \ が消える・CRLF のファイルは一致が外れる → 正規表現や置き換えは Write / Edit で。手元の dev の Web は /web.html (/ はアプリ)。
- 台本はブラックの共有メモ (side-session-notes/local_20eeeb19-…) の tab-flip・tab-rapid・tier-probe・nolog-check・card-variants・gtab-disabled・backor-check・reset-check.mjs。

## 4 本目 (10-24 夕〜) にした事・見ていない物
- 古い塊の読み直しを静的な版の印 /version.txt に (cd82fc4a、記録 notes/2026-10-23-stale-reload-requests.md)。本番に出すのは次の本番と一緒 (先に裏方の deploy:web で出すならブラックへ 1 行)。
- スイッチに寄せた: baseValues・weights (b35b5826)。足した: essTier (段の表のエッセンスの名前 640e3c04・c16d53d7)・essCard (カードの P0 / S0 と札 ae41e4a7)・firstVisit1024 (ベースの一覧の押しの守り ea96b954・説明はマウスが動いた時だけ 7ca9b118・38177e55)。どれも pending-release.md に日英。
- 頼みの直し: HeldOmens が棚の hidden を見る (fb0e0d95)・ShelfButton の説明に棚のアイテム (193d0440)。
- firstVisit1024 の説明のカードは 38177e55 で「入った位置が最後に動いた位置と違うか」に。隊長が本物のマウスで確かめ済み (17e0fbf3: ＋ の直後 0/5・動かすと 5/5・兜の直後 0/3)。
- 確かめの台本 (scratchpad、4 本目): stale-ver-check・ess-tier-check・ess-card-check・ess-card-sim・hover-check・still-check.mjs。窓なし Chrome は 9334 と自分の profile で立てて、台本の中で閉じる。
