# discord-wake — Discord に来た時だけ分析君を起こす常駐台本

**まだ動かしていない (Bot を作るかはオーナーが決める)。** 設計は共有メモ bunseki-wake-design.md (2026-10-20)。

```
[Worker exiledesk-live の webhook]          [この台本 (PC で常駐、Node 24 だけ・npm install 要らず)]
 要望・バグのチャンネル ── 投稿 ──▶ Bot (Gateway) ── 「-# 要望の id <id>」 ──▶ claude -p を 1 本 (同じ id は 1 回)
 日報のチャンネル      ── 投稿 ──▶            ── 「📊 ExileDesk 日報」 ──▶ その日 1 回だけ
                                              9:30 (JST) に日報が無い ──▶ 知らせる + 原因を見る 1 本
```
- 起こした claude は同時に 1 本 (列に並ぶ)。1 日の上限 10 回・1 本 20 分まで (変えるなら .env)。
- 起こした claude は既定で**読むだけ** (Read・Grep・Glob・wrangler の kv list / get・pull-logs)。結果は `state/results/<日>-<id>.md` に、`claude --resume <session>` で続きを話せる。
- 知らせの webhook (`WAKE_NOTIFY_WEBHOOK`) を入れると、結果をそのチャンネルに 1 通。Bot 自身は Discord に書かない。
- 止まっていた間 (PC が寝ていた等) の投稿は、つながった時に読み直す (最後に見た投稿より後だけ)。
- 人の書き込みや他の Bot は見ない (Worker の webhook の投稿だけ)。

## オーナーがやる事 (初回だけ)
1. **Bot を作る**: https://discord.com/developers/applications → New Application → 左の Bot → Reset Token でトークンを控える (人に見せない)。
2. **Message Content Intent を ON**: 同じ Bot の画面の Privileged Gateway Intents → MESSAGE CONTENT INTENT。OFF だと台本は「code 4014」で止まる。
3. **招待**: 左の OAuth2 → URL Generator → scopes に `bot`、権限に `View Channels`・`Read Message History` だけ → 出た URL を開いて自分のサーバーへ。要望・日報のチャンネルが Bot から見えるようにする (非公開チャンネルなら Bot のロールを足す)。
4. **トークンとチャンネル id を置く**: このフォルダの `.env.example` を `.env` に写して `DISCORD_BOT_TOKEN`・`WAKE_FEEDBACK_CHANNEL_ID`・`WAKE_REPORT_CHANNEL_ID` を入れる (`.env` は git に入らない)。PC の環境変数に置いてもよい。チャンネル id は Discord の設定 → 詳細設定 → 開発者モード ON → チャンネルを右クリック → ID をコピー。
5. **試す**: `WAKE_DRY_RUN=1` のまま、このフォルダで `start.cmd` → 「つながりました」が出る → 要望を 1 件送る → `state/results/` に頼みの文が出れば OK。よければ `WAKE_DRY_RUN=0` に。
6. **タスクスケジューラに登録** (PowerShell で 1 回):
   ```powershell
   $a = New-ScheduledTaskAction -Execute "C:\Users\kyohei\ExileDesk\server\discord-wake\start.cmd"
   $t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
   $s = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
   Register-ScheduledTask -TaskName "ExileDesk discord-wake" -Action $a -Trigger $t -Settings $s
   ```
   止める: `Stop-ScheduledTask "ExileDesk discord-wake"`、消す: `Unregister-ScheduledTask "ExileDesk discord-wake"`。
7. **決める事**: 分析君にどこまでさせるか (今は読むだけ。再現まで・直して開発版まで、にするなら `WAKE_ALLOWED_TOOLS` を広げる)、起こさない時間 (`WAKE_QUIET_HOURS`)、1 日の上限。

## 中身
| ファイル | 役割 |
|---|---|
| `wake.mjs` | 入口。チャンネルの見分け・同じ id は 1 回・1 日の上限・起こさない時間・9:30 の見張り・止まっていた間の読み直し |
| `gateway.mjs` | Discord の Gateway (心拍・つなぎ直し・RESUME) と、読み直し用の REST の GET |
| `jobs.mjs` | 起こす列 (同時 1 本)・`claude -p` の起こし方・頼みの文・結果の保存と知らせ |
| `state.mjs` | `state/state.json` (起こした id・日報の日・最後に見た投稿・回数) |
| `start.cmd` | タスクスケジューラの入口 (`node --env-file-if-exists=.env wake.mjs`) |

`state/` (覚え・ログ wake.log・添付・結果) と `.env` は git に入らない。トークンはログにも書かない。

## まだ分からない事
- `claude -p` で起こしたセッションがデスクトップアプリの一覧に出るか (出なくても `claude --resume <session>` で続きは話せる)。
- `claude -p` がサブスクの枠をどれだけ使うか。
