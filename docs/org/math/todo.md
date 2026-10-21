# 解析君 のやる事

## 引き継ぎ (2026-10-23、前の解析君がコンテキストが重くなって入れ替え。11/10 が全部の完成の目標)
今の主な仕事 = **ツリーの 100 人回しの核** `src/services/simulator/tree/tree-run.ts` (解析君の物。ワーカーと画面はシミュ部長、**画面に繋ぐのはオーナーの UI/UX の合格の後**)。記録 = notes/2026-10-23-tree-run.md (入口の形・確かめ・追記 1〜3)。
- 入口: `runTree(data, doc, { n, seed, price, startCost?, capDiv?, capSteps?, start?, aims?, onProgress?, every? })` → TreeRunResult (Record と数だけ、ワーカーに渡すので関数・Map・class を入れない、シミュ部長と約束)。箱ごと reach・visits・costIn・remain・warn、全体 perItem・finished・capped・stuck・median・p90・uses・restarts。
- TreeDoc の型は変えずに tree-run の中だけで読む物: `back: "match"` (形の合う箱へ)・`back: "restart"` (作り直し、始めの費用をもう一度)・`split` (分かれ目の箱、条件 heldCount・has・lacks・junk・free)・`next` (結果に関わらずその箱へ)。画面で組めるようにする時はシミュ部長と型を決める (合格の後)。
- 確かめの台本 `node scripts/analysis/check-tree-run.mjs [es|ring|mana|restart|all] [N]` (入口 _tree-run-entry.ts): ES 手袋 105.06 / 105.14 神 (−0.1%)、金の指輪 C 220.46 / 219.76 (+0.3%)、マナ系の指輪 (分かれ目) 1,000 人 1,834 / 1,940 (−5.5%、完成率のぶれで幅の中)、作り直し 見込みと +0.2%。前の台本 = es-gloves-ev.mjs・gold-ring-suffix-ev.mjs・mana-ring-ev.mjs。
- CoE との 1 手の突き合わせ (外の正解はこれが初めて) `node scripts/analysis/check-coe-odds.mjs 50000` (CoE の手元の写しを vm で動かす _coe-load.cjs): 金の指輪の右側の高貴 × 通常/上級/完全 × 触媒あり・なし 15 通り全部 95% の幅の中 (notes/2026-10-23-coe-odds.md)。

## やる事 (11/10 まで、ブラックと決めた並び)
1. ~~代わりの見本の数字~~ 済み (10-23、2 本目): ドレイクスキンブーツ + 移動速度 T1 フラクチャー + 元素耐性 T1 × 2 = 1 個 29.86 神 (台本 1 万人)。ツリー 2 通り (分かれ目・当たり外れの箱) は台本と同じ seed で一致 (notes/2026-10-23-boots-res.md、`check-tree-run.mjs boots`・`boots-res-ev.mjs`)。
2. ~~CoE との突き合わせを広げる~~ 済み (10-23、2 本目): カオス (通常・上級・完全) × 靴 3 形・指輪 1 形と、消去 (素・右側・左側) が CoE の正確な割合と幅の中 (notes/2026-10-23-coe-chaos.md、`check-coe-chaos.mjs`)。前の check-coe-odds.mjs の CoE のレアリティの書き方 (3 → ItemRarity.RARE) も直した、数字は同じ。
3. **⑤ 回し直し** (11/7〜10): 相場を新しくして (自分のサーバーの /boot.json を 1 回) 見本 (ES 手袋・金の指輪 C・マナ系の指輪・耐性の靴 boots-res-ev.mjs) を回し直して表に。
- 決まり: 配信者の名前を notes・見本・記事に出さない (オーナー 10-22)。記事は書かない (記事編集長、照らし合わせも向こうの部下)。報告はブラック (local_35782246-d80a-4c3f-9dff-36103418e719) へ直接。

## 後回し (11/10 の後、12/11 まで)
- 300 人の幅の 1 行、道を並べて比べる表の数字。
- ⚠ のぶれ: 100 人だと来た回数の少ない箱で点滅する (金の指輪 C で 2 箱)。案「30 回未満は出さない」/「1 割の余裕」→ シミュ部長が UI の合格を取った後に相談 (それまで持ち込まない、ブラック 10-22)。
- playHand に個数を返す口 (onUse) をシミュ部長に足してもらえば、tree-run の中の同じ流れを消せる (要る時に言う)。

## 閉じた物
- 自動の打ち方 (K2〜K8・鉄の指輪の 27.5%・n ≥ 6 ほか): オーナー 10-21「自動は無し」で閉じた (ブラック 10-22 OK)。auto/ のコードは残っている (シミュの持ち物)。見本の突き合わせの台本と記録は 10-23 に消した。

## 済み (10-20)
- 買い直しの上限 N の案 (10-21): 自動の答えは買い直さない (99% = 0)、N = 100 を案に (notes)
- K7 外れの系統の近似 (外れ 1 つごとに平均の重みを引く): 全部の見本の上位 3 が 1 割以内、靴 #1 +13.1% → +0.8%
- K6 範囲 B 両側のどれか: route ごとの model (model.routes)・rulesForOrder。手袋の見本で答え無し 0・上位 3 は計算と +1〜+9%
- K5 ③ の白から作る 1 個 (S1c の後) vs 字のとおり 1,000 人: 手袋 +0.1%・靴 +5.4% (check-sim-start.mjs、simulator/notes/2026-10-20-step4-formula-entry.md)
- K2c 靴の ±20%: ⑤ の同じ条件に別の形の答え (消去) が勝ち、発現の後にドッジを失っていた。別名の答えを通った回数で比べる形に → 靴 #3・#4 のずれ −20〜−24% → +5〜+6%
- R1 auto-types.ts (03b30a1c)。シミュの R1b の後に auto-solve の buildAutoModel の再輸出を消した。K4 の残り (入口の 3 つ) も差し替え
- K2b 靴 #2 の答え無し 422 人 → 0 (外の実測の見本の一時の台本の古い rulesOf を src の rulesFromDetail に)
- K4 auto/ の import を入口 (engine.ts) へ。入口にある物は全部付け替え (値は同じ)、無い 3 つは残り
- K3 範囲 A: 始めの形を stepOutcomes で (model.starts)、白からマジックで一緒に揃える道に対応
- K2 auto-rules.ts (rulesFromDetail・methodsFromDetail・answerFor)、手袋・靴で答え無し 0・イレギュラー 0。answerFor はまだ一度も使われていない
- solveOrder の NaN (9f44b722)・カオスの下限を orbFloor に (c8cd7ab5)・手 5 stepOutcomes (32e938d9)・手 4 の突き合わせ (11cbb873)
