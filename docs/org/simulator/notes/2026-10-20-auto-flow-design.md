# 自動 / 手動の流れと「⑤ を最善手で埋める」— 設計 (シミュ部長、2026-10-20)

設計だけ。リポジトリは書き換えていない・commit していない。
読んだ物: docs/org/simulator/README.md・todo.md・notes/auto-order-design.md、docs/org/dev/README.md、docs/org/math/notes/auto-order-2026-10-20.md、
共有メモ auto-order-api.md・auto-order-ui-asks.md、メモ sim-step-pages・sim-decisions-2026-10-20・feedback-show-sim-rules・feedback-minimal-text-ui・optimal-craft-dp。
コード: use-sim-steps.ts (reach・goTo・resetPatterns・Snap)、sim-state.ts、web-page.ts (SIM_STEPS)、StageSimPanel.vue (工程ごとの差し込み)、SimAutoOrder.vue、
auto-solve.ts (orderDetail の view = 見えている形ごとの最善手・visits)、auto-actions.ts (quizActionOf = 手の名前 → ⑤ の答え)、auto-model.ts (範囲外の理由 no(...))、
quiz-recipe.ts (QuizRule = { when, do }、When の項目)、scripts/analysis/check-auto-order.mjs の rulesOf (方策 → ⑤ の答え、エンジンとの突き合わせで使用済み)。

## 0. 決めてもらう事 (おすすめを先に)
1. **自動の時は ② の付け方 (高貴 / カオス、残りの付け方) も自動で決めるか** — おすすめ: はい。② で選ぶのは完成品の MOD・段・フラクチャーの印だけ、付け方の欄は「自動」と出す。
   最善手の中身で付け方は決まる (手袋の 1 位は投射物 = カオス 100%、ES = カオス 67% / 高貴 33%。optimal-craft-dp)。
   オーナーの「切ったら ② の付け方までリセット」はこの形だと自然 (自動が埋めた付け方を手動の既定に戻す)。
   別案: 付け方は今まで通り人が選び、自動は ④ 順番と ⑤ 答えだけ (その時は切った時のリセットは ④ から先)。
2. **既定は手動、前回の選び方を覚える** — おすすめ: これ (localStorage)。今の自動はフラクチャー済みを買う始め方しか対応しておらず (下の 3-3)、既定を自動にすると多くの狙いで「未対応 → 手動」の行が出て迷う。
   解析君の手 A (白から・4 MOD から も対応) が入ったら既定を自動に変える案を出し直す。
3. **自動を切った時は捨てる (オーナー案) か、自動の答えを残して手動で直せるようにするか** — おすすめ: オーナー案どおり捨てる (② の付け方に戻す)。
   残す案は「最善手を土台に少し直したい」人には便利だが、自動の付け方と手動の付け方の食い違い (関門の打ち止め 3,000 / 300 が変わる) で答えが打てない場面が出る。
   残す案は後で「自動の答えを写して手動のパターン 2 にする」ボタンとして足せる (⑥ の比べに並ぶ)。

## 1. 置き場と、工程ごとの出る / 隠れる

### 自動のチェックの置き場
- **【オーナー 10-20 の画面の後で上書き】工程の帯の「自動 / 手動」の札は外す。「自動で組む」のチェックは ② の「規格外ソケット」の右側に。下は元の設計**。
- **② 狙う MOD のページの見出しの右** に `[ ] 自動で組む ?` (チェック 1 つ)。① の貼り付けの「これで始める」は ② に来るので、貼った直後に目に入る。
  - ? の中: 「付け方・付ける順番・打ち方を最善手で埋める。決まりは ④・⑤ の ? に書いてある」
- **工程の帯 (SimStepBar) の右端に札「自動」/「手動」**。③〜⑥ のどこからでも今の形が分かる。押すと切り替え (= 下の 2 のポップアップ)。
- 状態は `craftStage.simAuto` (sim-state.ts に ref を 1 つ)。1 つ戻す (Snap) とレシピの保存 (sim-recipes) に入れる。
- ② で今の狙いが自動の範囲外なら、チェックは押せるが下に 1 行「自動に未対応: <理由> · 手動で続ける」(理由は buildAutoModel の reason をそのまま)。② の「次へ」では手動で進む (何も埋めていないのでポップアップは出さない)。

