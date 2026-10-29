# ExileDesk — 作業ごとに読む物 (地図)

PoE2 のクラフトのエミュレーター (Web が本番、アプリは当分触らない = G-07)。毎回読み込まれるので地図だけ・60 行まで。
役目は 1 つずつ (10-29): 決まりの正 = 設計図 `docs/spec/`、守らせる仕組み = フック (設計図 README ⑥ G-30〜39)、メモ = 設計図に無い経緯・オーナーの好み・外の置き場、ここ = 地図。
メモ = `~/.claude/projects/C--Users-kyohei-ExileDesk/memory/` の <名前>.md (古い物は `memory-archive-1029/`、一覧は INDEX.md)。

## いつも
- 返事は日本語。確認はスクリプトで (メモ feedback-verify-by-code)、見せるなら Chrome 1 タブ。
- 確認のスナップは Chrome を窓なし (headless) で 1 つだけ (new_page しない・isolatedContext を付けない、今ある about:blank に navigate_page)。終わったら確認用の Chrome ごと閉じる (コマンドラインに chrome-devtools-mcp を含む chrome.exe だけ)、手元で立てたサーバーも止める。スクリーンショットは見終わったら・送った後にすぐ消す (ゴミ箱を通さない)。残りは返事の終わりにフックが知らせる (G-36)。
- 1 ファイル 500 行まで。全体の地図は docs/ARCHITECTURE.md、計画は docs/roadmap-2026-10.md。
- AI の組織 (ブラック・部長・係) = docs/org/。部長・係は自分の部の docs/org/<部>/README.md を先に読む (記録は notes/、やる事は todo.md)。

## 決まりの正 = 設計図 `docs/spec/`
全体 README.md (大本 G-01〜08・進め方 G-20〜25・フック済み G-30〜39)・system.md (Y)・engine.md (E)・emu.md (M)・sim-tree.md (S)・tutorial.md (T)・shared-ui.md (U)・release.md (R)。新しい事は「設計図に書く → オーナーの OK → 作る → 同じ commit で設計図を直す」(G-20)。メモ・docs/org は経緯、食い違ったら設計図が正。

## 作業 → 先に読む物
| 作業 | 読む物 |
|---|---|
| データ・エンジン: カレンシー・お告げの動き (spec/・parts.ts・入口 engine.ts) | engine.md (E-xx)、docs/org/emulator/README.md (ジン部長)、docs/decisions/004-currency-as-description.md、docs/reviews/2026-10-17-rule-checklist.md、メモ poe2-craft-rules-confirmed・feedback-check-settled-rules |
| MOD の置き場・重み・段・部位・ベースの有無 | E-01〜19、メモ mod-engine-single-source・feedback-verify-with-poe2db・craft-weight-sources・item-classes-from-client・poe2-client-data-source |
| 確率の表・次の手で狙う | E-80〜82・M-30〜34、メモ held-odds-parity・aim-next-move |
| スパムシミュレーター・音・X シェア | M-60〜65、メモ chaos-spam-and-sfx |
| エミュの画面 (UI、views/craft-stage) | emu.md (M-xx)、docs/org/emu/README.md、docs/decisions/001-craft-stage.md、メモ craft-stage-feature |
| チュートリアル・コース・クラフトチャレンジ | tutorial.md (T-xx)、docs/decisions/003-quiz-recipe.md、docs/craft-challenge.md、メモ quiz-recipe・craft-challenge |
| シミュレーター (ツリー) | sim-tree.md (S-xx)、docs/org/simulator/README.md、docs/decisions/002-play-recipe.md |
| 両方の画面で一緒の部品 (for-share)・画面の挙動 (web/・composables・utils)・見た目 | shared-ui.md (U-xx)、docs/org/design/README.md、メモ org-roles-2026-10-23・game-ui-art-direction・web-phone-layout |
| 開発版を乱暴に触る (モンキー) | R-18、docs/org/monkey/README.md (指示待ち) |
| 英語の画面・用語 | U-60〜62・Y-80〜83、src/i18n/GLOSSARY.md、メモ web-english |
| リリース・更新内容・要望の返事 | release.md (R-xx)、docs/pending-release.md、メモ feedback-replies |
| サーバー (server/live・server/web)・分析の記録 | system.md (Y-xx)、server/live/README.md、メモ analytics-logs |
| 広告・ドメイン・SEO のページ | Y-10〜25、メモ web-ads-domain-plan、scripts/build-seo-pages.mjs |
| テストを足す・直す | G-22・R-19、メモ feedback-test-strategy・feedback-tests-need-external-truth |
| 動画・撮影・POE2Tube (video/) | docs/org/video/、メモ video-*・poe2tube-handoff |
| YouTube の字幕・外の調べもの | docs/org/research/、メモ youtube-subtitles・competitor-poe2-craft-beta |
| アプリ・PoB・取引所・ヴァールの天秤 (当分触らない) | `memory-archive-1029/INDEX.md`、docs/archive/README-app-2026-10.md |

## 動かし方
- 開発: `pnpm dev:web` は preview_start の "web" (port 1440)。Web 版は http://localhost:1440/web.html (`/` はアプリの入口)。
- 型: `pnpm -s exec vue-tsc --noEmit -p tsconfig.json`。テストはオーナーが言った時だけ (メモ feedback-test-strategy)。
- 環境は Y-70 (作る・確かめる・見張り・モンキーは dev 1440、手元の本番の作り 1460 / 1461 は出す直前の 1 回だけ・同時に 1 つまで)。オーナーの確かめは R-13 (ブラックが「確認して」と言った時だけ 1440)。
- 版上げと出し方は R-06・R-08。本番の出しは印が無ければフックが止める (G-38)。
- 手元の本番の作り: `pnpm preview:prod -- --dev` → http://dev.exiledesk.localhost:1461/、`pnpm preview:prod` → http://exiledesk.localhost:1460/。出す直前の照らし用 (R-09)。
- Bash では `\` が 1 段消える。正規表現や `\` の入る物は Write / Edit で書く。
- Bash で `cd` をつながない (許可の窓で夜中に止まる。フックが止める = G-33)。外は `git -C <path>` や絶対パスで。scratchpad の台本は絶対パスで呼び、書き換えは Edit / Write で。
- sleep で待つ Bash の繰り返しをしない (cmd の窓がちらつく)。待つ物は run_in_background で 1 回立てて知らせを待つか、台本の中で待つ。
