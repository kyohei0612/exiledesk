# サーバー管理人 のやる事

## 次の管理人へ (10-24、前の管理人。長い物は notes/2026-10-24-handoff.md)
- 先に README の決まり 10 個と notes/2026-10-24-handoff.md を読む。報告はブラック (dev/todo.md の宛先の表) へ。
- やりかけ: Discord を読むだけの Bot (1380e836、本番まだ)。オーナーのトークン (secret DISCORD_BOT_TOKEN) と読むチャンネルの ID 待ち (質問はブラックへ送り済み)。揃ったら vars に DISCORD_CHANNELS → 本番の D1 に migrations 0009 → server/live を deploy → 日報の節を見る (notes/2026-10-24-discord-bot.md)。
- やりかけ: ツリーの短い URL (/tree/、1e3432b5) は TREE_SHARE=1 の時だけ開く。シミュを本番に出す時に表 (0008) と一緒に。
- 照らしの台本: `node scripts/compare-snaps.mjs --local <手元>` (必ず 01 から、--prev で前の撮り物と)。手元は `node scripts/preview-prod.mjs --head --live --port 1462`。前回は違い 12/40 で全部 RELEASED の分 + スマホの使い方・コツの数 px のずれ (要確認)。
- Cloudflare の見張り: 毎朝と大きな確かめの前後に、wrangler auth token で GraphQL (workersInvocationsAdaptive・kvOperationsAdaptiveGroups)。1 日 10 万はアカウント全体、JST 9 時に戻る。web-dev は消したので本番だけの数 (10-23 は本番 web 3,423・live 775)。
- 日報: 予定のタスクが 9:05 頃に md を書いてブラックへ送る。止まったら list_task_runs で見て run_scheduled_task で回し直す。
- 気を付ける: 本番の worker を出すのは OK の後。server/web を出すと dist-web も上がる (本番と同じか比べてから)。src に新しい import.meta.env.* が入ると _bundle-ts.mjs の define に足さないと build:web が落ちる。
- 要望は KV の fb:。10-22 の 89ff6ab3 より後は 0 件 (10-24 朝)。返事の無い物は 91832821 だけ (シミュを本番に出す時)。

## 最新の報告 (10-24、ブラックへ。送信の上限で止まったのでここに)
- 手元の開発版と同じ環境ができた (29838492)。オーナーへ: `pnpm preview:prod -- --dev` → **http://dev.exiledesk.localhost:1461/** (ブックマーク「ExileDesk開発版」を差し替え、初回はビルドで数分、止めるのは Ctrl+C)。本番そのままは `pnpm preview:prod` → http://exiledesk.localhost:1460/。
- 開発版と同じ: ビルドの印・シミュとチュートリアル・相場は本番の live の /boot.json・分析は送らない。違う: 門なし、HEAD ではなく今の作業中のファイルから。確かめ (窓なしの Chrome 9370、返した): 題・アイコン 5 つ・manifest は開発版と同じ、エミュ・シミュのツリー・見本の木 (金の指輪で箱 42)・タブ替えが動きエラー 0。窓なしの Chrome だけ Service Worker の取っておき場が開けない癖 (外して見た)、いつもの Chrome はオーナーに触って確かめてほしい。本番と並べた比べは 42 通りで違いは content-type の charset だけ。
- web-dev を消す時の手順と CLAUDE.md の「動かし方」の 1 行の案は notes/2026-10-24-local-prod-env.md の末尾 (消すのはまだ)。


## 最新の報告 (10-22、返事の無い要望)
- 返事の無い要望は 2 件だけ (10-17 の区切り 91ccb2d0 より新しい 5 件のうち。区切りまでの 40 件のうち返事なし 18 件は、オーナー 10-17「一旦全要望クリア」で済み扱い)。
- 89ff6ab3 · 10-22 22:03 · 不在のアミュレットでスピリット狙いの手順 · 返事を置いた (オーナー 10-22「その動き、今できます!」/ en "You can do that now!")
- 91832821 · 10-18 · ① 完成品から逆算して最安の手順 ② 取引所の品を完成品の MOD に貼り付け · ① は止めた・② は開発版だけ (シミュを本番に出す時に返事)
- 本番で済んで返事を置けそうな物: 無し (51092b58・752b6d80・93d00e7c は置き済み)

## 前の報告 (10-22、ブラックへ)
- /craft-basics の「クロール済み未登録」の調べ (notes/2026-10-22-craft-basics-not-indexed.md、何も変えていない)。頭の情報 (title・description・canonical・hreflang) は揃っていて noindex も無く、sitemap にも入り、39 ページから張られている。
- 理由の見立ては 3 つ: (1) 10-17 にできたばかり (サイトも 10-09 に引っ越し)、(2) 9 つの話題を 2,334 字で 1 つ 260 字ほどと薄い (ブログの記事は 6,000 字前後)、(3) お告げ・骨・カタリストなどブログに詳しい記事があるのに、入門からは一覧 /blog/ にしかリンクが無い。
- 案 (審査の後、ジン部長の public/craft-basics.html): 各節から詳しい記事へリンクを張る、エミュレーターの具体の数字を足して 4,000〜5,000 字に、日付を出す。急がず、次の書き出しでもう一度見る。


## やる事
- 10-24 9:00 過ぎ: 今日の数字と、絵を門から外した後の 1 回あたりの減り方、新しい決まり (af59856d、作る・確かめるは手元、開発版はオーナーが触る時と本番の前だけ) の後の開発版の 1 日の見込みを、ブラックへ 1〜3 行 (ブラック 8 代目の頼み ②)。
- 10-24 朝 (決まり 8): Cloudflare の使用量を見る (wrangler auth token で GraphQL の workersInvocationsAdaptive・kvOperationsAdaptiveGroups、見るだけ)。10-23 は web-dev 11.8 万回で枠 10 万を越えた (確認用の Chrome で開発版を何度も開いた昼と夜、絵 1 枚ずつまで門を通っていた)。4caa758e で絵・フォント・音を門の外にした後、時間ごとにどれだけ減ったかをブラックへ。
- 10-24 9:05 の確かめ: 予定のタスク exiledesk-daily-summary がブラックへ SendMessage したか。list_task_runs で 10-24 の run が succeeded か → その run の最後の文に送った宛先の id があるか → ブラックに届いたかを 1 行で聞く。届いていなければ (許可待ちで止まった等) オーナーにアプリで「Run now」を 1 回押してもらい SendMessage の許可をタスクに覚えさせる。
- Discord の日報は手元から読めない (webhook は書くだけ・Bot 無し・REFRESH_KEY 無し、notes/bunseki-wake-design.md)。中身は D1 から `pull-logs.mjs` + `analyze-logs.py` で作り直す。

## OK 待ち

## 済み は notes/2026-10-23-todo-archive.md に移した
