# AdSense「有用性の低いコンテンツ」で落ちた時の原因と対処 (調べ 2026-10-22)

依頼 (オーナー「原因を知りたい。AdSense のこの落ち方をした時の対処法」): (1) 審査のロボットが JavaScript を動かすのか (2) 同じ理由で落ちて直して通った事例 (ツール / SPA 優先) (3) ExileDesk の今の直しと並べて足りない物・再申請の時期。
調べ方: 公式ページ (Google の AdSense ヘルプ・Search Central・AdSense ブログ) と、個人のブログ・GitHub の記録を検索ツールと読み取りで読んだ。Chrome は使っていない (指示どおり)。ExileDesk 側はリポジトリと本番を curl で確認 (公開ページだけ)。**事例の中に「ツール / SPA が直して通った」と日付つきで書いてある物は見つからなかった** (下の 2)。

## 1. 審査のロボットは JavaScript を動かすのか
**結論: 公式の記述なし。** 分かっている事と、言われている説を分ける。
### 1-1. 公式に書いてある事
| 出どころ | 書いてある事 | JavaScript について |
|---|---|---|
| Search Central「Google's special-case crawlers」https://developers.google.com/search/docs/crawling-indexing/google-special-case-crawlers | Mediapartners-Google は「visits participating sites in order to provide them with relevant ads」。robots.txt は `Mediapartners-Google` の指定で、`*` は無視される。「The special-case crawlers may ignore robots.txt rules」 | **書いていない** |
| AdSense ヘルプ「AdSense crawler」https://support.google.com/adsense/answer/99376 | 「The crawl is performed automatically.」「attempts to access URLs only where our ad tags are implemented」。AdSense のクローラーと Google のクローラーは別だが「share a cache」 | **書いていない** (「ad タグのある URL だけを見に来る」は審査の見方に効く) |
| Search Central「JavaScript SEO basics」https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics | **Googlebot** は「A headless Chromium renders the page and executes the JavaScript」。「server-side or pre-rendering is still a great idea」「not all bots can run JavaScript」。アプリ殻の最初の HTML は中身が無い、とも | Googlebot の話。**AdSense のクローラーのことは書いていない** |
| AdSense ブログ「How to address 'insufficient content' disapprovals」(2017) https://blog.google/products/adsense/how-to-address-insufficient-content/ | ページに「enough text for our crawler to be able to determine what your pages are about」が要る。「consist only of a site template and very little content」は通らない恐れ。**JavaScript・ナビゲーションの話は無い**。再申請の待ち期間も書いていない | 書いていない |
| AdSense ヘルプ「content and user experience」(前の調べで全文を Chrome で読んだ) | 「enough unique content so that we can determine what your site is about」 | 書いていない |
### 1-2. 言われている説 (公式ではない・未確認)
- Bubble のフォーラム: 全部 JS で描くサイトが 2 回落ち、「クローラーには空に近い HTML しか見えないのでは」と投稿者が推測 (答えは付いていない) https://forum.bubble.io/t/ad-sense-on-bubble-app/379747
- 「AdSense のボットは JS を動かさない」と書く古い記事 (二次資料、出どころ不明) と、「SPA は最初の HTML に文章が無いと落ちやすい」と書く 2026 年のガイド (adsenseaudit.net)、開発者向けのチェックリスト (coderfile.io ほか)。**どれも Google の公式の確認ではない**。
- 「有用性の低いコンテンツは新しいサイトへの包括的な落とし文句で、サイトの古さの影響が大きい」(toolpod.dev ほかの個人の見解)。**根拠は個人の推測**。
### 1-3. 安全側の判断
公式の記述が無いので、**JS を動かさない前提で最初の HTML に本文を入れる**のが安全。ExileDesk はこの方針 (トップに JS 無しの説明を入れた) で合っている。ただし「それが原因だった」とは言えない (原因は Google の判定でしか分からない)。

