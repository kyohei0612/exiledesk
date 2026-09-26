# POE2HTC のクラフトエンジン (取り込み)

ここは **他人のコード** です。ExileDesk の書き方 (日本語コメント、命名) は適用しません。
上流をそのまま置いて、差分を下に全部書きます。上流を追う時はこの表だけ見れば済むようにしてください。

- 出どころ: <https://github.com/Dboire9/POE2_HTC> (作者 Dboire9)
- ライセンス: **AGPL-3.0** (`LICENSE` にそのまま置いてあります)
- 取り込んだ版: `main` / patch データは 0.5.0
- 取り込んだ日: 2026-09-22

## AGPL について

AGPL-3.0 のコードを取り込んだので、**ExileDesk 全体が AGPL-3.0 になります**。
このリポジトリは元から公開なので、実務上は「LICENSE を置いて出典を書く」で条件を満たします。
非公開にする場合はここを丸ごと外す必要があります。

## 何を取り込んだか

| 置き場所 | 上流 | 中身 |
| --- | --- | --- |
| `engine/` | `packages/engine/src` | アイテムの状態、MOD プール、通貨のルール、確率 (純粋 TS) |
| `optimizer/` | `packages/optimizer/src` | 手順の探索と、状態ごとの最適手を解く solver |
| `data/` | `data/patches/0.5.0` | `mods.json` (2917 MOD) / `base_items.json` (52 クラス) / `essences.json` |

`prices.json` は取り込んでいません。値段は ExileDesk 側 (poe2scout と取引所) を使います。

## 上流から変えたところ (これで全部)

1. **テストと fixture を入れていません** (`*.test.ts`, `__fixtures__/`)。検算は上流のリポジトリで回ります。
2. **`node:fs` を使う 3 ファイルを外しました。** ブラウザでは JSON を直接 import するので要りません。
   - `engine/loadPatch.ts` … 代わりに `engine/indexPatch.ts` (純粋) を使う
   - `optimizer/loadPrices.ts` / `optimizer/frozenPrices.ts` … 代わりに `optimizer/cost.ts` の `indexPrices`
   併せて `engine/index.ts` と `optimizer/index.ts` からその再輸出を外しました。
3. **import のパスを平らにしました。** 上流は `packages/{engine,optimizer}/src` の 2 階層なので
   `'../../engine/src/x.ts'` と書いてあります。ここは兄弟なので `'../engine/x.ts'` に置換しました。
4. **使っていない引数 2 つに `_` を付けました** (ExileDesk の `noUnusedParameters` に引っかかるため)。
   - `engine/probability.ts` の `perfectEssenceProbability(data → _data, ...)`
   - `optimizer/optimize.ts` の `buildSteps(data → _data, ...)`

5. **`optimizer/markovActions.ts` の `pricedStepOf` を export しました** (1 語)。MDP の手を
   「何と何のお告げを使うか」に翻訳する唯一の場所で、画面に日本語名を出すのに要ります
   (`services/htc/labels.ts`)。写すと上流とずれるので、export して 1 か所のままにしました。
6. **使っていない optimizer の 5 ファイルを外しました** (2026-09-26)。`optimizer/index.ts` / `fromItem.ts` /
   `alternatives.ts` / `validate.ts` / `simulate.ts`。ExileDesk の画面からも検算からも届かないため。
   上流のコメントがこれらの名前を指している所 (`optimize.ts` など) はそのままです。

`tsconfig.json` の `lib` を ES2020 → ES2022 に上げています (`Array.prototype.at` を使うため)。

## 上流の但し書き (そのまま引き継ぐ)

- **desecrated の重みは実測ではありません。** poe2db が重みを公開していないので、上流が一律 2500 に置いています。
- **ルーンのプールの重みも実測ではありません。** 同じく一律 1000 です。
- 通常 MOD の重みは poe2db の `DropChance` で、これは PoE1 の同系統から当てた推定値です
  (ExileDesk の `scripts/build-mod-weights-poe2db.mjs` が使っているものと同じ出どころ)。

詳しくは上流の `docs/validation.md` (検証ログ) と `docs/ALGORITHM.md` を見てください。
