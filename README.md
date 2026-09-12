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

`src/services/trade2/query.ts` の `slotToTradeCategory()` を更新。
trade2 の正式カテゴリ ID は `https://www.pathofexile.com/api/trade2/data/filters` で確認:
```bash
curl https://www.pathofexile.com/api/trade2/data/filters | jq '.result[] | select(.id=="type_filters") | .filters[] | select(.id=="category") | .option.options[].id'
```

### 「未知 inventoryId が N 件」info → 新アイテムスロット対応

poe.ninja から想定外の inventoryId (例: 新タイプ装備) が来ている。
`is_target_inventory_id` (`poe_ninja_client.rs`) の白リストに追加するか、`inventoryIdToSlot()` (`services/craft-v2/ninja-item.ts`) で SlotKey にマップ。

### 依存パッケージ更新確認 (定期的)

```bash
pnpm outdated                # フロントエンド依存
cd src-tauri && cargo update --dry-run    # Rust 依存
# 互換性確認した上で:
pnpm update
cd src-tauri && cargo update
```

Tauri (v2) は破壊的変更が多いので minor 上げる際は CHANGELOG 必読。

### PoB (Path of Building PoE2 日本語版) の配布と更新

- **2026-09-08 から PoB はインストーラに同梱しない** (更新のたびに 120 MB 落としていたため)。CI の
  `scripts/publish-pob-bundle.mjs` が組み立て結果を zip (約 124 MB) にし、GitHub Release の固定タグ `pob-bundle` (rolling) に
  `pob-bundle.zip` + `pob-bundle.json` (contentHash / zipSha256 / url) を置く。内容ハッシュが前回と同じなら再アップロードしない。
- アプリ側 (`src-tauri/src/pob_bundle.rs`、`src/services/pob-bundle.ts`): `%LOCALAPPDATA%\com.kyohei.exiledesk\pob` に展開。
  未インストールなら左ナビ「PoB」の画面で「PoB をダウンロード」。インストール済みなら起動時に **30 日ごと**に manifest を確認し、
  内容が変わっていれば自動で入れ替える (手動「更新を確認」も可)。入れ替え後はヘッドレス PoB (DPS 計算) も再起動する。
  ローカル検証: `cd src-tauri && cargo run --example pob_bundle_probe <dir>` (`EXILEDESK_POB_MANIFEST_URL` で manifest 差し替え)。

- 構成: 公式 PoB (submodule `vendor/PathOfBuilding-PoE2`、master = release) + 日本語化パッチ PoB2-JP
  (ochi3/PoB2-JP のフォーク `kyohei0612/PoB2-JP`、submodule `vendor/PoB2-JP` / 開発機は `C:/Users/kyohei/POE秘書/POBJP`)
  + 日本語フォント BIZ UDPGothic (`vendor/fonts`、SIL OFL)。
- `scripts/build-pob-bundle.mjs` が `src-tauri/resources/pob/` にフラット配置で組み立てる。リリース CI (`release.yml`) は
  tauri-action の前に build → publish の順で実行する。開発機では `src-tauri/resources/pob` があればそれを直接使う
  (`pob_launcher::bundled_pob_dir` の候補: app_local_data_dir/pob → 旧同梱 resources → 開発用 resources/pob)。
  `--no-jp` で英語版のみ、`--check` で存在確認。
- 組み立て手順: (1) 公式 runtime (exe/DLL/lua) → (2) src/ の Lua/Data (TreeData は最新 + legion のみ)
  → (3) `Install-PoB2-JP.ps1 -Force -NoUpdate` で JP フック / CJK 対応 SimpleGraphic.dll / 辞書 CSV を適用
  → (4) 同梱フォントを `SimpleGraphic/Fonts/JpUI*.ttf` に上書き (PoB2-JP は游ゴシックを Windows からコピーするが
  再配布不可 + CI に無い) → (5) `*.pob2jp.bak` 除去 → (6) `Modules/ExileDeskOverlay.lua` で PoB 自身の自動更新を無効化。
