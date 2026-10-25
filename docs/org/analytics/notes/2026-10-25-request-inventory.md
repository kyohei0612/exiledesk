# サイト全体のリクエストの棚卸し (2026-10-25、ブラック 10 代目の頼み・オーナー「全体のアクセス系のやつ」)

調べと案だけ。コード・設定は触っていない。数え方: Cloudflare の GraphQL (Worker ごと `workersInvocationsAdaptive`、ゾーンの道・UA ごと `httpRequestsAdaptiveGroups`)・D1 の logs・日報の md・コード。台本は scratchpad の cf-paths.mjs / cf-split.mjs (使い捨て。残すなら scripts/ へ)。日は UTC (= JST 9:00 から)。

## 先に: 何が枠 (1 日 10 万、アカウント全体) に数えられるか
- **数える**: Worker が動いた回数だけ。web の Worker は `run_worker_first` の道 (`/`・`/index.html`・`/web.html`・`/s/*`・`/og/*`) と www・workers.dev の同じ道。exiledesk-live は全部 (/boot.json・/log・/feedback…・cron)。
- **数えない**: 静的ファイル (JS・CSS・絵・音・フォント・/blog/・/bases/・/faq などの読み物の HTML・/blog/index.json・sw.js)。何本読んでも 0。
- 画面の切り替え (?page=) は pushState で読み直さないので 0。

## ① 本番の実績 (Worker の回数/日)
| 日 (UTC) | web | live | 消した web-dev | 計 | 枠の % |
|---|---|---|---|---|---|
| 10-19 | 1,989 | 623 | 727 | 3,339 | 3% |
| 10-20 | 1,337 | 450 | 1,359 | 3,146 | 3% |
| 10-21 | 1,033 | 541 | 56,635 | 58,209 | 58% |
| 10-22 | 2,051 | 588 | 29,542 | 32,181 | 32% |
| 10-23 | 3,423 | 775 | 118,709 | 122,907 | **123%** |
| 10-24 (17:35 UTC まで) | 2,203 | 471 | (消した) | 2,674 | 3% |

訪問は 1 日 80〜130 (日報)・/log の届いた数は 93〜200 (D1 logs)。**本番だけなら 3〜4%**。越えたのは開発版だけで、それは消した。

### web の Worker の内訳 (ゾーンの集計、UA で分けた)
| 道 | 10-23 | 10-24 |
|---|---|---|
| `/` SemrushBot など ほかの Bot | 1,573 (うち Semrush 1,444) | 85 |
| `/` Applebot (exiledesk.com) | 533 | 559 |
| `www/` Applebot (301 を返して、次に `/` をもう 1 回) | 297 | 424 |
| `/` 人 | 272 | 376 |
| `www/` 人・Bot | 32 | 23 |
| `/og/*` (X などのカード) | 72 | 23 |
| `/s/*` (シェアを開く) | 33 | 8 |
| `/web.html`・`/index.html` | 16 | 0 |

→ web の Worker の **6〜8 割は巡回の Bot**。Applebot は毎日 1,000 回前後 (静的ファイルも含めると 1 日 3,000 回)、www を開くと move-gate.js の 301 で Worker を 2 回通る。

