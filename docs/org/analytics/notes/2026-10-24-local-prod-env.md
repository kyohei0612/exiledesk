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

## 作った (10-24、オーナー「おけ、作って」)
- `pnpm preview:prod` (scripts/preview-prod.mjs): 本番と同じ作り (vite build・相場の控え・読み物・ブログ) を server/web/.wrangler/preview-dist に出し、server/web/wrangler.jsonc から作った設定 (置き場の道だけ替え、routes を外す) で wrangler dev (workerd) を http://127.0.0.1:1460/ に。`--dev` で開発版と同じ作り (シミュレーター・チュートリアルが開く)、`--no-build` で作り直さずに立て直す。止めるのは Ctrl+C。
- 本番に書かない: D1 は手元の写し (server/web/.wrangler/state-preview、本番の shares の新しい 20 行を SELECT で読んで写す)。画面の送り先 (VITE_WEB_API) は手元の Worker 自身 → /boot.json・/log は 404 になり、相場は /market-fallback.json (本番に置いてある控えを写す)、分析の記録は捨てる。dist-web (本番に出す物) は触らない。
- 並べて比べる: `node scripts/compare-prod-local.mjs [--md]` (本番と手元で同じ URL を人とクローラーの 2 通り、GET だけ)。

### 比べた結果 (10-24、手元は main の作り・本番は v0.1.59x)
ステータス・Location・cache-control・x-robots-tag は全部同じ。違いは静的な資材の content-type の後ろの `; charset=utf-8` (手元の資材の配り手だけが付ける。HTML は meta charset を持つので画面には効かない) だけ。古い住所・www のクローラー向け 301 は住所 (Host) で分けるので、この台本では比べていない。

| URL | 誰 | 本番 | 手元 | 同じ |
|---|---|---|---|---|
| / | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| / | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /index.html | 人 | 307<br>location: / | 同じ | ○ |
| /index.html | クローラー | 307<br>location: / | 同じ | ○ |
| /web.html | 人 | 404 | 同じ | ○ |
| /web.html | クローラー | 404 | 同じ | ○ |
| /?page=sim-tree | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /?page=sim-tree | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /?page=routes | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /?page=routes | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /?lang=en | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /?lang=en | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /about | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /about | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /about.html | 人 | 307<br>location: /about | 同じ | ○ |
| /about.html | クローラー | 307<br>location: /about | 同じ | ○ |
| /about/ | 人 | 307<br>location: /about | 同じ | ○ |
| /about/ | クローラー | 307<br>location: /about | 同じ | ○ |
| /blog | 人 | 307<br>location: /blog/ | 同じ | ○ |
| /blog | クローラー | 307<br>location: /blog/ | 同じ | ○ |
| /blog/ | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /blog/ | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /en/ | 人 | 404 | 同じ | ○ |
| /en/ | クローラー | 404 | 同じ | ○ |
| /faq | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /faq | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /ads.txt | 人 | 200<br>content-type: text/plain<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/plain; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /ads.txt | クローラー | 200<br>content-type: text/plain<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/plain; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /robots.txt | 人 | 200<br>content-type: text/plain<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/plain; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /robots.txt | クローラー | 200<br>content-type: text/plain<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/plain; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /sitemap.xml | 人 | 200<br>content-type: application/xml<br>cache-control: public, max-age=0, must-revalidate | 同じ | ○ |
| /sitemap.xml | クローラー | 200<br>content-type: application/xml<br>cache-control: public, max-age=0, must-revalidate | 同じ | ○ |
| /market-fallback.json | 人 | 200<br>content-type: application/json<br>cache-control: public, max-age=0, must-revalidate | 同じ | ○ |
| /market-fallback.json | クローラー | 200<br>content-type: application/json<br>cache-control: public, max-age=0, must-revalidate | 同じ | ○ |
| /bases/ | 人 | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /bases/ | クローラー | 200<br>content-type: text/html<br>cache-control: public, max-age=0, must-revalidate | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=0, must-revalidate | × |
| /no-such-page-x | 人 | 404 | 同じ | ○ |
| /no-such-page-x | クローラー | 404 | 同じ | ○ |
| /s/C6RGjvS | 人 | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=3600 | 同じ | ○ |
| /s/C6RGjvS | クローラー | 200<br>content-type: text/html; charset=utf-8<br>cache-control: public, max-age=3600 | 同じ | ○ |
| /og/C6RGjvS.png | 人 | 200<br>content-type: image/png<br>cache-control: public, max-age=31536000, immutable | 同じ | ○ |
| /og/C6RGjvS.png | クローラー | 200<br>content-type: image/png<br>cache-control: public, max-age=31536000, immutable | 同じ | ○ |

