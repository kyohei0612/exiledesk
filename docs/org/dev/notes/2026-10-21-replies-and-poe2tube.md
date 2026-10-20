# 要望の返事 2 件と POE2Tube の古いフォルダー (開発部長、2026-10-21)

## 1. 要望の返事 → 本番待ち (置いていない)
本番 v0.1.588 には出ていない: クラフト手順のコースは `src/services/tutorial/course-release.ts` の REVIEW のまま (RELEASED に無い)、シミュレーターは本番で `SIM_LOCKED`。どちらも docs/pending-release.md の OK 待ち。
本番に出したら下の JSON を `fbr:<id>` に置く (やり方はメモ feedback-replies。version は出した版に直す)。画面が頭に「ご報告ありがとうございます！」を付けるので、置くのは後ろだけ。

93d00e7c (英語、要望。出る物: pending-release.md の「クラフト手順の段」04ad4147・d1e7c664 → course-release.ts の REVIEW から RELEASED へ):
```json
{"text":"「使い方・コツ」に「クラフト手順」を追加し、最初のコースとして不在のアミュレットで全スペル +5 (品質 40% + 聖別) を 1 手ずつ作れるようにしてみました！ご要望通りでしたか？是非使ってみてまたフィードバックいただけたら幸いです！","en":"We added a new “Crafting guides” section to Guide & Tips. The first guide builds +5 to all Spell Skills on an Absent Amulet (40% quality + Sanctify) step by step. Is this what you had in mind? Please give it a try and let us know what you think! We would love as many people as possible to try it and send feedback, so it would really help if you could spread the word!","version":"0.1.xxx"}
```

91832821 (日本語、要望 ① 逆算 ② 取引所のアイテムを写す。出る物は ② だけ: pending-release.md の「シミュレーター ① の貼り付け」1a0d6e53・63aafd86。シミュレーターを本番に出す時。① の自動はオーナー 10-21「自動化はいらない」で止めたので書かない):
```json
{"text":"シミュレーターのベースを選ぶ画面に「貼り付け」を足し、取引所や poe.ninja のアイテムを貼るとベースと狙う MOD を一度に決めて始められるようにしてみました！ご要望通りでしたか？是非使ってみてまたフィードバックいただけたら幸いです！","version":"0.1.xxx"}
```

## 2. POE2Tube の古いフォルダー → 確かめ済み、消すのはオーナー
- 場所: `C:\Users\kyohei\POE2Tube\cache` 30GB (audio・stage・tachie・thumb・voice、作り直せる) と `output` 29GB (作った mp4・サムネ・録画)。
- 移っているか: POE2Tube の git の 663 ファイルは全部 ExileDesk の video/ にある (blob の hash で比べ、違う 7 つ = CLAUDE.md・README.md・.gitignore・.coverage・settings.py・update_exiledesk.py・thumbs/exiledesk_promo.py は 29b020f9 のパス直し)。設定 .env (YouTube の鍵 3 行) は video/.env に同じ大きさで移っている。video/ の settings.py は cache・output を video/ の中に作り、古いフォルダーを指していない。
- 消していない理由: 59GB の完全な削除 (ゴミ箱を通さない) は Claude の安全の決まりで自分ではできない操作。オーナーが PowerShell で:
  `Remove-Item -Recurse -Force C:\Users\kyohei\POE2Tube\cache, C:\Users\kyohei\POE2Tube\output`
- 消す前の C の空き 307.1GB (使用 623.3GB)。消した後は約 366GB の見込み。
- 残り (今回の範囲外): POE2Tube の残り (.git 22MB・.venv・assets など) はフォルダーごと消せる状態。消すかはオーナーの決め。
