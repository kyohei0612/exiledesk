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

## 最新の報告 (10-25 昼、ブラックへ。送信の上限 (ユーザーの次の書き込みまで 10 回) で止まったのでここに)
- ① 要望 93d00e7c の返事を置き直した (fbr:93d00e7c、0.1.598)。「使い方・コツに『クラフト手順』のカテゴリを作りました！最初の 1 本は『不在のアミュレットで全スペル +5』…」+ 英語 (広めての一言つき)。読み出しで確かめた。注意: 前の返事 (0.1.589、聖別の倍率) をもう見た人には、同じ id なので新しい返事は出ない (画面が id ごとに「見た」を覚える)。見たかはこちらでは分からない。
- ② 10-24 の日報: 9:05 の回で 10-24 の分を D1 から読む wrangler がその時だけ失敗し (手で回すと通る)、記録が欠けたまま daily-summary.mjs の TypeError で落ちていた。直し c486b428 (3 回まで読み直し・訳は wrangler の stderr・昨日の分が無ければ訳を書いて止める。壊れた鍵でわざと落として確かめた)。作り直した daily/2026-10-24.md: 訪問 99 (+20)・人 77 (+17)・PV 244 (+31、PC 127・スマホ 117)・PV/訪問 2.46。画面は craft 73・base 60・picker 37・routes 21・mod-list 19、ブログは記事ごとに 1〜3 PV。要望・バグ 0 件。どこから: direct 45・YouTube 14・旧 workers.dev 12・Google 8。
- 10-25 の予定のタスクの回 (local_e1184968) は、落ちた後の Bash で許可待ちのまま「動いている」で止まっている。私が立てた物ではないので止めていない (要るならオーナーかブラックで)。
- ③ /cosmetics/・/mtx-art/ は web の Worker に数えられない (最終チェック長の頼み、v0.1.598 の本番で)。決まった回数だけ叩いて 1 分ごとの web の Worker の回数を見た: /cosmetics/ 10・/cosmetics/<種類>/ 5・/en/cosmetics/ 5 (全部 200) の分 → 0、ある絵 /mtx-art/64.webp 10 (200) → 0、比べの /s/<id> 5 → 5。ただし無い絵 (/mtx-art/100.webp、404) 20 → 20: 404 は Worker を通る (notes/2026-10-25-www-redirect-rule.md の通り)。絵の道を間違えると 1 枚ずつ数えられるので、スキンの絵の名前が JSON と揃っているかはスキン部長に。台本は scratchpad の cf-count-probe.mjs・cf-minutes.mjs (使い捨て)。

## 前の報告 (10-24 の手元の開発版・10-22 の要望と /craft-basics) は notes/2026-10-23-todo-archive.md に移した (10-25 ホワイト)

## やる事
- 10-26 朝 (UTC の 10-25 が締まった後): web の Worker の数が 2,000 前後 → 650 前後に下がったか (トップを Worker の外に出した f3f66871 と Rule「www bot to apex」の後。10-25 の 9 件 OK は scripts/check-www-redirect.mjs)。ブラックへ 1 行。
- スキン一覧の SEO のページ (/cosmetics/・/en/cosmetics/、スキン部長) が本番に出たら、ゾーンの集計で Worker の数に出ていないかを 1 回見る (notes/2026-10-25-request-inventory.md の台本の形)。
- Discord の日報は手元から読めない (webhook は書くだけ・Bot 無し・REFRESH_KEY 無し、notes/bunseki-wake-design.md)。中身は D1 から `pull-logs.mjs` + `analyze-logs.py` で作り直す。

## OK 待ち

## 済み は notes/2026-10-23-todo-archive.md に移した
