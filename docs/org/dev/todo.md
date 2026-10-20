# 開発部長 のやる事

## 常駐の宛先 (SendMessage の to。入れ替えたら直す)
| 誰 | session id | 今 |
|---|---|---|
| ブラック | local_3b3c55ab-5df3-437a-855a-5e75e2c1fa64 | 司令塔 |
| 開発部長 | (このセッション) | まとめ役 |
| ジン部長 | local_3582faa0-ba38-498d-8f47-c6aa6fd767bf | 手空き (次: 見張りのずれの元探し) |
| シミュ部長 | local_1e51d4a4-ec5b-459d-85ee-95d6da9c079f | S1 |
| 解析君 | local_2188a7ed-e2f7-4c08-a09c-72c1b5aef099 | K2 (auto-rules.ts) |
| 解析君 (一時) | local_d25d3065-72c5-43e4-a27b-6a97b6bbd9de | やふやふ手袋・見本の靴。終わったらブラックが閉じる |
| 分析君・動画部長・リサーチ長 | — | 仕事が来たらブラックが立てる |

## 触っている (同じファイルは順に。始める時に書き、commit したら消す)
| 誰 | ファイル |
|---|---|
| 解析君 K2 | 新 src/services/simulator/auto/auto-rules.ts、scripts/analysis/check-auto-order.mjs・_auto-order-entry.ts、docs/org/math/README.md (地図 + 私の頭の 1 行も一緒に commit してもらう) |
| 解析君 (一時) | scripts/_flux-probe.test.ts (やふやふは ed2c9ba3 で commit 済み) |
| シミュ部長 S1 | src/views/simulator/SimPasteRead.vue・StageSimPanel.vue・StageTargetSummary.vue・SimAutoOrder.vue・SimStartPick.vue・use-sim-auto-order.ts・use-sim-steps.ts、src/state/simulator/sim-state.ts、src/views/craft-stage/StageBasePage.vue・use-stage-base.ts (各 1〜3 行) |

## 順番 (2026-10-20 夜、オーナー OK 済みの物)
設計: 自動 / 手動 = simulator/notes/2026-10-20-auto-flow-design.md、UI 点検 13 件 = simulator/notes/2026-10-20-sim-ui-check.md、エンジンの付け替え = emulator/notes/2026-10-20-engine-entry-plan.md。
自動 / 手動の決め 3 つはおすすめどおり: 自動の時は ② の付け方も自動・既定は手動で前回を覚える・切ったら捨てる。10-08 の「打ち方は自動で決めない」は自動の時だけ上書き、手動はそのまま。

### シミュ部長 (階段式、1 つずつ)
- S1 貼り付けの続き = 点検 1 (ilvl・品質・コラプトを ③⑤ に持ち越す、② の注記も実際の ilvl)・2 の画面側 (読めない行の ? に理由)・3 (④ の出せない時は押す前に灰色 + 1 行、取り直しの空欄)・12 (② の % の注記)・8 (① PC で「これで始める」が見えるように)。
- S1b ④ の build (手 5 で +1.7 秒、画面の側で止まる) をワーカー (auto-order.worker.ts) で組む。エンジンのデータの渡し方は解析君に聞く (開発部長経由)。
- S2 自動 / 手動 手 3・4 (simAuto・Snap・レシピの保存・リセット、② のチェック・帯の札・ポップアップ日英) + 点検 5 (② 次へ → 付け方の整理)。
- S3 自動 / 手動 手 5 (④⑤ を自動で埋める、⑥ の 1 行) + 点検 9・10 (⑤ の文字を絞る・回すを下に固定)・4 (④ スマホの表)。**K2 の後**。
- S4 自動 / 手動 手 6 (開発版でスナップ → OK 待ち)。デプロイは開発部長。
- S5 エンジンの付け替え 手 7 のシミュ・チュートリアル分 (import を入口へ、mechanical)。**K1 (手 5) の後、S4 の後**。
- S6 点検 6 (③ 値段の既定・単位)・7 のシミュの道具ボタン (開発部長のヘッダーの直しと一緒に)。

### 解析君
- K1 済み: 手 5 (32e938d9)・手 4 の突き合わせ (11cbb873)。
- K2 自動 / 手動 手 1: 新 auto/auto-rules.ts (rulesFromDetail・methodsFromDetail・answerFor)、check-auto-order.mjs を src の物で。
- K3 自動 / 手動 手 2: 範囲 A (白から・4 MOD から、auto-model.ts)。
- K4 エンジンの付け替え 手 7 の auto/ 分。

### ジン部長
- J1 済み (70c53ff0・a94d7aaf): 点検 2 は今の読みで読めない行 0 (コード直し無し)、品質の最大値 +20% は poe2db でブリーチのエッセンスのプレ (正しい)、family の直の比べを mod-rules へ。残り: currency-spec-golden が 10-17 の控えからずれている元探し (emulator/todo.md)。元の中身: emulator/todo.md の family の直の比べ (golden を回す) + 点検 2 の読み (見本 3 の暗黙・「ダメージが56%増加する」「ゴールド 10%」) + 見本 3・8 の「品質の最大値 +20%」(エッセンスの MOD か読みか)。parseItemText の形を変える時は先に開発部長へ (S1 が読んでいる)。

### 開発部長
- D1 済み (aa0d414a): `deploy:web-dev` は HEAD を ../ExileDesk-devbuild でビルド。HEAD 7660d25b を開発版に置いた (手 5 入り)。
- D2 点検 7 のヘッダー (広告・ヘッダー・為替の選択をスマホで詰める、src/web/)。S2 の後 (StageSimPanel とぶつからない時)。UI なのでオーナーの OK 待ち。
- D3 エンジンの付け替え 手 8 (scripts/check-engine-entry.mjs + CI)。S5・K4 の後。

- 点検 11・13 済み: 一時の係「シミュ部；チュートリアルの使いづらい所」が d1c97969。開発版 (HEAD 4b4e0818) を手元で開いて画面で確かめた (コース一覧は題と手数だけ・段 5 は次に押す物が光る)。本番の画面なので pending-release.md に OK 待ちで記載。

### オーナーの決め待ち (ブラック経由)
- ③ の白から作る費用のリロールの回数: magicLoopCounts (候補の側に外れがあれば消去 1 つ、無ければ増強、エンジンと 3% 以内・安い) か、字のとおり 1 ÷ (p × 側の割合) (消去 × 2 → 増強 1)。記録 simulator/notes/2026-10-20-step4-formula-entry.md。決まったらシミュ部長へ。

## OK 待ち
- 開発版 HEAD 4b4e0818 (10-20 夜): 手 5・チュートリアル 11・13・エッセンスの family。UI の物は pending-release.md
