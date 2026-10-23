# Workers の 1 日の上限 (10 万) を越えた時の動きと、本番を守る案 (2026-10-23)

頼み: ブラック 8 代目 (オーナー、Cloudflare の「Workers の 1 日のリクエストが 75%」の知らせ 10-23 23:25)。調べと案だけ。本番の設定はオーナーの OK の後。

## 何が起きたか
- 10-23 (UTC の 1 日 = 日本時間 9:00〜翌 9:00) の Workers のリクエスト: web-dev 約 11.9 万・本番 web 2,456・exiledesk-live 563。KV は読み 1,560・書き 33 で小さい (Cloudflare の GraphQL の集計)。
- web-dev は 11〜14 時に 1 時間 1.5〜2 万、21〜23 時に 0.8〜1.3 万 (部長たちが確認用の Chrome で開発版を何度も開いた時間)。門 (dev-gate.js) が `run_worker_first: true` で、絵 1 枚ずつまで Worker を通っていた。→ 4caa758e で絵・フォント・音を門の外に。
- 23:54 の時点で本番の / ・/blog/・ads.txt・live の /health は 200 のまま (数字の上では越えているが、まだ止まっていない)。

## 上限を越えた時の動き (Cloudflare の公式ドキュメント 10-23 に読んだ)
- 上限は **アカウント全体** で 1 日 10 万、**UTC 0:00 (日本時間 9:00) に戻る** (workers/platform/limits)。開発版の使いすぎで本番も止まりうる。
- `run_worker_first` に当たる道は、上限を越えると **429 を返す** (静的な資材に落ちない)。否定の形 (`!/…`) と、run_worker_first に当たらない静的な資材は **そのまま返る** (workers/static-assets/billing-and-limitations)。静的な資材のリクエストは無料・無制限。
- route の fail open / fail closed の切り替えは route (zone の route) の話で、custom domain・workers.dev の時の書きは無い。

## 本番 (server/web/wrangler.jsonc) の今
- `run_worker_first: ["/", "/index.html", "/web.html", "/s/*", "/og/*"]`。**/ (トップ = エミュレーターの入口) が Worker を通る**ので、上限を越えるとトップが 429 になる。ads.txt・絵・JS・/blog/・/faq などは静的な資材なので止まらない。
- / を Worker に通している訳は move-gate.js だけ: 古い住所 (web.exiledesk.workers.dev) と www.exiledesk.com をクローラーにだけ 301 で送る (人は今のまま)。/s/*・/og/* はシェアのカード (og-card.js、D1) で Worker が要る。

## 案 (上から順におすすめ)
1. **本番のトップを Worker の外に**: run_worker_first を `["/s/*", "/og/*"]` だけにする (サーバー管理人、server/web/wrangler.jsonc。オーナーの OK の後)。代わりに:
   - www → exiledesk.com のクローラーだけの 301 は、Cloudflare の Redirect Rules (zone の設定、無料。条件 `http.host eq "www.exiledesk.com"` かつ UA にクローラーの名前) に移す (オーナーのダッシュボード)。
   - 古い住所 workers.dev のクローラー向け 301 はやめる (Search Console のアドレス変更は 10-11 に済み、ページの canonical は exiledesk.com を指している)。
   - これで上限を越えても、トップ・記事・ads.txt は止まらない。止まるのはシェアの /s/・/og/ だけ。
2. **有料プラン (Workers Paid、月 5 ドル)**: 上限が 1 か月 1,000 万リクエストになり、1 日の上限で止まる心配がなくなる。今の使い方の見込みは下の通り月 5 ドルぴったり。
3. 開発版を別のアカウントへ: 枠がアカウントごとなので本番と分かれる。ただ D1 (シェアの表) を開発版も使っているので、作り直しが要る。手間の割に 1・2 より効かない。

## 有料にした時の 1 か月の見込み (10-22・10-23 の数字から)
- リクエスト: 本番 web 約 2,500/日・live 約 600/日・開発版 3〜12 万/日 → 多めに見て月 400 万前後 (含まれる 1,000 万の内)。KV 読み 月 5 万前後 (含まれる 1,000 万の内)、書き 月 1,000〜2,000 (100 万の内)。D1 も含まれる量の内。
- → **月 5 ドル (いまのドル円で 750 円前後) で収まる見込み**。CPU 時間は測っていない (含まれる 3,000 万 ms/月、普通のページの送りなら足りるはず)。
