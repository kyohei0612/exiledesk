# 広告が出ているほかのサイトの調べ (2026-10-22 夜、リサーチ長 2 本目)

頼み: ブラック (オーナー 10-22、「特に Craft of Exile とか」)。(1) ExileDesk と同じくらいの量の日本語のゲーム系サイトの広告 (2) シミュ・計算機系のサイトの広告と通っている理由。
**見方**: サブエージェント 2 本 (Sonnet) が curl / WebFetch で公開のページの HTML と `/ads.txt` を取った (JS は動かしていない、フォーム・登録なし)。私が保存した HTML で 2 点を確かめた: Craft of Exile の HTML・ads.txt に `nitropay` があり `adsbygoogle` が 0、ウマ娘DB の HTML に `adsbygoogle.js?client=ca-pub-…` がある。
**限界**: JS で描いた後に広告が本当に見えているかは分からない。分かるのは「今の姿」で、**審査に通った時の姿ではない**。日本語の小さな道具サイトの例は少なく、PoE 系の日本語の例は無い。

## 1. 同じくらいの量の日本語のゲーム系サイト (AdSense のコードが HTML にあるか)
| サイト | 種類 | 記事の本数 (出どころ) | 1 本の字数 (1 本だけ) | 道具の比重 | AdSense | 枠の形 | ほかの広告 | About・プライバシー |
|---|---|---|---|---|---|---|---|---|
| asukagame4.com | 個人のゲームブログ | 約 153 (post-sitemap) | 約 2,260 | 記事だけ | あり | 記事に ins 1 | もしも・楽天 | 両方 |
| mokomoko4879.com | 個人のゲームブログ | 約 66 | 約 3,440 | 記事だけ | あり | ins 5 | 楽天・バリューコマース | 両方 |
| maito-blog.com | ゲームの雑記 | 約 52 | 約 3,090 | 記事だけ | あり | ins 4 | 楽天 | 両方 |
| lucamoongames.com | はてなのゲーム雑記 | 約 40 | 約 600 | 記事だけ | あり | ins 12・自動広告 | 楽天 | 両方 (ads.txt 404) |
| tor0roblog.com | 雑記 | 約 776 | 約 1,600 | 記事だけ | あり | ins 5 | 楽天・Amazon 等 | 両方 (ads.txt 404) |
| ore-game.com | ゲームの検証・計算の道具 + 記事 | マイクラだけで約 20 (sitemap 無し) | 約 5,040 | 道具が主 | あり | 自動広告だけ (ins 無し) | A8 | HTML では見つからず |
| uma.pure-db.com (ウマ娘DB) | フレンド検索・相性計算 | **記事 0** (sitemap 16 URL は全部画面) | — | **道具だけ** | **あり** (確かめた) | HTML に ins 無し | i-mobile | 両方 |
| webtools-lab.com | ガチャシミュ等の道具集 | 約 60 (道具 + 記事) | 未計測 | 道具が主 | あり | ins 無し | 忍者 AdMax らしき (未確認) | 両方 |
| 9db.jp (中規模、比べる用) | 掲示板 + Wiki + 計算 | 大規模 | — | 半々 | あり | ins 1 | GAM・Geniee 等 | 見えず |
| kuroseru13.com (反例) | ブログの運営 | 約 7 | 約 800 | 記事だけ | **なし** | — | A8 | 両方 |
| gacha-probability.hitome-notes.com (反例) | 確率の道具 | ほぼ 0 (32 URL) | — | 道具だけ | **なし** | — | なし | プライバシーだけ |

傾向: 記事が主のサイトは 40〜150 本・1 本 2,000〜3,500 字が多い (ExileDesk の 30 本・3,000〜5,500 字は本数で少なめ、1 本の厚みは上)。**道具だけ・記事 0 でも AdSense が出ている例がある** (ウマ娘DB)。About とプライバシーは 11 件中 8 件。