- **runtime の基準コミット固定** (`JP_RUNTIME_BASE_COMMIT` = PoB 0.22.0 release): PoB2-JP の差替 SimpleGraphic.dll は
  パッチ同梱の古い ANGLE / re2 / fmt / lua51 とセットで動き、残りの DLL (libEGL.dll 等) は 0.22.0 公式版と組み合わせた
  状態でオーナー環境の動作実績がある。master (0.23.1) の libEGL.dll は新しい libGLESv2 の export を要求するため、
  JP 同梱の libGLESv2 と混ぜると起動時に「EGL_LockVulkanQueueANGLE が見つからない」で落ちる。
  Lua 側 (src/) は master 最新を使う (0.22.0 runtime + 0.23.1 src で動作確認済み)。
- PoB 本体を上げる: `git -C vendor/PathOfBuilding-PoE2 fetch && git checkout origin/master` → スクリプト再実行 →
  起動確認 (`tier: full` で終わること。data-only に縮退したら PoB2-JP のアンカーが PoB 側で変わった) → submodule 参照をコミット。
  runtime 側の DLL 更新を取り込みたい場合は基準コミットを上げて同様に起動確認する。
- 日本語化を上げる: `POBJP` (フォーク) 側で翻訳 CSV を更新・push → submodule 参照を更新。
- **ゲーム内文言は公式訳** (2026-09-07〜): `node scripts/build-pob2jp-from-client.mjs` が
  `data-cache/client-export/` (build-dicts-from-client.mjs の書き出し、12 テーブル + csd) から
  `vendor/PoB2-JP/payload/Data/Translate/ja-JP/client-*.csv` (アイテム / ユニーク / スキル / パッシブ / MOD 名 /
  stat 文 / フレーバー、約 32,000 件) を生成し manifest.lua の末尾に登録する。PoeJP は後から読んだファイルが勝つので
  同じ英文キーは公式訳で上書き、PoB 自身の UI (タブ名 / 設定説明 / 計算欄) は PoB2-JP の意訳のまま。
  リーグ更新時の手順: `pnpm build:dicts:client` → `node scripts/build-pob2jp-from-client.mjs` →
  `vendor/PoB2-JP` で commit + push → ExileDesk で submodule 参照を commit。
- ユーザーデータ: `installed.cfg` によりビルド保存先は公式 PoB と同じ `Documents/Path of Building (PoE2)/`。

### ヴァールの天秤 (2026-09-12〜)

賭けクラフトの期待値ツール群。左ナビ「ヴァールの天秤」をクリックすると下に展開する (旧「クラフト収支」は廃止。
聖別の賭け / アルダーの航路 も 2026-09-12 にオーナー指示で削除)。確率はどれも GGG 非公開なので既定値はコミュニティの観測値で、各画面の「前提」から変更できる。
素材価格は poe2scout、売値は trade2 (取得ボタン = API、「鑑定 ↗」= `?q=` で JP トレードを開くだけ) か手入力。

- アドニアの賭け (`views/Overquality.vue`, `views/overquality/{model,useOverquality}.ts`): 吸収のワンドをヴァールアルカニストのインフューザーで
  品質 20% → 30% に育てて可能性のお告げ + 可能性のオーブでアドニアのエゴにする (アドニア専用ページ)。品質の階段を状態遷移で解いて
  生存率 / インフューザー期待数 / 完成品 1 個の実質コスト / 利益 / 損益分岐のベース価格 / 95・99% 資金を出す。
  既定: +2 が 20%、コラプト確率 = 0.052 × (品質 − 20) (20 → 30 の生存率 ≈ 9.8%)。
- ジェムコラプトの賭け (`views/GemCorrupt.vue`, `views/gem-corrupt/{model,useGemCorrupt}.ts`): レベル 21 · 品質 23% のジェムを
  得る 4 経路 (自作 / 21 を買って結晶 / 23% を買って結晶 / 完成品を買う) を 1 回の期待収支で比較。ジェム一覧は
  `scripts/build-gems-from-client.mjs` → `src/i18n/gems-client.json` (SkillGems / BaseItemTypes / GemTags、persistent = スピリット)。
