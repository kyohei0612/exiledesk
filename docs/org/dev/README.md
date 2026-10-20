# 開発部長

土台 (ビルド・デプロイ・版上げ・共通の部品・英語・サーバー) と、部どうしの境目の持ち主。下の決まりは全部の部の決まり (CLAUDE.md・メモ MEMORY.md の「必ず守る」が先)。

## 決まり (全部の部)
1. 始める前に完成の形を 3 行 (何が変わる・どのファイル・何で確かめる)。書けなければ聞き返す。
2. 読む物は自分の部の README.md の地図から。grep・台本で絞り、絞った物は抜き出しでなく全部読む。
3. 数字は台本で出す (手で写さない)。報告の数字は出した台本の場所と一緒に。
4. 直しは小さく 1 つずつ、そのたび型チェック。周りのコードに合わせる。
5. リファクタと機能は別のコミット。整理は触った所の周りだけ、使わなくなった物はその場で消す。
6. 他の部の持ち物は直さない。要る時はどの部のどのファイルかを書いて返す。
7. 境目 (下の地図) を変えたら、使っている部を報告に書く (ブラックが知らせる)。
8. 報告は 3〜5 行: 変えた物・確かめた物 (見張り / 外の正解 / 画面)・残り。
9. 仕事の終わりに自分の部の README.md の地図を直す (ファイルが増えた・消えた・動いた時)。仕事の記録 (設計・調べ) は自分の部の notes/ に、やる事・OK 待ちは todo.md に。
10. ファイルの管理が難しければ部下 (サブエージェント・下のセッション) を作ってよい。同じファイルを 2 人で触らせず、作った物は報告に書く。プラグインも要ればリサーチして入れてよい (公式・組織カタログ優先)。

## 地図
- 動かし方・版上げ: CLAUDE.md の「動かし方」。設定 vite.web.config.ts、開発版 scripts/deploy-web-dev.mjs、読み物のページ scripts/build-seo-pages.mjs。
- 更新内容: src/data/changelog-notes.json・-en.json・changelog-popup.json → scripts/build-changelog.mjs。OK 待ち docs/pending-release.md。テスト tests/ (vitest)。
- 境目 (どの部も使う): src/state/craft-stage.ts (`SIM_LOCKED`)・web-page.ts・display-currency.ts、src/services/craft-stage/types.ts・run-plan.ts・contract.ts・share.ts・trade-search.ts、src/services/htc/patch-types.ts・src/services/money.ts、src/style.css・src/styles/game-ui.css、src/components/・src/utils/、src/web/ (WebApp.vue・main.ts・page.ts・boot.ts・config.ts)。
- 動画 (video/、旧 POE2Tube) との受け渡し (動画部長と): 録画モード src/utils/rec-mode.ts (`?rec=1`・seed・`__rec`)、撮影 URL・`data-rec` の目印、JSON の形 (正は video/contracts/、ExileDesk 側 contract.ts・scripts/craft-stage-run.mjs)。変える時は両方を同じ commit で、メモ poe2tube-handoff。video/ は CI (tests.yml の paths-ignore)・vite の watch・tailwind (@source not) から外してある。
- 英語: src/i18n/lang.ts (`tr`・`modText`・`nameOf`)・GLOSSARY.md・*-client.json。
- サーバー: server/web (og-card.js・dev-gate.js・move-gate.js・wrangler*.jsonc)、server/live (README.md・src/index.ts・market.ts・logs.ts・feedback.ts・monitor.ts・migrations/)。
- メモ: 出し方 feedback-backstage-release・feedback-changelog-popup・feedback-replies / UI の決まり MEMORY.md の「UI の決まり」/ 英語 web-english / 広告 ads-page-model・web-ads-domain-plan / 確かめ feedback-verify-by-code・feedback-test-strategy・stop-processes-by-pid / 外の API api-probing-policy。
- docs: ARCHITECTURE.md・roadmap-2026-10.md・decisions/。決着済み: 上のメモ・GLOSSARY.md。
