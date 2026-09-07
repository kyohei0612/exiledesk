# ExileDesk

POE2 (Path of Exile 2) 向けデスクトップ UI ツール。**配布精度優先で UI は 2 機能に集中**:

- **上位プレイヤーMOD一覧** (poe.ninja 連携): 上位 10 アセンダンシー × 50 人のレア装備 MOD を prefix/suffix で集計、trade2 即時検索連携
- **カレンシーランキング** (poe2scout 連携): 神/高貴/カオス 3 通貨並列ペア表示、神換算値表示

## 技術スタック

- **フロント**: Vue 3 + TypeScript + Vite + Tailwind CSS
- **バックエンド**: Rust (Tauri v2)
- **データソース**: poe.ninja, POE2DB, RePoE fork, poe2scout, pathofexile.com/trade2

## 開発環境セットアップ

```bash
pnpm install
pnpm tauri dev     # 開発時 (Vite HMR + cargo watch)
pnpm build         # フロントエンド本番ビルド (vue-tsc + Vite)
pnpm tauri build   # 配布用 EXE/DMG/AppImage 生成
```

## 起動時自動チェック (Phase ο)

アプリ起動時に以下を自動検証し、問題があれば**警告履歴パネル**に表示する:

1. **poe.ninja API スキーマ**: `economyLeagues[]` / `snapshotVersions[]` の必須フィールド存在確認
2. **POE2DB HTML 構造**: サンプルページ (Atziris_Splendour) の `itemName` クラス + `<h1>` 存在確認
3. **trade2 API フィルタ**: `armour.shield` / `armour.focus` / `armour.quiver` カテゴリ存在確認
4. **未知 inventoryId カウンタ**: poe.ninja から想定外の inventoryId が来てたらカウント上昇
5. **辞書件数チェック**: 5 種類の i18n 辞書が期待件数を下回っていないか

警告が出た場合、以下のメンテナンス手順で対応する。

## メンテナンス手順 (オーナー向け)

配布版 EXE では Node.js / pnpm / cargo は同梱されないため、**dev 環境でこれらコマンドを手動実行**してメンテする。
警告パネルに対応する対処法は以下:

### 「辞書ファイル X が薄い」警告 → 辞書再生成

```bash
# unique-mods-ja (POE2DB 個別ユニュページから MOD 抽出、Phase λ)
node scripts/build-unique-pages-detail.mjs --offline   # data-cache 利用、HTTP 0

# unique-names-ja (POE2DB EN/JP ペアから ユニュ正式名 抽出、Phase ξ)
node scripts/build-unique-names-ja.mjs --offline

# poe2-flavour-ja (RePoE fork 由来 flavour text、Phase κ)
node scripts/build-poe2-flavour-ja.mjs

# mod-tier-and-group (Data-H2 修正済 sorter 込み)
node scripts/build-mod-tier-and-group.mjs

# trade2-stat-mapping (GGG 内部 stat ID → trade2 数値 ID)
node scripts/build-trade2-stat-mapping.mjs
```

`data-cache/poe2db-unique-pages/` は事前にスクレイプ済の HTML キャッシュなので、`--offline` フラグで HTTP 不要。
新ユニュ追加など実 HTTP が必要な場合は `--offline` を外して実行 (POE2DB へのレート制限注意)。

### 一次ソース: GGG クライアントの dat テーブルから辞書を生成 (2026-09-07〜)

poe2db / RePoE / PoB はいずれもゲームクライアント同梱のデータテーブルの写しなので、
写しをスクレイプする代わりに原本を読む。暗号化されておらず、パスワード等は不要。

```bash
pnpm build:dicts:client          # = node scripts/build-dicts-from-client.mjs
```

