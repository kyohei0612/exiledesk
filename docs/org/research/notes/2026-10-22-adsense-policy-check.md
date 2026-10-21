# AdSense の再申請: 要件と ExileDesk の今の状態のチェック表 (2026-10-22)

不合格の理由は「有用性の低いコンテンツ」(オーナー 10-22)。ブラックに渡された 3 ページを読み、ExileDesk (リポジトリの public/・dist-web/・server/web/・scripts/ の実物) と照らした。
読んだページ (公開ページ、引用は 15 語以内):
- **A**「Google AdSense content and user experience」https://support.google.com/adsense/answer/10015918
- **B**「Manual actions report」の「Thin content with little or no added value」https://support.google.com/webmasters/answer/9044175 (Search Console の手動対策のページ。スパムの定義は下の **D** が詳しい)
- **C**「Spam policies for Google web search」(依頼の URL https://support.google.com/publisherpolicies/answer/11035931 の中身。広告を出せない画面の決まりへの導き)
- **D** (補足) 「Google Publisher Policies」https://support.google.com/adsense/answer/9335564 と、検索のスパムの決まり https://developers.google.com/search/docs/essentials/spam-policies (A〜C の本文だけでは定義が足りなかったので追加で読んだ)
注意: 要約ツールで読んだ。ページが長く切れた所があり、**全文は確認していない**。ExileDesk 側の「状態」は、リポジトリの中身を読んだ範囲 (実際のブラウザ表示・Search Console は見ていない)。

## 1. 要件と今の状態
| # | 要件 (ページ名・短い引用) | ExileDesk の今の状態 | 判定 | 直す物 (持ち主) |
|---|---|---|---|---|
| 1 | A「Provide enough unique content」: "provide content that gives your users a reason to visit and return" / "substantial value and originality" | ツール (エミュレーター・シミュレーター) が本体。**文章の読み物は手書き 3 本**: 使い方 3,132 字・クラフト入門 2,540 字 (日本語)・ExileDesk について 2,492 字 (public/*.html、字数は本文のみ)。記事は未公開。ツールの画面は JS で描かれ、文字としては薄い | **足りない** | 記事 15〜20 本 (解析君)、読み物の入口 (ジン部長) |
| 2 | A: "update your site regularly" | アプリの更新は頻繁 (150 回以上)。ただし**読み物の更新**は無い (about 等は 10-12 以降)。sitemap は 6 URL を weekly/monthly と宣言 | 足りない (中身の更新が見えない) | 記事を週 2〜3 本 (解析君)、更新日を載せる (SEO 手引き 9) |
| 3 | A「Spam policies」: avoid "pages with little to no content" | 手書きページは薄くはないが短め。ツールの画面 (ベース選び・MOD 一覧など) は文章がほとんど無い | 分からない (ツール画面を「ページ」として見られるかは不明) | ジン部長 (ツール画面に読む文章を足すか、広告を出さない画面を決める) |
| 4 | A: avoid "pages optimized for specific keywords or phrases" | **ベースごとの自動ページ**「<名前> (<English>) の MOD と段 — PoE2 ベース」が 日本語 788 + 英語 788 = **1,576 ページ** (dist-web/bases・dist-web/en/bases、sitemap.xml は 1,583 URL)。各ページはデータ (素の数値・暗黙・MOD の段) の表が中心で、導入の文は同じ型 | **危ない (分からない)** (下の 2) | 方針を決める (ブラック) → ジン部長・分析君 |
| 5 | A: "repeating long segments of text in different pages" / D: 「scraped or copyrighted content」 | ベースのページ間で**同じ MOD の段の表が何十ページにも出る** (例: 同じ部位の MOD 一覧)。文は自作データの出力で、他サイトの写しではない。ゲームの名称・画像はゲーム会社の物 (about に帰属を明記) | 分からない (重複と見られる恐れ) | 同上 |
| 6 | A: "Google ads may not be placed on sites with scraped or copyrighted content" | MOD 名・文はゲームのクライアント / poe2db の日本語・英語をそのまま使っている。about に「権利は GGG に帰属」と書いてある | 分からない (引用の範囲を超えるか不明) | ブラック (方針) |
| 7 | A「navigational elements」: 揃っているか・読みやすいか・押せるか・正しい先か・各ブラウザ | 静的ページのヘッダーに「エミュレーター / クラフト入門 / ベース一覧 / 使い方 / ExileDesk について / お問い合わせ / English」の帯がある。SPA 本体のナビゲーションは**今回見ていない** | 一部満たす / 分からない | ジン部長 (全ページで帯が同じか・スマホで折り返すか確認) |
| 8 | A「Site structure」: "organize your content by topic" / 切れたリンク・無関係なリンクを避ける | ベース一覧 → ベース → 「同じ部位のほかのベース」の構造はある。記事の置き場 (一覧・カテゴリ) は**まだ無い** | 足りない (記事の部分) | ジン部長 (記事一覧・カテゴリ) |
| 9 | B「Thin content」: "low-quality pages or shallow pages" ／ 例: thin affiliate・content from other sources・doorways | 手書き以外に**自動生成の大量ページ**。アフィリエイトは未導入 (about の「協賛の枠には PR」予定のみ)。doorway (似た検索語のためのページ) に見えるかは「ベース名で検索を集める目的」がある (build-seo-pages.mjs の冒頭に「検索の入口にもなる」) | **危ない (分からない)** | ブラック (方針) |
| 10 | B: 直し方 "provides significant added value for your users" ／ 手動対策の再申請は「消した悪い例と足した良い例」 | 追加の価値 = 期待値・費用の数字 (エンジンで回した) が記事の強み。ただし**まだ公開していない**。直した記録 (何を消し・何を足したか) の残し方は決まっていない | 足りない | ブラック (段取りに「直した記録」を入れる) |
| 11 | B のコツ: "ask people not affiliated" (関係ない人に評価してもらう) | 未実施 | 足りない | ブラック (再申請前に外の人 2〜3 人に見てもらう) |
| 12 | D「scaled content abuse」: "many pages are generated for the primary purpose of manipulating search rankings" (生成 AI でも同じ) | ベースの自動ページは**データから機械的に作る** (build-seo-pages.mjs)。目的は「検索の入口」と書いてある。記事を AI で量産する場合も同じ扱い | **危ない** (自動ページ + 記事の量産の両方) | ブラック・解析君 (記事は 1 本ずつ中身のある物にする) |
| 13 | D「Publisher Policies」: ads barred on screens "without publisher-content or with low-value content" | 広告の枠はクラフト画面以外をページにして両脇に置く設計 (メモ ads-page-model)。**ツール画面・ベース選びのページ**は文章が少ない。今は広告は本番で出していない (ADS_LIVE) | **危ない (分からない)** | ジン部長 (広告を出す画面は文章のある画面に限る) |
| 14 | D: "alerts, navigation or other behavioral purposes" の画面に広告を出さない | 「ベースを選ぶ」ページは**操作・ナビゲーションのための画面**で、そこに広告の枠を置く設計 (メモ ads-page-model・web-ads-domain-plan) | **危ない (分からない)** (「ナビゲーション目的の画面」の範囲は本文を全部読んでいない) | ジン部長 |
| 15 | D: ads barred with "more ads or other paid promotional material than publisher-content" | 広告は 1 ページ最大 3 つ (PC) / 1 つ (スマホ) の設計。文章の少ない画面だと広告が相対的に多くなる | 分からない | ジン部長 |
| 16 | C「Tips」: "unnecessary, repeated use of keywords" | ベースのページの題・見出しに名前を繰り返す型。キーワードの詰め込みではない。ブログは SEO 手引き (詰め込み禁止) に従う予定 | 満たしている (今のところ) | 解析君 (記事で守る) |
| 17 | C: "doorway" pages | ベースのページは「エミュレーターでこのベースを試す」へ誘導する (CTA)。入口が目的のページに近い | 分からない | 同 4 |
| 18 | C: 違反時 "Google-served ads disabled"・直せば再審査 | 一度不合格。再申請の準備中 | — | ブラック |
| 19 | A: 見出し「Submit your site for review」 "review process usually takes a few days" | 前回 10-13 申し込み → 不合格 | — | ブラック |
| 20 | A / D の「ユーザー体験」(読みやすさ・各ブラウザ) | スマホ・PC の崩れは直してきた (変更履歴)。実機のブラウザ確認は今回していない | 分からない | ジン部長 |

## 2. 気になる点の詳しい見立て (推測は推測と書く)
### 2-1. ベースの一覧の読み物 (/bases/・/en/bases/) は「薄い」に当たるか
- 事実: 日本語 788・英語 788 の自動ページ。見本の 1 ページ (灰樹皮のタリスマン) の本文は 8,200 字ほどで、**ほとんどが MOD と段の表** (数字)。導入文は同じ型 (「<名前> は <部位> のベースです。必要レベルは N。普通の MOD はプレフィックス N 系統…」)。見出しは固定 (素の数値 / 暗黙の MOD / 付く MOD / エッセンス / 冒涜 / 同じ部位のほかのベース)。サイトの記載 (build-seo-pages.mjs) は「AdSense の審査の前に…審査で落ちやすいのは『中身が少ない』なので、手で書かずに…ベースごとのページを作る」。
- 見立て (推測): **A の "repeating long segments" と、D の "scaled content abuse"・B の "shallow pages" に当たる恐れがある**。表のデータは有用だが、「検索の入口」と書いてある通り、似た型のページを大量に作った形で、同じ MOD の表が多くのページに出る。当たるかは Google の判断で**分からない**。
- 取れる手 (どれも決めていない、選択肢): (a) sitemap から外す・`noindex` にして、審査では手書きの記事と少数のページだけ見せる (b) 数十ページに絞って文章 (使い道・クラフトの勧め) を足す (c) 部位ごとのまとめに統合して 1,576 → 数十ページにする。
### 2-2. ツールのサイトの扱い
- AdSense は「ツールだけで文章が無い」サイトを「中身が少ない」と見る恐れがある (A の最初の要件)。ExileDesk は**ツールの文章を表の外に出す**必要 (使い方・考え方・数字の根拠)。記事がその役目。
- 広告の枠を**ツールの操作画面 (ベース選びのページ等)** に置く設計は、D の「navigation or behavioral purposes の画面に広告を出さない」「publisher-content の無い画面に出さない」に触れる恐れ。**文章のある記事ページ・読み物ページ中心**にする案を検討 (メモ ads-page-model の設計との調整が要る)。
### 2-3. 重複 (旧ドメイン web.exiledesk.workers.dev)
- 事実: server/web/wrangler.jsonc で `workers_dev: true` (旧 URL を生かす)。server/web/move-gate.js は、**クローラー (UA に google / bot 等、または Sec-Fetch-Mode が無い取得) には 301 で exiledesk.com へ**。人は web.html の script で移る。web.html と /bases/ の `<link rel="canonical">` は exiledesk.com。開発版 (dev-gate.js) は `X-Robots-Tag: noindex, nofollow`。
- 今回の検索 (別件) で、**日本語のクラフト検索に旧ドメインの ExileDesk Web が出ていた** (旧 URL がインデックスに残っている)。301 は効いているはずだが、旧 URL に noindex や Search Console のアドレス変更の状態は**今回確認していない**。
- 直す物: 分析君が (1) 旧ドメインのクローラーへの応答 (301 のままか、`X-Robots-Tag: noindex` も足すか) (2) Search Console のアドレス変更の状態 を確認。AdSense は審査対象のドメインを見るので、旧ドメインの重複が理由として挙がっているかは不明。
### 2-4. 読者が書き込む所 (コメント欄の予定)
- D「User-generated spam」: "Comment spam on blogs" (スパムの決まりの例)。コメント欄は**審査の前に付けない方が安全**と読める (私見。要件としては書かれていない)。付けるなら: 事前承認制か通報・削除の仕組み、nofollow (rel="ugc")、スパムの自動検出、ログイン無しなら連投の制限。掲示板は 10-16 に一度閉じた (v0.1.524)。
### 2-5. 翻訳のページ
- /en/bases/ は**ゲームの英語の原文を使った英語ページ** (機械翻訳ではない) で、日本語と hreflang で結ぶ (build-seo-pages.mjs の冒頭)。記事の日英も同じ形が安全。英語の記事は直訳ではなく、英語の読者向けに書く (SEO 手引き 11)。ページ数が倍になる点は 2-1 の判断に含める。

## 3. 今の段取りに足りない物 (5 行)
段取り = 記事 15〜20 本 (日英) → 体裁 → 週 2〜3 本 → 2〜4 週後に再申請。
1. **自動ページ 1,576 の方針** (noindex / 絞る / 統合) を、記事より先に決める。再申請の前に sitemap から外すのが最小の手 (ブラック → ジン部長・分析君)。
2. **広告を出す画面の選び方**: ベース選び・ツール操作画面には出さず、記事ページ・読み物に限る (ジン部長)。広告の枠の設計メモ (ads-page-model) の見直し。
3. **記事の導線**: ヘッダーに「記事」、一覧・カテゴリ・更新日 (ジン部長)。「読み物の中身が見える」状態にする。
4. **旧ドメインの重複**: 301 + canonical + Search Console を確認 (分析君)。
5. **コメント欄は再申請の後に**。付けるなら管理の仕組み (通報・承認・ugc) を先に。加えて、**直した記録** (何を消し・何を足したか) を段取りに入れ、再申請の前に関係ない人 2〜3 人に外から見てもらう (ブラック)。

## 4. 未確認
- 3 つのページの全文 (要約ツールで読んだ。長いページは途中で切れた)。
- Google が不合格の理由として具体的にどのページを挙げたかは不明 (理由は「有用性の低いコンテンツ」だけ)。
- SPA 本体の画面の見え方・ナビゲーション・実機のブラウザ表示は今回見ていない。
- ベースのページの被リンク・Search Console のインデックス状況は見ていない。
