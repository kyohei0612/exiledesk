# 手 4: ③ の式の 1 手の確率をエンジンの入口に (シミュ部長、2026-10-20)

案 = emulator/notes/2026-10-20-engine-entry-plan.md の ③ 手 4。commit 06a4ba0c (keep-compare)・0fb9ed92 (use-sim-calc・sim-greater・self-craft-dist ほか)。

## 何を変えたか
- 新しい部品 `src/services/simulator/sim-odds.ts`: アイテムの状態 (狙いのルーンを差した MOD の無いマジック・固定 + 外れ 1 つのレア・3 MOD + 壁のレア) を作り、入口を呼ぶだけ。
  - `magicAugOdds` = addOddsBySpec + hitShare (側ごとの当たり・両側が空の時の側の割合)
  - `chaosAfterFix` = addHitOdds (カオス)
  - `fractureOdds` = fractureHit (壁は未発現で数えない)
- 式の組み方 (マジックのループ magicLoopCounts・self-craft-dist の 1 人ずつ・÷ 当たり) はシミュに残した。
- 「× 3」は calc.fracP (= 1/3) からの ÷ に (use-sim-calc・self-craft-dist・use-sim-starts・use-sim-result・SimCostTip)。

## 数字 (台本 scripts/_sim-formula-probe.test.ts、`pnpm exec vitest run -c scripts/_sim-probe.config.ts`、N = 2 万)
見本 = 手袋 Intricate Gloves (マナ T1 固定) と靴 Vaal Greaves (移動速度 T3 以上を固定)、ilvl 82。エンジン = applyCurrency を N 回。

| 物 | 前 | 後 | エンジン |
|---|---|---|---|
| 増強 3 等級の p・q・share (手袋・靴) | — | 前と差 0 | 誤差の内 (例 手袋 完全 p 0.1087 / 0.1159 (638/5504)、share 0.2775 / 0.2752) |
| 固定の後のカオス 靴 耐性 (無印 / 上級 / 完全) | 0.0235 / 0.0394 / 0.0675 | 0.0252 / 0.0425 / 0.0751 | 0.0246 / 0.0421 / 0.0737 |
| 固定の後のカオス 手袋 会心倍率 (無印) | 0.0104 | 0.0110 | 0.0109 |
| フラクチャーの当たり | 1/3 | 1/3 | 手袋 0.317 (329/1038)・靴 0.347 (228/658) (6 万本、高貴 3 → 骨 → フラクチャー) |
| keepCompare のカオスの費用 (手袋 3 つ・靴) | 12331 / 7047 / 8221 / 3108 | 11674 / 6671 / 7782 / 2901 (5〜7% 安い) | — |

- 変わったのはカオスだけ: 前は固定した MOD の系統も分母に入れていた (打つ処理は固定した系統を除く)。後がエンジンに合う → 後が正しい。
- 増強・フラクチャーは前と同じ数字 (前の自前の重みは、空のマジックでは入口と同じ計算だった)。
- 解析君の突き合わせ (⑥ の回し方と並べる) はまだ。