- 読み取りは devDependency の `pathofexile-dat` (poe-dat-viewer 作者製) の CLI を子プロセスで呼ぶ。
  Steam 既定パスを自動検出 (`--steam <dir>` / `POE2_DIR` で指定可)。
  `--patch <version>` なら GGG のパッチ配信サーバから直接取るのでゲーム不要 (CI 向け。
  ただし PoE2 の最新パッチ番号フィードが未整備なので、CI 配線は保留)。
- PoE2 のテーブルは `Data/Balance/<Table>` と `Data/Balance/Japanese/<Table>` にあり、EN / JA は同じ行番号で対応する。
- 出力 (すべて既存への上書きマージ。クライアントが正なので同じキーはクライアントの訳で更新、キーは消さない):

| 出力 | テーブル | 備考 |
|---|---|---|
| `items-ja-client.json` (新規) | BaseItemTypes `Name` | 4,479 件。`currencies-ja.ts` で items-ja(公式凍結) の次に引く |
| `unique-names-ja.json` | Words `Text` → `Text2` | `Wordlist = 6` がユニーク名種別 (既知ユニークからの実測)。JA の `Text` は英語のままなので `Text2` を使う |
| `poe2-flavour-ja.json` | FlavourText `Text` | **キーは CR+LF を保持** (`UniqueTooltip.strip()` がその形で引く。空白に潰すと一切ヒットしない) |
| `unique-mods-ja.json` | Mods (`generation_type: unique`) の EN/JA text を行対応 | `build-unique-mods-from-client.mjs`。2,032 → 8,342 件。poe2db 版 (κ/λ) は追加のみの補強に降格 |
| `currency-effects-ja.json` | CurrencyItems `Description` / `StackSize` + SoulCores / SoulCoreStats / SoulCoreStatCategories | `build-currency-effects-from-client.mjs`。ルーン・ソウルコアは「装備種別: 効果」を csd で描画 (poe2db 版と同文)、`RequiredLevel` → 「レベル N」 |

#### MOD 文言・ティア・spawn weight も原本から (2026-09-07〜)

`pnpm build:dicts:client` は上の 3 辞書に続けて MOD パイプラインも回す:

```
build-dicts-from-client.mjs    ─ files 指定で Data/StatDescriptions/stat_descriptions.csd も書き出す
build-mods-from-client.mjs     ─ Mods / Stats / Tags / ModType / ModFamily テーブル + csd
                                 → data-cache/mods.en.json / mods.ja.json (RePoE 形式互換)
extract-mods-bundle.mjs        ─ 無改造 (入力が RePoE の写しから原本生成に変わっただけ)
                                 → src/i18n/mods-bundle.json
build-mod-tier-and-group.mjs   ─ 無改造 → src/i18n/mod-tier-and-group.json
```

- `stat_descriptions.csd` は UTF-16LE、全言語のブロック入り (`lang "Japanese"` が 10,776 中 10,770)。
  パーサは `scripts/parse-stat-descriptions.mjs` (PoB-PoE2 の `src/Export/statdesc.lua` の JS 移植)。
  pathofexile-dat は `files` の保存名でパスの `/` を `@` に置換する。
- `Mods` の外部キーは参照先テーブルの行番号。`Stat1Value` は `[min, max]` の配列。
  `Domain` / `GenerationType` は enum で、ラベルは `build-mods-from-client.mjs` の表 (RePoE と Id で突合して確定)。
- 検証 (2026-09-07): 旧 bundle と共通の 3,656 MOD で EN 文言 96.0% 一致。残りはマーカー名変更 (`[HitDamage|Hits]`→`[Hit|Hits]`) と
  クライアント側の本当の更新 (数値調整・文言変更)。JA は 3,627 / 3,666 が本物の日本語 (トレード API 補完 0 件)。
  クライアントにしか無い MOD は 220 件 (0.5 で追加されたもの)。
- **`extract-mods-bundle.mjs --refresh` は使わない**: 凍結済みの RePoE (JA は 404) を再取得して原本生成を上書きする。

この `Mods` テーブル (spawn weight / タグ / ティア) がクラフト確率シミュレーションの土台になる。

