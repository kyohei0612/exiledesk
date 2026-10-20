# 分析君を「来た時だけ起こす」下調べ (2026-10-20)

コード・設定は変えていない。外の API は叩いていない。

## 1. 今の流れ (server/live = Worker exiledesk-live)

```
[Web の「要望・バグを送る」]
  POST /feedback ─▶ KV "fb:<逆順の時刻>:<id>" (90 日。新しい順に並ぶ)
                 ├▶ 画像は D1 fb_images (90 日、毎朝の cron が消す)
                 └▶ すぐ Discord (secret DISCORD_WEBHOOK)  … 「💬 要望・バグ 👤<送った人> · 時刻」+ 本文 + 状態 + 添付 JSON + 画像、最後の行に「-# 要望の id <id>」
                    (画面では要望とバグを分けない。🐛 は古い版の bug だけ)
  POST /feedback/<id>/images ─▶ D1 + Discord (同じ webhook)

[Web の操作]
  POST /event ─▶ Analytics Engine (exiledesk_events, 3 か月)
  POST /log   ─▶ D1 exiledesk-logs の logs (1 まとまり 1 行)

[cron]
  0 * * * *  (毎時) … 相場 → KV market、8 時間おきに配信の見張り → KV state、訪問者数、異常は KV alertlog: に控えるだけ (即時の Discord はやめた 10-08)
  0 0 * * *  (UTC 0 時 = JST 9 時) … monitor.ts dailyReport → Discord (REPORT_WEBHOOK、無い / 失敗なら DISCORD_WEBHOOK)
                                     logs.ts sendYesterdayLogs → Discord (LOGS_WEBHOOK、「分析用の記録 <日> N 行 · MB」の 1 行だけ)
                                     画像の掃除
```
- Discord に送るのは全部 webhook (書くだけ。読めない)。Discord Bot・Bot のトークンはリポジトリにも手元にも無い。
- 日報の中身は GET /report (ヘッダー x-exiledesk-key = REFRESH_KEY) でも出るが、REFRESH_KEY は手元に無い。
- 手元で読めるのは wrangler ログイン経由の KV (`wrangler kv key list --prefix fb:`) と D1 (pull-logs.mjs)。
- ANTHROPIC_API_KEY は環境変数に無い (claude -p はサブスクのログインで動く)。claude CLI 2.1.300・Node v24 あり。
- ~/.claude/scheduled-tasks に以前のデスクトップの予定の仕事 (exiledesk-unfreeze-2026-10-16) がある = デスクトップの予定の仕事は使ったことがある。

## 2. 起こし方の調べ (公式 docs)
- claude -p: Node の spawn で cwd=リポジトリ、引数は配列で。--output-format json で session_id が取れる。--permission-mode / --allowedTools で無人に。出典 code.claude.com/docs/en/headless
- -p のセッションはデスクトップの Code タブの一覧に出るか: 公式に記載なし (要確認)。`claude --resume <session-id>` で続きは話せる。
- デスクトップの予定の仕事: 9 時に起こせる・ローカルのファイル可・最短 1 分。アプリが起動して PC が起きている時だけ。寝ていたら起きた後に 1 回。外からのトリガーは無い。
- クラウドの routines: API トリガー (POST …/routines/<id>/fire、リサーチプレビュー) はあるが、手元のファイル・wrangler ログインは使えない → この用途には不向き。
- 費用: -p はサブスクの枠。枠にどう数えるかは公式に明記なし。

## 3. おすすめ
**Discord Bot (Gateway で待ち受け) を Node の常駐台本に 1 本。** 見張りは Claude を使わない。
- 要望・バグのチャンネルに webhook の投稿が来た瞬間に届く (数分おきに見に行かない、Cloudflare の KV 読みの枠も使わない)。
- 毎朝 9 時の日報も日報のチャンネルに来るので、「日報が届いたら 1 回起こす」で 9 時の予定の仕事が要らない (届かなければ 9:30 に「来ていない」を起こす)。
- 起こす = `claude -p "<分析君への頼み + 本文 + 添付 JSON の場所>" --output-format json` を cwd=C:\Users\kyohei\ExileDesk で。同時は 1 本まで (列に並べる)、同じ要望の id は 1 回。
- 結果は Discord に返さず (Bot に書く権限を付けるなら別に決める)、オーナーへは決めたチャンネルに 1 行 + セッション id。
- 常駐はタスクスケジューラ「ログオン時に起動・失敗したら 1 分後に再起動・停止しない」。メモリは Node + discord.js で 50〜100 MB 程度 (見込み、測っていない)。

代わりの案 (Bot を作りたくない時): 台本が 5 分おきに `wrangler kv key list --prefix fb:` の先頭 1 件を見て、前と違えば起こす。Bot は要らないが、wrangler のログイン切れ (10-19 に 7403 があった) に弱く、1 回ごとに wrangler (重い node) が立つ。KV の list は無料 1,000/日 の内 288/日。9 時は日報の中身が読めない (REFRESH_KEY が無い) ので、D1 から自分で集計させる形になる。

## オーナーにやってもらう事 (Bot 案)
1. Discord Developer Portal でアプリ → Bot を作る、トークンを控える。
2. Bot の設定で **Message Content Intent** を ON。
3. 招待 URL (scope: bot、権限: View Channel・Read Message History。返事を書かせるなら Send Messages) でサーバーに入れ、要望・日報のチャンネルを見られるようにする。
4. トークンは PC の環境変数 or 台本の横の .env (git に入れない) に自分で貼る。
5. 分析君に何をさせるか (読むだけ / 再現まで / 直して開発版まで) と、起こしてよい時間帯・1 日の上限を決める。

## 未確定
- -p で起こしたセッションがデスクトップの一覧に出るか (公式に無い。作る時に 1 回試せば分かる)。
- -p がサブスクの枠をどれだけ使うか (公式に明記なし)。
- デスクトップの予定の仕事で PC の環境変数が使えるか (公式に無い)。
- webhook の投稿を Bot が読む時の author は webhook (bot 扱い) なので、台本で「webhook_id があれば対象」と見分ける必要あり (Discord の一般的な仕様、ここでは試していない)。
