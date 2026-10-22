# シミュレーターのツリーの英語の点検 (2026-10-22、ジン部長 5 本目、ブラック 6 代目の頼み)

拾い方: 台本で src/views/simulator/tree/ と src/services/simulator/tree/ の画面に出る日本語を拾った (コメントは除く)。
- 英語の対あり: 257 (`tr("…", "…")`・`["…", "…"]`・`{ ja, en }`)。英語の側に日本語が残る物 0、空 1 (TreeHandShelf.vue の `tr("回", "")`、数の後ろの字を英語では付けない、そのままでよい)。
- 英語の対が無い日本語: 実際に画面に出る物は 1 か所だけ (下の 1)。ほかに拾えた物は組の形の対か、画面に出ない検索の言い換え (TreeModPick.vue の 速度 / スピード)。
- 言葉の決まりは src/i18n/GLOSSARY.md の「シミュレーターのツリー」(15 行、72d4ba99)。

## 直す所 (シミュ部長の UI が済んでから。tree/ はシミュ部長の持ち物)
1. SimTreePage.vue:144 — 当たりの名前を `join("・")` でつなぎ、tr が無い。英語は `", "` に (`tr(\`${…} (${held.join("・")})\`, \`${…} (${held.join(", ")})\`)`)。
2. tree-check.ts:77 — 「触媒のお告げ」の英語が `Catalysing omen`。poe2db の名前は **Omen of Catalysing Exaltation** (items-ja-poe2db.json「触媒の高貴のお告げ」)。
3. 「回す」の英語が Run と Play で揺れている: SimTreePage.vue:276 `Playing runs`、TreeRunBar.vue:19 の説明 `Play ${RUN_N} runs …`。ボタンは `Run ${RUN_N}` なので Run / Running に揃える。

poe2db で取れなかった物: 無し (ツリーに出るゲームの名前は 触媒の高貴のお告げ だけで、写しにあった。カレンシー・MOD の名前は画面ではエンジンの名前の表から出る)。
