# 開発部長 のやる事

## 常駐の宛先 (SendMessage の to。入れ替えたら直す)
| 誰 | session id | 今 |
|---|---|---|
| ブラック | local_3b3c55ab-5df3-437a-855a-5e75e2c1fa64 | 司令塔 |
| 開発部長 | (このセッション) | まとめ役 |
| ジン部長 | local_3582faa0-ba38-498d-8f47-c6aa6fd767bf | J1 |
| シミュ部長 | local_1e51d4a4-ec5b-459d-85ee-95d6da9c079f | S1 |
| 解析君 | local_2188a7ed-e2f7-4c08-a09c-72c1b5aef099 | K1 (手 4 の突き合わせ) |
| 解析君 (一時) | local_d25d3065-72c5-43e4-a27b-6a97b6bbd9de | やふやふ手袋・見本の靴。終わったらブラックが閉じる |
| 分析君・動画部長・リサーチ長 | — | 仕事が来たらブラックが立てる |

## 触っている (同じファイルは順に。始める時に書き、commit したら消す)
| 誰 | ファイル |
|---|---|
| 解析君 K1 | scripts/analysis/_auto-order-entry.ts (手 5 の本体は 32e938d9 で commit 済み、手 4 の突き合わせ中) |
| 解析君 (一時) | scripts/_flux-probe.test.ts (やふやふは ed2c9ba3 で commit 済み) |
| シミュ部長 S1 | src/views/simulator/SimPasteRead.vue・StageSimPanel.vue・StageTargetSummary.vue・SimAutoOrder.vue・use-sim-*.ts、src/services/simulator/paste-read.ts、src/state/simulator/sim-state.ts |
| ジン部長 J1 | src/services/craft-stage/item-text.ts (+ item-text-types.ts)・apply-essence.ts・spec/essence-specs.ts |
| 開発部長 D1 | scripts/deploy-web-dev.mjs |

## 順番 (2026-10-20 夜、オーナー OK 済みの物)
設計: 自動 / 手動 = simulator/notes/2026-10-20-auto-flow-design.md、UI 点検 13 件 = simulator/notes/2026-10-20-sim-ui-check.md、エンジンの付け替え = emulator/notes/2026-10-20-engine-entry-plan.md。
自動 / 手動の決め 3 つはおすすめどおり: 自動の時は ② の付け方も自動・既定は手動で前回を覚える・切ったら捨てる。10-08 の「打ち方は自動で決めない」は自動の時だけ上書き、手動はそのまま。

### シミュ部長 (階段式、1 つずつ)
- S1 貼り付けの続き = 点検 1 (ilvl・品質・コラプトを ③⑤ に持ち越す、② の注記も実際の ilvl)・2 の画面側 (読めない行の ? に理由)・3 (④ の出せない時は押す前に灰色 + 1 行、取り直しの空欄)・12 (② の % の注記)・8 (① PC で「これで始める」が見えるように)。
- S2 自動 / 手動 手 3・4 (simAuto・Snap・レシピの保存・リセット、② のチェック・帯の札・ポップアップ日英) + 点検 5 (② 次へ → 付け方の整理)。
- S3 自動 / 手動 手 5 (④⑤ を自動で埋める、⑥ の 1 行) + 点検 9・10 (⑤ の文字を絞る・回すを下に固定)・4 (④ スマホの表)。**K2 の後**。
- S4 自動 / 手動 手 6 (開発版でスナップ → OK 待ち)。デプロイは開発部長。
- S5 エンジンの付け替え 手 7 のシミュ・チュートリアル分 (import を入口へ、mechanical)。**K1 (手 5) の後、S4 の後**。
- S6 点検 6 (③ 値段の既定・単位)・7 のシミュの道具ボタン (開発部長のヘッダーの直しと一緒に)。

### 解析君
- K1 (今) 手 5 = auto-actions を stepOutcomes へ (32e938d9 済み)・手 4 の突き合わせ。
- K2 自動 / 手動 手 1: 新 auto/auto-rules.ts (rulesFromDetail・methodsFromDetail・answerFor)、check-auto-order.mjs を src の物で。
- K3 自動 / 手動 手 2: 範囲 A (白から・4 MOD から、auto-model.ts)。
- K4 エンジンの付け替え 手 7 の auto/ 分。

### ジン部長
- J1 emulator/todo.md の family の直の比べ (golden を回す) + 点検 2 の読み (見本 3 の暗黙・「ダメージが56%増加する」「ゴールド 10%」) + 見本 3・8 の「品質の最大値 +20%」(エッセンスの MOD か読みか)。parseItemText の形を変える時は先に開発部長へ (S1 が読んでいる)。

### 開発部長
- D1 `deploy:web-dev` を commit 済みの HEAD だけからビルドする形に (今すぐ)。
- D2 点検 7 のヘッダー (広告・ヘッダー・為替の選択をスマホで詰める、src/web/)。S2 の後 (StageSimPanel とぶつからない時)。UI なのでオーナーの OK 待ち。
- D3 エンジンの付け替え 手 8 (scripts/check-engine-entry.mjs + CI)。S5・K4 の後。

### ブラックに頼む事
- 点検 11・13 (チュートリアル: views/tutorial/・services/tutorial/topic-courses*) は今のシミュの列とファイルが重ならないので、一時の係 (シミュ部長 (チュートリアル)；UI 点検 11・13) を立ててよいか。立てないなら S6 の後に回す。

## OK 待ち
