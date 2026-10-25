# サーバー管理人 のやる事

## 次の管理人へ (10-25、2 本目 → 3 本目。1 本目からの長い物は notes/2026-10-24-handoff.md)
- 先に README の決まり 10 個と notes/2026-10-24-handoff.md を読む。報告はブラック (dev/todo.md の宛先の表) へ。セッション同士の送信はオーナーの書き込みの間に 10 回までで止まる。止まったらここの「最新の報告」に書いて commit。
- **明日の朝 (10-26、JST 9 時に UTC の 10-25 が締まった後)**: web の Worker の 1 日の数が 2,000 前後 → 650 前後に下がったかを見てブラックへ 1 行。残りの大半は 404 (/wp-admin/ などを探る Bot、1 日 600 前後) のはず。数え方は notes/2026-10-25-request-inventory.md (ゾーンの集計の台本の形もそこ)。
- **日報の予定のタスク**: 10-25 の回 (local_e1184968) は D1 の読みがその時だけ落ちた後、Bash の許可待ちで「動いている」のまま止まっている (2 本目は止めていない、立てた人のでないので)。台本は c486b428 で直した (3 回まで読み直し・昨日の分が無ければ訳を書いて止まる)。明日 9:05 の回が通るかを list_task_runs で見る。ブラックへの SendMessage は前から断られるので、ブラックが md を読みに行く形。
- やりかけ: Discord を読むだけの Bot (1380e836、本番まだ)。オーナーのトークン (secret DISCORD_BOT_TOKEN) と読むチャンネルの ID 待ち。揃ったら vars に DISCORD_CHANNELS → 本番の D1 に migrations 0009 → server/live を deploy → 日報の節を見る (notes/2026-10-24-discord-bot.md)。
- やりかけ: ツリーの短い URL (/tree/、1e3432b5) は TREE_SHARE=1 の時だけ開く。シミュを本番に出す時に表 (0008) と一緒に。
- **持ち物が増えた (10-25、701e97b5)**: vite.web.config.ts・public/robots.txt・scripts/build-seo-pages.mjs・preview-prod.mjs・compare-prod-local.mjs・compare-snaps.mjs (README の地図の「Web の作り」)。vite.web.config.ts には dev だけの読み物の差し込み (6a78fe35・6492792a、/blog/ を data-cache/dev-blog から配り、トップへのリンクを /web.html に) がある。足した台本 scripts/check-www-redirect.mjs は owner-of で「共通」のまま (owners.txt に「サーバー」を足すのをブラックに頼んだ)。
- Cloudflare の見張り: wrangler auth token で GraphQL (Worker ごと workersInvocationsAdaptive、ゾーン exiledesk.com f2abdbdb… の道・UA ごと httpRequestsAdaptiveGroups)。GraphQL は数回続けると 5 分の回数の上限、wrangler の一時の鍵は数分で切れる (待つ台本は鍵を後で取り直す)。1 日 10 万はアカウント全体・JST 9 時に戻る。
- 照らしの台本: `node scripts/compare-snaps.mjs --local <手元>` (必ず 01 から、--prev で前の撮り物と)。手元は `node scripts/preview-prod.mjs --head --live --port 1462`。
- 気を付ける: 本番の worker を出すのは OK の後 (出すのは最終チェック長)。src に新しい import.meta.env.* が入ると _bundle-ts.mjs の define に足さないと build:web が落ちる。Node の fetch は sec-fetch-mode を自分で付ける (名乗らないプログラムを試すのは curl で)。
- 要望は KV の fb:。返事の無い物は 91832821 だけ (シミュを本番に出す時。① 逆算は止めた・② 貼り付けは旧シミュごと消えたので、返事は今の形で書き直す要あり)。

### 今日 (10-25) の済み
- サイト全体のリクエストの棚卸し (notes/2026-10-25-request-inventory.md): 本番だけなら 1 日 3〜4%、web の Worker の 6〜8 割は Bot のトップ (Applebot・SemrushBot)。1 人 1 訪問 2〜4 回、操作では増えない。
- トップを Worker の外へ (af0c886c、本番 f3f66871): run_worker_first は /s/*・/og/* だけ、move-gate.js は og-card を返すだけ。www の Bot 向けの 301 はオーナーが作った Cloudflare の Redirect Rule「www bot to apex」(式の直しは 42bd5fab)。本番で check-www-redirect.mjs --share C6RGjvS が 9 件全部 OK。手順・戻し方は notes/2026-10-25-www-redirect-rule.md。
- /cosmetics/・ある絵 /mtx-art/ は本番で Worker の数に 0 (叩いた 30 回 → 0、比べの /s/ 5 → 5)。**無い道 (404) は 1 回ずつ数える** (無い絵 20 → 20)。
- 要望 93d00e7c の返事を 0.1.598 の物に置き直した (前の返事をもう見た人には同じ id なので出ない)。
- 10-24 の日報を作り直した (daily/2026-10-24.md: 訪問 99・人 77・PV 244・要望 0)。スキン部長・デザイン部長への枠の答え、dev のブログの差し込み。

## 前の報告 (10-24 の手元の開発版・10-22 の要望と /craft-basics) は notes/2026-10-23-todo-archive.md に移した (10-25 ホワイト)

## やる事
- 10-26 朝 (UTC の 10-25 が締まった後): web の Worker の数が 2,000 前後 → 650 前後に下がったか (トップを Worker の外に出した f3f66871 と Rule「www bot to apex」の後。10-25 の 9 件 OK は scripts/check-www-redirect.mjs)。ブラックへ 1 行。
- 10-26 9:05 の日報の予定のタスクが通ったか (list_task_runs)。止まった 10-25 の回 (local_e1184968) の片付けはブラックかオーナーに。
- Discord の日報は手元から読めない (webhook は書くだけ・Bot 無し・REFRESH_KEY 無し、notes/bunseki-wake-design.md)。中身は D1 から `pull-logs.mjs` + `analyze-logs.py` で作り直す。

## OK 待ち

## 済み は notes/2026-10-23-todo-archive.md に移した
