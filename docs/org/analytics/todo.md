# サーバー管理人 のやる事

## 次の管理人へ (10-24、前の管理人。長い物は notes/2026-10-24-handoff.md)
- 先に README の決まり 10 個と notes/2026-10-24-handoff.md を読む。報告はブラック (dev/todo.md の宛先の表) へ。
- やりかけ: Discord を読むだけの Bot (1380e836、本番まだ)。オーナーのトークン (secret DISCORD_BOT_TOKEN) と読むチャンネルの ID 待ち (質問はブラックへ送り済み)。揃ったら vars に DISCORD_CHANNELS → 本番の D1 に migrations 0009 → server/live を deploy → 日報の節を見る (notes/2026-10-24-discord-bot.md)。
- やりかけ: ツリーの短い URL (/tree/、1e3432b5) は TREE_SHARE=1 の時だけ開く。シミュを本番に出す時に表 (0008) と一緒に。
- 照らしの台本: `node scripts/compare-snaps.mjs --local <手元>` (必ず 01 から、--prev で前の撮り物と)。手元は `node scripts/preview-prod.mjs --head --live --port 1462`。前回は違い 12/40 で全部 RELEASED の分 + スマホの使い方・コツの数 px のずれ (561ddbe7 で直った、旧シミュの空の箱 6px)。
- Cloudflare の見張り: 毎朝と大きな確かめの前後に、wrangler auth token で GraphQL (workersInvocationsAdaptive・kvOperationsAdaptiveGroups)。1 日 10 万はアカウント全体、JST 9 時に戻る。web-dev は消したので本番だけの数 (10-23 は本番 web 3,423・live 775)。
- 日報: 予定のタスクが 9:05 頃に md を書いてブラックへ送る。止まったら list_task_runs で見て run_scheduled_task で回し直す。
- 気を付ける: 本番の worker を出すのは OK の後。server/web を出すと dist-web も上がる (本番と同じか比べてから)。src に新しい import.meta.env.* が入ると _bundle-ts.mjs の define に足さないと build:web が落ちる。
- 要望は KV の fb:。10-22 の 89ff6ab3 より後は 0 件 (10-24 朝)。返事の無い物は 91832821 だけ (シミュを本番に出す時。① 逆算は止めた・② 貼り付けは旧シミュごと 10-22〜23 に消えたので、返事は今の形で書き直す要あり、10-25 ホワイト)。

## 前の報告 (10-24 の手元の開発版・10-22 の要望と /craft-basics) は notes/2026-10-23-todo-archive.md に移した (10-25 ホワイト)

## やる事
- スキン一覧の SEO のページ (/cosmetics/・/en/cosmetics/、スキン部長) が本番に出たら、ゾーンの集計で Worker の数に出ていないかを 1 回見る (notes/2026-10-25-request-inventory.md の台本の形)。
- Discord の日報は手元から読めない (webhook は書くだけ・Bot 無し・REFRESH_KEY 無し、notes/bunseki-wake-design.md)。中身は D1 から `pull-logs.mjs` + `analyze-logs.py` で作り直す。

## OK 待ち

## 済み は notes/2026-10-23-todo-archive.md に移した
