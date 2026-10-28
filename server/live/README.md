# exiledesk-live — ライブ中のチャンネルを配る小さなサーバー

Web 版の横に「自分のチャンネル・協賛チャンネル」のサムネとリンクを出すための仕組み。
今は相場・配信・記録・要望・日報・Discord の受け口も持つ。決まりの正は設計図 `docs/spec/system.md` (Y-40〜47・Y-60〜66、10-28 から)。/tree/ の短い URL (tree-share.ts) は 10-28 に消した (表は 0012 で出しの時に落とす)。
Cloudflare Workers (無料枠) で動き、**ドメインは要らない** (`exiledesk-live.<あなたの名前>.workers.dev` という URL がもらえる)。

```
[5 分ごとに自動で]
 Worker ──「この数人、今ライブ中？」──▶ YouTube (RSS + /live ページ + videos.list 1 点) / Twitch (Get Streams)
 Worker ── 結果を KV に保存

[サイトを見た人]
 ブラウザ ── GET /live.json ──▶ Worker ── KV の結果をそのまま返す
```

見る人が何千人いても、YouTube / Twitch への問い合わせは 5 分に 1 回。無料枠 (Workers 10 万回/日、KV 読み 10 万/日・書き 1,000/日、YouTube 1 万点/日) に余裕で収まる。

## 返す JSON (GET /live.json)

```json
{
  "updatedAt": "2026-10-07T09:00:00.000Z",
  "live":     [ { "id": "poe2tube", "name": "POE2Tube", "platform": "youtube", "status": "live", "title": "…", "thumb": "https://…/mqdefault.jpg", "watchUrl": "https://www.youtube.com/watch?v=…", "startedAt": "…", "viewers": 12, "pr": false, "url": "…" } ],
  "upcoming": [ …同じ形 (status: "upcoming", scheduledAt あり)… ],
  "channels": [ { "id": "…", "name": "…", "platform": "…", "url": "…", "pr": true, "status": "off", "avatar": "https://…" } ],
  "errors": []
}
```

- `live` … 今ライブ中 (視聴者の多い順、自分のチャンネルが先)
- `upcoming` … 予定の配信 (YouTube だけ。近い順)
- `channels` … 全チャンネル (配信していなくても出す。アイコン付き)。並びは channels.json のまま
- `pr: true` は協賛。画面には「PR」と出す (ステマ規制: お金や物をもらった宣伝には表示が要る)

## 要望・バグ (Web 版の「要望・バグを送る」)

- `POST /feedback` に届いた物を KV に 90 日残す (同じ IP から 1 時間 10 件まで、bot よけの欄あり)
- `GET /feedback.json (ヘッダー x-exiledesk-key: <REFRESH_KEY>)` で新しい順の一覧 (添付 = 送った人の画面の状態: ベース・狙い・パターン)
- Discord にも流すなら: Discord のサーバー設定 → 連携サービス → ウェブフック → 新しいウェブフック → 「ウェブフック URL をコピー」→ `npx wrangler secret put DISCORD_WEBHOOK` に貼る → `pnpm run deploy`

## 見張りと毎朝の AI の評価と見解 (2026-10-07、10-26 に今の形)

- **操作の印** (`POST /event`): Web 版が「開いた → 手で打つ / シミュレーション → ベース → 狙い → 順番 → 手順 → 回した → 完成 → 取引所」などの印を送る (cookie なし、名前や IP は無い)。Analytics Engine に 3 か月残る (無料 10 万/日)。ダッシュボードの Workers → Analytics Engine で「有効にする」が 1 回要る
- **毎朝 9 時の AI の評価と見解** (10-26 オーナー「既定の報告はいらなくなった」): 予定のタスクが手元で `scripts/pull-logs.mjs` (D1 の記録 + `pull-server-notes.mjs` の異常・要望・Discord) を読んで `docs/org/analytics/daily/<日>-ai.md` を書き、`scripts/post-ai-review.mjs` で D1 の `ai_review` に置く → Worker が `POST /ai-review/flush` (と毎時の cron) で #日報 に全文を流す (src/ai-review.ts、secret の `REPORT_WEBHOOK`)。数字の日報 (前の `dailyReport`・`GET /report`) と #分析ログファイル管理 への記録の件数は 10-26 に消した
- **異常**: 相場の中継が落ちた・サーバーのエラーなどを KV の `alertlog:` に控えるだけ (同じ物は 6 時間に 1 回、2 日残す)。Discord にはすぐ送らない。毎朝の AI の評価と見解の材料
- **ログ**: ダッシュボードの Workers → exiledesk-live → ログ に 1 回ごとの記録 (path・status・ms・国。無料は 3 日分)。手元で見るなら `pnpm tail`