週次 CI (`build:dicts:online`) の poe2db / RePoE スクレイパーはすべて「既存キーは上書きしない・追加のみ」に
なっているので、クライアント原本の値が週次実行で戻ることはない。これで辞書の全層が原本由来になった。
poe2db / RePoE 経路が今も意味を持つのは「クライアントに無いもの」だけ (現状ほぼ無い)。

### 週次辞書更新 (CI) が失敗する / ユニーク辞書が 0 件になる → スクレイパー追従

`build:dicts:online` は **Phase κ (`build-unique-mods-ja.mjs`) が先頭**で、POE2DB の
カテゴリページ (`/us/Rings` 等) からユニークのスラッグ一覧を作り、以降の
λ (`build-unique-pages-detail`) / `build-unique-names-ja` がそれを消費する。
この κ が空振りすると後段が全滅する。

症状の見分け方 (κ のログ):

```text
[build-unique-mods-ja] Rings: en=0 ja=0 pair-blocks=0 ...   ← 全カテゴリでこれ
[build-unique-mods-ja] entries: 0
```

`categories fetched: 32` なのに `en=0 ja=0` なら HTTP は通っていて **HTML のパースが外れている**。
実例 (2026-06): POE2DB がアンカーの class を `UniqueItems uniqueitem` → `UniqueItems UniqueItem`
に変えただけで 3 ヶ月間ずっと 0 件だった (正規表現は現在 `i` フラグで casing 非依存)。
確認手順:

```bash
node scripts/build-unique-mods-ja.mjs        # カテゴリページ再取得 (64 req、約 1 分)
grep -o -i 'class="unique[A-Za-z ]*"' data-cache/poe2db_Rings_us.html | sort | uniq -c
```

ここに出る class 名と `parseUniqueBlocks` (κ) / `collectSlugs` (λ) の正規表現を突き合わせる。
個別ページ側 (`<div class="Stats">` / `explicitMod` / `itemName` / `class="lc"`) は
`data-cache/poe2db-unique-pages/<slug>_us.html` で同様に確認できる。

CI (`.github/workflows/build-dicts.yml`) 側の仕組み:

- `data-cache/` は gitignore 対象なので **actions/cache で週をまたいで持ち越す**
  (初回のみ個別ページ ~780 枚を 1 req/s で取得、約 15〜18 分。以降は差分のみ)
- 辞書の件数が 1 つでも減ったら PR を作らず失敗する (0 件で上書きされる事故の防止)
- 手動実行: `gh workflow run build-dicts.yml` → 差分があれば `auto/dict-update` に PR が立つ

### 「poe.ninja API 構造変更を検出」警告 → スキーマ追従

`src-tauri/src/poe_ninja_client.rs` の以下関数を更新:
- `fetch_index_state` — `economyLeagues[].url` / `snapshotVersions[].version` フィールド名変更時
- `fetch_economy_leagues_inner` — リーグ一覧フォーマット変更時
- `character_items_to_cached` — items[] スキーマ変更時

新フィールドが追加された場合は `CachedRareItem` / `CachedUniqueItem` (`craft_v2_storage.rs`) にも追加。

### 「POE2DB HTML 構造変更」警告 → スクレイプビルダー追従

`scripts/build-unique-pages-detail.mjs` の `htmlToText()` / DOM パース正規表現を確認:
- POE2DB のクラス名 (`itemName` / `lc` 等) 変更時
- ページ構造 (table / div 入れ子等) 変更時

サンプル HTML を `data-cache/poe2db-unique-pages/Atziris_Splendour_us.html` で確認しながら正規表現を調整。

### 「上位プレイヤーMOD一覧」が空 / 「search カラムを抽出できない」警告 → search パーサ追従

