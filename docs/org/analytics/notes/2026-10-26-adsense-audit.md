# 本番 exiledesk.com の点検 (AdSense の審査向け、サーバー 5、10-26 夜)

頼み: ブラック 13 代目 (オーナー「他に設定間違ってないかフルチェック、AdSense 受かりたいよ」)。外の API は叩かず、本番のページを Googlebot の名乗りで取っただけ (台本は scratchpad の adsense-audit.mjs)。速さとスマホは窓なし Chrome 1 つで Lighthouse (mobile) と trace を 1 回。

## 良かった物 (直す物なし)
| 項目 | 結果 |
|---|---|
| ads.txt | /ads.txt 200 text/plain、`google.com, pub-1993030721214430, DIRECT, f08c47fec0942fa0` (メモの pub ID と同じ)。www は 301 で同じ所へ |
| AdSense のコード | 全ページの head に adsbygoogle.js?client=ca-pub-1993030721214430 が 1 本 (トップ・記事・固定ページ・一覧)。google-adsense-account の meta は無し (無くてよい) |
| プライバシーポリシー | 日英あり。制定・改定の日付、集める情報、Cookie、Google AdSense・第三者配信・過去の訪問に基づく広告、Google 広告設定と aboutads / youronlinechoices でのオプトアウト、Google の「サービスを使うサイトの情報の使い方」へのリンク、Cloudflare・Google Fonts など。審査で見られる文は揃っている |
| お問い合わせ・運営者 | /contact・/en/contact にフォーム (種類・内容・返信先)、/about・/en/about 2,400〜4,200 字 |
| フッター | 調べた 77 ページ全部に about・privacy・contact へのリンクと「非公式のファンサイト、権利は Grinding Gear Games」 |
| 移し替え | http・www・http+www とも https://exiledesk.com へ 301 (Always Use HTTPS はオーナーが 10-26 に On)。/web.html → / は 1cf9d1c9 で出し待ち |
| canonical・hreflang・robots・sitemap | サイトマップ 73 件 全部 200・自分の canonical・日英の hreflang が対。robots.txt は Allow: / と Sitemap。lastmod は 1cf9d1c9 で出し待ち |
| 題・説明 | 77 ページで題・説明の重複 0、空 0 |
| 壊れたリンク | 中のリンク 1,745 本 (ベースの個別は 30 枚だけ) で 404 は 0 |
| 中身の量 | 記事 31 本 (日) + 30 本 (英)、本文 4,200〜6,300 字。一番薄いのは /contact 660 字・/cosmetics/ 768 字 (noindex) |
| トップ (SPA) | JS 無しでも本文 1,943 字 (説明・できること・新しい記事 3 本) が見える |
| 速さ (窓なし Chrome、絞り無し) | LCP 0.41 秒・CLS 0.10 (trace) / 0.05 (Lighthouse)。SEO 100・アクセシビリティ 95・ベストプラクティス 77 |
| スマホ | 全ページ viewport あり。Lighthouse (mobile) で崩れの指摘なし |

## 直す物
- 見えない (私、済み): 静的なページに HSTS・X-Content-Type-Options: nosniff・Referrer-Policy・X-Frame-Options: SAMEORIGIN (public/_headers、6369a7f8)。手元の wrangler dev で付くのと、JS・CSS・manifest の content-type が正しい (nosniff で読めなくならない) のを見た。
- オーナーの手: EEA・英国向けの同意 (CMP)。今は同意の仕組みが無い。審査の可否には要らないが、通った後に EEA・英国では広告がほぼ出ない (Google は認定 CMP を求める)。AdSense の「プライバシーとメッセージ」→「欧州の規制」でメッセージを作って公開するだけ (コードは今の adsbygoogle のままで出る)。
- UI (デザインの OK が要る): ① スマホのフッターのリンク (使い方・プライバシーポリシー) の押せる大きさが 14px 高で狭い (24px 以上の推奨、Lighthouse の target-size)。② 画面に main の印が無い (アクセシビリティ)。どちらも審査の合否には効かない見込み (推測)。
- 気になる (直さない): Lighthouse の「第三者 Cookie 1 つ」は AdSense の物 (ポリシーに書いてある)。メインの JS が約 4.2MB (圧縮前) と大きいが、LCP は本文の文字で決まっていて速い。

## 規約の面
- 広告を押させる文は見当たらない (「広告」の語は開発版だけの「広告 (開発版だけ)」の札)。広告の枠は審査が通るまで本番では出していない (ads-page-model) ので、ボタンとの近さは今は見られない。通った後にスマホで棚・ボタンから指 1 本離す決まり (web-ads-domain-plan) を見る。
- 非公式の注意書きと GGG の権利の文は全ページのフッターにある。
