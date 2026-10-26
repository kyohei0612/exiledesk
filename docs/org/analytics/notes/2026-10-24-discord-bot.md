# Discord を読むだけの Bot (2026-10-24)

オーナー 10-24: 10-21 の「Bot は作らない」を決め直し。「Bot は自分で 9:03 (日本時間) に起きて Discord を見に行き、書き込みをファイルにして管理人に渡す。管理人は Bot が作ったファイルを分析するだけ」。

## 作り (サーバー管理人が作った、本番にはまだ出していない)
- server/live の Worker に cron `3 0 * * *` (UTC 0:03 = 日本 9:03) を足した (wrangler.jsonc)。src/discord.ts の `pullDiscord` が、決めたチャンネルの前回より後の書き込みを Discord の REST (`GET /channels/<id>/messages`、読むだけ) で取り、D1 の `discord_daily` に 1 日 1 行で置く。チャンネルごとの「前回どこまで読んだか」は `discord_cursor` (migrations/0009_discord.sql)。KV は使わない。初めての回は 24 時間前から。1 チャンネル 1 回 500 件まで。
- 毎朝 9:05 の日報の回 (scripts/daily-summary.mjs) が、その日の行を読んで日報の md に「Discord の書き込み」の節を足す → ブラックへ送る。
- トークンか読むチャンネルが無い時は「Bot 未設定」の 1 行 (どこも落ちない)。トークンが違う時 (401 など) は「一部失敗」とエラーの文を載せる。
- Bot は Discord に何も書かない。Cloudflare の有料プランは使わない (1 日 1 回 + チャンネル数の取得なので枠はほぼ食わない)。

## オーナーがやる事 (トークンはオーナーだけが触る)
1. https://discord.com/developers/applications → 「New Application」(名前は例 ExileDesk Reader) を作る。
2. 左の「Bot」→「Reset Token」でトークンを出して控える (誰にも見せない・Claude に渡さない)。同じ画面の **Privileged Gateway Intents** の「**MESSAGE CONTENT INTENT**」を ON にして保存 (これが無いと書き込みの本文が空で返る)。
3. 左の「OAuth2」→「URL Generator」で、Scopes に `bot`、Bot Permissions に `View Channels` と `Read Message History` だけに印 → 下の URL を開いて ExileDesk のサーバーに招く。
4. トークンを入れる (PC のターミナルで、リポジトリの server/live で):
   ```bash
   npx wrangler secret put DISCORD_BOT_TOKEN
   ```
   と打ち、聞かれたらトークンを貼る (画面には出ない)。
5. 読むチャンネルを教える: Discord の「ユーザー設定 → 詳細設定 → 開発者モード」を ON → 読みたいチャンネルを右クリック →「チャンネル ID をコピー」→ ID (数字) をブラック経由で管理人へ。ID は秘密ではないので、管理人が wrangler.jsonc の `DISCORD_CHANNELS` に書く。
6. 管理人が本番の D1 に表を作り (migrations/0009)、server/live を出し直す → 次の朝 9:03 から動く。出した直後に 1 回、手で取り込みを起こして日報の節を確かめる。

## 質問 (オーナーへ)
- どのチャンネルを読むか (例: 要望・バグの通知が来るチャンネル、日報のチャンネル、人が書き込む雑談・質問のチャンネル)。サーバーが流している通知 (webhook の書き込み) も読むか、人の書き込みだけにするか。

## 確かめ (10-24、手元)
- 手元の Worker (wrangler dev --local --test-scheduled) で 9:03 の cron を起こす → 手元の D1 に `{"status":"未設定"}` の行。
- 作り物の Discord の返り (2 ページ 103 件、本物は叩かない) で: 古い順に 103 件、チャンネルごとに前回の印が置かれ、2 回目は 0 件、形の違うチャンネルの id は飛ばす、401 は「一部失敗」で落ちない。
- 日報の台本: 本番の D1 に表が無い今は「Bot 未設定 (本番の D1 に表がまだ無い)」の 1 行。

## 本番に出した (10-26、サーバー管理人 3 本目)
- オーナーがトークン・招待・MESSAGE CONTENT INTENT を済ませた。読むのはサーバー (guild) 1504880690867732630 の全部 (オーナー「全部読んで」)。vars は DISCORD_GUILD_ID (DISCORD_CHANNELS は使わない、書けばそれだけ読む)。
- 毎回 GET /guilds/{id}/channels と /threads/active で文字 (0)・お知らせ (5)・スレッド (10〜12) を拾う。見る権限の無いチャンネル (403) は飛ばして「書き込み無し・飛ばした」の 1 行に。Discord を叩くのは 1 回 45 回まで (無料のサブリクエスト 50)、1 チャンネル 500 件まで、残りは次の回に続きから。同じ日に 2 回走ったら前の行に足す (上書きしない)。
- 本番の D1 に migrations 0008・0009 を当てた。一時の cron (UTC 16:55) で 1 回起こして discord_daily に 10-26 の行 (status ok、3 チャンネル: #日報 1・#分析ログファイル管理 1 (どちらも webhook)・#要望管理場所 0)、日報の台本で「Discord の書き込み」の節が出るのを見た。一時の cron は外して出し直した (fb61d7fa)。
- 10-26 9:03 の回は 16:55 より後の分を同じ行に足す。

## 役割の線 (10-26 オーナー「ボットがやることは分析ファイルログを分析部に送ることやね」)
- Bot (server/live の Worker) = 渡すだけ。毎朝 9:00 に前の日の記録を数え、#分析ログファイル管理 に「分析用の記録 <日> N 行」を流し (sendDayLogs)、9:03 に Discord の書き込みを discord_daily へ。分析しない・Discord に人向けの文は書かない (流すのは前からの通知の 1 行だけ)。
- ログの本体は添付ではなく D1 の logs (10-10 に添付をやめた。行数は書き込みの「N 行」と同じ)。分析の部は `node scripts/pull-logs.mjs <日>` で data-cache/logs/<日>.jsonl に受け取る。
- 分析の部 (サーバー管理人) = 受け取ったログを全部読み、日報 (docs/org/analytics/daily/<日>.md) と AI の評価と見解 (<日>-ai.md、見本 2026-10-25-ai.md) を書き、ブラックへ要点 3〜5 行。毎朝の予定のタスクに足すかはオーナーの OK 待ち。
- 10-26 の整理: 上の「9:05 の日報 (daily-summary.mjs) が節に載せる」は終わり (台本ごと消した)。discord_daily は scripts/pull-server-notes.mjs が毎朝 <日>-server.json に写し、9 時の AI の評価と見解が読む。#分析ログファイル管理 への書き込みも 10-26 にやめた (チャンネルが消えても Bot は落ちない)。
