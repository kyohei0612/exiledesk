# ADR-002: クラフトステージとの受け渡し JSON (手順 / 結果) を pydantic で一本化する

- 日付: 2026-09-27
- 状態: 承認
- 関連: ADR-001 (全体設計)、ExileDesk `docs/decisions/001-craft-stage.md`

## 背景

POE2Tube (Python) が「この順でカレンシーを使って」と頼み、ExileDesk (TypeScript) が「1 手ごとにこう変わった」と
返す。2 つの言語・2 つのリポジトリをまたぐので、形が曖昧だと台本生成 (数字の注入) と図解描画が壊れる。

## 決定

1. **正は Python の pydantic モデル** `src/poe2tube/contracts/craft_stage.py`。
   JSON Schema は `scripts/export_contract_schemas.py` で `contracts/*.schema.json` に生成し、ExileDesk は
   そこから TS 型を作る。手書きの二重定義を持たない。
2. **手順 JSON は厳格 (`extra=forbid`)、結果 JSON は寛容 (`extra=ignore`)**。
   頼む側は勝手にキーを増やさない、返す側は将来キーを足しても壊れない。
3. **カレンシーの名前は ExileDesk の `price-keys.json` のキーを流用**し、POE2Tube で独自の名前を作らない
   (公式日本語名も ExileDesk が付けて返す。POE2Tube は訳さない)。
4. **結果 JSON は連鎖を自己検証する**: `steps` の数 = 手順の展開数、`before[i] == after[i-1]`、`final == after[-1]`。
   壊れた結果を台本生成に流さない。
5. **使えない手は飛ばさない**: `applied: false` + `reason`、`before == after`。動画で「ここでは打てない」と説明できる。
6. **再現性**: `plan.seed` から 1 手ごとの seed を派生。同じ手順 JSON → 同じ結果 JSON (撮り直し・検算のため)。
7. 見本 `contracts/examples/*.json` を置き、テストで常に検証する。

## 影響

- ExileDesk ADR-001 の「再生モード」が読む JSON はこの schema (パスを ADR に追記)。
- 台本生成は `CraftStageResult` を入力に取る (数字は LLM に作らせず、ここから注入する)。
- 費用は `price_unit` 建て。動画で「今の相場で ○ ex」と出す時の単位もここから取る。

## 却下した案

- ExileDesk の内部型 (`StageItem` の TS) を正にして Python 側で追随: TS 側の変更に Python が気づけない。
  Python を正にすれば pytest が見本 JSON で即検知できる。
- 1 ファイルの共有 TypeScript 定義を両方から import: リポジトリをまたぐ import は配置が複雑になる。
