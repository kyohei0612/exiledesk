# 開発部長 (常駐のまとめ役)

ブラックから開発の仕事を全部受け、部長に振る。誰がどのファイルを触っているか (dev/todo.md の表) を持ち、同じファイルの仕事は同じ部長に順に、違うファイルの物だけ並べる。push・デプロイ (deploy:web-dev・deploy:web・版上げ) は開発部長。自分の持ち物は土台 (ビルド・デプロイ・版上げ・共通の部品・英語・サーバー) と部どうしの境目。下の決まりは全部の部の決まり (CLAUDE.md・メモ MEMORY.md の「必ず守る」が先)。

## 決まり (全部の部)
1. 部長は常駐 (部ごとに 1 本、開きっぱなし)。仕事はブラック → 開発部長 → 部長で来る。部長どうし・ブラックへ直に頼まない (要る時は開発部長へ)。新しいセッションが要る時も開発部長 → ブラック (合図で起きたターンでは立てられない)。
2. 同じファイルは同じ部長が順に (階段式、並べない)。始める前に触るファイルを開発部長に 1 行、開発部長が dev/todo.md の「触っている」に書き、ぶつかる物は待たせる。
3. 始める前に完成の形を 3 行 (何が変わる・どのファイル・何で確かめる)。読む物は自分の部の README の地図から grep・台本で絞り、絞った物は全部読む。数字は台本で出し、台本の場所と一緒に。
4. 直しは小さく 1 つずつ、そのたび型チェック。周りのコードに合わせる。リファクタと機能は別のコミット、整理は触った所の周りだけ、使わなくなった物はその場で消す。
5. commit は自分が触ったパスだけ、`git commit -m "…" -- <パス>` の 1 回で (index は皆で共有。先に add して置くと他人の commit に混ざる、10-20 に起きた)。`git add -A`・`git add .`・引数なしの `git commit`・stash・reset・ブランチ替えは禁止。同じファイルに他人の書きかけがあれば commit せず開発部長へ。push・デプロイは開発部長。
6. 他の部の持ち物は直さない。要る時はどの部のどのファイルかを書いて返す。MOD の置き場・重み・段・文、カレンシーとお告げの効果、確率、品質・聖別の式はエンジン部のエンジンの入口 (services/craft-stage/engine.ts) から取り、自前の表・式・重みの足し算を作らない (足りない物はジン部長に入口へ足してもらう)。
7. 境目 (下の地図) を変えたら、使っている部を報告に書く (開発部長が知らせる)。
8. 報告は 3〜5 行 (変えた物・commit・確かめた物 (見張り / 外の正解 / 画面)・残り) を開発部長に SendMessage、中身は自分の部の todo.md・notes/。ターンの終わりは必ず「終わった / 待つ理由」を 1 行 (日本語、黙って止まらない)。開発部長はまとめてブラックに 1 行。
9. 仕事の終わりに自分の部の README.md の地図を直す。記録 (設計・調べ) は notes/、やる事・OK 待ちは todo.md。常駐が重くなったら todo.md・notes/ に引き継ぎを書き、開発部長に入れ替えを頼む。
10. ファイルの管理が難しければ部下 (サブエージェント) を作ってよい。同じファイルを 2 人で触らせず、作った物は報告に書く。プラグインも要ればリサーチして入れてよい (公式・組織カタログ優先)。

## 地図
- 動かし方・版上げ: CLAUDE.md の「動かし方」。設定 vite.web.config.ts、開発版 scripts/deploy-web-dev.mjs (commit 済みの HEAD を隣の ../ExileDesk-devbuild (git worktree) でビルド、書きかけは入らない。`-- --wip` で作業中の物)、読み物のページ scripts/build-seo-pages.mjs。
- 更新内容: src/data/changelog-notes.json・-en.json・changelog-popup.json → scripts/build-changelog.mjs。OK 待ち docs/pending-release.md。テスト tests/ (vitest)。
- 境目 (どの部も使う): src/state/craft-stage.ts (`SIM_LOCKED`)・web-page.ts・display-currency.ts、src/services/craft-stage/share.ts・trade-search.ts、src/services/htc/patch-types.ts・src/services/money.ts、src/style.css・src/styles/game-ui.css、src/components/・src/utils/、src/web/ (WebApp.vue・main.ts・page.ts・boot.ts・config.ts)。
- エンジンの核 (types.ts・run-plan.ts・contract.ts・乱数 htc/rng.ts) は境目ではなくエンジン部の持ち物 (emulator/README.md の地図)。
- 動画 (video/、旧 POE2Tube) との受け渡し (動画部長と): 録画モード src/utils/rec-mode.ts (`?rec=1`・seed・`__rec`)、撮影 URL・`data-rec` の目印、JSON の形 (正は video/contracts/、ExileDesk 側 contract.ts・scripts/craft-stage-run.mjs)。変える時は両方を同じ commit で、メモ poe2tube-handoff。video/ は CI (tests.yml の paths-ignore)・vite の watch・tailwind (@source not) から外してある。
- 英語: src/i18n/lang.ts (`tr`・`modText`・`nameOf`)・GLOSSARY.md・*-client.json。
- サーバー: server/web (og-card.js・dev-gate.js・move-gate.js・wrangler*.jsonc)、server/live (README.md・src/index.ts・market.ts・logs.ts・feedback.ts・monitor.ts・migrations/)。
- メモ: 出し方 feedback-backstage-release・feedback-changelog-popup・feedback-replies / UI の決まり MEMORY.md の「UI の決まり」/ 英語 web-english / 広告 ads-page-model・web-ads-domain-plan / 確かめ feedback-verify-by-code・feedback-test-strategy・stop-processes-by-pid / 外の API api-probing-policy。
- docs: ARCHITECTURE.md・roadmap-2026-10.md・decisions/。決着済み: 上のメモ・GLOSSARY.md。