- **D1 の記録の整理** (2026-10-28 オーナー「３ＧＢ上限で設定あふっれたら古い奴から整理」、設計図 Y-66): 毎朝 9:00 (JST、cron `0 0 * * *`) に D1 の大きさが 3 GB を超え、中身 (logs + 要望の画像) も 3 GB を超えていたら、logs を古い日から 2.7 GB まで消す (src/logs-prune.ts)。消したら alertlog の `記録の整理`。今の大きさは `pull-server-notes.mjs` の `d1`
- **Discord を読むだけの Bot** (2026-10-24、10-26 に本番): 毎朝 9:03 (JST、cron `3 0 * * *`) に、サーバー (vars の `DISCORD_GUILD_ID`) の文字のチャンネル・お知らせ・スレッドを拾い、それぞれ前回より後の書き込みを D1 の `discord_daily` に 1 日 1 行 (src/discord.ts、migrations/0009)。見る権限の無いチャンネルは飛ばす、1 回 45 回まで叩く。トークンは secret の `DISCORD_BOT_TOKEN`。Bot は何も書かない。作り方は docs/org/analytics/notes/2026-10-24-discord-bot.md

## オーナーがやること (初回だけ、全部無料)

1. **Cloudflare のアカウント** を作る: https://dash.cloudflare.com/sign-up
2. **YouTube の API キー**: https://console.cloud.google.com/ でプロジェクトを作る → 「API とサービス」→「ライブラリ」で **YouTube Data API v3** を有効にする → 「認証情報」→「API キーを作成」。キーの制限で「YouTube Data API v3 だけ」にしておくと安全
3. **Twitch のアプリ**: https://dev.twitch.tv/console/apps → 「アプリケーションを登録」(名前は何でも、OAuth リダイレクト URL は `http://localhost`、カテゴリは Website Integration) → **クライアント ID** と **クライアントシークレット** (「新しいシークレット」で作る) を控える
4. このフォルダで:
   ```bash
   pnpm install
   npx wrangler login              # ブラウザが開くので Cloudflare にログイン
   npx wrangler kv namespace create LIVE
   ```
   最後のコマンドが `id = "xxxxxxxx"` を出すので、`wrangler.jsonc` の `REPLACE_WITH_KV_NAMESPACE_ID` をそれに置き換える
5. 秘密の値を登録する (聞かれたら貼り付ける):
   ```bash
   npx wrangler secret put YOUTUBE_API_KEY
   npx wrangler secret put TWITCH_CLIENT_ID
   npx wrangler secret put TWITCH_CLIENT_SECRET
   npx wrangler secret put REFRESH_KEY          # 好きな文字列 (手で調べ直す時の合言葉。要望の一覧を見る時にも使う)
   npx wrangler secret put DISCORD_WEBHOOK      # (任意) 要望・バグ・異常・日報を Discord に流す
   npx wrangler secret put CF_ANALYTICS_TOKEN   # (任意) 日報の訪問数など (Account Analytics: Read のトークン)
   npx wrangler secret put DISCORD_BOT_TOKEN    # (任意) Discord を読むだけの Bot (docs/org/analytics/notes/2026-10-24-discord-bot.md)
   ```
6. `channels.json` を本物にする (自分のチャンネルの `youtubeChannelId`、協賛チャンネル)。YouTube のチャンネル ID は UC で始まる 24 文字: YouTube Studio → 設定 → チャンネル → 詳細設定 に出る
7. 置く:
   ```bash
   pnpm run deploy
   ```
   `https://exiledesk-live.<名前>.workers.dev` が出る。`…/health` を開いて `{"ok":true}` が出れば動いている。
   最初の 1 回は `…/refresh (ヘッダー x-exiledesk-key: <REFRESH_KEY>)` を開くとすぐ調べる (あとは 5 分おきに勝手に)。`…/live.json` が結果

チャンネルを足す・外す時は `channels.json` を直して `pnpm run deploy` だけ。

## 手元で動かす (開発)

```bash
cp .dev.vars.example .dev.vars     # 中にキーを書く (無くても動く。その時は errors にキーが無いと出る)
pnpm dev                           # http://localhost:8787
curl "http://localhost:8787/cdn-cgi/local/scheduled"   # 5 分おきの処理を今すぐ 1 回
curl http://localhost:8787/live.json
```

手元の KV は `.wrangler/` の中に作られる (git には入れない)。

## 中身

| ファイル | 役割 |
|---|---|
| `channels.json` | 載せるチャンネルの一覧 |
| `src/youtube.ts` | RSS + /live ページで動画 ID を集め、videos.list (1 点) でライブ中か確かめる。search.list (100 点) は使わない |
| `src/twitch.ts` | アプリのトークン (KV に覚える、58 日有効) + Get Streams (100 人まで 1 回) |
| `src/state.ts` | 結果を JSON の形にまとめる (並び順) |
| `src/index.ts` | 5 分おきの処理と、GET /live.json などの入口 |

自動テストはリポジトリの `tests/live-worker.test.ts` (`pnpm test` で一緒に走る。外には繋がない)。
