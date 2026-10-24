# モンキー隊長 のやる事

## 次の隊長へ (2 本目、10-24 夜)
- 台本の置き場: C:/Users/kyohei/AppData/Roaming/Claude/side-session-notes/local_52fe22f9-cf1b-45a0-a390-c0d305e6b60a/monkey-scripts/ (lib2 の DIR はここ、出力もここに出る)。lib2.mjs (CDP・タブ・止める通信)、api-monkey.mjs (棚・お告げ・確率)、goal-monkey.mjs (完成の MOD つき)、goal-list.mjs (完成の MOD の一覧 md)、drive.mjs + watch.mjs (初めての人の回: 本物の入力で 1 タブ、見張りが外の通信を止めてエラーを watch.log に)、hover-shot.mjs (押した直後の浮き窓を撮る)、jobs-all.json (764 ベース × 3)・jobs-p.json (代表 22 × 3)。
- Chrome: 使用表に書いてから自分で窓なしで立てる `chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratchpad>/chrome-prof --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"`。止めるのは CDP の Browser.close → profile とスクショを消す → 使用表を「空き」に (commit)。
- 止める通信: 名前解決で localhost 以外を潰し、さらに lib2 の tab() / watch.mjs が CDP の Fetch で localhost 以外を止めて数える。1 回でも外へ出たら止めてブラックへ。絵 (poecdn)・フォント・広告・boot.json が出ないのは止めたため (不具合に数えない)。
- 回し方: 棚・お告げ = `node api-monkey.mjs jobs-all.json <出力> 20 12` (5 分)。確率 = `RUN=100 node api-monkey.mjs jobs-p.json <出力> 16 12`。完成・個数 = `ESS=1 node goal-monkey.mjs jobs-p.json <出力> 16 8` (2 分、ESS=1 でエッセンスの行も入れる、10-24 夜に数え方が直った)。goal-monkey の出力は照らしの前に steps へ card・mods を足す (記録の 7 回目)。
- 照らし: リポジトリの根で `node scripts/check-monkey-engine.mjs <出力>` (ジン部長、<出力>/engine/)。正はエンジン。形の合う箱へ移した木と打ち止めの木は台本が比べない。
- 猿の口 = 手元 1440 の ?page=sim-tree の window.__simMonkey (使い方は src/views/simulator/tree/sim-monkey.ts の頭の注釈だけ読む)。dev サーバーが読み直すと一時消える (Cannot read properties of undefined) → 回し直す。
- 気を付ける: 用語は推測で訳さない (MOD の種類・ルーン・お告げは英語のキーのまま)。浮き窓など見た目の確かめは文字で探さず撮って目で見る (見本で拾えるか先に確かめる)。他のセッションへの送りは要る物だけ。猿は 10 分以内。
- 今の残り: 無し (7 回目 エッセンスありは比べた 48 本ずれ 0、初めての人の回 13 件はシミュ部長が直した、浮き窓は 38177e55 で直った)。記録は docs/org/simulator/notes/2026-10-24-monkey.md と -monkey-goals.md。

指示待ち。仕事はブラックから来る (docs/org/monkey/README.md の決まり 10)。宛先は dev/todo.md の表。

## やる事
- 無し

## 先の予定
- 照らし合わせ係: シミュが出来上がったら、ベースごとに猿 3 匹でツリーを組ませ、エミュの画面と照らす (README の頭・決まり 7、オーナー 10-23)。