## ② 画面ごとの 1 人の見込み (一通り使った時、枠に数える回数)
| 画面 | web | live | 計 | 出どころ |
|---|---|---|---|---|
| どの画面でも開いた時 | 1 (`/`) + 初めての端末だけ sw.js の install で `/` をもう 1 回 | /boot.json 1 (ブラウザが 10 分覚える) | 2〜3 | src/web/boot.ts・public/sw.js |
| 記録の送信 | 0 | /log 離れる時に 1 回 (1 時間に 1 回まで、20 万字で早める) | +1/時 | log-sender.ts・track.ts |
| エミュ (棚から打つ・スパムシミュ・100 人) | 0 | 0 (計算はブラウザの中) | 0 | — |
| スパムのシェアを押す | POST /s/new 1 | 0 | 1 | use-spam-share.ts |
| シェアを X で見た人 | /s/<id> 1 + カード /og/ 1〜2 (Bot) | 0 | 2〜3 | og-card.js |
| チュートリアル・使い方 | 0 | 0 | 0 | — |
| 読み物 (/blog/・/faq・/craft-basics・/bases/) | 0 (静的) | /log 離れる時 1 回まで | 0〜1 | blog.js |
| 要望を送る | 0 | /feedback 1 (+絵 1) | 1〜2 | FeedbackDialog.vue |
| 要望を送った人 | 0 | /feedback/replies 開いた時と 45 分後 | 1〜2 | feedback-replies.ts |
| シミュ (ベース・MOD・手・テストラン・100 人・保存・レシピ) | 0 | 0 (共有は #recipe= の URL、サーバーに置かない) | 0 | シミュ部長 23 本目が手元で数えた (操作中 0・60 秒放置 0、開いた時 /boot.json 1) と一致 |
| スキン一覧 (予定) | 0 (絵 1,966 枚は静的) | 0 | 0 | 2026-10-25 にスキン部長へ |
| サーバーの cron | — | 1 時間おき 24 + 9:00・9:03 の 2 | 26/日 | server/live/wrangler.jsonc |

→ 1 人 1 訪問で **2〜4 回**、どの画面でも操作で増えない。目標の月 10 万 PV (1 日 3,300 PV) でも、人の分は web 3,300 + live 4,000 前後 = 1 日 1 万弱 (枠の 1 割)。

## ③ 多い順に 3 つと減らす案
1. **巡回の Bot がトップを叩く (web の 6〜8 割、1 日 1,000〜2,000)**: トップを Worker の外へ。run_worker_first を `["/s/*", "/og/*"]` だけにし、www → exiledesk.com の 301 は Cloudflare の Redirect Rules (無料、ダッシュボード) へ、workers.dev の Bot 向け 301 はやめる (10-23 の案 1、notes/2026-10-23-workers-limit.md)。→ Bot も人も `/` は 0 回、越えてもトップは止まらない。持ち主: server/web/wrangler.jsonc・move-gate.js = サーバー管理人、Redirect Rules = オーナーのダッシュボード。本番の設定なのでオーナーの OK の後。
2. **SemrushBot (SEO の道具の巡回、10-23 に 1,444)**: 来るのは日によって違う。robots.txt で `User-agent: SemrushBot` を Disallow (検索の順位には関係ない)。持ち主: public/robots.txt = 共通 (ジン部長)。1 をやれば数には入らなくなるので、1 の後は通る量だけの話。
3. **live の /boot.json と /log (1 日 450〜775)**: 今は小さい (枠の 1% 弱)。人が増えた時に効くのは /boot.json (開くたび 1 回)。案: ブラウザの覚える時間を 10 分 → 30〜60 分 (相場は 1 時間おきの更新なので中身は変わらない)。持ち主: src/web/boot.ts = デザイン部長、返す側の Cache-Control は server/live = サーバー管理人。急がない。

## 本番で数えて確かめた事 (10-25 昼、v0.1.598)
- 決まった回数だけ叩き、1 分ごとの web の Worker の回数を見た: /cosmetics/・/en/cosmetics/ 20 回 (200) → 0、ある絵 /mtx-art/64.webp 10 回 (200) → 0、/s/<id> 5 回 → 5、**無い絵 (404) 20 回 → 20**。
- → 静的な物は数えない。ただし置き場に無い道 (404) は 1 回ずつ数える (Worker があると、無い道は Worker に落ちる)。絵の道の書き間違い・古い版の塊を読みに来るのは数えられる。

## 気を付ける事
- 1 日 10 万はアカウント全体。危ないのは人の数より、確認用の Chrome で**本番**を何度も開く確かめ (10-23 の HeadlessChrome は `/` に 41 回) と、Worker を通る道を足す変更 (run_worker_first に道を足す・静的な物を Worker で返す)。
- Free プランのゾーンの集計は URL の ? の後 (クエリ) が取れない。Applebot がどの ?page= を開いているかは分からない。
