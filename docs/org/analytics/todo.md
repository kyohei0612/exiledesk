# サーバー管理人 のやる事

## 10-28 (6 本目、報告はブラック 15 代目 local_a9a41698)
- system.md ⑦ をオーナーの答えどおりに (672890ee8): /tree/ (tree-share.ts・TREE_SHARE) を消した・D1 は 3 GB を超えたら古い日の記録から消す毎朝 9:00 の cron (server/live/src/logs-prune.ts、Y-66。手元の SQLite で 4 つの場合を回しただけ、本番で消えた事はまだ無い)・日報の材料に D1 の大きさ (pull-server-notes の d1、10-28 は 79 MB)・Workers は無料のまま (Y-76)・開発版の要望は本番へ (Y-71 の例外)。ジェムコラプトを Web から外すのはエミュ部長 75151d72b・デザイン部長 87ea44cb0 が済ませた (Y-17)、開発版の印の式はデザイン部長 410d84e1f (⑦5)。
- レシピのシェアのカード絵 (Y-35、server/web/recipe-card.js・recipe-share.js、画面はシミュ部長 96416a8c・f2b926175): オーナー OK 済み (「カードOK」「ツリーの形出るの神やね」)、出すのは「出して」の後。出す順は docs/pending-release.md の行と共有メモ side-session-notes/local_c6a769ac…/recipe-card-api.md: ① server/live で `wrangler d1 migrations apply exiledesk-logs --remote` (0012 tree_shares を落とす・0013 recipe_shares に列 card) → ② recipe-share.js の `RECIPE_CARD` を true にして deploy:web → ③ スイッチ recipeCard を RELEASED に。
- 気になる: 10-28 夕に wrangler から本番の D1 を読もうとして `code: 7403` (アカウントに権限が無い) で断られた。① と毎朝の pull-logs.mjs・pull-server-notes.mjs も同じ login を使うので、出す前と翌朝の日報で確かめる (オーナーの `wrangler login`)。
- 残り: ⑦7 見張りの無い不変条件 (最終チェック長と後で相談)。要望 91832821 の返事の書き直し・サファイア 170 回空振りの疑い (ジン部長待ち) は下のまま。

## 4 → 5 の引き継ぎ (10-26 夜、オーナー「立て直し」で入れ替え。4 本目は着任だけで作業なし)
- 報告の宛先はブラック 13 代目 (local_526b63a7)。予定のタスク 2 つの通知も 13 代目に付け直し済み。
- 10-27 の朝に見る 3 つ (結果は 13 代目へ 1〜3 行): ① exiledesk-daily-summary の 10-27 の回が通ったか (10-25 の回 local_e1184968 の残りが片付いたかを list_task_runs で) ② #日報 に AI の見解が流れたか (D1 ai_review の posted_at)、#分析ログファイル管理 に書き込みが無いか ③ Discord の Bot の 9:03 の回 (discord_daily の 10-27 の行に人の書き込みが本文つきで入ったか)。
- 10-26 夜 (5 本目): レシピの短い URL exiledesk.com/r/<id> を server/web に作った (61eee10e、表 recipe_shares 0011 は本番に当て済み、Worker は次の deploy:web で出る)。仕様は共有メモ side-session-notes/local_526b63a7…/recipe-short-url-api.md、画面のコピーはシミュ 32。live の /tree/ (TREE_SHARE) は 10-28 に外した (オーナー「消す」、表は 0012 で次の出しの時に落とす)。
- やりかけは下の 3 → 4 のまま (ツリーの短い URL は上で別の形に・要望 91832821 の返事の書き直し・サファイア 170 回空振りの疑いはジン部長待ち)。

