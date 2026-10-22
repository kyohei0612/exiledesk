# 本番の最初の絵が出るまで (2026-10-22、ジン部長 5 本目。調べは途中で取り消し)

ブラック 6 代目の頼み「本番を開くと中身が真っ黒」で測りかけたが、真っ黒は開発版のツリーの URL の物と分かり取り消し (シミュ部長へ)。止まる前の 1 回だけの測りで分かった事を残す。

- 測り方: 窓なし Chrome、キャッシュ・保存を消して https://exiledesk.com/ (v0.1.594) を 1 回、回線は絞らず。台本は消した (CDP の Network の時刻と 100ms ごとの画面の様子)。
- 最初の絵 (FCP) 11,484ms。その間ずっと何も出ていない。
- 待っていたのは Google Fonts の CSS (`fonts.googleapis.com/css2?family=Yuji+Syuku&family=Zen+Antique&family=Zen+Kaku+Gothic+New…`、143KB) で、届くまで 370→11,360ms。HTML (366ms)・本体の JS web-*.js (794KB、523ms で届いた) はすぐ。フォントの CSS は描きを止める読み方なので、これが遅いと画面全体が出ない。
- 届いた後は 11,629ms でヘッダーとベースを選ぶ画面まで一気に出た。/boot.json (相場) は 11,471ms から。
- 1 回だけなので、手元の回線の揺れの見込みもある。もう一度測ってから決める事。

直す案 (まだ直さない、本番の挙動が変わる):
1. (おすすめ) フォントの CSS を描きを止めない読み方にする (`<link rel="preload" as="style" onload="this.rel='stylesheet'">` + `<noscript>`、または media="print" で読んでから all に)。`display=swap` は付いているので、届くまでは端末の字で出る。見込み: 最初の絵はフォントを待たずに JS が届いた所 (この測りでは 0.5 秒くらい) まで縮む。
2. フォントを自分のサーバーに置く (/fonts/ に同じ 3 書体の woff2 の要る分だけ)。Google への通信が無くなる。手間は 1 より大きい。

## 測り直しと直し (10-22 夕、オーナー OK)
- 測り直し (本番 v0.1.594、キャッシュ無し 6 回): 最初の絵 220〜560ms (真ん中 300)。11 秒は出なかった = 前の 1 回は Google の遅れ。ただし毎回フォントの CSS が届いた直後に絵が出る (描きがフォントを待っている)。
- 直し 1bef14b9: `<link … rel="stylesheet" media="print" onload="this.media='all'" />` + `<noscript>` (web.html・index.html・build-seo-pages.mjs・public/*.html と en の 12 ファイル。ブログは Google Fonts を使っていない)。本番にはまだ。
- 前後 (台本、cookie だけ残してキャッシュ・保存を消す、5 回の真ん中): ふつう 本番 224ms → 開発版 72ms。フォントの CSS を 3 秒わざと遅らせる (Fetch で止める) と 本番 3,260ms → 開発版 92ms。開発版でも同じ 5 書体が当たり、link の media は all に替わる (見た目は同じ、届くまでの一瞬は端末の字)。
