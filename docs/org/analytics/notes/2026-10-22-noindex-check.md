# noindex の洗い出し (2026-10-22)

きっかけ: Search Console から 10-22 17:01 に「noindex タグによって除外されました」の新しい要因のメール (URL は書いていない)。頼み: ブラック 6 代目 (オーナー「インデックス系の確認」)。調べだけで何も変えていない (AdSense 審査中)。
やり方: Googlebot の UA で curl。sitemap.xml の 73 URL + よく踏まれる入口 17 本 = 90 本の、HTTP の返り・X-Robots-Tag・`<meta name="robots">` を見た。

## 結果
- **sitemap の 73 URL は全部 200・noindex なし・X-Robots-Tag なし** (sitemap に noindex の URL は入っていない)。canonical も自分の URL と一致 (10-22 の別の調べ、2026-10-22-search-console-coverage.md)。
- noindex が付いている物:

| URL | 返り | 付いている物 | わざと / 間違い | 持ち主・メモ |
|---|---|---|---|---|
| /bases/・/en/bases/ (一覧) | 200 | meta robots noindex, follow | わざと | scripts/build-seo-pages.mjs (ジン部長)。10-22 オーナー OK「自動で作ったページは有用性の低いコンテンツに数えられやすいので全部 noindex にして sitemap から外す」 |
| /bases/<ベース>・/en/bases/<ベース> (約 340 枚) | 200 | meta robots noindex, follow | わざと | 同上。**今回のメールの要因はほぼこれ**: 10-12 には「クロール済み未登録」224 件として見られていた物が、noindex にした後に取り直されて「noindex で除外」へ移った |
| /s/<id> (スパムシミュのシェア) | 200 | meta robots noindex | わざと | server/web/og-card.js (分析君)。X のカード用の小さなページで、すぐ /?page=routes… へ移す。X から踏まれて Google にも知られるが、載せる物ではない |
| web-dev.exiledesk.workers.dev (開発版) | 404 | X-Robots-Tag: noindex, nofollow | わざと | server/web/dev-gate.js (分析君)。合言葉の無い取得は 404 + noindex |

- noindex ではないが 200 でない物 (参考): /web.html 404・/en/ 404・存在しない URL 404 (404 のページに noindex は無いが 404 なので載らない)。www.exiledesk.com/ と web.exiledesk.workers.dev/ はクローラーに 301 → exiledesk.com/。http://exiledesk.com/ と ?page=…・?lang=en は 200・noindex なし (canonical は https://exiledesk.com/)。

## 間違いは見つからなかった
- 載せたいページ (トップ・入門・使い方・About・お問い合わせ・プライバシー・FAQ・ブログ 31・英語 35) に noindex は無い。
- 選べる事 (間違いではない): ベースの一覧 (/bases/・/en/bases/) だけは、手で書いた説明を足して index にする手もある (入口のページとして)。決めるならオーナー、作るのはジン部長。今は審査中なので触らない。
- メールの件は「noindex にした物が除外として数えられた」ので、Search Console の該当の行を開いて URL が /bases/ ・/s/ だけなら、そのままでよい。
