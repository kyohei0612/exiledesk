# ADR-001: クラフトステージ (craft-stage) — ゲームと同じ挙動で 1 手ずつ見せる実演シミュレーター

- 日付: 2026-09-27
- 状態: 承認 (実装前)
- オーナー指示: 「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」
  「クラフトステージでいこう」
- 関連: POE2Tube 側 `docs/decisions/001-poe2tube-architecture.md` (動画パイプライン全体)
- 注: ExileDesk 初の ADR。これまで設計はファイル先頭コメントと memory に置いてきたが、
  他リポジトリ (POE2Tube) から参照される機能なので文書として独立させる。

## 背景

- ExileDesk のクラフト計算機 (`HtcCraftLab`) は「確率と期待費用を計算する研究室」で、
  画面に出るのは○×ツリーと数字。**実際にカレンシーを 1 個使ってアイテムがどう変わるか** を見せる画面は無い。
- YouTube (POE2Tube) の初心者向けクラフト解説で「実際に作ってみた」パートを、
  実ゲーム画面を録画せずに **ExileDesk の画面で** 見せたい。配信 (OBS) でも同じ画面で手動実演したい。
- 調査結果 (2026-09-27): 既存エンジンに「本物のアイテム状態 + カレンシー 1 個 → 新しい状態」を返す API は **無い**。
  - `sim-route-helpers.ts` の `apply()` は乱数で抽選するが、状態が「狙い MOD か外れ (null)」に畳まれ、
    外れた時にどの MOD が付いたか分からない。rarity / ベース名 / 数値も持たない。
  - vendor `plan.ts` の `applyStep` は完全な `ItemState` を扱うが抽選せず、狙い通り付いた前提で進む (非 export)。
  - Transmute / Augment / Regal / Alchemy / 普通のエッセンス は確率計算のみで抽選が無い。**Vaal は未実装**。
  - 乱数は `rng.ts` の `mulberry32(seed)` で決定論的。`Math.random` は不使用。

## 決定

### 1. 名前と置き場

| 項目 | 値 |
|---|---|
| 表示名 (左メニュー) | **クラフトステージ** |
| コード ID | `craft-stage` |
| サービス | `src/services/craft-stage/` (新設、engine とは分離) |
| 画面 | `src/views/craft-stage/CraftStage.vue` + パネル分割 |
| CLI (動画用) | `scripts/craft-stage-run.mjs` (`_htc-bridge-entry.ts` に export を足す) |
| コミット scope | `feat(craft-stage): ...` |
| 位置づけ | `HtcCraftLab` = 研究室 (計算)、クラフトステージ = 舞台 (実演)。エンジンのデータは共有 |

### 2. 「本物の状態」を持つ型を新設する

vendor の `ItemState { base, level, rarity, prefixes, suffixes }` を拡張し、**表示に必要な全部** を持つ:

```ts
StageItem {
  base: ItemBase; name: string; ilvl: number; rarity: Rarity;
  prefixes: StageMod[]; suffixes: StageMod[];   // 各 { modId, tierName, values: number[], fractured?, desecrated? }
  quality?: number; corrupted?: boolean;
}
StageStep { currency: StageCurrency; omen?: string; seed: number;
            before: StageItem; after: StageItem; changed: { added?: StageMod; removed?: StageMod }; cost: number }
```

- 数値は `Tier.ranges` から抽選して埋める (`fillHashes` で日本語 1 行に)。
- 既存の `SimState` / `Slot` (抽象状態) は触らない。**`sim-route-helpers.ts` (391 行) には足さない**。

### 3. 1 手抽選 `applyCurrency(data, item, currency, rng): StageStep`

- 重みは既存の `modTierWeight` / `poolTotalWeight` / `familiesOf` を使い、
  規則 (側・枠・クラフト MOD 1 つ・冒涜 1 つ・お告げ) は `sim-route-helpers.ts` の `usable` / `apply` の分岐を移植。
- 実装するカレンシー (段階):
  - **Phase 1 (1 分テスト用)**: Transmute / Augment / Regal / Exalt / Chaos / Annul / Alchemy (強さ 3 種は Exalt / Chaos / Regal に)
  - **Phase 2**: Essence (普通 / パーフェクト) / Desecrate / お告げ各種 / 触媒 (品質)
  - **Phase 3**: Vaal (結果表を poe2db から確認してから。現状 "corruption is not modelled")
- 乱数は `mulberry32(seed)` を **1 手ごとに seed を持つ** (StageStep.seed)。同じ seed 列なら何度でも同じ結果 = 動画の再撮り・検算が可能。

### 4. 2 つの入力、1 つのエンジン

| モード | 入力 | 用途 |
|---|---|---|
| 手動 | 画面のカレンシー棚をクリック | 配信 / 自分の練習 |
| 再生 | 手順 JSON (`{ base, ilvl, steps:[{currency, omen?}], seed }`) | 動画 (POE2Tube が渡す) |

