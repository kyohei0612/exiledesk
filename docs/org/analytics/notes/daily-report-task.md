# 毎朝の日報の予定のタスク (README の決まり 2 の細かい所)

- 予定のタスク exiledesk-daily-summary (毎朝 9:05 頃、cron 8:54 + 揺らぎ約 11 分、オーナー 10-22)。
- `node scripts/daily-summary.mjs` が docs/org/analytics/daily/<昨日>.md を書く (D1 の記録 + KV の要望。md は git に入れない)。
- タスク自身が docs/org/dev/todo.md の宛先の表の「| ブラック |」の行から id を引き、SendMessage で 3〜5 行送る (昨日の訪問・PV・画面ごと・ブログ・前の日との差・要望とバグ (部の候補つき)・気になる事 1 つ)。10-23 にこの形へ (前は分析君への終わった知らせを待つ形で、10-22・10-23 とも届かなかった)。
- Discord の日報 (Analytics Engine) は手元から読めないので、数字は D1 の物。
- 失敗 (wrangler の 7403 など) はタスクがそのままブラックへ。分析君は頼まれた時に md を読んで深掘りする。
