# トップを Worker の外へ・www の Bot 向けの 301 を Redirect Rules へ (2026-10-25)

オーナー OK (ブラック 10 代目経由「ロボットの件も 1 と 2 進めて」)。訳は notes/2026-10-25-request-inventory.md (web の Worker の 6〜8 割が巡回の Bot のトップ)。
コードの直しは commit 済み (本番にはまだ出していない)。**順番は必ず ① Redirect Rule を作る → ② 確かめ → ③ 本番に出す。** ③ を先にすると www の Bot に 301 が出なくなる (Search Console で www が同じ中身の別ページに戻る)。

## 変えた物 (server/web)
- wrangler.jsonc: `run_worker_first` を `["/", "/index.html", "/web.html", "/s/*", "/og/*"]` → `["/s/*", "/og/*"]`。トップ・index.html は静的な置き場から直接 (枠に数えない、越えても止まらない)。
- move-gate.js: www・旧 workers.dev の Bot 向けの 301 を消した (シェアのカード og-card.js を返すだけ)。www は ① の Redirect Rule に、workers.dev の 301 はやめる (アドレス変更は 10-11 に済み、canonical は exiledesk.com)。
- 人の動きは今と同じ: www を人が開くと 200 のまま (作業中のデータを消さない)、web.html の頭の script で exiledesk.com へ移る。/boot.json・/log は別の Worker (exiledesk-live) なので変わらない。

## ① オーナーがダッシュボードでやる事 (5 分)
1. https://dash.cloudflare.com/ → exiledesk.com → 左の **Rules** → **Overview** → **Create rule** → **Redirect Rule** (Single Redirect)。
2. Rule name: `www bot to apex` (何でもよい)。
3. 「If incoming requests match…」で **Custom filter expression** → **Edit expression** を押して、下の 1 行をそのまま貼る:
   ```
   (http.host eq "www.exiledesk.com" and (len(http.request.headers["sec-fetch-mode"]) eq 0 or lower(http.user_agent) contains "bot" or lower(http.user_agent) contains "google" or lower(http.user_agent) contains "crawl" or lower(http.user_agent) contains "spider" or lower(http.user_agent) contains "slurp" or lower(http.user_agent) contains "yandex" or lower(http.user_agent) contains "baidu" or lower(http.user_agent) contains "facebookexternalhit" or lower(http.user_agent) contains "embedly" or lower(http.user_agent) contains "preview"))
   ```
   (前の move-gate.js と同じ見分け: ページを開く時に必ず付く sec-fetch-mode が無い = プログラム、または UA に Bot の名前)
4. 「Then…」: Type **Dynamic**、Expression に `concat("https://exiledesk.com", http.request.uri.path)`、Status code **301**、**Preserve query string** に印。
5. **Deploy** (Save)。無料プランで 10 本まで作れるうちの 1 本。お金は掛からない。
- 3 で「この関数は使えない」と出たら、そこで止めてサーバー管理人へ (式を書き直す)。

## ② 確かめ (サーバー管理人、① の後すぐ)
- `node scripts/check-www-redirect.mjs` → **全部 OK** なら ③ へ。
- 一番大事な行は「www の /blog/ を Bot で → 301」。/blog/ は今も Worker を通らない道なので、ここが 301 なら Rule が効いている (Rule を作る前の 10-25 は 200 = NG 1 件、ほかの 6 件は OK だった)。
- 「www の / を人で → 200」が NG なら Rule が人まで飛ばしている → Rule を止めて (ダッシュボードの切り替え) サーバー管理人へ。

## ③ 本番に出す (最終チェック長、裏方なので版は上げない)
- いつもの `pnpm deploy:web` (server/web の wrangler deploy。dist-web も一緒に上がるので main をそのまま出す時に)。
- 出した後: `node scripts/check-www-redirect.mjs --share <id>` (id は D1 の shares の新しい物。`/s/<id>` と `/og/<id>.png` が 200 = シェアが今どおり)。
- 次の日の朝: Cloudflare の Worker の数 (web) が 2,000 前後 → 650 前後に下がったか (サーバー管理人の毎朝の見張り)。

## 戻し方
- Rule が悪い時: ダッシュボードの Rules でその Rule を Off (すぐ効く)。
- 本番に出した後に戻す時: この commit を revert して `pnpm deploy:web`。

## 手元で確かめた事 (10-25)
- 本番と同じ wrangler.jsonc で手元の workerd を立て、Worker が動いた時だけ印を付ける包みで 18 通り叩いた (台本は scratchpad の check-worker-first.mjs、使い捨て): `/`・`/?page=guide` (人・Bot とも 200、Worker を通らず)、`/index.html` (307 → /、通らず)、/blog/・/bases/・/faq・/sw.js・/market-fallback.json (通らず)、/s/<id>・/og/<id>.png・無い /s/ (Worker が動いて今どおり 200・200・302)。トップの HTML は題・web の JS とも今と同じ。
- **置き場に無い道 (404) は、run_worker_first に関係なく Worker が動く** (手元で /no-such-page・/assets/none.js・/web.html が Worker を通った。今の本番でも同じ)。本番の 404 は 10-24 に 620 回 (/wp-admin/ などを探る Bot、古い版の JS)。直しの後に残る web の Worker はおもにこれ。減らすなら Worker を「置き場だけ」と「シェアだけ」に分ける (急がない、枠の 1% 未満)。
- ついでに見えた事: 古い版の JS (/assets/extra-bases-DD5v4Q9A.js) の 404 が 10-24 に 12 回 (iPhone の Chrome)。出し直しの前に開いていた画面が古い塊を読みに来ている。Worker の数には小さいが、その人の画面が止まっていないかは デザイン部長 (古い塊の読み直し) へ。
