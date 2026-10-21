# 金の指輪のキャストスピードの素の重み (調べ、2026-10-22)

頼み: ブラック (オーナー 10-22、計算せず調べだけ)。元は配信者の「poe2db のキャストスピードのウェイトが壊れて 1 になっている、実感では 1/5 くらいで付く」(research/notes/2026-10-21-owner-stream-wishes.md の D)。
台本 `scripts/analysis/cast-speed-weight-probe.mjs`。

## 1. エンジン (src/) が使っている重み
- `Rings/IncreasedCastSpeed` = **5 段とも 1,000** (出始め ilvl 1 / 18 / 35 / 51 / 60)。
- 出どころ: `src/services/htc/weight-overrides.ts` の上書き (2026-09-23)。「poe2db の重みは PoE2 の新 MOD が 1 = 不明のまま」なので、仮置きの 1 を **Craft of Exile (beta, PoE2) の CastSpeedJewellery1-5 / ring = 1,000** で埋めた (首飾りは 800)。一度「動画のカオス約 500 回に 1 回」から 60 に下げたが、それは T1 の回数だったので CoE に戻した (同じファイルの経緯)。
- 比べ: レアリティ (サフィックス、`ItemFoundRarityIncrease`) = 3 段とも 1,000、全元素耐性 (`AllResistances`) = 5 段とも 800 (どちらも上書き無し、poe2db の値)。

## 2. Craft of Exile (手元の写し data-cache/coe-beta-data.json、2026-10-09)
classmods の指輪 (クラス 33、首飾りは 34):
| MOD (GGG の key) | 出始め | 指輪の重み |
|---|---|---|
| CastSpeedJewellery1〜5 | 1 / 18 / 35 / 51 / 60 | **1,000 ずつ (実数)** |
| ItemFoundRarityIncrease1〜3 (サフィックス) | 3 / 24 / 40 | 1,000 ずつ |
| AllResistances1〜5 | 12 / 26 / 40 / 54 / 68 | 800 ずつ |
- 首飾りは CastSpeedJewellery1〜6 が 800 ずつ。CoE は 1 ではなく実数を持っている (エンジンと同じ値)。

## 3. poe2db の指輪のページ (https://poe2db.tw/us/Rings、2026-10-22 に公開ページを 1 回読んだ。ページ内の ModsView の JSON の DropChance = Weight 列)
| 名前 | 出始め | Weight |
|---|---|---|
| of Talent / of Nimbleness / of Expertise / of Sortilege / of Legerdemain (キャストスピード 5 段) | 1 / 18 / 35 / 51 / 60 | **1 (5 段とも)**。ほかの行は文字列の "1000" などだが、ここだけ数字の 1 |
| of Plunder / of Raiding / of Archaeology (レアリティ) | 3 / 24 / 40 | 1000 |
| of the Crystal〜of the Rainbow (全元素耐性) | 12〜68 | 800 |
- **配信者の言うとおり、poe2db のキャストスピードは 1 になっている**。エンジンは 9-23 からこれを使っていない (CoE の 1,000 で上書き済み)。

## 4. 重みで「素の右側の高貴 + 上級」の当たりがどう変わるか (エンジンで 20,000 回)
始め = スペルダメージ T2 (F) + レアリティ T1。キャストスピードの 5 段の重みだけを台本の中で書き換えた (src は触らない)。
| キャストスピードの重み | T2 以上 | どの段でも |
|---|---|---|
| **1,000 (エンジン・CoE、今)** | **4.37%** | 6.52% |
| 1 (poe2db) | 0.00% | 0.01% |
| 200 (参考: 配信者の「1/5」を 1,000 の 1/5 と読んだ場合。この読みは推測) | 0.97% | 1.48% |
- poe2db の 1 をそのまま使うと、キャストスピードは素の高貴ではほぼ付かない。エンジンと CoE の 1,000 では T2 以上が 1 回 4.4%。配信者の「実感 1/5」が何に対する 1/5 か (重みか、付く割合か) は配信の言葉からは決まらない。
- 前の金の指輪・マナ系の指輪の計算 (8561d67c ほか) は全部エンジンの 1,000 で回している。

## 確かめた物
- 外の正解: CoE の写しと poe2db の公開ページ (どちらも読むだけ)。ゲーム内の実測は無い。
- エンジンで回した: 4 の表。
