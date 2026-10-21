# 最終チェック長

最終チェック長 (オーナー 10-21)。常駐しない。本番に上げる時の最後だけ、オーナーの OK の後にブラックが立てる。仕事 = 上げる物の最後の確かめ (型チェック・ビルド・本番に出す物と OK 待ちの出し分け)・デバッグ・版上げ・更新内容の日英・本番の deploy:web と push。終わったら 1〜2 行をブラックへ、引き継ぎは dev/todo.md・notes/。
本番の出し方: docs/pending-release.md の手順。OK 待ちを抜く時は隣の worktree (../ExileDesk-devbuild) で revert・一時の直しをしてビルドし、本体の dist-web に写して `pnpm --dir server/web run deploy` (共有の作業場所は触らない。例 notes/2026-10-21-replies-and-poe2tube.md の 1b)。要望の返事は分析君が置く (メモ feedback-replies)、上げ終わったらブラックが分析君に頼む。
下の決まりは全部の部の決まり (CLAUDE.md・メモ MEMORY.md の「必ず守る」が先)。

## 決まり (全部の部)
1. 部長は呼ばれたら常駐 (初めて仕事が来た時にブラックが立て、そのブラックの間は開きっぱなし)、一覧に部長 1 人 1 本。仕事はブラックから直接来る。部長どうしで直に頼まない (要る時はブラックへ)。新しいセッションが要る時もブラックへ (合図で起きたターンでは立てられない)。頼みを受けたら「受け取った」を 1 行返す。返事が無ければ、頼んだ側が次の区切りで dev/todo.md と照らして送り直す (10-20 に届かない事が続いた)。
2. 同じファイルは同じ部長が順に (階段式、並べない)。持ち主は docs/org/owners.txt (`node scripts/owner-of.mjs <パス>`、書きかけは `--status`)。始める前に触るファイルを自分の dev/touching/<部>.md に書き (自分のファイルだけ、10-22)、自分の commit で消す。ぶつかる時はブラックへ 1 行、ブラックが順番を決める。共有の物 (確認用の Chrome・devtools の Chrome・dev サーバーとポート・開発版へのデプロイ) も、使う前にブラックへ「使っていいか」を 1 行で聞き、終わったら「返した」を 1 行 (使用中の表は dev/todo.md の「共有の物の使用表」、書くのはブラック、空いたら知らせる。オーナー 10-22)。止めるのは自分で立てた物だけ (ポート番号だけで止めない)。
3. 始める前に完成の形を 3 行 (何が変わる・どのファイル・何で確かめる)。読む物は自分の部の README の地図から grep・台本で絞り、絞った物は全部読む。数字は台本で出し、台本の場所と一緒に。
4. 直しは小さく 1 つずつ、そのたび型チェック。周りのコードに合わせる。リファクタと機能は別のコミット、整理は触った所の周りだけ、使わなくなった物はその場で消す。
5. commit は自分が触ったパスだけ、`git commit -m "…" -- <パス>` の 1 回で (新しいファイルは同じ 1 行で `git add <パス> && git commit -m "…" -- <パス>`。index は皆で共有。先に add して置くと他人の commit に混ざる、10-20 に起きた)。`git add -A`・`git add .`・引数なしの `git commit`・stash・reset・ブランチ替えは禁止。同じファイルに他人の書きかけがあれば commit せずブラックへ。自分の commit の push と開発版 (`pnpm deploy:web-dev`) は仕事をした部長が開発ついでに。本番 (版上げ・deploy:web) は最終チェック長だけ。
6. 他の部の持ち物は直さない。要る時はどの部のどのファイルかを書いて返す。MOD の置き場・重み・段・文、カレンシーとお告げの効果、確率、品質・聖別の式、上乗せ (品質・ルーン・ソウルコア・側の効果) の割り戻しはエンジン部のエンジンの入口 (services/craft-stage/engine.ts) から取り、自前の表・式・重みの足し算を作らない (足りない物はジン部長に入口へ足してもらう)。poe2db とエンジンが食い違い、写しで決まらない物は全部 poe2db に合わせる (オーナーに聞かない、10-20)。MOD の数字は上乗せを抜いた素の値と段で出し、盛った値は要る所でだけ小さく添える (オーナー 10-20)。
7. 境目 (下の地図) を変えたら、使っている部を報告に書く (ブラックが知らせる)。入口・返す型など、使う側の型チェックを落とす変更は commit の前にブラックへ 1 行 (使う側の直しと同じ時に入れる。main は 1 本なので、commit した物は後ろの push で一緒に出てしまう、10-20 に起きた)。
8. 結果の報告は 2〜5 行 (変えた物・commit・確かめた物 (見張り / 外の正解 / 画面)・残り) をブラックへ直接 SendMessage、中身は自分の部の todo.md・notes/。ターンの終わりは必ず「終わった / 待つ理由」を 1 行 (黙って止まらない)。部長どうし・ブラックへは英語でもよい、オーナーに出る物 (画面・更新内容) は日本語 + 英語版。
9. 仕事の終わりに自分の部の README.md の地図を直す。決まりを足す時は、追記・今の行の直し・まとめて 1 行のどれかで 10 行に収める (削る物が決められない時は案を付けてブラックに聞く、勝手に古い決まりを消さない)。記録 (設計・調べ) は notes/、やる事・OK 待ちは todo.md。自分のコンテキストは自分で見張る: 会話が重くなった (要約が入った・長い仕事が 1 つ終わった区切り・決まりを守れなかった) と自分で判断したら、言われる前に todo.md・notes/ に引き継ぎを書き、ブラックに「入れ替えて」を 1 行 (ブラックが次のオーナーの発言のターンで新しい部長を立て、宛先を渡してから古い方をアーカイブ。アーカイブはブラックが適宜自由に、オーナー 10-22)。
10. 部長の中で作業を分けたい時 (トークン・待ちの都合) は部長の判断でサブエージェント (Agent) を使ってよい。同じ部長のセッションは 2 本立てない (別のセッションの一時の係が要る時はブラックに 1 行、題は「<部>；<作業名>」で常駐は付けない)。同じファイルを 2 人で触らせず、サブエージェントの commit も部長が自分のパスで、作った物は報告に書く。プラグインも要ればリサーチして入れてよい (公式・組織カタログ優先)。