### 表
| 工程 | 手動 (今のまま) | 自動 |
|---|---|---|
| ① ベース (?page=base) | 今のまま (貼り付けのタイル・カタログ) | 同じ。自動 / 手動は ① では選ばない (ベースを選ぶ人は工程を知らない) |
| ② 狙う MOD | MOD・段・フラクチャーの印・付け方 (▾)・残りの付け方・どれか | MOD・段・フラクチャーの印・どれかは同じ。**付け方の ▾ は「自動」の札** (高貴 / カオス / 残りの付け方)。冒涜専用・エッセンスは MOD で決まるのでそのまま。増強スパムは選べない (範囲外、▾ に灰色で「自動は未対応」)。範囲外の行 1 つ |
| ③ ベースの値段 | 今のまま | 同じ (値段は計算に要る)。違いなし |
| ④ 付ける順番 | ベースの計算 + 「おすすめの順番を出す」ボタン + つかんで並べる表 | ベースの計算はそのまま。**④ に入ったら自動で計算を始め、1 位を表に入れる** (ボタン無し、「計算中 2/3 · やめる」)。上位 3 + 今の順番の表は出す (「この順にする」で選び直せる)。手で並べ替えてもよい → その順番で ⑤ を埋め直す (自動のまま) |
| ⑤ 打ち方 | クイズ (場面ごとに答える)・答えた一覧・パターン | **答えは自動で埋まる**。出す物: 1 行「自動で答えた N 場面 · 目安 約 X 神 · 完成 Y%」+ ? (決まりの文) + 「答えた一覧 ▼」(閉じて、開くと読むだけ)。**クイズの欄・答える欄・パターンを足すボタンは隠す**。「手で直す」ボタン = 自動を切る (ポップアップ) |
| ⑥ 回す・結果 | 今のまま | 同じ回し方 (quizFromSim + runQuizOnce)。結果の上に 1 行「計算の目安 約 X 神 / 回した 約 Z 神」(ずれが見える)。パターンの比べの札は 1 本 (「自動」) だけ |

- 文字は最低限 (feedback-minimal-text-ui): 自動の決まりは全部 ? の中、既定で閉じる。
- 決まりは画面に文で (feedback-show-sim-rules): 自動の答えは「答えた一覧」に手動と同じ文 (quiz-text の whenText / actionText) で全部出す。10-08 の「打ち方は自動で決めない・プリセットは出さない」は、10-20 のオーナーの自動の指示で上書きと読む (手動は今まで通り残るので両立)。⚠ この読みはブラック経由でオーナーに一言確かめたい。

## 2. 自動を切った時・入れ直した時のリセット

### 切った時 (自動 → 手動)
- 消す物: ② の付け方 (自動が入れた高貴 / カオス・残りの付け方 → 手動の既定 = methodsFor の最初)、④ の順番 (orderKeys の既定の並び)、⑤ の答え (パターンを空)、⑥ の結果。
- 残す物: ベース・アイテムレベル・ソケット・② の狙う MOD と段・フラクチャーの印・どれか、③ の値段。
- 行き先: ② のページ (付け方を選ぶ所から)。
- ポップアップを出すのは消す物がある時だけ (② にいて ④ 以降がまだなら黙って切り替える。オーナー 10-19「何も変わってない判定なら消さない」と同じ考え)。
- 1 つ戻す (Ctrl+Z) で戻せる (Snap に simAuto と patterns・order・targets が入る)。

| | 日本語 | English |
|---|---|---|
| 題 | 手動にしますか? | Switch to manual? |
| 本文 | 自動で決めた付け方・付ける順番・打ち方の答えは消えて、② の付け方を選ぶ所に戻ります。狙う MOD と値段はそのまま。 | The methods, order and answers chosen automatically will be cleared, and you'll go back to choosing methods in step 2. Your target mods and prices stay. |
| ボタン | 手動にする / 自動のまま | Switch to manual / Keep auto |

### 入れ直した時 (手動 → 自動)
- 消す物: ⑤ の手で入れた答え (全パターン)・⑥ の結果・② の付け方 (自動にする)。④ の順番は自動の計算で置き換える。
- 行き先: 今のページのまま。④ より先にいたら ④ に戻って計算 → ⑤ を埋める。② にいれば何も消えない。
- ポップアップは手で入れた答えか結果がある時だけ。

| | 日本語 | English |
|---|---|---|
| 題 | 自動にしますか? | Switch to auto? |
| 本文 | 手で入れた打ち方の答え (N 場面) と回した結果は消えて、付け方・付ける順番・打ち方を最善手で埋め直します。 | Your answers (N situations) and run results will be cleared, and methods, order and answers will be refilled with the best moves. |
| ボタン | 自動にする / 手動のまま | Switch to auto / Keep manual |

用語: 「最善手」の英語 best moves は auto-order の既存の文 (played optimally) と揃える。新しいゲーム用語は無い (GLOSSARY.md の確認は書く時に)。

## 3. ⑤ を最善手で埋める

