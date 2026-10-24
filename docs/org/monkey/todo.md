# モンキー隊長 のやる事

## 次の隊長へ (1 本目、10-24)
- 台本は C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/6a70cacf-bba6-4c8f-a010-7df6bed3fe05/scratchpad/monkey/ (自分の scratchpad に写して使う、元は消さない)。lib2.mjs (CDP・外の通信を止める・行き先)、api-monkey.mjs (猿の口で道を組む猿)、jobs-all.json (全 764 ベース × 3)・jobs-p.json (代表 22 × 3)、bases-all.json (ベース一覧)。
- 回し方: 使用表に書いて Chrome 9333 を立てる (--host-resolver-rules で localhost 以外を潰す)。棚・お告げ = `node api-monkey.mjs jobs-all.json <出力> 20 12` (run 無し、約 5 分)。確率 = `RUN=100 node api-monkey.mjs jobs-p.json <出力> 16 12` (約 1.5 分)。
- 照らし: リポジトリの根で `node scripts/check-monkey-engine.mjs <出力のフォルダー>` (ジン部長の台本、<出力>/engine/ に書く)。正はエンジン (エミュの画面ではない)。
- 猿の口 = 手元 1440 の ?page=sim-tree の window.__simMonkey (setBase・addable・shelf・omens・add・boxItem・run・dump、シミュ部長の物)。コードは読まない、使い方は部長に聞く。
- 外の通信: lib2 の tab() が CDP の Fetch で localhost 以外を止めて c.blocked に数える。1 回でも外へ出たら止めてブラックへ。
- 気を付ける: 他のセッションへの送りは、オーナーが書いてから 10 回で止まる (要る物だけ送る)。Bash の heredoc は `\` が 1 段消えるので、正規表現の入る台本は Write / Edit で書く。猿は全部で 10 分以内。
- 気を付ける: dev サーバーが読み直すと window.__simMonkey が一時消える (5 回目の 16 手)。終わったら Chrome を止めて profile を消し、使用表を「空き」に。
- 2 本目 (10-24 夕): 台本は C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/6068d9d5-3cfc-4ccf-809d-8284f4a2a515/scratchpad/monkey/ (1 本目の写し、lib2 の DIR はここ)。7 回目の完成の MOD つきは goal-monkey.mjs (`node goal-monkey.mjs jobs-p.json <出力> 16 8`、約 2 分、エッセンスの行は外す、手ごとに dumpNow も残す)。照らしの前に steps へ card・mods を足す (記録の 7 回目の回し方)。一覧の md は goal-list.mjs。Chrome は自分で窓なしで立てる (--headless=new --remote-debugging-port=9333 --user-data-dir=<scratchpad>/chrome-prof --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1")、止めるのは CDP の Browser.close。
- 今の残り (10-24 夕): 完成・個数のずれ 3 本は形の合う箱へ移す道で、ジン部長の台本の直し待ち。エッセンスの狙いの数え方の直しも待ち (終わるまでエッセンスの行の木は数えない)。棚の違いが出たらその時の dump と boxItem をシミュ部長へ。記録は docs/org/simulator/notes/2026-10-24-monkey.md の末尾。

指示待ち。仕事はブラックから来る (docs/org/monkey/README.md の決まり 10)。宛先は dev/todo.md の表。

## やる事
- 無し

## 先の予定
- 照らし合わせ係: シミュが出来上がったら、ベースごとに猿 3 匹でツリーを組ませ、エミュの画面と照らす (README の頭・決まり 7、オーナー 10-23)。
