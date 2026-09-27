# contracts — ExileDesk クラフトステージとの受け渡し JSON

両リポジトリが同じ「約束の形」を見て作るための置き場。**正は `src/poe2tube/contracts/craft_stage.py` (pydantic)**、
`*.schema.json` はそこから `python scripts/export_contract_schemas.py` で生成する (手で編集しない)。

| ファイル | 向き | 中身 |
|---|---|---|
| `craft-stage-plan.schema.json` | POE2Tube → ExileDesk | 手順 JSON: ベース・ilvl・seed・カレンシーの順番 |
| `craft-stage-result.schema.json` | ExileDesk → POE2Tube | 結果 JSON: 1 手ごとの before / after / 変化 / 費用、最終アイテム |
| `examples/plan-*.json` / `examples/result-*.json` | 見本 | テスト (`tests/test_craft_stage_contract.py`) が検証する |

## 決まり

- キーは **snake_case**。ExileDesk 内部 (camelCase) との変換は ExileDesk 側の書き出し関数で行う。
- `schema` 欄で版を持つ (`craft-stage-plan/1` / `craft-stage-result/1`)。互換を壊す変更は `/2` にして両方を同時更新。
- カレンシーのキー名は ExileDesk `src/services/htc/price-keys.json` の `currency` キーをそのまま使う
  (`transmute` / `augment_greater` / `chaos_perfect` / `alchemy` / `annul` / `vaal` …)。
  冒涜は骨が装備種別で決まるので抽象キー `desecrate` / `desecrate_ancient` / `desecrate_altered`。
  エッセンスは `essence:<key>`、触媒は `catalyst_<tag>`。お告げは `omens` の id (`OmenofDextralExaltation` 等)。
- ExileDesk が結果 JSON に **キーを足すのは自由** (POE2Tube は `extra=ignore`)。消す・意味を変えるのは版上げ。
- 手順 JSON に POE2Tube が未知のキーを足すのは禁止 (`extra=forbid`)。
- `steps` は `plan.steps` の `times` を展開した数と 1:1。`steps[i].before == steps[i-1].after`、`final == steps[-1].after`。
- 使えない手 (その状態で打てないカレンシー) は飛ばさず `applied: false` + `reason` で記録し、`before == after` にする。
- 1 手ごとの `seed` は ExileDesk が `plan.seed` から派生させる (例 `seed + index`)。同じ手順 JSON なら結果 JSON も同一。
- 費用の単位は `price_unit` (`exalted` / `divine` / `chaos`)、相場は ExileDesk の market-store の値。

## ExileDesk 側の使い方 (予定)

```
node scripts/craft-stage-run.mjs plan.json result.json
```

TS の型は `json-schema-to-typescript` で `*.schema.json` から生成する (`src/services/craft-stage/contract.ts`)。