- trade2 のレート制限 (実測 X-Rate-Limit-Ip): search 5:10:60, 15:60:300, 30:300:1800, 600:21600:3600。5 分 30 回を超えると 10〜30 分ペナルティ。
  `services/trade2/pricing.ts` は search 10.5 秒 / fetch 2.5 秒間隔で直列化し、429 で打ち切る。
  診断: `cd src-tauri && cargo run --example trade2_probe` / `trade2_batch <queries.json> <out.json>` (env `TRADE2_GAP_MS`)。

### カレンシーランキングの分類 (2026-09-09〜)

- サイドバーのカテゴリはゲーム内カレンシー取引所 (Alva) と同じ 14 分類・同じ並び (クライアント `CurrencyExchange` /
  `CurrencyExchangeCategories` 由来、`scripts/build-currency-exchange-from-client.mjs` → `src/i18n/currency-exchange.json`)。
  poe2scout のアイテムを英名で取引所の表に引き、グループ ID `x:<Category>` で集計する。取引所に無いもの (装備 / ユニーク等) は
  poe2scout のカテゴリのまま後ろに並ぶ。基本通貨 3 種 (神 / 高貴 / カオス) は基準レート帯に出すので件数はゲームより 3 少ない。

### ゲームログ診断 (2026-09-10〜)

- 左ナビ「ゲームログ診断」: PoE2 の `logs/Client.txt` を末尾から走査し、既知パターン表で
  「実害あり / 注意 / 既知の無害 / 未分類」に仕分ける (`src-tauri/src/client_log.rs`)。
  ゲームは無害な CRIT を大量に吐く (実測 64 MB / 41 万行で CRIT 29 万件、うちほぼ全部が無害) ので、
  件数ではなく分類と対処法を見せるのが目的。実害ありは日別推移も出す。
- パターン表は `RULES` (client_log.rs) に集約。**未分類のものは画面に「エラー解決案を追加してください」と出す**ので、
  出てきたメッセージを `RULES` に足していく運用。無害なものにも「なぜ対処不要か」を書く。
- 消し込み: 診断結果の要約を `<app_local_data_dir>/client-log-history.json` に残してからログ本体を 0 バイトにする。
  **週 1 回、起動時に自動実行** (`services/client-log.ts` の `ensureClientLogRotated`、前回から 7 日 + 32 MB 以上)。
  ゲーム起動中はファイルが掴まれていて消せないので、その回は見送って次の起動で再試行する。
- 診断: `cd src-tauri && cargo run --example client_log_probe [走査 MB]` (`EXILEDESK_CLIENT_LOG` でパス上書き可)。
  実測で末尾 64 MB / 41 万行を 1.65 秒。

## アーキテクチャ概要

```
ExileDesk/
├── src/                       # Vue 3 + TypeScript フロント (全ファイル 300〜400 行以下を維持)
│   ├── views/
│   │   ├── CraftDiscoveryV2B.vue      # 上位プレイヤーMOD一覧 (配線とレイアウトのみ)
│   │   ├── craft-v2/                  # 派生状態 / MOD 選択 / ユニークホバー の composable + helpers
│   │   ├── CurrencyRanking.vue        # カレンシーランキング (配線のみ)
│   │   ├── currency/                  # 取得 composable + 表示ヘルパー
│   │   ├── PobLauncher.vue            # PoB の起動 / ダウンロード / 更新画面
│   │   └── Settings.vue
│   ├── components/
│   │   ├── craft-v2/                  # ヘッダー / 警告履歴 / アセタブ / 検索バー / 各カード
│   │   ├── currency/                  # サイドバー / 基準レート / テーブル / ホバーカード / スパークライン
│   │   └── decor/                     # BaseCard.vue, UniqueTooltip.vue
│   ├── services/
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
│   ├── src/pob_launcher.rs            # PoB の起動 (app_local_data_dir/pob)
│   ├── src/pob_bundle.rs              # PoB 別配布 (pob-bundle release から DL / 30 日ごと確認 / 入れ替え)
│   ├── src/health_check/              # 起動時健全性チェック: unknown_inv / checks_ninja / checks_web
│   ├── src/craft_v2_storage.rs        # キャッシュ atomic write
│   ├── src/trade2.rs                  # trade2 API client
│   └── resources/pob/                 # 開発用 PoB (gitignore、scripts/build-pob-bundle.mjs が生成。CI では zip にして別配布)
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
