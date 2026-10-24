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