### 3-1. 方策 → ⑤ の答え
- 入口はもうある: `orderDetail(model, order, { mc })` の `view` = 見えている形ごとの最善手の名前・値・mc で通った回数。手の名前 → 答えは `quizActionOf(model, name)` (auto-actions.ts)、restart は `{ restart: true }`。
- 形 → 答えの条件 (When) は台本 check-auto-order.mjs の `rulesOf` がもう書いている (札ごと 0/1/2、固定の札 3、p./s. の junk・hid・bad、des、aug、要るルーンを差す答え)。エンジンとの突き合わせ (手袋・靴、⑥ と同じ回し方 1,000 人) もこの答えで回って順位が揃った。
  → **rulesOf を src に移す** (新 src/services/simulator/auto/auto-rules.ts、解析君)。形: `rulesFromDetail(model, detail, recipe) → QuizRules`。同じ When になる形が 2 つ以上なら通った回数の多い物 (今の台本と同じ)。
- 付け方を自動にする時 (決めてもらう事 1): `methodsFromDetail(model, detail)` → 札ごとに mc で付いた手の多い方 (高貴系 / カオス系) を ② の method に入れる。関門の打ち止めの種類 (spam 3,000 / step 300) がこれで決まるので、method → 打ち止め → もう一度 solveOrder の順で 1 回だけ回し直す (2 回目で method が変わらなければ確定、変われば 2 回目の物で止める)。
- 埋めた後の穴埋め (解析君に頼む本体): 計算の形はエンジンの場面より粗い (段は狙い以上で 1 つ、外れの系統は数だけ) ので、⑥ で回すと答えの無い場面が出る事がある。
  - 案: `answerFor(model, order, situation) → QuizAction` (エンジンの場面 → 計算の形に落とす → 方策の手)。⑤ の今の「答えの無い場面を探す」流れ (StageQuizEditor の exploring) を自動で回し、無い場面に answerFor の答えを足す。300 人 × 最大 3 回で 0 になるまで。
  - それでも当てはまらない人は今の決まりどおりイレギュラー (止めて、どの計算にも入れない。sim-decisions-2026-10-20)。
  - 段が低いまま付いた (札の値 1) は「ここでは付いていない」扱い (今の決まり) なので形は外れ側に落ちる。answerFor で同じに扱う。

### 3-2. 計算の時間
- 今の数字 (解析君の表): 順番 1 つ 手袋 12 ms・靴 106 ms (1 つ目は 130〜310 ms)、順番の候補 手袋 120 通り 2.4〜3.1 秒、mc 2,000 人 数百 ms。
- 自動の流れ: ② の「次へ」で buildAutoModel (範囲の判定もここ。靴で 0.3 秒程度、手袋は測る) → ④ に入ったら候補の計算 (ワーカー、今の auto-order) → 1 位で orderDetail(mc 500) → rulesFromDetail → 穴埋めの回し (300 人 × 最大 3)。
- 見込み: ④ に入ってから ⑤ が埋まるまで手袋で 5〜15 秒 (穴埋めの回しの速さ次第、⑥ の回す処理の今の速さで測る)。目標 **⑤ に着くまでに埋まっている** (④ を見ている間に裏で進む)。埋まる前に ⑤ に来たら「埋めている 2/3」と出す。
- ワーカー: 今の auto-order.worker.ts に「detail」の仕事を足す (model だけで閉じる)。rulesFromDetail は recipe (quizFromSim) が要るので画面の側。穴埋めの回しはエンジンのデータが要るので ⑥ の回す処理と同じ所 (use-sim-run)。

### 3-3. 範囲外の狙いの時の出し方
- **【オーナー 10-20 の 2 回目で上書き】T1 の狙いがあってもチェックは押せ、押すと警告のポップアップで「T2 以上にして自動にする / 手動のまま」。前者で T1 を T2 以上に下げる (Ctrl+Z で戻せる、フラクチャー固定は下げない)。下は 1 回目の決め**。
- **【オーナー 10-20 決定】自動で選べる段は T2 以上まで**。② で T1 だけの狙いがある時は自動のチェックを押せず、1 行「T1 だけの狙いは自動では組めない。手動で」/ "Targets that need T1 only can't be planned automatically. Use manual." (英語は書く時に GLOSSARY で確かめる)。理由: T1 だけはほぼ完成しない・計算が長い・管理しきれない。例外の見込み: フラクチャーで固定済みの MOD (買って始める物、例 マナ T1 固定) は打たないので T1 でよい → シミュ部長が確かめる。
今の範囲 (auto-model の no(...)): フラクチャー済みを買う始め方だけ。範囲外 = 白から / 4 MOD から / 手打ちの状態から、グレーターの道、増強スパム、両側のどれか、完璧以外のエッセンス、クラフト MOD、何でも良い札・途中だけの札、狙い 9 つ以上、形が多すぎる、高貴とカオスの段の下限が違う。
- 出し方: **② の範囲外の 1 行だけ** (「自動に未対応: 理由 · 手動で続ける」)。半分だけ自動 (④ だけ自動で ⑤ は手動など) はしない。今の ④ の「おすすめの順番を出す」も同じ model を使うので、範囲外なら ④ のボタンの所の今の 1 行 (出せない理由) のまま。
- 自動のまま ③ で始め方が範囲外 (白が一番安い) になった時: ④ に入った所で 1 行「この始め方は自動に未対応 · 手動で続ける / フラクチャー済みを買う始め方にする」。ここが一番よく出る穴なので、解析君の手 A で潰すのが先。
- 広げる順 (解析君): A 白から・4 MOD から (⑤ はどちらもフラクチャー済みのレアから始まる。R = その始め方の値段にするだけで形は同じはず) → B 両側のどれか (sim-split-by-side どおり側ごとに route を分け、route ごとに解いて答えも route ごとに書く。費用は fracWeights で重み付け) → C グレーターの道 (始めの形に残す MOD が付いているだけ。sim-greater の keep を始めの形に入れる) → D 完璧以外のエッセンス (C と同じ道の中で出る) → E 増強スパム (白から全部 ⑤、形が大きい。最後)。