42 通りのうち違う物 20

## (b) 開発版と同じ形 (10-24、オーナー「今の開発版と全く同じ環境を作って触れるように」)
- 開く: `pnpm preview:prod -- --dev` → Chrome で **http://dev.exiledesk.localhost:1461/** (ブックマーク「ExileDesk開発版」をここへ)。(a) 本番そのままは `pnpm preview:prod` → http://exiledesk.localhost:1460/。作り直さずに立て直すのは `--no-build`。止めるのは Ctrl+C。
- 開発版 (scripts/deploy-web-dev.mjs) と同じ物: ビルドの印 VITE_DEV_PREVIEW=1 (チュートリアル・シミュレーター・ブログの下書き)、相場・配信は本番の server/live の /boot.json を読む、分析は送らない、要望を送れば本番に届く。違う物: 門 (鍵・cookie) が無い、開発版は commit 済みの HEAD をビルドするが手元は今の作業中のファイルから、1 つ前の版の塊は残さない (手元は出し直しの入れ替わりが無いので要らない)。
- 待ち受けは `localhost` (127.0.0.1 と ::1)。`::` にすると家の LAN (192.168.x) にも出てしまい、その上 Windows では返らなくなったのでやめた。
- 確かめ (窓なしの Chrome 9370、10-24): タブの題「ベースを選ぶ — ExileDesk」・アイコン 5 つ (/web/favicon-48・96・144・icon-192・/favicon.ico)・manifest 200 (application/manifest+json) は開発版・本番と同じ (題・アイコンは本番と開発版で分かれていない)。エミュ (?page=base)・シミュのツリー (?page=sim-tree)・見本の木 (?page=sim-tree&sample=gold-ring-suffix で箱 42)・タブ替え エミュ → シミュ → エミュ が動き、JS のエラー 0・400 以上 0。
- 窓なしの Chrome だけの癖: 新しい profile では Service Worker の CacheStorage が開けず (UnknownError)、後から読む塊が ERR_FAILED になった。CDP で Service Worker を通さない (Network.setBypassServiceWorker) と全部通る。開発版でも同じ sw.js が動いているので、オーナーのいつもの Chrome では起きない見込み (オーナーが触って確かめる)。

## web-dev を消す時の手順 (オーナーが触って OK の後、ブラックの「消して」で。まだしない)
1. Cloudflare の Worker `web-dev` を消す: `pnpm --dir server/web exec wrangler delete -c wrangler.dev.jsonc` (秘密 DEV_KEY も一緒に消える)。消す前に `wrangler deployments list -c wrangler.dev.jsonc` で名前が web-dev なのを見る。本番の `web` は消さない。
2. 消した後の確かめ: https://web-dev.exiledesk.workers.dev/ が繋がらない (Cloudflare の 404/1042 等)、本番の exiledesk.com・/s/・/og/ が 200。
3. リポジトリから消す物 (サーバー管理人の commit): scripts/deploy-web-dev.mjs、server/web/dev-gate.js・wrangler.dev.jsonc、package.json の `deploy:web-dev`、手元の .dev-web-key・dist-web-dev/・node_modules/.cache/exiledesk-dev-web-assets.json (git に無い物)、../ExileDesk-devbuild の worktree は最終チェック長も使うので残す (本番の出しの OK 待ちを抜く所)。
4. 言い方を替える案 (md はブラックとホワイトが直す): CLAUDE.md の「非公開の開発版: `pnpm deploy:web-dev`」→「手元の開発版: `pnpm preview:prod -- --dev` → http://dev.exiledesk.localhost:1461/」、各部の README・todo・メモの「開発版に出す / 開発版で確かめる」→「手元の開発版で確かめる」、共有の物の使用表の「開発版へのデプロイ」の行は消す。og-card.js の「開発版の門」の文と sw.js の `?k=` の除けは、門が無くなれば外せる (後で)。
5. 気を付ける事: 開発版のシェアの URL (/s/) や鍵付き URL を誰かに渡していれば切れる。今まで外に出したのはオーナーのスマホだけの見込み。

## CLAUDE.md の「動かし方」に足す 1 行の案 (ブラックが直す)
- 手元の本番と同じ環境: `pnpm preview:prod` (本番そのまま、http://exiledesk.localhost:1460/)・`pnpm preview:prod -- --dev` (開発版と同じ、http://dev.exiledesk.localhost:1461/)。本番と並べて比べる `node scripts/compare-prod-local.mjs`。
