# Search Console の「ページのインデックス登録」(書き出し 2026-10-22)

オーナーが渡した zip (exiledesk.com-Coverage-2026-10-22.zip) を分析君が読んだ (10-22)。直しは案だけ (AdSense 審査中なので読み物・AdSense のコードは触らない)。

## 書き出しの中身
- 入っていたのは要約の CSV 4 本だけ (グラフ・重大な問題・重大ではない問題・メタデータ)。**URL ごとの一覧は入っていない**。理由ごとの URL は Search Console で理由の行を開いて、その画面から書き出す必要がある。
- グラフの数字は **2026-10-12 で止まっている** (10-10・10-11 は空、表示回数 0〜1)。ブログ (10-21 公開)・ベースのページの noindex (10-22) より前の数字。

## (1) 登録済み / 未登録 (10-12 時点)
- 登録済み 111・未登録 237 (合計 348)。表示回数 12。

## (2) 未登録の理由 (ページ数)
| 理由 | ソース | 確認 | ページ |
|---|---|---|---|
| クロール済み - インデックス未登録 | Google | 開始 | 224 |
| ページにリダイレクトがあります | ウェブサイト | 開始前 | 12 |
| 代替ページ (適切な canonical タグあり) | ウェブサイト | 開始前 | 1 |
- 検出未登録・404・noindex・重複 (canonical なし) は 0 件。
- 主な URL は書き出しに無いので推定 (下で本番を見て確かめた範囲):
  - クロール済み未登録 224 = ほぼ /bases/・/en/bases/ のベースの自動ページ (当時 sitemap に約 340 件)。10-22 に全部 noindex (follow) にして sitemap から外した (scripts/build-seo-pages.mjs) ので、次からは「noindex タグで除外」に移るはず。これは狙いどおり。
  - リダイレクト 12 = 本番の住所のゆれ。.html 付き (/about.html → /about)・末尾の / (/about/ → /about、/blog → /blog/)・/index.html → / はどれも 307 (Workers の assets の html_handling auto-trailing-slash)。中のリンク・sitemap はこれらを使っていないので、Google が古い形・外のリンクから拾った物と見られる。
  - 代替ページ 1 = www.exiledesk.com/ (下の通り 200 で同じ中身、canonical は https://exiledesk.com/) と見られる。

## 本番で確かめた事 (10-22、curl)
- sitemap.xml は 73 URL (トップ・入門・使い方・About・お問い合わせ・プライバシー・FAQ・ブログ 31・英語 35)。**全部 200、canonical は自分の URL と一致、robots の noindex なし**。robots.txt は Allow: / と sitemap の行だけ。
- http://exiledesk.com/ → **200 (https へ送っていない)**。
- https://www.exiledesk.com/ → **200 (exiledesk.com へ送っていない)**。中身は同じで canonical は https://exiledesk.com/。
- /en と /en/ → 404 (英語の入口は /?lang=en と /en/about など)。
- web.exiledesk.workers.dev → クローラーにだけ 301 (move-gate.js、人はページの script で移る。10-11 の決め)。

## (3) 直した方がよい物 (案)
1. **www → exiledesk.com を 301** (持ち主: 分析君、server/web/move-gate.js。www は routes に custom_domain で入っている)。注意: www で使っている人の作業中のデータ (localStorage) は住所ごとに別なので、人を 301 で送ると消える。workers.dev と同じく「クローラーにだけ 301、人はページの script でデータごと移す」形にするか、www の利用が 0 なら全部 301。本番のサーバーの変更なのでブラックの OK の後。
2. **http → https を 301** (持ち主: オーナーの Cloudflare の設定「Always Use HTTPS」が素直。コードでやるなら move-gate.js で http: の時に 301、分析君)。
3. **ベースの自動ページ**: 10-22 の noindex で十分。sitemap から外れているので「クロール済み未登録」は次の書き出しで減るはず (持ち主: ジン部長、build-seo-pages.mjs)。直しは要らない。
4. **/en/ の 404**: 英語の入口を作るなら /en/ → /?lang=en (または /en/about) に送る (持ち主: 分析君の server/web、または build-seo-pages.mjs でページを作るならジン部長)。急がない。
5. **次の書き出し**: ブログ公開と noindex が反映されてから (1〜2 週間後)、理由ごとの URL の一覧も書き出してもらうと、推定ではなく URL で確かめられる。