新リーグ開始直後に一番壊れやすい箇所。poe.ninja の search エンドポイントは
`application/x-protobuf` のみ (JSON 非対応) で、`.proto` が公開されていないため
**フィールド番号を実データから読み取る実装**になっている。リーグ切替でこの番号が
変わるとパースが 0 件を返し、HTTP は 200 のまま機能だけが無言で死ぬ。

まず切り分けプローブを走らせる (どの段で落ちたか 1 発で分かる):

```bash
cd src-tauri && cargo run --example ninja_probe
```

index-state → build-index-state → リーグ一覧 → リーグ指定解決 → search → character の
6 段を順に叩き、search が 0 件なら `>>> SEARCH PARSE BROKEN <<<` を出す。

構造が変わっていた場合は `poe_ninja_client.rs` の以下を実データに合わせて更新:
- `parse_search_column` — カラム message のフィールド番号
  (現状 `f1` = カラム ID、`f7` = 値の繰り返し)
- `extract_search_columns` — カラムを探す深さ

現在のレスポンス構造 (2026-09-07 実測):

```text
f1 { f1: varint(総ヒット数), f12: Column { f1: "name"/"account"/…, f7: 値 × 行数 } × 28 }
```

`name` 列と `account` 列は同じ行順なので、同じ添字どうしが 1 キャラに対応する。

起動時ヘルスチェック (`check_poe_ninja_search_parse`) が実際にパースを試すので、
壊れていれば警告履歴パネルに出る。

### 「trade2 API 仕様変更」警告 → カテゴリ追従

`src/services/craft-discovery-v2.ts` の `slotToTradeCategory()` を更新。
trade2 の正式カテゴリ ID は `https://www.pathofexile.com/api/trade2/data/filters` で確認:
```bash
curl https://www.pathofexile.com/api/trade2/data/filters | jq '.result[] | select(.id=="type_filters") | .filters[] | select(.id=="category") | .option.options[].id'
```

### 「未知 inventoryId が N 件」info → 新アイテムスロット対応

poe.ninja から想定外の inventoryId (例: 新タイプ装備) が来ている。
`is_target_inventory_id` (`poe_ninja_client.rs`) の白リストに追加するか、`inventoryIdToSlot()` (`craft-discovery-v2.ts`) で SlotKey にマップ。

### 依存パッケージ更新確認 (定期的)

```bash
pnpm outdated                # フロントエンド依存
cd src-tauri && cargo update --dry-run    # Rust 依存
# 互換性確認した上で:
pnpm update
cd src-tauri && cargo update
```

Tauri (v2) は破壊的変更が多いので minor 上げる際は CHANGELOG 必読。

### 同梱 PoB (Path of Building PoE2) の更新

- 実体は submodule `vendor/PathOfBuilding-PoE2` (runtime + src)。`scripts/build-pob-bundle.mjs` が
  `src-tauri/resources/pob/` にフラット配置で組み立て、`tauri.conf.json` の `resources/pob/**/*` で同梱される。
  リリース CI (`release.yml`) は tauri-action の前にこのスクリプトを実行する。ローカルで `pnpm tauri dev` /
  `pnpm tauri build` する前にも 1 回実行しておくこと (無いと左ナビ「PoB を開く」が起動不可表示になる)。
- PoB 本体を上げる: `git -C vendor/PathOfBuilding-PoE2 pull` → スクリプト再実行 → 起動確認 → submodule の
  参照をコミット。TreeData は最新ツリー + legion のみ同梱 (旧ツリーは遅延ロードなので新規ビルドには不要)。
- 同梱版は `Modules/ExileDeskOverlay.lua` で PoB 自身の自動更新を止めている (上書きで同梱物が壊れるため)。
  `installed.cfg` によりビルド保存先は公式 PoB と同じ `Documents/Path of Building (PoE2)/`。
- 注意: PoB の描画エンジン (SimpleGraphic) は 1 バイト = 1 グリフのビットマップフォントで、日本語は描画できない。
  辞書を差し替えても豆腐になるので、日本語化はレンダラ側の対応が前提。

