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

## アーキテクチャ概要

```
ExileDesk/
├── src/                       # Vue 3 + TypeScript フロント
│   ├── views/                 # CraftDiscoveryV2B.vue, CurrencyRanking.vue
│   ├── services/              # craft-discovery-v2.ts (集計層)
│   ├── components/decor/      # BaseCard.vue, UniqueTooltip.vue
│   ├── i18n/                  # 辞書 JSON 群
│   ├── constants/             # trade2 マジック文字列集約
│   └── composables/           # キーボードショートカット等
├── src-tauri/                 # Rust バックエンド
│   ├── src/poe_ninja_client.rs        # poe.ninja API client (RateGate 予約時刻ベース)
│   ├── src/craft_v2_storage.rs        # キャッシュ atomic write
│   ├── src/health_check.rs            # Phase ο 健全性チェック
│   └── src/trade2.rs                  # trade2 API client
├── scripts/                   # 辞書ビルダー / α 探索ツール
└── data-cache/                # スクレイプキャッシュ (gitignore)
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
