# 手元で本番と同じ環境を出せるか (調べだけ、2026-10-24)

頼み: ブラック 8 代目 (オーナー「ローカルと鯖環境を合わせたら、わざわざ開発版ウェブで確かめる必要なく本番リリースできる」→「知りたいのは可能なのか」)。台本・package.json は作っていない。手元で wrangler dev も立てていない (共有のポート)。server/web/wrangler.jsonc・move-gate.js・og-card.js と Cloudflare の仕組みから判断した。

## 結論: ほぼできる
`pnpm build:web` で dist-web/ を作り、`server/web` で `wrangler dev` (workerd = 本番と同じ実行の土台) を本番の wrangler.jsonc のまま立てれば、次は本番と同じに出せる見込み。

| 物 | 手元で同じか | メモ |
|---|---|---|
| Worker を通る道 (run_worker_first: / ・/index.html・/web.html・/s/*・/og/*) と、通らない資材 | 同じ | assets の設定 (html_handling auto-trailing-slash・not_found_handling 404-page) も workerd が同じに読む |
| 末尾の / や .html のゆれの 307、404 のページ | 同じ | 同上 |
| move-gate.js のクローラーだけ 301 | ほぼ同じ | 住所 (Host) で分けるので、手元では Host ヘッダーを www.exiledesk.com / web.exiledesk.workers.dev にして叩けば見られる見込み (未確かめ) |
| /s/<id>・/og/*.png (シェアのカード) | 同じにできる | D1 は `--remote` で本番の shares を読むか、手元の D1 に 1 行入れる。絵の部品 (workers-og の wasm) は workerd で動く見込み。字は Google Fonts を取りに行くのでネットが要る |
| 開発版の門 (dev-gate.js) | 同じ | `-c wrangler.dev.jsonc` と DEV_KEY を手元の .dev.vars に (git に入れない) |
| ヘッダー (X-Robots-Tag・Cache-Control 等) | Worker が付ける物は同じ | 下の端の物は除く |

## 手元では出せない物 (本番に出した直後にサーバー管理人が数回だけ見る)
- 端 (Cloudflare のエッジ) のキャッシュと、出した直後の版の入れ替わり (古い塊を持ったタブ・/?stale=)。
- 独自ドメインの TLS・http → https (Always Use HTTPS はオーナーのダッシュボード)・zone の Redirect Rules。
- 1 日の上限 (10 万) と使用量・Cloudflare Web Analytics の beacon・AdSense の表示・Search Console の取得。
- 本番の秘密 (DEV_KEY・REFRESH_KEY 等) は手元に無い → 手元では仮の値。
- 出した直後に見る手順 (案、各 1 回): (1) / ・/blog/・/faq・ads.txt・sitemap.xml が 200、(2) 古い住所と www をクローラーの UA で 301、(3) /s/<本物の id> と /og/ の絵が 200、(4) 出す前の版の /assets/ の塊を 1 つ取って 200 (開いたままのタブが落ちない)、(5) 30 分後に Cloudflare の集計で web のエラーが 0。

## 作るならどれくらいの手間
- 台本 1 本 (ビルド → server/web で wrangler dev、ポートを決めて立て、終わったら PID で止める) と、本番と手元で同じ URL の並びを叩いて返り (状態・Location・主なヘッダー) を比べる台本 1 本。合わせて半日ほど (サーバー管理人)。package.json に 1 行 (共通の持ち物、ブラックの OK)。
- 本番と並べて比べるのは、サイトの中身 (dist-web) を本番と同じ版にした時だけ意味がある (中身が違うと 200 / 404 も変わる)。
- 気を付ける事: 手元の Web 版のページが本番の server/live へ分析の記録を送らないこと (本番の作りなので送り手が動く。手元の時は ?nolog=1 か、窓なしの Chrome なら 10-24 の直しでサーバーが外す)。