## 次の管理人へ (10-26、3 本目 → 4 本目。前の 2 → 3 は git の履歴 (10-29 の md の整理で消した): 2026-10-26-todo-archive.md、1 本目からの長い物は git の履歴 (10-29 の md の整理で消した): 2026-10-24-handoff.md)
- 先に README の決まり 10 個と notes/daily-report-task.md (毎朝 9 時の AI の評価と見解の流れ) を読む。報告はブラック (dev/todo.md の宛先の表、今は 12 代目 local_feea72b4)。セッション同士の送信はオーナーの書き込みの間に 10 回まで、止まったら共有メモ (side-session-notes/<ブラックの id>/) に書く。
- **毎朝の形が変わった (10-26 オーナー「既定の報告はいらなくなった」)**: 予定のタスク exiledesk-daily-summary が 9 時に pull-logs.mjs (D1 の記録 + pull-server-notes.mjs の異常・要望・Discord = <日>-server.json) → <日>-ai.md (見本 daily/2026-10-25-ai.md、git に入れない) → post-ai-review.mjs で #日報 に全文。数字の日報 (daily-summary.mjs・サーバーの dailyReport・GET /report) と #分析ログファイル管理 への書き込みは消した (71d1a969)。
- **10-27 の朝に見る**: ① 予定のタスクの 10-27 の回が通ったか (10-25 の回 local_e1184968 が許可待ちで「動いている」のまま残り、10-26 の朝の回が始まらなかった。止めるのはオーナーかブラック、片付いたかを list_task_runs で) ② #日報 に AI の見解が流れたか (D1 の ai_review の posted_at) ③ #分析ログファイル管理 に書き込みが来ていないか ④ Discord の Bot の 9:03 の回 (discord_daily の 10-27 の行、人の書き込みが本文つきで取れたか。オーナーの試しの書き込みが 9:03 より後ならここに入る)。
- Discord の Bot (本番、0f10e022): vars の DISCORD_GUILD_ID のサーバーの文字・お知らせ・スレッドを毎朝拾って読むだけ。権限の無いチャンネルは飛ばす、1 回 45 回まで叩く、同じ日は前の行に足す。手で起こす口は無い (一時の cron を足して出す台本は scratchpad にあった kick-discord.mjs の形、notes/2026-10-24-discord-bot.md)。
- AI の見解を #日報 へ (7eea783d): 台本が D1 の ai_review に塊を置き、Worker の POST /ai-review/flush (と毎時の cron) が REPORT_WEBHOOK で流す。URL は手元に無い。同じ日は 1 回だけ。
- オーナーの記録の外し (734e34e8、pending-release で次の本番): 手元の住所 (localhost・*.localhost) で開いた Web 版とブログは送らない。オーナーの手順は端末・ブラウザごとに https://exiledesk.com/?nolog=1 を 1 回。
- 数えている物 (10-25〜26): コスメの静的ページ /pv.js (d17fb76f、本番で D1 に入るのを見た)、シミュの「100 人回す」sim:run・テストラン sim:test (集計は e29311c8、D1 の screen への振り分けはデザインの track.ts 待ち)。
- Worker の数: UTC 10-25 は web 558 (10-24 は 2,471) + live 585 = 1,143 (1 日 10 万の約 1%)。トップを Worker の外に出した効き目。
- やりかけ: 要望 91832821 の返事 (シミュを本番に出した後の形で書き直す要あり)。
- 気になる事 (調べていない): 10-25 に 1 人が MOD 5 つのサファイア (ジュエル) にカオスを 170 回空振り (0.1.596)。上限を超えた形ができる道がエンジンに残っている疑い、ジン部長 11 本目が調べている。

## 前の報告 (10-24 の手元の開発版・10-22 の要望と /craft-basics) は git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md に移した (10-25 ホワイト)

## やる事
- **AdSense の審査が通ったら戻す** (10-27 ブラック 13 の OK で外した、模擬審査 notes/2026-10-27-adsense-mock-review.md): scripts/build-seo-pages.mjs (ベース 1,576 枚 + 一覧) と scripts/build-cosmetics-pages.mjs (コスメ 20 枚) の `ADS_ON_AUTO_PAGES = false` を true に → 別の出力先で作って adsbygoogle が入るのを見る → commit → ブラックへ hash (出すのは最終チェック長)。記事・FAQ・固定ページ・トップのコードはそのまま。
- (済み 10-27 v0.1.626) 静的なページのフッター 375 (12 ページ、リンク 44〜46px・はみ出し 0)・/web.html の 301・lastmod 73 件・セキュリティのヘッダー・/r/ を本番で見た。89dec922 (自動ページの広告のコード外し) は次の deploy:web の後に本番で adsbygoogle が 0 か見る
- デザイン 9 がシミュの記録を track.ts に足す (10-26 夜に OK を出した): screen の to に "tree"・"sim-base"・"sim-mods"、新しい kind "sim_act" {a: hand|save|copy, s}、1 訪問で a ごとに 1 回。出たら scripts/analyze-logs.py の数え方に足す (届いた hash はデザイン 9 から)。
- 10-27 の朝: 上の「10-27 の朝に見る」の 4 つ。結果はブラックへ 1〜3 行。
- (済み 10-26: web の Worker の数は 558 に下がった。10-26 の日報の回は 10-25 の回が残っていて始まらず、10-25 の分は手で作った)

## OK 待ち

## 済み は git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md に移した
