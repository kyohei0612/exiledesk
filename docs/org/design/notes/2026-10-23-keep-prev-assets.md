# 本番でも 1 つ前の版の塊を残す案 (デザイン部長 2 本目、10-23)

次の本番の時に、最終チェック長と分析君 (server/web の持ち主) に渡す。開発版は 09b0d2b5 で入れて確かめ済み。

## なぜ
- 出した直後の 40 秒ほどは、Cloudflare が古い版と新しい版を入れ替わりで返す (開発版の見張りで見た)。古い index.html に当たると前の版の塊を取りに行き、それが消えていると 404。
- 開いたままのタブも、後から読む部品で前の版の塊を取る。
- 2e952b59 の読み直し (web.html の `__staleReload`) で直るようにはしたが、読み直しは 1〜2 回出る。塊が残っていれば 404 そのものが起きない。

## 開発版でやった形 (scripts/deploy-web-dev.mjs)
1. ビルドの前: 前に出した版の「自分の分」の一覧 (node_modules/.cache/exiledesk-dev-web-assets.json) を読み、その塊を dist-web-dev/assets から OS の一時フォルダーへ退避。一覧が無い初回は、今ある assets/ を全部前の版と見る。
2. vite build (OUT を空にする)。
3. 今の版の assets/ の一覧を書き、退避した前の版の塊のうち、今の版に無い物だけを足す。
- 残るのは 1 つ前の版の自分の分だけ。その版が残していたさらに前の分は落ちるので、膨らまない (43 本 + 27 本 = 70 本、3 回出しても 70 本)。
- 確かめ (10-23): 1 回目の版で開いたタブで 2 回目 (塊の名前が替わる) の後にツリーへ移る → 404 0・読み直し 0・エラー 0。出して 1 分後も 1 回目の版の塊を直に取って 200。

## 本番に入れる案
- 退避と足し込みを scripts/keep-prev-assets.mjs (`save <OUT> <名前>` / `restore <OUT> <名前>`) に切り出す。開発版の台本もそれを呼ぶ形に寄せる (同じ作りを 1 つに)。
- package.json の build:web を `node scripts/keep-prev-assets.mjs save dist-web web && vue-tsc … && vite build … && node scripts/keep-prev-assets.mjs restore dist-web web && …(後の台本)` に。deploy:web はそのまま (`pnpm --dir server/web run deploy` が dist-web をまるごと上げる)。
- OK 待ちを抜いて出す時 (docs/pending-release.md、隣の worktree でビルドして本体の dist-web に写す) は、写す時に dist-web/assets を消さずに上書きで写す。または写した後に restore を呼ぶ。消してから写すと前の版が残らない。
- 一覧は手元 (node_modules/.cache) にあるので、出す端末が替わると初回扱い (今ある dist-web/assets を全部前の版と見る)。dist-web が空なら何も残らない = 今と同じで、壊れはしない。
- 大きさ: 本番の assets は 10 MB 前後、2 つ分でも Cloudflare の静的ファイルの上限 (1 本 25 MiB・2 万本) より十分小さい。既に上げてある物は wrangler が上げ直さない (開発版で「already uploaded」)。

## 持ち主
- package.json (build:web・deploy:web) = 共通 (ジン部長)、docs/pending-release.md (出し方の手順) = 最終チェック長、server/web = 分析君 (owner-of.mjs で引いた、10-23)。scripts/keep-prev-assets.mjs を作るなら、開発版の台本と同じくデザインで持てる。案を受けるかは、ブラックと最終チェック長が決める。