## 2. シミュ・計算機・データの道具サイト (英語が中心)
| サイト | 種類 | 広告網 (HTML・ads.txt) | 道具の画面の文 (JS 無し) | ガイド・記事 | About・プライバシー | 広告の置き場 |
|---|---|---|---|---|---|---|
| **craftofexile.com** | PoE1/2 のクラフト計算 | **NitroPay** (AdSense のコードは無い) | 約 650〜800 語 (JS で描く) | ガイド・FAQ・使い方・更新履歴。ブログは無い | About・Privacy・Donate | 道具の画面の左・右・下 + ホームの 4 枠 |
| poe2db.tw | PoE2 のデータ | NitroPay (同意の窓あり) | 約 1,840 語 (サーバーで描く) | News と wiki の本文が大量 | Privacy・Patreon | 分からない |
| poe.ninja | 相場・ビルドの集計 | Ezoic (同意の窓あり) | 45〜63 語 (SPA の殻) | docs・support | Privacy・Support・About | 殻の HTML に上・左右・下の 4 枠 |
| poe-vault.com | ビルド・ガイド | Freestar + GAM | 約 700 語 | ガイド多数 | 確認できず | 確認できず |
| maxroll.gg/poe2 | ガイド・プランナー | GAM (Ziff Davis の持ち物) | 約 2,450 語 | ニュース・ガイド大量 | 確認できず | 確認できず |
| ffxivteamcraft.com | FF14 のクラフト | Playwire (ads.txt だけ) | 約 6 語 (SPA) | 不明 | 不明 | 分からない |
| d4builds.gg | D4 のプランナー | Playwire (ads.txt) | 約 270 語 | ビルド・ガイドへのリンク | 不明 | 分からない |
| genshin-optimizer (github.io) | 原神のダメ計 | **AdSense を直に** | 約 19 語 | 不明 | 不明 | 分からない |
| pobb.in | PoB の共有 | 広告なし (ads.txt も無し) | 約 190 語 | 無し | 確認できず | — |
| Mobalytics・Last Epoch Tools | — | ads.txt では NitroPay (画面は Cloudflare で止まった) | — | — | — | — |

### Craft of Exile をくわしく
- **広告網**: NitroPay (`s.nitropay.com/ads-556.js`・`nitroAds`)。AdSense・GAM のコードは無い。ads.txt の google.com 直の行 (pub-9872233689689746) は poe2db・Last Epoch Tools と同じで、NitroPay 経由で Google の広告も入るという意味。**AdSense の審査に通った証ではない**。PoE2 の画面も同じ。
- **置き場**: package.js の `createAd` に 4 枠 (`left_ad`・`right_ad`・`bottom_ad`・`home_ad`)、60 秒ごとに入れ替え、「Report Ad」つき。**道具の画面そのものの左右と下に出している** (記事の中ではない)。
- **道具の画面の文**: 最初の HTML は約 28KB で、見える文は Patreon の帯だけ。道具は JS で描く。
- **固定のページ** (サーバーが本文入りで返す): FAQ 約 920 語・How to use 約 480・Privacy 約 2,170 (更新 2020-10-02、文に「Google AdSense など」が残る)・Donate 約 160・About 約 95 (Krakenbul らへの謝辞、GGG とは関係ない旨)・Changelog・Guides・Weightings。**ブログの記事は無い**。利用規約のページは見当たらない。
- **収入**: 広告 + PayPal の寄付 + Patreon (払うと広告が消える)。Donate のページに「広告は運営費のため控えめに」。
- poe2db も NitroPay + Patreon (Patron は広告なし)、poe.ninja は Ezoic。

### 広告網の入る目安 (各社の公開の文、申し込む前にその社で確かめ直す)
- Nitro: 月 10 万 PV から、ゲーム系に特化 (blog.nitropay.com の比べる記事・nitropay.com の FAQ)。
- Playwire: 月 50 万 PV が目安、独自の中身と正しい流入を見る (Playwire の FAQ)。
- Ezoic: 2026-02-19 から新規は 25 万 MAU 以上 (support.ezoic.com の要件のページ)。

## 3. 見立て
- **有名な PoE の道具サイトは AdSense ではなく、ゲーム向けの広告網 (NitroPay・Ezoic・Playwire) で道具の画面に広告を出している**。AdSense を「道具の画面で通した」手本にはならない。AdSense を直に使う道具の例は、ウマ娘DB (記事 0) と genshin-optimizer だけ。
- 日本語の個人サイトで AdSense が出ている物は、記事が主なら 40 本以上が多い。ただし道具だけのサイトにも出ている例がある。**通った理由は HTML からは言えない** (審査の時の姿が分からない)。

## 4. ExileDesk に足りない物・真似できる物 (5 行)
1. **道具の入口に本文を**: CoE は FAQ・How to use・Guides・Weightings を URL ごとにサーバーが本文入りで返している。ExileDesk も使い方・クラフト入門はあるので、**FAQ (よくある質問) と「重み・確率の出どころ」のページ**を足すと形が近くなる (ジン部長・記事編集長)。
2. **About に出どころと謝辞**: CoE は About に Krakenbul らへの謝辞と「GGG とは関係ない」を書いている。ExileDesk の About にも、データの出どころ (poe2db・CoE・Krakenbul の実測) と非公式の旨があるか 1 回見る (記事編集長)。
3. **記事の本数**: 日本語の個人サイトは 40 本以上が多い。今の 30 本から週 2〜3 本を続ければ、再申請の目安の 2〜4 週間後に 40 本前後になる (記事編集長)。
4. **寄付・応援のページ**: 「広告は運営費のため」の一文と寄付は CoE・poe2db と同じ形 (任意、オーナー)。
5. **AdSense がまた落ちた時の別の道**: NitroPay は月 10 万 PV から (目標の月 10 万 PV と同じ線)。PoE の道具サイトの多くがここ (オーナー、急がない)。
