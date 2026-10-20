# ExileDesk の全体の地図

PoE2 のクラフトのエミュレーター。**本番は Web** (https://exiledesk.com/、2026-10 から当分は Web だけを更新)。デスクトップアプリ (Tauri 2) もあるが今は触らない (下の「アプリ」)。
ここは「どこに何があって、どう繋がっていて、何を正として扱うか」の地図。細かい経緯は各ファイルの頭のコメントと `docs/decisions/` (ADR)。作業ごとに読む物は `CLAUDE.md`。

```
Web の画面 (src/web/WebApp.vue → src/views/craft-stage/CraftStage.vue)
  └ 状態 (src/state)                … craft-stage.ts (アイテム・工程・持っている物・お告げ)、web-page (ページの印) … 部ごとの物は emulator/・simulator/・tutorial/
      └ 仕組み (src/services/craft-stage)
          ├ カレンシーの動き (spec/)   … 説明文の分解 (対象・動作の部品・制約・お告げ)。ADR-004
          ├ 打つ入口 (apply-currency.ts) … spec で打てない物 (指名・鑑定など) だけ今の関数
          └ エンジン (src/vendor/poe2htc + src/services/htc) … MOD の置き場・重み・段の正
サーバー (Cloudflare Workers)
  ├ server/web  … 画面の配信・シェアのカード (/s/<code>、og-card.js)・ベースの読み物のページ
  └ server/live … チャンネル・相場 (/boot.json)・記録 (/log → D1)・要望 (/feedback)・日報
```

## Web の画面 (クラフトステージ)

| タブ | 入口 | 中身 |
|---|---|---|
| エミュレーター | `views/craft-stage/CraftStage.vue` | ベース選び → 棚 (`CurrencyShelf.vue`) から持って打つ。アイテム (`StageItemCard.vue`)・工程・MOD 一覧 (`StageModList.vue`)・次の手で狙う (`StageAimPanel.vue`)・スパムシミュレーター (別ページ `StageRoutesPage.vue`、運試し `StageRouteLuck.vue`、計算は `services/craft-stage/route-race.ts`。旧カオススパム計算機は 2026-10-19 に消した) |
| ジェムコラプト | `views/gem-corrupt/GemCorruptWebPanel.vue` (計算は views/gem-corrupt/model.ts。Web では広告と一緒に出す予定) | 売値 3 つを入れて収支 |
| チュートリアル (開発版だけ) | `views/tutorial/StageCourses.vue`・`StageTopicGuide.vue`・`StageCourseGuide.vue` | 動作を学ぶコース (`services/tutorial/topic-courses.ts`)・実践 (`course-recipes.ts`) |
| シミュレーター (開発版だけ) | `views/simulator/StageSimPanel.vue` | 打ち方を組んで何百人分作る (ADR-002・003)。回し方は `services/simulator/` |

開発版だけの物は `state/craft-stage.ts` の `SIM_LOCKED` で本番から隠す (非公開の開発版 `pnpm deploy:web-dev` では開く)。

## 部ごとの持ち場 (2026-10-20 に分けた。部は docs/org/)

| 部 | 画面 | 仕組み | 状態 | テスト |
|---|---|---|---|---|
| エミュレーター | `views/craft-stage/` | `services/craft-stage/` (spec/ も)・`services/htc/`・`services/mods/`・`vendor/poe2htc/` | `state/emulator/` | `tests/` の直下 |
| シミュレーター | `views/simulator/` | `services/simulator/` (`htc/` = 自動モードの木 sim-route・tree-decide・step-odds) | `state/simulator/` | `tests/simulator/` |
| チュートリアル (シミュレーター部) | `views/tutorial/` (Video*・コース) | `services/tutorial/` | `state/tutorial/` | `tests/tutorial/` |
| 開発 (共通) | `web/`・`components/`・`utils/` | `i18n/`・`services/money.ts`・`services/telemetry/` ほか | `state/` の直下 (`craft-stage.ts`・`web-page.ts`・`display-currency.ts` ほか) | — |

craft-stage/ に残した共通の土台: `run-plan.ts`・`contract.ts` (打つ処理、どの部も使う)・`share.ts`・`trade-search.ts`・`types.ts`。htc/ の `buy-or-craft.ts`・`prices.ts`・`paste*.ts` もアプリ・各部がまたがって使うので htc/ に残した。scripts/ は今のまま 1 つのフォルダー。

## 何を正とするか (同じ事を 2 か所でやらない)

- **カレンシー・お告げの動き** … `services/craft-stage/spec/` の説明文の分解 (`*-specs.ts` = カレンシーごとの対象・動作・制約、`parts.ts` = 動作の部品、`judge.ts` = 打てるか、`run-spec.ts` = 打つ、`odds.ts` = 確率表)。
  カレンシー固有の処理を書き足さず、部品とお告げの効き目 (`OmenEffect`) で表す。決めた決まりの一覧は `docs/reviews/2026-10-17-rule-checklist.md`。
- **MOD の置き場・重み・段** … エンジンの**行** (`Gloves_str` など。STR / DEX / INT、ワンドの属性で分かれる)。読み込みは `services/htc/patch.ts` の `loadHtcPatch()`
  (同梱データ + `extra-bases.json` + `weight-overrides.ts` + poe2db の直し `poe2db-pool-fixes.json`)。ベース名 → 行は `services/htc/bridge.ts` の `classOfBase`。
  画面で MOD を並べるのは `services/craft-stage/mod-list.ts` の `modListFor`。
- **MOD の決まり (系統・重み・出やすさ)** … `services/mods/mod-rules.ts`。`m.family` を直接比べたり、段の重みを自分で足したりしない。
- **確率の表** … `services/craft-stage/held-odds.ts` (棚の確率)・`aim-odds.ts` (次の手で狙う)・`route-race.ts` (スパムシミュレーターの 100 人)・`chaos-spam.ts` (運の順位)。打つ処理と同じ部品を使う。
- **ベースの一覧** … `services/items/base-catalog.ts` と `components/items/BaseCatalog.vue`。今のゲームに無いベースは `removed-bases.json` で外す。
- **部位のまとまり** … `services/mods/item-classes.ts` (クライアントの ItemClasses。部位の名前を手で並べない)。
- **ゲームの名前・文面** … クライアント (`src/i18n/*-client.json`、`currency-hover-*.json`)。自分で訳さない。画面の言葉は `i18n/lang.ts` の `tr("日本語", "English")`、MOD の文は `modText`。
- **お金** … `services/money.ts`、画面に出す時は `state/display-currency.ts` (費用は切り上げ・収入は切り下げ)。
- **アイテムの色** … `src/style.css` の `@theme`。色コードを画面に直接書かない。ゲームの絵の枠・ボタンは `styles/game-ui.css` (`.g-panel`・`.g-tab`・`.g-btn`)。
- **更新内容** … `src/data/changelog-notes.json` (日本語) と `changelog-notes-en.json` (英語)。`scripts/build-changelog.mjs` が `changelog.json` を作る (タグの無い Web だけの版も入る)。
- **分析の記録** … 画面は `utils/log-record.ts` の `logRecord` を呼ぶだけ (`services/telemetry/log-sender.ts` が送る、`src/web/track.ts` が入口・画面の切り替え)。

新しい画面を作る時も上の置き場から取る。直す時は置き場の 1 か所を直せば全部の画面が変わる。1 ファイル 500 行まで。

## データの出どころ

| 何 | どこから | 作り直し |
|---|---|---|
| アイテム名・MOD の文面・ジェム・エッセンス・説明文 | ゲームのクライアント (`pathofexile-dat`) | `pnpm data:client` |
| MOD の置き場・重み | poe2db (同梱エンジン + `poe2db-pool-fixes.json`)。冒涜専用は全部同じ重み | `scripts/build-poe2db-fixes.mjs`、照合は `scripts/audit-poe2db-mods.mjs` |
| 付き方の正解 | Craft of Exile の写し (`data-cache/coe-beta-package_poe2.js`) とオーナーのゲームでの確認 | — |
| ベース・ユニーク・ルーンの絵 | クライアントの DDS → webp (`public/<pack>/`) | `pnpm data:client` |
| 相場 | poe2scout をサーバーが 1 時間おきに取り、`/boot.json` で配る | server/live |

## 配布

- **Web**: `node scripts/bump-version.mjs patch` → `cd src-tauri && cargo check -q` → コミット → push → `pnpm deploy:web` (= `pnpm build:web` + `server/web` の deploy)。タグは打たない。
  `pnpm build:web` の最後に `scripts/build-seo-pages.mjs` がベースの読み物のページ (日本語 `/bases/`・英語 `/en/bases/`) と sitemap.xml を作る。
- **非公開の開発版**: `pnpm deploy:web-dev` (URL は `?k=` 付き、チュートリアル・シミュレーターが開く、記録は送らない)。
- **サーバー**: `cd server/live && pnpm run deploy` (手順は `server/live/README.md`)。D1 は `exiledesk-logs`、KV は増やさない。

## テスト

- `pnpm -s exec vitest run <ファイル>` … 触った所だけ。全部は main への push で CI (`tests.yml`) が回す。
- カレンシーの動きを変えたら `tests/currency-spec-golden.test.ts` (結果の見張り) も。わざと変えた時は `GOLDEN_WRITE=1` で取り直す。
- 期待値は外の正解 (poe2db・クライアント・Craft of Exile・オーナーのゲームでの確認) から。自分のコードの写しでテストを作らない。

## 開発を始める

1. Node 20・pnpm 10 (アプリを触るなら Rust stable も)
2. `pnpm install`
3. `pnpm dev:web` → http://localhost:1440/web.html (`/` はアプリの入口)
4. 型は `pnpm -s exec vue-tsc --noEmit -p tsconfig.json`

## アプリ (当分触らない)

画面は Vue、裏は Rust (`src-tauri/src`: 取引所 trade2 の門番・捌き速度の巡回・PoB (Lua)・画像パック・更新)。サイドバーにカレンシーランキング・取引履歴・ヴァールの天秤・クラフト計算機 (廃止予定)・火力チェック・スキン。
配布は `v*.*.*` のタグで `.github/workflows/release.yml`。取引所の検索は 10 秒間隔・5 分 30 回を守る。手順の詳細は `docs/archive/README-app-2026-10.md` とメモ memory-archive-index。