## 2. 同じ理由で落ちた人の事例 (出どころ付き・結果が書いてある物だけ)
| サイト (種類) | 落ちた理由と見立て | 直した物 | 期間・回数・結果 | 出どころ |
|---|---|---|---|---|
| **kakeklar.no** (Vite + React の **SPA**、ツール) | 全 URL が同じ index.html (同じ題・説明・canonical)、存在しない URL も 200 (soft 404)、全体で約 1,500 語・小ページ 120〜260 語。規約ページ不足 (プライバシーに広告・Cookie の記述なし、連絡先なし) | ビルド時に全ページを静的 HTML に (prerender) + ページごとの題・説明・canonical + sitemap + 本物の 404、ガイド 18 本とレシピ 4 本 (約 2 万 1,600 語)、規約ページを書き直し | 2026-10-16 に反映。**再審査の結果は書いていない** | https://github.com/webmaxru/barnebursdag-planlegger/pull/9 |
| **aws-cert-roadmap-lab** (日本語の学習サイト、問題ページ) | 1 回目 (2026-06-28) は URL がほぼ全部 404 (CloudFront の書き換えの未反映)。2 回目 (2026-08-02) が「有用性の低いコンテンツ」: 問題ページの固有の文が約 228 字。**解説が JS で隠れていて静的 HTML に文章が無かった** | 解説を静的 HTML に移し、固有の文を約 335 → 1,760 字に。About・規約・連絡先・ブログを足し、英語・中国語のページを noindex + sitemap から外した | 再申請の基準: 反映から **14 日以上 (21〜28 日を推奨)**、Search Console で索引の数が横ばい以上、URL 検査の「描画された HTML」に解説が出て最終クロールが反映後。**結果は書いていない** (issue は 2026-10-12 に「not planned」で閉じた) | https://github.com/vincentmango-wen/aws-cert-roadmap-lab/issues/323 |
| Visionmetadata (サイト、PR) | prerender で非 JS の HTML は直したが、**描画後のページが URL をまたいで同じ節を繰り返していた** | ページ間の重複を除き、重複 URL を 301 | 結果は書いていない | https://github.com/salmanahmad410439402-ai/Visionmetadata-Website/pull/2 (検索結果の要約のみ) |
| toolpod.dev (開発者ツール 65 以上 + ブログ 15 本、AI で作った) | 本人の見立て: 新しいサイトへの包括的な理由 (古さ・少ない流入) | **何も直さず**待つ | 2025-12-30 時点で不合格、3〜4 週間後に再申請予定 (結果は書いていない) | https://toolpod.dev/blog/adsense-rejection-low-value-content と https://dev.to/bdubs/i-applied-for-adsense-and-got-rejected-for-low-value-content-hog (同じサイトに見える) |
| 技術ブログ (Next.js、記事 12 本) | 記事が 101〜360 語と短い、About が無い、サイトの目的が不明、ナビゲーション不足 | About ページ・ヘッダー / フッターの導線・短い記事を 500 語以上に加筆・メタデータ | 結果は書いていない (再申請は反映後と) | https://zenn.dev/beachone1155/articles/20251101-adsense-low-value-content-fix |
| WordPress の個人ブログ (地域・開発・AI) | フッターに 404 の画像、**固定ページ (連絡先・プライバシー・プロフィール) にナビゲーションから行けない** | フッターを作り直し、固定ページへの導線 | 反映の 3 日後に再審査の予定 (結果は書いていない) | https://motoyawata.namaste.jp/wp/adsense%E3%81%A7%E3%80%8C%E6%9C%89%E7%94%A8%E6%80%A7%E3%81%AE%E4%BD%8E%E3%81%84%E3%82%B3%E3%83%B3%E3%83%86%E3%83%B3%E3%83%84%E3%80%8D%E3%81%A8%E8%A8%80%E3%82%8F%E3%82%8C%E3%81%9F%E8%A9%B1%EF%BD%9C/ |
| ゲーム開発ブログ (WordPress) | 10 回落ち、**11 回目で合格** (本文に 10 回目との食い違いあり)。「独自性・ユーザーの役に立つか・ナビゲーション」 | カテゴリを 2 つに・タグなし・メニュー整備・プライバシー / 問い合わせ・独自ドメイン・Analytics と Search Console。**記事 40 本・平均約 2,700 字** | 2023-10〜2024-06 (約 8 か月)。落選のメールは申請の約 1 週間後、合格は 2 日以内。本人の見立ては「39 → 40 本が分かれ目」 | https://matsubon-games.com/adsense-pass/ |
| ホテル宿泊の旅ブログ (WordPress) | 4 回落ち、**5 回目で合格**。本人の見立て: カテゴリが多く雑記と見られた | カテゴリ 7→4・タグ 10→4、トップを記事一覧に、記事 20→約 40 本、カテゴリ変更時の 301 | ブログ開設から約 6 か月。1 回の審査は約 10 日 | https://main.oneehan-blog.com/other/google-adsense-approval-travel-blog-6-months/ |
| (まとめ記事) 日本語の対策記事 | 記事数の目安は年で違う (「2023 年 8 本、2024 年 15 本」「15〜20 本」)。直す物は「薄い記事の加筆・統合・非公開」「固定ページ」「カテゴリ整理」 | — | 再申請までの目安 (軽微 1〜2 週間、中規模 3〜6 週間) は**根拠の無い個人の見立て** | https://seory.co.jp/google-adsense-audit/ ほか (検索結果の要約) |
- **通った事例は全部ブログ** (回数は 5〜11 回、期間は 6〜8 か月)。**ツール / SPA が直して通ったと日付つきで書いてある事例は見つからなかった**。SPA の事例 2 件 (kakeklar.no・Visionmetadata) は直した所までで、結果が書いていない。
- 共通して直した物: (a) 静的な本文 (JS 無しで読める文章) (b) 記事・文章の量と長さ (12 本で 101〜360 語は短いと自己評価、通った例は 40 本・平均 2,700 字) (c) 固定ページ (About・プライバシー・連絡先) とナビゲーションの導線 (d) 薄い・重複・自動のページを外す (noindex・統合) (e) カテゴリ・テーマを絞る。
- 公式の再申請の待ち期間: **書いていない** (AdSense ブログ 2017)。

