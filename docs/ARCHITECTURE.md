# ExileDesk の全体の地図

PoE2 のための Windows アプリ。画面は Vue 3 + TypeScript、裏側は Rust (Tauri 2)。
ここは「どこに何があって、どう繋がっていて、何を正として扱うか」の地図。細かい経緯は各ファイルの頭のコメントと `docs/decisions/` (ADR) にある。

```
画面 (src/views, src/components)
  └ 状態 (src/state)            … 画面をまたぐ物 (相場・取引所の使用権・表示通貨・クラフトステージ …)
      └ 仕組み (src/services)   … 計算・データの読み書き・外部 API の形
          ├ 計算機のエンジン (src/vendor/poe2htc + src/services/htc)   … MOD の置き場・重み・段の正
          └ Rust (src-tauri/src) … 取引所 (trade2) の門番・捌き速度の巡回・PoB (Lua)・画像パック・ログ・更新
```

## 画面 (サイドバーの順)

| 画面 | 入口 | 主な中身 |
|---|---|---|
| カレンシーランキング | `views/CurrencyRanking.vue` | poe2scout の相場 (`state/market-store.ts`) |
| ユニーク装備価格推移 | `views/UniqueTrend.vue` | poe.ninja の一覧・推移、お気に入りの最安値は trade2 (`state/unique-watch.ts`) |
| 上位プレイヤー MOD 一覧 | `views/CraftDiscoveryV2B.vue` | poe.ninja の builds 集計 (`services/craft-v2`)、段の表は `services/mods/tiers.ts` |
| 忍者ビルドコピー | `views/BuildCopy.vue` | PoB コード / ninja URL → 装備と取引所の値段 (`services/build-copy`) |
| 取引履歴 | `views/TradeHistory.vue` | マーチャントの履歴 (POESESSID) |
| ヴァールの天秤 (4 画面) | `views/Overquality.vue` ほか | アドニアの賭け・ジェムコラプト・自動ジェム監視・規格外の賭け (`views/rare-craft`) |
| クラフト計算機 | `views/htc-craft/HtcCraftLab.vue` | 貼り付け or ベースから → 作り方と費用 (エンジン) |
| クラフトステージ | `views/craft-stage/CraftStage.vue` | 1 手ずつの実演・動画モード・POE2Tube の撮影 (ADR-001) |
| スキン | `views/mtx/MtxList.vue` | PoE1 のスキンが PoE2 で使えるか (`services/mtx`) |
| PoB を開く / ゲームログ診断 / 設定 | `views/PobLauncher.vue` ほか | |

## 何を正とするか (同じ事を 2 か所でやらない)

- **MOD の置き場・重み・段** … 計算機のエンジンの**行** (`Gloves_str` など。STR / DEX / INT、ワンドの属性で分かれる)。
  読み込みは `services/htc/patch.ts` の `loadHtcPatch()` (同梱データ + `extra-bases.json` + 重みの上書き `weight-overrides.ts`)。
  ベース名 → 行は `services/htc/bridge.ts` の `classOfBase`、エンジンを読まずに行だけ要る所は `services/htc/base-rows.json`。
  計算機・クラフトステージ・規格外の賭け・ビルドコピーのレア・上位プレイヤー MOD 一覧の段の表、全部ここから。
- **ベースの一覧 (種類の段・素の数値)** … `services/items/base-catalog.ts` と部品 `components/items/BaseCatalog.vue`。
- **取引所 (trade2) を叩く順番と間隔** … Rust の門番 (`src-tauri/src/trade2/gate`・`pace.rs`・`reserve.rs`)。
  画面側は `state/trade-lock.ts` で「今どの機能が使っているか」を 1 つに決める。**検索は 10 秒間隔・5 分 30 回を守る** (テストでも)。
- **MOD の決まり (系統・重み・出やすさ)** … `services/mods/mod-rules.ts` (`familyKeysOf` / `familyBlocked` / `tierWeight` / `fillShares`、エッセンスを打てるかは `essenceClash`)。
  中身はエンジンの `familiesOf` / `excluded` / `modTierWeight`。`m.family` を直接比べたり、段の重みを自分で足したりしない
  (2 つの系統にまたがる MOD を落とす)。
- **お金** … 換算と丸めの決まりは `services/money.ts` (`toExalted` / `ceilMoney` / `floorMoney`)、画面に出す時は `state/display-currency.ts` の `roundMoney`
  (費用は切り上げ・収入は切り下げ)。取引所のリーグ名は `marketStore.tradeLeague`。
