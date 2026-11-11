# ExileDesk — 作業ごとに読む物 (地図)

PoE2 のクラフトのエミュレーター (Web が本番、アプリは当分触らない = G-07)。毎回読み込まれるので地図だけ・60 行まで。
役目は 1 つずつ (10-29): 決まりの正 = 設計図 `docs/spec/`、守らせる仕組み = フック (設計図 README ⑥)、メモ = 設計図に無い経緯・オーナーの好み・外の置き場、ここ = 地図。
メモ = `~/.claude/projects/C--Users-kyohei-ExileDesk/memory/` の <名前>.md (古い物は `memory-archive-1029/`、一覧は INDEX.md)。

## いつも
- 確認用の Chrome は窓なしで 1 つ、新しいページを開かず今ある空のページを使う (G-26d)。片付けは G-36。
- フックは repo の `.claude/hooks/` (登録は `.claude/settings.json`)。セッションの最初に「【フック】ExileDesk の見張りが入っている」が出なければ、その PC はフックが入っていない (ブラックへ)。フックと登録の書き換えは印が要る (G-48)。
- 1 ファイル 500 行まで (G-26d)。全体の地図は docs/ARCHITECTURE.md、計画は docs/roadmap-2026-10.md。
- AI の組織 (ブラック・部長・係) = docs/org/。部長・係は自分の部の docs/org/<部>/README.md を先に読む (記録は notes/、やる事は todo.md)。

## 決まりの正 = 設計図 `docs/spec/`
全体 README.md (大本 G-01〜08・進め方 G-20〜26・フック済み G-30 から)・system.md (Y)・engine.md (E)・emu.md (M)・sim-tree.md と sim-tree-k.md (S)・tutorial.md (T)・shared-ui.md (U)・release.md (R)・daily.md (D)。経緯の記録は `docs/spec/history/`。新しい事は「設計図に書く → オーナーの OK → 作る → 同じ commit で設計図を直す」(G-20)。メモ・docs/org は経緯、食い違ったら設計図が正。

## 作業 → 先に読む物
| 作業 | 読む物 |
|---|---|
| データ・エンジン: カレンシー・お告げの動き (spec/・parts.ts・入口 engine.ts) | engine.md (E-xx)、docs/org/emulator/README.md (ジン部長)、docs/decisions/004-currency-as-description.md、docs/reviews/2026-10-17-rule-checklist.md、メモ craft-pointers・pref-truth |
| MOD の置き場・重み・段・部位・ベースの有無 | E-01〜19、メモ craft-pointers・pref-truth・craft-weight-sources |
| 確率の表・次の手で狙う | E-80〜88・M-30〜34、メモ craft-pointers・screen-pointers |
| スパムシミュレーター・音・X シェア | M-60〜65、メモ screen-pointers |
| エミュの画面 (UI、views/craft-stage) | emu.md (M-xx)、docs/org/emu/README.md、docs/decisions/001-craft-stage.md、メモ screen-pointers |
| チュートリアル・コース | tutorial.md (T-xx) |
| デイリー (クラフトチャレンジ) | daily.md (D-xx)、docs/org/daily/README.md、docs/craft-challenge.md、メモ screen-pointers |
| シミュレーター (ツリー) | sim-tree.md・sim-tree-k.md (S-xx)、docs/org/simulator/README.md |
| 両方の画面で一緒の部品 (for-share)・画面の挙動 (web/・composables・utils)・見た目 | shared-ui.md (U-xx)、docs/org/design/README.md、メモ screen-pointers |
| 出す前の猿 (モンキー) | R-18・R-18c (最終チェック長) |
| 英語の画面・用語 | U-60〜62・Y-80〜83、src/i18n/GLOSSARY.md、メモ screen-pointers |
| リリース・更新内容・要望の返事 | release.md (R-xx)、docs/pending-release.md、メモ feedback-replies |
| サーバー (server/live・server/web)・分析の記録 | system.md (Y-xx)、server/live/README.md、メモ analytics-logs |
| 広告・ドメイン・SEO のページ | Y-10〜25、メモ web-ads-domain-plan、scripts/build-seo-pages.mjs |
| テストを足す・直す | G-22・R-19・G-26d、メモ pref-truth |
| 動画・撮影・POE2Tube (video/) | video/ (CLAUDE.md)、メモ pref-video・video-channel、受け渡しの正は video/contracts/ |
| YouTube の字幕・外の調べもの | docs/org/research/、メモ youtube-subtitles |
| アプリ・PoB・取引所・ヴァールの天秤 (当分触らない) | `memory-archive-1029/INDEX.md`、docs/archive/README-app-2026-10.md |

## 動かし方
- 開発: `pnpm dev:web` は preview_start の "web" (port 1440)。Web 版は http://localhost:1440/web.html (`/` はアプリの入口)。
- 型: `pnpm -s exec vue-tsc --noEmit -p tsconfig.json`。テストはオーナーが言った時だけ (G-26d)。
- 環境は Y-70、出す前の確かめは G-21・R-18、オーナーの確かめは R-13。
- 版上げと出し方は R-06・R-08。本番の出しは印が無ければフックが止める (G-38)。
- 手元の本番の作り: `pnpm preview:prod -- --dev` → http://dev.exiledesk.localhost:1461/、`pnpm preview:prod` → http://exiledesk.localhost:1460/。使い方は R-09。
- Bash では `\` が 1 段消える。正規表現や `\` の入る物は Write / Edit で書く。
- 外は `git -C <path>` や絶対パスで (G-33)。scratchpad の台本は絶対パスで呼び、書き換えは Edit / Write で。
- sleep で待つ Bash の繰り返しをしない (cmd の窓がちらつく)。待つ物は run_in_background で 1 回立てて知らせを待つか、台本の中で待つ。