## 3. ExileDesk の今の直しと並べる
確認の仕方: リポジトリ (scripts/build-seo-pages.mjs・web.html・public/・sitemap・git log) と、本番の exiledesk.com を curl (2026-10-22)。**本番は、まだ古い状態** (下の 3-2)。
### 3-1. 事例の「直した物」と ExileDesk
| 事例の直し | ExileDesk の今 | 判定 |
|---|---|---|
| 静的な本文 (JS 無しで読める) | リポジトリの web.html は JS 無しで読める本文が約 1,783 字 (script を除いて数えた。ブラックの 1,916 字とは数え方が違う可能性)。**本番はまだ 40 字だけ** | 作った / 本番はこれから |
| 自動・薄いページを外す | build-seo-pages.mjs が全部 `noindex, follow` + sitemap から外す (10-22 オーナー OK、コードの冒頭に記載)。**本番のベースのページは noindex がまだ付いていない** (curl で meta robots 無し) | 作った / 本番はこれから |
| ページごとの題・説明・canonical・本物の 404 | 本番で存在しない URL は 404 を返す (curl で確認)。静的ページの canonical・題・説明はある (前の調べ) | 満たしている |
| 記事の量と長さ | ブログ 18 本 (日英、ブラックの数え方。リポジトリには blog の記事の commit がある) の**本番の公開は未確認** (本番の /blog/ は 404)。1 本の長さの基準は決まっていない | 足りない可能性 / 本番はこれから |
| 固定ページとナビゲーション | About・プライバシー・連絡先・使い方・クラフト入門 (日英) が本番にある。「ブログ」の導線はリポジトリの commit (ヘッダー・フッター) で追加済み、本番は未反映。SPA のヘッダーは開発版だけ | 一部これから |
| プライバシーに AdSense・Cookie の記述 | 本番の privacy.html に「5. 広告について」あり (前の調べ)。AdSense 向けの追記は今回の直しに入っていると聞いた (未確認) | 作った / 確認 |
| カテゴリ・テーマを絞る | テーマは PoE2 のクラフトだけ (無関係な話題は無い)。ブログのカテゴリ数は未確認 | 良い (カテゴリ数だけ要確認) |
| 広告のコード | AdSense のタグは本番のトップと静的ページにある (curl で `adsbygoogle`・`ca-pub-1993030721214430` を確認) | 満たしている |
### 3-2. 足りない物 (事例からの優先順)
1. **本番に反映してから見せる**: 今の本番は古く、トップは 40 字・ベースのページは noindex なし・/blog/ は 404。**反映の後、Search Console の URL 検査で「描画された HTML」に文章が出て、最終クロールが反映後になっているかを確かめる** (aws-cert の再申請の基準と同じ)。AdSense のクローラーは「ad タグのある URL」を見に来るので、タグのあるページ (トップ・静的ページ・記事) に文章があるか。
2. **記事の質と長さの基準を決める**: 事例では「12 本で 101〜360 語」が短いとされ、通った例は 40 本・平均 2,700 字。18 本の 1 本ごとの長さと中身 (数字・根拠・自分の経験) を見直す。**本数の目安は年・人で幅があり、公式の数字は無い**。
3. **ページ間の重複**: Visionmetadata の例のように、記事どうしで同じ節・同じ表を繰り返さない。日英のページは hreflang で結ぶ。
4. **ナビゲーション**: 本番のトップのツール画面に、記事・About への導線があるか (SPA のヘッダーは開発版だけという記述)。反映後に確認。
5. **ツール画面に広告を出さない設計の確認** (前の表の 13・14)。審査の間は広告枠を出さず、文章のあるページ中心にする。
### 3-3. 再申請の時期の目安
- **公式**: 待ち期間の記述なし。
- **個人の記録 (参考)**: 反映から **2〜4 週間待つ**のが多い (aws-cert の基準は 14 日以上・21〜28 日推奨)。1 回の審査結果は申請から約 1 週間〜10 日。急いで再申請すると、古いキャッシュを見られるという第三者の指摘がある (公式の確認なし)。落選が重なると不利になるという説もある (出どころ不明)。
- **推奨 (私見・事例ベース)**: **すぐではなく、本番に反映 → Search Console で再クロールと索引を確認 → 2〜4 週間待って再申請**。待つ間も記事を週 2〜3 本足し、更新が続いている形を見せる。ToolPod のように「サイトの古さ」が原因なら時間も効く (この説は未確認)。

## 4. 未確認
- AdSense の審査のロボットが JS を動かすか: **公式の記述なし**。
- Google が ExileDesk をどのページで・何を理由に落としたか (理由は文言だけ)。
- ツール / SPA が直して通った事例 (日付・結果つき): 見つからなかった。
- ブログ 18 本の本番での公開状態、1 本ごとの長さ。
- 事例の期間・回数は個人ブログの記述で、検証できない。
