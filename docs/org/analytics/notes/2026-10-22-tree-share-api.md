# ツリーのレシピの短い URL の保存先 (server/live、2026-10-22)

頼み: ブラック 6 代目 (オーナー 10-22)。画面の側 (?page=sim-tree&r=<id> で開く・「回す」をすぐ押せる) はシミュ部長。サーバーは分析君。
コード: server/live/src/tree-share.ts (入口は index.ts の handle の頭)、表は migrations/0008_tree_shares.sql (D1 exiledesk-logs の tree_shares)。KV は使わない。

## 住所
- 本番: `https://exiledesk-live.exiledesk.workers.dev` (Web 版が今 /boot.json・/log を読んでいる所と同じ。src/web/config.ts の live の住所)

## 保存: `POST /tree/new`
- 本文: 木の JSON をそのまま (content-type は何でもよい、`text/plain` でも可。sendBeacon / fetch どちらでも)。**JSON のオブジェクト**で、**32KB (UTF-8 のバイト) まで**。金の指輪の木で約 1.3〜2KB。
- 返り (200): `{ "id": "bbLkiWaZ", "name": "金の指輪 (サフィックス 3 つ)" }`
  - id = 中身の SHA-256 から決まる 8 文字 (0-9A-Za-z)。**同じ中身は同じ id** (空白・改行の違いは同じに数える。キーの順番が違うと別の id)。
  - name = 木の `name` か `title` (文字、80 文字まで)。無ければ null。X のカードに使う予定。
- 断り:
  - 400 `{"error":"JSON ではない"}` / `{"error":"形が違う"}` (配列・数など、オブジェクトでない)
  - 413 `{"error":"大きすぎる"}` (32KB を超えた)
  - 429 `{"error":"少し待ってからもう一度"}` (同じ IP から 10 分に新しい木 20 本まで。**もうある木は数えずに 200 で返す**)
- IP は SHA-256 の頭 16 文字だけ置く (連打の制限だけに使う)。

## 取り出し: `GET /tree/<id>`
- 返り (200): `{ "id": "bbLkiWaZ", "name": "…" | null, "at": 1792655722692, "tree": { …置いた木の JSON… } }`
  - `cache-control: public, max-age=31536000, immutable` (中身は変わらないので、ブラウザと端は 1 回目の後は取りに来ない)。
- 断り: 400 `{"error":"id の形が違う"}` (8 文字の英数字でない)、404 `{"error":"無い"}`。
- CORS は `*` (exiledesk.com からも開発版からも読める)。

## 使い方の例 (画面の側)
```js
const r = await fetch(`${LIVE}/tree/new`, { method: "POST", body: JSON.stringify(doc) }).then((x) => x.json());
// → 共有の URL: https://exiledesk.com/?page=sim-tree&r=${r.id}
const got = await fetch(`${LIVE}/tree/${id}`).then((x) => (x.ok ? x.json() : null)); // got.tree が木
```

## 確かめ (10-22、手元の wrangler dev --local + 手元の D1)
- 1.3KB の木を保存 → id bbLkiWaZ、空白を詰めた同じ木も同じ id、GET で同じ木と name・1 年キャッシュ。
- 無い id 404、形の違う id 400、JSON でない 400、配列 400、33KB 413。
- 別々の木を続けて送ると 20 本目まで 200・21 本目から 429、429 の間もある木は 200。
- 本番の D1 に表を作る (`wrangler d1 migrations apply exiledesk-logs --remote` か 0008 を execute) のと worker の出し直しは、ブラックの OK の後。

## X のカード (案)
- 画面は 1 枚の HTML (SPA) なので、?page=sim-tree&r= のままでは木の名前をカードに出せない。案: 共有の URL を `exiledesk.com/t/<id>` にし、server/web (分析君) が `/t/*` で木の name を og:title にした小さな HTML を返して `/?page=sim-tree&r=<id>` へ移す (スパムの /s/<id> と同じ形、run_worker_first に `/t/*` を足す)。

## 開発版 (web-dev) から本番に触らずに使う形 (案、10-22。オーナー「シミュレーターはまだ開発版」で本番には出さない。作るのは指示の後)
- 今: 開発用の別の worker は無い (wrangler.sim.jsonc も name は本番と同じ exiledesk-live)。開発版の Web も本番のサーバー (src/web/config.ts の WEB_API_BASE、VITE_WEB_API で替えられる) を見ている。
1. **おすすめ**: 開発用の別の worker (仮 exiledesk-live-dev、workers.dev だけ・cron なし) + 別の D1 (仮 exiledesk-dev、tree_shares だけ) を作る。開発版のビルドはツリーの保存・取り出しだけその住所を見る (ほかの /boot.json・/log は本番のまま)。オーナーが開発版で共有を試せ、本番の worker・D1 は触らない。作るのは分析君 (Cloudflare に worker と D1 を 1 つずつ足すので OK が要る)、画面の住所の切り替えはシミュ部長。
2. 手元の wrangler dev (手元の D1) だけで、シミュ部長が手元の画面 (1440) から作る。何も作らないが、開発版 (web-dev) からは届かないのでオーナーは開発版で試せない。
