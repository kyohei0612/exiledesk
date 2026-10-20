# シミュ部長 のやる事

## やる事
- ④ おすすめの順番: 本物の solveOrder に繋いだ (276bda26)。手袋のずれは solveOrder の NaN 1 つで並べ替えが壊れていた → c45a7739 で直し、開発版で 1 位 約 2,474 神・完成 71%。NaN の元は解析君に頼んだ (共有メモ auto-order-ui-asks.md の 7)
- ワーカーが 800KB (auto-solve → auto-model → quiz-build を引き込む)。解析君に再輸出をやめてもらったら import を直す (共有メモ auto-order-ui-asks.md の 5)

## OK 待ち
- ④ おすすめの順番を出す (83fb3fbe・276bda26、開発版だけ。pending-release.md に記載)
- ① の「貼り付け」(ベースの一覧のタイル → 下に枠 → 「これで始める」で ① のベース + ② の狙い。② の「貼り付けで写す」は外した。f808760c・11a2722b、読みはエンジンの入口の parseItemText。開発版だけ、pending-release.md に記載)。残り: 見本 3・8 の「品質の最大値 +20%」がクラフト MOD の狙いに入る (エッセンスの MOD か読みの話はジン部長)
- ② の「どっちも」の組の番号を枠の数だけ進める (1・2、次は 3。cff4e0de、開発版だけ)
