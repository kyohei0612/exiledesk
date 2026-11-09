# サーバー管理人 のやる事

前の報告 (10-24 の手元の開発版・10-22 の要望と /craft-basics)・済み・前の引き継ぎは git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md・2026-10-24-handoff.md・2026-10-26-todo-archive.md。毎朝の流れは README の決まりと notes/daily-report-task.md。10-26〜28 の記録は 11-10 の棚卸しで下の「閉じた物」に 1 行ずつ (全文は git の履歴)。

## やる事
- **D1 の記録が 3 GB を超えたら古い日から消す毎朝 9:00 の cron** (server/live/src/logs-prune.ts、Y-66、10-28): 手元の SQLite で 4 つの場合を回しただけで、本番で消えた事はまだ無い (外待ち = 容量)。超えた日の日報で消えたかを見る
- **AdSense の審査が通ったら戻す** (10-27 ブラック 13 の OK で外した、模擬審査 notes/2026-10-27-adsense-mock-review.md): scripts/build-seo-pages.mjs (ベースのページは 10-31 に消して 410 = Y-84、残りは一覧と sitemap) と scripts/build-cosmetics-pages.mjs (コスメ 20 枚) の `ADS_ON_AUTO_PAGES = false` を true に → 別の出力先で作って adsbygoogle が入るのを見る → commit → ブラックへ hash (出すのは最終チェック長)。記事・FAQ・固定ページ・トップのコードはそのまま。

## OK 待ち

## 閉じた物 (11-10 棚卸し)
- system.md ⑦ をオーナーの答えどおりに (672890ee8、10-28: /tree/ を消した・D1 の大きさを日報に・Workers は無料のまま・開発版の要望は本番へ) — 済み
- レシピのシェアのカード絵 (Y-35、recipeCard) — v0.1.639 で本番 (dc5d097ae)
- wrangler が本番の D1 を読めなかった (code: 7403、10-28) — 古い (その後の出しで本番に当てられた)
- 要望 91832821 の返事の書き直し・サファイア 170 回空振りの疑い — 古い (空振りはジン 11 本目が調べて直しなし = emulator/todo.md の閉じた物)
- 4 → 5 の引き継ぎ (10-26 夜、10-27 の朝に見る 3 つ・レシピの短い URL /r/ 61eee10e) — 古い (/r/ は本番、朝の確かめは日付が過ぎた)
- 3 → 4 の引き継ぎ (10-26、毎朝の形・Discord の Bot・AI の見解・記録の外し・数えている物・Worker の数) — 古い (流れは notes/daily-report-task.md・notes/2026-10-24-discord-bot.md)
- 静的なページのフッター・301・lastmod・ヘッダー・/r/ の確かめ (v0.1.626) と、89dec922 の後に本番で adsbygoogle が 0 か見る — 古い (10-27 済み、日付が過ぎた)
- シミュの記録 (sim_act・tree の screen) を scripts/analyze-logs.py の数えに足す — 済み (754cfe60b・b22ce3fa0)
- 10-27 の朝に見る 4 つ・10-26 の Worker の数 — 古い (日付が過ぎた)
