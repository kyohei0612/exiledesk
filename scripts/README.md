# scripts/

ExileDesk のデータ抽出・ビルド支援スクリプト群。

## extract-mods-bundle.mjs

`src/i18n/mods-bundle.json` を RePoE fork (poe2) の `mods.json` から再生成する。

### Source

- English: <https://raw.githubusercontent.com/repoe-fork/poe2/master/data/mods.json>
- Japanese: <https://raw.githubusercontent.com/repoe-fork/poe2/master/data/Japanese/mods.json>
- License: **MIT** (RePoE 本体) / data は GGG 所有 (ToS 準拠)
- Repo: <https://github.com/repoe-fork/poe2>

### Usage

```bash
# キャッシュがあればそれを使い、なければダウンロード
node scripts/extract-mods-bundle.mjs

# 強制的に上流から再ダウンロード（バージョンアップ追従時）
node scripts/extract-mods-bundle.mjs --refresh
```

ダウンロードしたソース JSON は `data-cache/mods.{en,ja}.json` に保存される
（git 管理外。`.gitignore` で除外）。

### 出力カテゴリ

| Bundle kind | 判定条件 | 件数 (目安) |
|---|---|---|
| `normal` (フラグなし) | `domain ∈ {item,misc,flask,jewel}` AND `generation_type ∈ {prefix,suffix}` | ~2200 |
| `essence: 1` | `is_essence_only=true` | ~33 |
| `corrupt: 1` | `generation_type=corrupted` (Vaal Orb) | ~120 |
| `desecrated: 1` | `domain=desecrated` (Abyss / Ulaman / Kurgal / Amanamu) | ~370 |

### Guardrails

スクリプト末尾に最小件数チェックがあり、想定値を下回ると exit code 2 で fail する。
これは前回のような大量取りこぼしを早期に検知するため。

```
total ≥ 2000
desecrated ≥ 300
corrupted ≥ 100
essence ≥ 5
normal ≥ 1500
```

## verify-mods-bundle.mjs

生成された bundle の健全性を検証する。

```bash
node scripts/verify-mods-bundle.mjs
```

確認項目:

- kind 別カウント（normal / essence / corrupt / desecrated）
- prefix / suffix のバランス
- `text_ja` / `text_en` の null 数（前回 essence で全 null になった事故対策）
- 全 33 装備タグの per-kind spawn 数
- 「筋力および器用さ」hybrid mod の存在チェック（PoE2 では desecrated のみが正解）
- ring の normal mod サンプル

`exit 1` になる失敗条件:

- `text_ja` / `text_en` に null が 1 件でも混入
- essence < 5 / corrupted < 100 / desecrated < 300

## build-stat-scale-from-client.mjs / check-mod-values.mjs (2026-10-03)

MOD の数値の「データの値 → 画面の値」の決まりと、その全数点検。
オーナー「異界の MOD で、アミュレットなのに火スペルの MOD の中身が 400% とか。MOD をフルチェックしてくれ」。

```bash
node scripts/build-stat-scale-from-client.mjs   # pnpm build:stat-scale。csd の token → src/services/mods/stat-scale.json / stat-hidden.json
node scripts/check-mod-values.mjs               # pnpm check:mods。不一致を一覧、0 件で exit 0 (--all で照合できなかった段も出す)
```

- 決まりはアプリ側 `src/services/mods/stat-scale.ts` に 1 つ (1 万分率 ÷100、毎分 ÷60、ミリ秒 ÷1000 …)。表は `build:dicts:client` の中でも作り直す
- 点検の中身は `src/services/mods/mod-values-check.ts` (tests/mod-values.test.ts と同じ関数)。見るのは
  (a) 原本 mods-bundle の text_en と stats、(b) 計算機のエンジン (poe2htc mods.json + extra-bases.json) の段の ranges、
  (c) 樹の MOD の段 (dropOnly) と上位プレイヤーの MOD のティア表 (services/mods/tiers.ts)
- エンジンの段は **stats を持つ段だけ生の値** (stats が無い同梱の冒涜 / エッセンスは poe2db の表示値)。この前提も点検が全段で確かめる

## 関連ドキュメント

- 調査: `.company/research/topics/poe2-mod-data-sources.md`
- 型定義: `src/data/mods.ts`
