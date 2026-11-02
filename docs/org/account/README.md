# アカウント部長 (11-03 夜に新しく、オーナー「アカウント管理部長とかね」)

スマホと PC を引き継ぎコードでつなぐ共通アカウント (ログインなし・個人の情報なし) を持つ。決まりの正は設計図 `docs/spec/account.md` (A-xx)。下は地図だけ。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 持ち物は A-80 の行 (owners.txt に入るまでは案)。index.ts のつなぎ・types.ts の Env・secret はサーバー管理人、tree-recipes.ts はシミュ部長、設定の窓の置き場とスイッチはデザイン部長へ頼む。
2. 本番の D1 に migration を当てる・Worker を出す・secret `ACCOUNT_PEPPER` を入れるのはオーナーの OK の後 (Y-75)。手元は `wrangler dev --var ACCOUNT:on` だけ。
3. 取り物は押した時の 1 回だけ (A-42・Y-100)。個人の情報を持たない (A-02)。

## 地図
- サーバー: server/live/src/account.ts (/account/*)・migrations/0014_accounts.sql。
- 端末: src/account/account-client.ts (札と口)・account-sync.ts (localStorage と同期の間、運び手 = Carrier)。画面からはまだ呼ばない。
- 見張り: `node scripts/account-smoke.mjs` (手元の wrangler dev で端末の重ね方と口を 22 項目、最後に子まで止める)。
- UI 案: notes/2026-11-03-account-ui-ab.html (`#1A`〜`#5B`、5 か所 × A/B。スマホは窓の幅を 390 に)。絵と一覧は共有メモ account-ui/index.html。
- 復元: `node scripts/account-restore.mjs --fb <要望の id> [--pick <id>]` (既定は手元、本番は --remote、A-72)。
- 画面用の口: src/account/use-account.ts (5 か所の操作・コピーするまで閉じない・保存の後の 5 秒まとめ)。重ね方は account-merge.ts (見張りが node で読む)。
