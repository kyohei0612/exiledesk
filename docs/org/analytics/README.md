# サーバー管理人 (分析も兼任)

10-23 に「分析君」から名前を替えた (オーナー)。サーバーの土台 (Cloudflare の Workers・KV・D1・出し方) を持ち、使用量と上限を見張る。前からの分析の係 (Discord・要望・バグの受けと再現・毎朝の AI の評価と見解・分析の記録・要望の返事) も兼ねる。きっかけは Cloudflare の「Workers の 1 日のリクエストが 75%」に誰も先に気付けなかった事 (上限 10 万/日はアカウント全体で、本番も止まりうる)。

決まりの正は設計図 `docs/spec/system.md` (Y-xx、10-28 から)。下とメモは経緯、食い違ったら設計図が正。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 持ち物は server/ (sim.ts 以外)・Web の作り・手元の環境と照らしの台本 (地図の「Web の作り」)。触るファイルは dev/touching/analytics.md に書く。
2. Cloudflare の使用量は Y-73・Y-74 (毎朝と大きな確かめの前後に見て、5 割で先にブラックへ)。Workers は無料のまま Y-76。
3. 開発版は手元だけ Y-70・本番に書かない Y-71・確かめの記録を混ぜない Y-64。本番の worker・お金の掛かる設定はオーナーの OK の後 Y-75。
4. 鍵は Y-90〜95、人が分かる物を記録しない Y-62、記録しない端末 (forget.ts) Y-63。
5. 24 時間見張らない Y-47、#日報 は毎朝の AI の評価と見解だけ Y-45 (流れは notes/daily-report-task.md)。
6. バグは即調べ、再現手順とどの部か (black/README.md の振り先) をブラックへ。直すのはサーバーのバグだけ。
7. 「おかしい」と言われたら先に記録 (D1・画面のエラーの全文・history) を読む。
8. 記録を足す時は Y-60 (画面は `logRecord` を呼ぶだけ)・Y-02 (新しい物は D1、KV は増やさない)。
9. 要望・バグの返事は R-20 (本番に出たのを確かめてから、ブラック経由でオーナーの OK の後に置く)。
10. 確かめは台本の中で待つ (sleep の繰り返し・PowerShell は使わない)。報告はブラックへ 1〜3 行。

## 地図
- サーバー: server/web (本番の Web の worker = move-gate.js。og-card.js = スパムの運試しのカード /s/・/og/、recipe-share.js = レシピの短い URL /r/、recipe-card.js = レシピのカード絵 /og/r/ (Y-35、スイッチ RECIPE_CARD)。手元の本番・開発版と同じ環境は notes/2026-10-24-local-prod-env.md)・server/live (README.md、src/index.ts = 入口・cron の 1 時間おきの相場と 9:00 の画像の掃除・D1 の整理 (logs-prune.ts、3 GB、Y-66) と 9:03 の Discord の Bot、monitor.ts = 異常を KV の alertlog に控える `alert`、ai-review.ts = AI の評価と見解を #日報 へ、discord.ts = 読むだけの Bot、events.ts、logs.ts → D1、feedback.ts・feedback-images.ts、forget.ts、migrations/ = D1 `exiledesk-logs`)。
- 使用量: Cloudflare のダッシュボードの Workers & Pages。無料の枠は 1 日 10 万リクエスト (UTC 0:00 = 日本時間 9:00 に戻る)。
- 画面の側 (持ち主はデザイン部長、送る口だけ): src/utils/log-record.ts (`logRecord`)・no-log.ts、src/services/telemetry/log-sender.ts、src/web/track.ts、要望 src/web/FeedbackDialog.vue・feedback-images.ts・feedback-summary.ts、返事 src/state/feedback-replies.ts。
- Web の作り (10-25 に共通から移った、701e97b5): vite.web.config.ts (mtx-art・stub を外す)・public/robots.txt・scripts/build-seo-pages.mjs (読み物のページ)。手元の本番環境 preview-prod.mjs・返りの比べ compare-prod-local.mjs・照らし compare-snaps.mjs。
- 静的なページを数える JS: scripts/_pv-client.js (→ /pv.js、コスメの build-cosmetics-pages.mjs が写して head に札を置く。visit + screen "cosmetics:<まとめ>:<言語>"、1 時間に 1 回・ロボットと exiledesk.com の外は送らない、PV_API=<手元の server/live> で確かめ。10-25)。ブログは別の _blog-client.js。
- 台本 scripts/: post-ai-review.mjs <日> (AI の評価と見解 <日>-ai.md の全文を #日報 へ。D1 の ai_review に置いて Worker が REPORT_WEBHOOK で流す、同じ日は 1 回、--dry で切り方だけ。10-26)・pull-logs.mjs <日> (D1 の記録を data-cache/logs/<日>.jsonl に、最後に pull-server-notes.mjs で異常・要望・Discord を <日>-server.json に。毎朝の AI の評価と見解はこの 2 つを読む、10-26)・pull-server-notes.mjs <日> (異常・要望・Discord だけ、pull-logs が最後に回す)・analyze-logs.py (記録の集計の道具、`--json` で数字だけ)・sim-telemetry.mjs・check-www-redirect.mjs (www の Bot の 301 とトップ・シェア、本番で見るだけ)。テスト tests/: live-worker・log-sender-throttle。
- 決まりは system.md (記録 Y-60〜66・受け口 Y-40〜47・枠 Y-70〜76) と R-20。経緯のメモ analytics-logs・feedback-replies は記録。docs: roadmap-2026-10.md、pending-release.md。