- **ゲームの名前・文面** … クライアント (`src/i18n/*-client.json` など)。自分で訳さない。
  種類の日本語は `services/items/base-catalog.ts` の `classJa`、MOD のタグは `services/mods/tag-ja.ts`、品質の表記は `services/htc/quality.ts` の `qualityLabelOf`、
  MOD の文面の `#` を段の幅で埋めるのは `services/htc/mod-text.ts` の `fillHashes`。
- **種類 → タグ (spawn の判定)** … `services/mods/item-class-tags.ts` (エンジンの行からは `tagsOfEngineRow`)。
- **アイテムの色** … `src/style.css` の `@theme` (`rarity-normal / magic / rare / unique`、`mod-fractured / desecrated / crafted`)。
  クラスは `text-rarity-rare` など、CSS は `var(--color-rarity-rare)`。色コードを画面に直接書かない。
- **時刻の書き方** … `utils/format-time.ts`。

新しい画面 (MOD の別のタブなど) を作る時も、上の置き場から取る。同じ表や式を画面の中に書き写さない。
直す時は置き場の 1 か所を直せば全部の画面が変わる。決まりを変えたら `tests/` の該当テスト (`mod-rules` / `shared-tables` / `money-and-trade`) も直す。

## データの出どころ

| 何 | どこから | 作り直し |
|---|---|---|
| アイテム名・MOD の文面・ジェム・エッセンス | ゲームのクライアント (`pathofexile-dat`) | `pnpm data:client` |
| MOD の重み | poe2db の推定 (同梱エンジン) + `weight-overrides.ts` (Craft of Exile・他の部位から借りる) | エンジンの更新時 |
| ベース・ユニーク・スキンの画像 | クライアントの DDS → webp (`public/<pack>/`) | `pnpm data:client` |
| スキンの PoE1 / PoE2 | クライアントの `MtxTypes` の名前の無い列 19 / 20 | `pnpm data:client` |
| 相場 | poe2scout (カレンシー)・poe.ninja (ユニーク・ビルド)・trade2 (出品) | アプリが取りに行く |

パッチの後は `pnpm data:client` 1 本 (段の一覧は `--list`、途中から `--from N`、画像を飛ばす `--no-art`)。最後にテストが走る。

## 配布

- **アプリ本体**: `v*.*.*` のタグで `.github/workflows/release.yml` が作る (約 4 分半)。インストーラーは約 8 MB。自動更新は `latest.json`。
  リリースの手順はタグの前に `pnpm build` → `node scripts/bump-version.mjs patch` → `cargo check` → コミット → push → タグ。
- **画像パック**: 画像はインストーラーに入れない。`scripts/asset-packs.mjs --publish` が Release `asset-packs` に置き (変わった時だけ)、
  アプリは要る版と違う時だけ落とす。初回は zip、次からは変わった画像だけ (`src-tauri/src/asset_packs.rs`)。開発版は `public/` を直接読む。
- **PoB**: Release `pob-bundle` に別配布 (`src-tauri/src/pob_bundle.rs`)。
- **キャッシュ**: `cache-warm.yml` が main でリリースと同じ `tauri build --no-bundle` を回してキャッシュを温める。

## テスト

- `pnpm test` … `tests/` (vitest)。MOD の重み・行、クラフトステージ、スキンの判定、お金の丸め・換算、取引所の URL、貼り付け。
  リリースの中でも走り、落ちたら止まる。
- `cargo test` (src-tauri) … 取引所の門番・捌き速度の集計・画像パックの差分など。`tests.yml` が main への push ごとに回す。
- `scripts/check-*.mjs` … 手元用の検算 (POE2Tube の見本や data-cache を読む物がある)。
- 計算や判定を直したら、答えの分かっている例を `tests/` に 1 つ足す。オーナーの実体験 (使えた / 使えなかった、ゲームで見た数値) は特に良い答え。

## 開発を始める

1. Node 20・pnpm 10・Rust (stable)・ffmpeg (画像を作る時だけ) を入れる
2. `pnpm install`
3. `pnpm tauri dev` (画面だけなら `pnpm dev` → http://localhost:1420)
4. 変更したら `pnpm test`、Rust を触ったら `cd src-tauri && cargo test`
- 新しい worktree で `cargo test` が落ちる時は `env -u NoDefaultCurrentDirectoryInExePath cargo test` (LuaJIT の組み立てがカレントディレクトリを探すため)
