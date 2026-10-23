# スタートとフラクチャーの形 (オーナーの決め 10-23、ブラック 8 代目の 4 つ目) の計画と頼み

シミュ部長 16 本目が調べた所まで (コードは何も変えていない)。送信の上限でジン部長・デザイン部長に頼めなかったので、ここから頼む。

## オーナーの決め (ブラックの文の要約)
1. フラクチャーの印: 完成形の MOD を決める所で (a)「狙いにする」の横に「フラクチャー」ボタン (b) アイテムの MOD の行の右クリックでも付け外し。複数の MOD に付けてよい (= どれかが固定されればよい候補)。
2. 狙いは MOD の枠 (プレ 3・サフィ 3) を超えてもよい (止めない)。
3. アイテムの表示: 印の MOD が複数なら 1 行「フラクチャー MOD ×n」、ホバーでどれが重なっているか。
4. スタート: 切り替えのボタンは置かず印で決まる。印あり = 候補のどれか 1 つが固定されたレア + 外れ MOD (固定 1 + 外れ 3)。印なし = 白 (ノーマル) から。どちらもスタートの枠に「＋」(MOD を足す・外れを差し替え)。

## 今のコード
- 狙い = `TreeDoc.memoAims: Aim[]` (`{ modId, tier }`、tree-model.ts:22)。`toggleGoal`・`hasGoal`・`goalItem` は use-tree.ts。
- 完成形のカード `goalItem` = 狙いを全部スタートの作り (tree-sample の `startItemOf` → `startWith`、forceKey で付ける) で付けた物。枠を超えると forceKey が打てず note「付けられない狙いがある」で止まる (TreeGoalPage.vue の data-tree-goal-problem)。
- スタート = `TreeDoc.start: { rarity, mods: StartMod[] }` + `startRandom` (tree-sample.ts の `startWith`: freshItem → ルーン → 指名の MOD → 乱数の数だけ素の高貴 / 増強)。TreeStartPick が始め方 4 つ。
- アイテムのカード = 共通 `src/components/for-share/item/StageItemCard.vue` (デザイン部長)。右クリックは `removable` の時だけ `emit('fracture', m)` (エンジンの `unfracturable` で打てない物は出さない)。フラクチャーの行をまとめる表示は無い。

## 頼み
### ジン部長 (エンジンの入口 engine-sim.ts か engine.ts)
- (J1) フラクチャーの候補から始めのアイテムを作る: `data, base, itemLevel, candidates: {modId, tier}[], rng` → 候補のどれか 1 つが ✦ で付いたレア + 外れ 3 (ゲームのフラクチャーのオーブは MOD 4 つのレアの 1 つを等しく固定。どの候補が固定されるかの割合、外れの選び方 = 素の高貴 3 回で良いか、打てない時の理由)。
- (J2) 枠を超えた狙いでも完成形のカードを作る (表示用、付けられる所まで付けて残りを返す、など。または枠の判定を外す設定)。
- (J3) 3 つ目の「スタートの外れ MOD」は、この作りの途中の物ではない (原因は白紙に戻すの鍵の残り、7fdc3dd3 で直した)。
### デザイン部長 (StageItemCard)
- (D1) フラクチャーの印の MOD が複数の時に 1 行「フラクチャー MOD ×n」+ ホバーで中身 (どれが重なっているか)。印はシミュから渡す (例 `fractureGroup: readonly string[]` の modId の組)。
- (D2) `removable` (× を出す) と別に、右クリックで `emit('fracture', m)` を出すプロップ (シミュの完成形のカードは × を出さない)。エミュの手で打つ画面は今のまま。

## シミュでやる事 (頼みの後)
- `Aim` に印 `fractured?: true` を足し、`toggleFracture(modId)` (use-tree)。TreeGoalPage の tier-actions の slot に「フラクチャー」ボタン、カードの `@fracture` で付け外し。
- スタートを印から決める: 印なし = 白 (rarity normal、mods []、乱数無し)、印あり = J1 で作る。TreeStartPick の始め方 4 つは外し、スタートの枠に「＋」(足す・外れを差し替え)。
- 枠を超えた狙いで止めない (J2 の後、data-tree-goal-problem を出さない)。
- 確かめ: 本物のマウスで印 0 / 1 / 2 個のスタートの形・ホバー・右クリック・枠を超えた狙い・エラー 0、開発版。
