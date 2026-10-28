# 毎朝 9 時の AI の評価と見解 (README の決まり 5 の細かい所、10-26 に今の形)

オーナー 10-26「日報も古い報告の仕方は不要、完全に既定の報告はいらなくなったから、時間は 9 時でいいや自動でやるの」「だってもう直で見にいくんでしょ」。

- 予定のタスク exiledesk-daily-summary (毎朝 9 時頃。中身はブラックが書き換えた、~/.claude/scheduled-tasks/exiledesk-daily-summary/SKILL.md)。
- 流れ: `node scripts/pull-logs.mjs <昨日>` → data-cache/logs/<昨日>.jsonl (D1 の記録の全部) と <昨日>-server.json (サーバーの異常・要望・その朝 9:03 に Bot が取った Discord の書き込み、scripts/pull-server-notes.mjs) を読む → docs/org/analytics/daily/<昨日>-ai.md (何が起きているか / 良い兆し / 悪い兆し / 前の日・前の週との違いの訳 / 次の手 3 つまで。見本 2026-10-25-ai.md) → `node scripts/post-ai-review.mjs <昨日>` で #日報 に全文 (同じ日は 1 回だけ)。md は git に入れない。
- D1 の大きさ (10-28 から): <昨日>-server.json の `d1` = { bytes, limit: 3e9 }。上限 3 GB を超えると毎朝 9:00 の cron が古い日の記録から消す (Y-66)。評価と見解の終わりに「D1 ○ MB / 3 GB」を 1 行、消した日は異常の `記録の整理` に出る。
- 集計の道具が要れば `python scripts/analyze-logs.py data-cache/logs/<日>.jsonl` (前の日・前の週と並べる時も)。
- 消した物 (10-26): 数字だけの日報 (scripts/daily-summary.mjs・server/live の dailyReport と GET /report)、#分析ログファイル管理 への記録の件数 (sendDayLogs・LOGS_WEBHOOK)。
- 止まった回が「動いている」のまま残ると次の回が始まらない (10-25 の回 local_e1184968 で 10-26 の朝が飛んだ)。朝に <昨日>-ai.md が無ければ list_task_runs で見る。
