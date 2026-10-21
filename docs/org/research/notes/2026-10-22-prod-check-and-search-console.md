# 本番に出た後の確かめ + Search Console に出す URL (2026-10-22 夜、v0.1.590 = 7884f2f6)

**見方**: 台本 = 自分の scratchpad の pf/prod-check.mjs (sitemap の 71 URL + 固定ページ・ベースの見本 = 75 ページを、JS 無しで取得して数える。取り直し 3 回・間隔 0.3 秒)。画面は見ていない。

## 1. 結果: 全部よし (直す物なし)
| # | 項目 | 結果 (台本で数えた) | 判定 |
|---|---|---|---|
| 1 | AdSense のコードが `<head>` の中に | **75 / 75 ページ** (トップ・/about・/craft-basics・/guide・/privacy・/contact・/blog/・記事 59・/en/ の固定ページと一覧・ベースの一覧と見本)。pub はどれも ca-pub-1993030721214430 の 1 つ | よし |
| 2 | ads.txt | 200、`google.com, pub-1993030721214430, DIRECT, f08c47fec0942fa0` (`<head>` の pub と同じ) | よし |
| 3 | noindex | 付いているのは **ベースの 4 ページだけ** (/bases/・/en/bases/・見本 2 枚、どれも `noindex, follow` の meta)。記事・固定ページ・一覧は 0。`X-Robots-Tag` のヘッダーはどのページにも無い (開発版の門のヘッダーは本番には無い) | よし |
| 4 | sitemap | 200・**71 URL** (固定 10 + ブログ一覧 2 + 記事 59)。ベースは入っていない。robots.txt は Allow: / と sitemap の場所 | よし |
| 5 | クラフト台の「ブログ」 | /blog/index.json が 200 (日 30・英 29、下書き 0)。BLOG_ON = true は前にコードで確かめた。トップの JS 無しの本文から記事・一覧へ 4 本 | よし (画面では見ていない) |
| 6 | 日本語の About | 2,085 字 (main の中) | よし |
| 7 | ツリーへのリンク (前の点検の止まる物) | 記事 59 ページで `sim-tree` は **0**。custom-mod-weights の「開発版だけ」の文も無い | 直っている |
| 8 | ページが開くか | 75 / 75 が 200 | よし |

## 2. Search Console で「URL 検査 → インデックス登録をリクエスト」する URL (大事な順に 10 本)
1. https://exiledesk.com/
2. https://exiledesk.com/blog/
3. https://exiledesk.com/about
4. https://exiledesk.com/craft-basics
5. https://exiledesk.com/guide
6. https://exiledesk.com/blog/greater-perfect-orb-difference/ (一番長い記事 5,585 字、早見表)
7. https://exiledesk.com/blog/are-omens-worth-it/ (5,152 字、よく探される問い)
8. https://exiledesk.com/blog/chaos-reroll-vs-restart/ (4,745 字)
9. https://exiledesk.com/blog/catalyst-types/ (4,562 字、一覧の形で探されやすい)
10. https://exiledesk.com/en/blog/

選び方: 入口 (トップ・一覧)→ 審査で見られる固定ページ → 記事は字数の多い順から、題が「探される問い・一覧」になっている物。残りの記事は sitemap から拾われるのを待つ (1 日の上限があるので翌日以降に 5〜10 本ずつ足してもよい)。

## 3. sitemap を出し直す手順 (3 行)
1. Search Console の左の「サイトマップ」を開く。
2. 「新しいサイトマップの追加」に `sitemap.xml` と入れて「送信」(前に送った物があっても消さずに同じ名前で送り直してよい)。
3. 一覧の「ステータス」が「成功」、「検出されたページ」が **71** になったかを見る (反映まで数時間〜数日)。
