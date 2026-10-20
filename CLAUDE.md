# ExileDesk — 作業ごとに読む物

PoE2 のクラフトのエミュレーター (Web が本番、アプリは当分触らない)。毎回読み込まれるので短く保つ (60 行まで)。
メモ = `~/.claude/projects/C--Users-kyohei-ExileDesk/memory/` の <名前>.md。docs = このリポジトリの docs/。

## いつも
- 返事は日本語。確認はスクリプトで、見せるなら Chrome 1 タブ。リリースは版上げ + `pnpm deploy:web` (UI はオーナーの OK の後)。
- 確認のスナップは Chrome を窓なし (headless) で 1 つだけ立ち上げ (new_page しない・isolatedContext を付けない、今ある about:blank に navigate_page)、確認が終わったら確認用の Chrome ごと閉じる (コマンドラインに chrome-devtools-mcp を含む chrome.exe だけ止める。メモ feedback-close-test-pages)。手元で立てたサーバーも止める。
- 開発版に出す物は広告ありきで作る (クラフト画面以外は別のページ・両脇に縦長の枠。メモ ads-page-model)。
- スクリーンショットは見終わったらすぐ消す (ゴミ箱を通さない)。置き場は ~/.claude/projects/C--Users-kyohei-ExileDesk/<セッション>/tool-results と %TEMP%/claude/…/scratchpad・images。送った物も送った後に消す。
- 1 ファイル 500 行まで (超えるなら分ける)。全体の地図は docs/ARCHITECTURE.md、計画は docs/roadmap-2026-10.md。
- AI の組織 (司令塔ブラック・部長・係) = docs/org/。部長・係のセッションは自分の部の docs/org/<部>/README.md を先に読む (記録は notes/、やる事は todo.md)。

## 作業 → 先に読む物
| 作業 | 読む物 |
|---|---|
| カレンシー・お告げの動き (spec/・parts.ts) | docs/decisions/004-currency-as-description.md、docs/reviews/2026-10-17-rule-checklist.md、メモ poe2-craft-rules-confirmed・feedback-game-rules-as-written・feedback-check-settled-rules |
| MOD の置き場・重み・段・部位 | メモ mod-engine-single-source・feedback-verify-with-poe2db・craft-weight-sources・item-classes-from-client・poe2-client-data-source |
| 確率の表・次の手で狙う | メモ held-odds-parity・aim-next-move |
| カオススパム計算機・音・X シェア | メモ chaos-spam-and-sfx |
| クラフトステージの画面 (UI) | docs/decisions/001-craft-stage.md、メモ craft-stage-feature・ui-one-frame-rule・ui-no-break-rules・feedback-basic-flow・feedback-minimal-text-ui・game-ui-art-direction・web-phone-layout・ui-try-before-release |
| チュートリアル・コース・クラフトチャレンジ | docs/decisions/003-quiz-recipe.md、docs/craft-challenge.md、メモ quiz-recipe・craft-challenge・recipe-showcase |
| シミュレーター (開発版だけ) | docs/decisions/002-play-recipe.md、メモ sim-cost-model・sim-split-by-side・feedback-show-sim-rules |
| 英語の画面・用語 | src/i18n/GLOSSARY.md、メモ web-english・feedback-english-with-every-feature・feedback-no-guessed-terms |
| リリース・更新内容・要望の返事 | docs/pending-release.md (OK 待ちの物)、メモ feedback-web-only-for-now・feedback-backstage-release・feedback-replies (更新内容は changelog-notes.json と -en.json) |
| サーバー (server/live・server/web)・分析の記録 | server/live/README.md、メモ analytics-logs |
| 広告・ドメイン・SEO のページ | メモ web-ads-domain-plan、scripts/build-seo-pages.mjs |
| テストを足す・直す | メモ feedback-tests-need-external-truth・feedback-self-tests・feedback-test-strategy |
| 動画・撮影・POE2Tube (video/) | docs/org/video/、メモ video-*・poe2tube-handoff |
| YouTube の字幕・外の調べもの (poe2db・CoE の大きな調べ・似たサイト・AI の進め方) | docs/org/research/、メモ youtube-subtitles |
| アプリ・PoB・取引所・ヴァールの天秤 (当分触らない) | メモ memory-archive-index |

## 動かし方
- 開発: `pnpm dev:web` は preview_start の "web" (port 1440)。Web 版は http://localhost:1440/web.html (`/` はアプリの入口)。
- 型: `pnpm -s exec vue-tsc --noEmit -p tsconfig.json`。テストはオーナーが言った時だけ (確かめは開発版の画面のスナップ。メモ feedback-test-strategy)。
- 版上げ: `node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → commit → push → `pnpm deploy:web`。
- 非公開の開発版: `pnpm deploy:web-dev` (チュートリアル・シミュレーターが開く)。
- Bash では `\` が 1 段消える。正規表現や `\` の入る物は Write / Edit で書く。