## アーキテクチャ概要

```
ExileDesk/
├── src/                       # Vue 3 + TypeScript フロント (全ファイル 300〜400 行以下を維持)
│   ├── views/
│   │   ├── CraftDiscoveryV2B.vue      # 上位プレイヤーMOD一覧 (配線とレイアウトのみ)
│   │   ├── craft-v2/                  # 派生状態 / MOD 選択 / ユニークホバー の composable + helpers
│   │   ├── CurrencyRanking.vue        # カレンシーランキング (配線のみ)
│   │   ├── currency/                  # 取得 composable + 表示ヘルパー
│   │   ├── PobLauncher.vue            # 同梱 PoB の起動画面
│   │   └── Settings.vue
│   ├── components/
│   │   ├── craft-v2/                  # ヘッダー / 警告履歴 / アセタブ / 検索バー / 各カード
│   │   ├── currency/                  # サイドバー / 基準レート / テーブル / ホバーカード / スパークライン
│   │   └── decor/                     # BaseCard.vue, UniqueTooltip.vue
│   ├── services/
│   │   ├── craft-discovery-v2.ts      # 互換 barrel (実体は下記)
│   │   ├── craft-v2/                  # types / ninja-item / ingest / finalize / cache / runner
│   │   ├── mods/                      # normalize (テンプレ正規化) / dictionaries (辞書引き)
│   │   └── trade2/                    # league / query / open
│   ├── state/craft-v2/                # store (reactive) / fetch (取得制御) / health (健全性・辞書チェック)
│   ├── data/                          # mods.ts (bundle 読み込み), item-tags.ts
│   ├── i18n/                          # 辞書 JSON 群 (クライアントデータ由来)
│   └── composables/                   # キーボードショートカット等
├── src-tauri/                 # Rust バックエンド
│   ├── src/poe_ninja_client/          # poe.ninja client: config / status / metrics / rate_gate / http /
│   │                                  #   leagues / search / ascendancy_fetch / orchestrate / cache_convert / protobuf
│   ├── src/pob/                       # ヘッドレス PoB (mlua): lua_boot / worker / lua_calls / commands
│   ├── src/pob_launcher.rs            # 同梱 PoB (resources/pob) の起動
│   ├── src/health_check/              # 起動時健全性チェック: unknown_inv / checks_ninja / checks_web
│   ├── src/craft_v2_storage.rs        # キャッシュ atomic write
│   ├── src/trade2.rs                  # trade2 API client
│   └── resources/pob/                 # 同梱 PoB (gitignore、scripts/build-pob-bundle.mjs が生成)
├── vendor/PathOfBuilding-PoE2/# PoB submodule (runtime + src)
├── scripts/                   # 辞書ビルダー / クライアントデータ抽出 / PoB 同梱組み立て
└── data-cache/                # スクレイプ・クライアント抽出キャッシュ (gitignore)
```

### キャッシュ

- 場所: `%APPDATA%/com.kyohei.exiledesk/craft_v2_cache.json`
- atomic write: `*.tmp` 経由 rename (Rust-H6 対応)
- snapshot_version プレフィックス `ν1-` で旧スキーマ自動破棄

### レート制御 (RateGate)

- Semaphore 並列度 4
- 最小間隔 280ms (グローバルゲート、予約時刻ベース)
- 429: 8 回 exponential backoff (3s → 120s) + 全タスク一斉停止 (Cloudflare 1015 解除待ち)
- 5xx: 3 回 backoff (21 秒で諦め、個別キャラのみ)

## リンク

- POE2 公式: https://www.pathofexile.com/
- poe.ninja POE2: https://poe.ninja/poe2/
- POE2DB: https://poe2db.tw/
- poe2scout (カレンシー): https://poe2scout.com/
- trade2 検索: https://www.pathofexile.com/trade2

## ライセンス

私用 (個人開発、配布は GitHub Releases 経由)。