- **操作は Craft of Exile 仕様** (2026-09-27 オーナー指示): カレンシー棚のアイコンをクリック → カーソルにアイコンが付いて持った状態になる →
  アイテム枠をクリックで適用 (例: 冒涜の骨アイコンを持ってアイテムをクリック = 冒涜)。右クリック / Esc で手放す。
  持ったまま連続でクリックすれば連打 (Chaos スパム) になる。
- **カレンシーは計算機 (HtcCraftLab) の物をそのまま使う**: 棚に並ぶ種類・アイコン・日本語名・値段は `price-keys.json` / `labels.ts` /
  `market-store` にリンクし、クラフトステージ側で独自の一覧を持たない。「その状態で使えない物」は計算機と同じ `usable` 判定で灰色にする。
- **クラフトの規則も計算機と同一**: 側・枠・クラフト MOD 上限・冒涜 1 つ・お告げの効き方は HTC の規則を移植し、計算機の確率と実演の抽選が食い違わないこと
  (検算: 同じ状態・同じカレンシーで `stepProbability` の分布と `applyCurrency` を多数回引いた頻度が一致する)。
- 再生モードは 1 手ごとに `StageStep` を配列に積み、**結果 JSON を書き出す** (POE2Tube の台本生成の入力)。
- **JSON の形は POE2Tube が正** (2026-09-27 取り決め、POE2Tube ADR-002):
  `C:\Users\kyohei\POE2Tube\contracts\craft-stage-plan.schema.json` (手順、入力) と
  `craft-stage-result.schema.json` (結果、出力)。見本は `contracts/examples/`、決まりは `contracts/README.md`。
  TS 型は schema から `json-schema-to-typescript` で `src/services/craft-stage/contract.ts` に生成し、手書きしない。
  キーは snake_case、カレンシーは `price-keys.json` のキー、冒涜は `desecrate` / `desecrate_ancient` / `desecrate_altered`、
  使えない手は `applied:false` + `reason` で `before == after`、seed は `plan.seed` から 1 手ごとに派生。
- 画面は「アイテム枠 / カレンシー棚 / 変化ハイライト / 工程履歴 (下に積み上がる)」の 4 パネル。
  積み上がる履歴が POE2Tube の「積み上げ図解」と同じ見え方になるようにする。
- 撮影は POE2Tube 側の責務 (ヘッドレスブラウザで再生モードのページを開き、1 手ごとに PNG)。
  そのため再生モードは **URL / IPC で手順 JSON を受け取り、`?step=N` で任意の手まで進めた静止状態** を出せること。

### 5. 表示は公式日本語のみ

- MOD は `jaOfMod` / `fillHashes`、カレンシー・お告げは `jaOfPriceKey` / `jaOfOmen`。自前で訳さない (labels.ts の決まり)。
- 相場は `market-store` の値を使い、外部 API は叩かない (api-probing-policy)。

### 6. 守る決まり

- 1 ファイル 500 行まで (目標 300)。Vue は `views/craft-stage/` にパネルを切り出し、composable は親で 1 回だけ呼ぶ。
- Pinia 不要、`src/state/` に `reactive` シングルトン。scoped style 禁止、`src/style.css` の `@layer components`。
- 検算は `scripts/check-craft-stage.mjs` (`bundleEntry` → `loadPatchSync` → seed 固定で 1 手ずつ → 期待の rarity / 枠数 / 段の下限を `NG:` で数える)。
- 実装後は `pnpm dev` + アプリ本体で一度動かしてからリリース。

## 影響

- HTC (AGPL-3.0) のデータ・重み計算を使うので、クラフトステージも AGPL の範囲内 (ExileDesk 全体が既に AGPL)。
- `_htc-bridge-entry.ts` の export が増える。`extra-bases.json` / `weight-overrides.ts` の仮重み (冒涜 2500 等) は
  実演結果にもそのまま反映されるため、動画では「重みは poe2db 由来の推定」と一言添える。
- 既存の `HtcCraftLab` / `sim-route*` / vendor には手を入れない (回帰リスクゼロ)。

## 却下した案

- `sim-route-helpers.ts` の `apply()` を拡張して本物の MOD を返す: 抽象状態が前提の 391 行を壊す。別ファイルが安全。
- vendor の `applyStep` を export して使う: 抽選しないので「実際に使ったらどうなるか」にならない。
- 画面録画 (実ゲーム): POE2Tube ADR-001 で却下済み (尺が声と合わない、自動化できない)。

## 次の一手

1. `src/services/craft-stage/types.ts` + `apply-currency.ts` (Phase 1 の 7 種) + `check-craft-stage.mjs`
2. `views/craft-stage/` の 4 パネルと左メニュー登録、再生モード (`?step=N`)
3. POE2Tube から `scripts/craft-stage-run.mjs` を叩いて結果 JSON を受け取る疎通