### 3-4. 解析君に頼む所 / シミュ部長がやる所
| 解析君 | シミュ部長 |
|---|---|
| auto-rules.ts: rulesFromDetail (台本の rulesOf を移す)・methodsFromDetail・answerFor | 自動のチェック・帯の札・ポップアップ・リセット |
| 確かめ: 手袋・靴で「自動で埋めた答え」を ⑥ と同じ回し方 1,000 人 → 答えの無い場面 0・イレギュラー 0・費用が計算と 1 割以内 (外の正解 = エンジン) | ④ に入ったら自動で計算・1 位を入れる、⑤ の要約の 1 行と読むだけの一覧、⑥ の「目安 / 回した」 |
| 範囲を広げる A〜E (別々の commit) | 穴埋めの回し (answerFor を呼ぶ側)、ワーカーの detail の仕事 |
| 時間: buildAutoModel の手袋の時間、mc の完成の割合が 6〜11 ポイント高いずれ (残り) | 開発版に出す・Chrome 1 タブでスナップ・オーナーの OK |

## 4. 実装の手
| 手 | 中身 | 触るファイル | 担当 |
|---|---|---|---|
| 1 | 方策 → 答え: rulesFromDetail・methodsFromDetail・answerFor。台本 check-auto-order.mjs を src の物を使う形に | 新 src/services/simulator/auto/auto-rules.ts、scripts/analysis/check-auto-order.mjs | 解析君 (今 solveorder-nan のセッションが auto-solve 周りを直しているので、その commit の後) |
| 2 | 範囲 A: 白から・4 MOD から | auto-model.ts | 解析君 |
| 3 | 状態とリセット: simAuto・Snap・レシピの保存・切った / 入れた時の消し方 (goTo / resetPatterns を使う) | src/state/simulator/sim-state.ts・sim-recipes.ts、src/views/simulator/use-sim-steps.ts、新 use-sim-auto.ts | シミュ部長 |
| 4 | 画面: ② のチェックと範囲外の 1 行・付け方の「自動」の札、帯の札、ポップアップ (日英) | StageSimPanel.vue (今 421 行、差すのは数行)・StageTargetSummary.vue (付け方の ▾)・SimStepBar.vue、新 SimAutoToggle.vue・SimAutoConfirm.vue | シミュ部長 |
| 5 | ④⑤ を自動で埋める: ④ に入ったら計算 → 1 位 → detail → 答え → 穴埋め、⑤ の要約・一覧・「手で直す」、⑥ の 1 行 | use-sim-auto-order.ts・auto-order.ts・auto-order.worker.ts、StagePatternEditor.vue、use-sim-run.ts、新 SimAutoPlay.vue | シミュ部長 |
| 6 | 開発版 (`pnpm deploy:web-dev`)、手袋・靴で自動 / 手動 / 切る / 入れ直すのスナップ → OK 待ち。メモ (sim-step-pages・optimal-craft-dp・feedback-show-sim-rules) と README の地図 | — | シミュ部長 |

- 手 1・2 (解析君) と 手 3・4 (シミュ部長) は並べて進められる (触るファイルが重ならない)。手 5 は手 1 の後。
- 同時に別のシミュ部長が UI の点検をしている: StageSimPanel.vue・SimStepBar.vue・StageTargetSummary.vue を触るなら順番を決める (ブラックに)。
- 全部で 6 手。手 3〜5 は合わせて 1〜2 日分の見込み。

## 決めた事 (S3、2026-10-20 シミュ部長)
- 両側の「どれか」(K6) の route の並びは quizFromSim のまま (プレが先)。付いた側は打つまで分からないので、安い側を先にはしない。⑤ の要約は route ごとの目安を並べる (「プレフィックスに付いた工程 約 X · サフィックスに付いた工程 約 Y」)。

