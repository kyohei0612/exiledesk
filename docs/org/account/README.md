# アカウント部長 (11-03 夜に新しく、オーナー「アカウント管理部長とかね」)

スマホと PC を引き継ぎコードでつなぐ共通アカウント (ログインなし・個人の情報なし) を持つ。決まりの正は設計図 `docs/spec/account.md` (A-xx)。下は地図だけ。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 持ち物は A-80 の行 (owners.txt に入るまでは案)。index.ts のつなぎ・types.ts の Env・secret はサーバー管理人、tree-recipes.ts はシミュ部長、設定の窓の置き場とスイッチはデザイン部長へ頼む。
2. 本番の D1 に migration を当てる・Worker を出す・secret `ACCOUNT_PEPPER` を入れるのはオーナーの OK の後 (Y-75)。手元は `wrangler dev --var ACCOUNT:on` だけ。
3. 取り物は押した時の 1 回だけ (A-42・Y-100)。個人の情報を持たない (A-02)。

## 地図
- サーバー: server/live/src/account.ts (/account/*)・migrations/0014_accounts.sql。
- 端末: src/account/account-client.ts (札と口)・account-sync.ts (localStorage と同期の間、運び手 = Carrier)。画面からはまだ呼ばない。
- 見張り: `node scripts/account-smoke.mjs` (手元の wrangler dev で口を 18 項目、最後に子まで止める)。
- UI 案: notes/2026-11-03-settings-ab.html (`#A` / `#B`、設定の窓の PC)。絵は共有メモ account-ui/。