## 地図
- 持ち主の表: docs/org/owners.txt (下の行ほど強い) と scripts/owner-of.mjs (`--status`・`--check <部> <パス…>`)。地図と食い違ったら owners.txt が正。共通の部品・英語 (部の名前「共通」) はジン部長、サーバー (server/) は分析君 (10-21 に開発部長から移した)。入口の見張り scripts/check-engine-entry.mjs (CI、控え check-engine-entry.baseline.json より増えたら落ちる。減ったら `--head --write`。「ジン」の src/services を入口の外として数えるので、共通の物は「共通」のまま)。
- 動かし方・版上げ: CLAUDE.md の「動かし方」。設定 vite.web.config.ts、開発版 scripts/deploy-web-dev.mjs (commit 済みの HEAD を隣の ../ExileDesk-devbuild (git worktree) でビルド、書きかけは入らない。`-- --wip` で作業中の物)、読み物のページ scripts/build-seo-pages.mjs。
- 更新内容: src/data/changelog-notes.json・-en.json・changelog-popup.json → scripts/build-changelog.mjs。OK 待ち docs/pending-release.md。テスト tests/ (vitest)。
- 境目 (どの部も使う、持ち主はジン部長): src/state/craft-stage.ts (`SIM_LOCKED`、手順 JSON・再生・共有は stage-replay.ts に分けた)・web-page.ts・display-currency.ts、src/services/craft-stage/share.ts・trade-search.ts、src/services/htc/patch-types.ts・src/services/money.ts、src/style.css・src/styles/game-ui.css、src/components/・src/utils/、src/web/ (WebApp.vue・main.ts・page.ts・boot.ts・config.ts)。
- エンジンの核 (types.ts・run-plan.ts・contract.ts・乱数 htc/rng.ts) は境目ではなくエンジン部の持ち物 (emulator/README.md の地図)。
- 動画 (video/、旧 POE2Tube) との受け渡し (動画編集長と): 録画モード src/utils/rec-mode.ts (`?rec=1`・seed・`__rec`)、撮影 URL・`data-rec` の目印、JSON の形 (正は video/contracts/、ExileDesk 側 contract.ts・scripts/craft-stage-run.mjs)。変える時は両方を同じ commit で、メモ poe2tube-handoff。video/ は CI (tests.yml の paths-ignore)・vite の watch・tailwind (@source not) から外してある。
- 英語 (ジン部長): src/i18n/lang.ts (`tr`・`modText`・`nameOf`)・GLOSSARY.md・*-client.json。
- サーバー (分析君): server/web (og-card.js・dev-gate.js・move-gate.js・wrangler*.jsonc)、server/live (README.md・src/index.ts・market.ts・logs.ts・feedback.ts・monitor.ts・migrations/)。
- メモ: 出し方 feedback-backstage-release・feedback-changelog-popup・feedback-replies / UI の決まり MEMORY.md の「UI の決まり」/ 英語 web-english / 広告 ads-page-model・web-ads-domain-plan / 確かめ feedback-verify-by-code・feedback-test-strategy・stop-processes-by-pid / 外の API api-probing-policy。
- docs: ARCHITECTURE.md・roadmap-2026-10.md・decisions/。決着済み: 上のメモ・GLOSSARY.md。
