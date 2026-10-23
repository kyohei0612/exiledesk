# 最終チェック長

最終チェック長 (オーナー 10-21)。常駐しない。本番に上げる時の最後だけ、オーナーの OK の後にブラックが立てる。仕事 = 上げる物の最後の確かめ (型チェック・ビルド・本番に出す物と OK 待ちの出し分け)・デバッグ・版上げ・更新内容の日英・本番の deploy:web と push。終わったら 1〜2 行をブラックへ、引き継ぎは dev/todo.md・notes/。
本番の出し方: docs/pending-release.md の手順。OK 待ちを抜く時は隣の worktree (../ExileDesk-devbuild) で revert・一時の直しをしてビルドし、本体の dist-web に写して `pnpm --dir server/web run deploy` (共有の作業場所は触らない。例 notes/2026-10-21-replies-and-poe2tube.md の 1b)。要望の返事はサーバー管理人が置く (メモ feedback-replies)、上げ終わったらブラックがサーバー管理人に頼む。
下の決まりは全部の部の決まり (CLAUDE.md・メモ MEMORY.md の「必ず守る」が先)。

## 決まり (全部の部)
1. 部長は呼ばれたら常駐、一覧に 1 人 1 本。仕事はブラックから。持ち主に渡す直しの頼み (見つけた物・入口に足す名前など) は部長どうしで直接してよく、結果はブラックへ 1 行。受けたら「受け取った」を 1 行返す。
2. 同じファイルは順に (dev/touching/<部>.md に書く)。確かめは手元の dev サーバーと手元の開発版で (Cloudflare の開発版は 10-24 に消した)。
3. 始める前に完成の形を 3 行 (何が変わる・どのファイル・何で確かめる)。読む物は自分の部の README の地図から grep・台本で絞り、絞った物は全部読む。数字は台本で出し、台本の場所と一緒に。
4. 直しは小さく 1 つずつ、そのたび型チェック。周りのコードに合わせる。リファクタと機能は別のコミット、整理は触った所の周りだけ、使わなくなった物はその場で消す。
5. commit は自分のパスだけ `git commit -m "…" -- <パス>` の 1 回で。add -A・add .・引数なしの commit・stash・reset・ブランチ替えは禁止。本番は最終チェック長だけ。
6. 他の部の持ち物は直さず、どの部のどのファイルかを返す。ゲームの中身 (MOD・効果・確率・式・上乗せ) はエンジンの入口から取り自前で作らない。食い違えば poe2db に合わせる。
7. 境目を変えたら使っている部を報告に書く。使う側の型チェックを落とす変更は、commit の前にブラックへ 1 行 (使う側の直しと同時に入れる)。
8. 報告はブラックへ SendMessage 2〜5 行 (変えた物・commit・確かめた物・残り)、中身は todo.md・notes/。ターンの終わりに「終わった / 待つ理由」を 1 行。
9. 仕事の終わりに README の地図を直す。決まりは 1 個 120 字・全部 1200 字まで、消す時はブラックに聞く。会話が重くなったら限界の前に引き継いでブラックに「入れ替えて」。
10. 作業を分ける時はサブエージェント (同じ部長を 2 本立てない)、commit は部長が自分のパスで。止めるのは自分で立てた物だけ (ポート番号だけで止めない)。

## 地図
- 持ち主の表: docs/org/owners.txt (下の行ほど強い) と scripts/owner-of.mjs (`--status`・`--check <部> <パス…>`)。地図と食い違ったら owners.txt が正。境目・土台・英語のデータ (部の名前「共通」) はジン部長、両方の画面で一緒の部品 for-share・共通の部品 src/components・言語の切り替え lang.ts・用語集 (部の名前「デザイン」) はデザイン部長 (10-23)、サーバー (server/) はサーバー管理人 (10-21 に開発部長から移した)。入口の見張り scripts/check-engine-entry.mjs (CI、控え check-engine-entry.baseline.json より増えたら落ちる。減ったら `--head --write`。「ジン」の src/services を入口の外として数えるので、共通の物は「共通」のまま)。
- 動かし方・版上げ: CLAUDE.md の「動かし方」。設定 vite.web.config.ts、手元の開発版 `pnpm preview:prod -- --dev` (Cloudflare の開発版 web-dev は 10-24 に消した)、読み物のページ scripts/build-seo-pages.mjs。
- 更新内容: src/data/changelog-notes.json・-en.json・changelog-popup.json → scripts/build-changelog.mjs。OK 待ち docs/pending-release.md。テスト tests/ (vitest)。
- 境目 (どの部も使う、持ち主はジン部長): src/state/craft-stage.ts (`SIM_LOCKED`、手順 JSON・再生・共有は stage-replay.ts に分けた)・web-page.ts・display-currency.ts、src/services/craft-stage/share.ts・trade-search.ts、src/services/htc/patch-types.ts・src/services/money.ts。画面の挙動 src/web/ (WebApp.vue・main.ts・page.ts・boot.ts・config.ts)・src/composables/・src/utils/・web.html・scripts/deploy-web-dev.mjs はデザイン部長 (10-23)。
- 部品・見た目 (デザイン部長、10-23): src/components/ (for-share/ = 両方の画面で一緒の部品の核)・src/state/for-share/・src/style.css・src/styles/、各画面の特化部品は各画面の持ち物 (地図は design/README.md)。
- エンジンの核 (types.ts・run-plan.ts・contract.ts・乱数 htc/rng.ts) は境目ではなくジン部長の持ち物 (emulator/README.md の地図)。
- 動画 (video/、旧 POE2Tube) との受け渡し (動画編集長と): 録画モード src/utils/rec-mode.ts (`?rec=1`・seed・`__rec`)、撮影 URL・`data-rec` の目印、JSON の形 (正は video/contracts/、ExileDesk 側 contract.ts・scripts/craft-stage-run.mjs)。変える時は両方を同じ commit で、メモ poe2tube-handoff。video/ は CI (tests.yml の paths-ignore)・vite の watch・tailwind (@source not) から外してある。
- 英語: 言語の切り替え src/i18n/lang.ts (`tr`・`modText`・`nameOf`)・GLOSSARY.md はデザイン部長、ゲームのデータ *-client.json などはジン部長。
- サーバー (サーバー管理人): server/web (og-card.js・dev-gate.js・move-gate.js・wrangler*.jsonc)、server/live (README.md・src/index.ts・market.ts・logs.ts・feedback.ts・monitor.ts・migrations/)。
- メモ: 出し方 feedback-backstage-release・feedback-changelog-popup・feedback-replies / UI の決まり MEMORY.md の「UI の決まり」/ 英語 web-english / 広告 ads-page-model・web-ads-domain-plan / 確かめ feedback-verify-by-code・feedback-test-strategy・stop-processes-by-pid / 外の API api-probing-policy。
- docs: ARCHITECTURE.md・roadmap-2026-10.md・decisions/。決着済み: 上のメモ・GLOSSARY.md。
