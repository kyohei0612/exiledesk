# 解析君 のやる事

## 前の引き継ぎ (2→3・3→4 本目、回し直しの手順と de6ddf96 の数字はここ)・閉じた物・済み (10-20・10-23) は notes/2026-10-23-todo-archive.md に移した (10-23・10-25 ホワイト)
- 10-25 の変わり目 (シミュ部長): 木の見本 (tree-samples.ts・samples/*.json・?sample=) と古いレシピは消した (2d492b9d)、人が作る分かれ目のボタンは外した (split の箱の作りは木・回す所・精査に残る)、フラクチャー済みのスタートは ✦ 1 つだけ (外れ 3 はやめた)。**tree-samples を読む台本は今は動かない**: scripts/analysis の _tree-run-entry.ts (check-tree-run.mjs の入口)・_tree-patterns-entry.ts・check-tree-patterns.mjs・gold-ring-midway-ev.mjs・gold-ring-suffix-dp.mjs (10-25 ホワイトが grep)。回し直す時は見本の代わりの木を決めてから。

## 引き継ぎ (2026-10-23、前の解析君がコンテキストが重くなって入れ替え。11/10 が全部の完成の目標)
今の主な仕事 = **ツリーの 100 人回しの核** `src/services/simulator/tree/tree-run.ts` (解析君の物。ワーカーと画面はシミュ部長、**画面に繋ぐのはオーナーの UI/UX の合格の後**)。記録 = notes/2026-10-23-tree-run.md (入口の形・確かめ・追記 1〜3)。
- 入口: `runTree(data, doc, { n, seed, price, startCost?, capDiv?, capSteps?, start?, aims?, onProgress?, every? })` → TreeRunResult (Record と数だけ、ワーカーに渡すので関数・Map・class を入れない、シミュ部長と約束)。箱ごと reach・visits・costIn・remain・warn、全体 perItem・finished・capped・stuck・median・p90・uses・restarts。
- TreeDoc の型は変えずに tree-run の中だけで読む物: `back: "match"` (形の合う箱へ)・`back: "restart"` (作り直し、始めの費用をもう一度)・`split` (分かれ目の箱、条件 heldCount・has・lacks・junk・free)・`next` (結果に関わらずその箱へ)。画面で組めるようにする時はシミュ部長と型を決める (合格の後)。
- 確かめの台本 `node scripts/analysis/check-tree-run.mjs [es|ring|mana|restart|all] [N]` (入口 _tree-run-entry.ts): ES 手袋 105.06 / 105.14 神 (−0.1%)、金の指輪 C 220.46 / 219.76 (+0.3%)、マナ系の指輪 (分かれ目) 1,000 人 1,834 / 1,940 (−5.5%、完成率のぶれで幅の中)、作り直し 見込みと +0.2%。前の台本 = es-gloves-ev.mjs・gold-ring-suffix-ev.mjs・mana-ring-ev.mjs。
- CoE との 1 手の突き合わせ (外の正解はこれが初めて) `node scripts/analysis/check-coe-odds.mjs 50000` (CoE の手元の写しを vm で動かす _coe-load.cjs): 金の指輪の右側の高貴 × 通常/上級/完全 × 触媒あり・なし 15 通り全部 95% の幅の中 (notes/2026-10-23-coe-odds.md)。

## やる事 (11/10 まで、ブラックと決めた並び)
1・2 (代わりの見本の数字・CoE との突き合わせ) は済み (10-23)、notes/2026-10-23-todo-archive.md へ。
3. **⑤ 回し直し** (11/7〜10): 相場を新しくして (自分のサーバーの /boot.json を 1 回) 見本 (ES 手袋・金の指輪 C・マナ系の指輪・耐性の靴 boots-res-ev.mjs) を回し直して表に。
- 決まり: 配信者の名前を notes・見本・記事に出さない (オーナー 10-22)。記事は書かない (記事編集長、照らし合わせも向こうの部下)。報告はブラック (宛先は dev/todo.md の表) へ直接。

## 後回し (11/10 の後、12/11 まで)
- **勘所の一覧 (オーナー 10-22、シミュレーター完成の後)**: 狙いを 50〜100 通りばらして動的計画法で回し、どの部位にも効く決まり (狙い 0〜1 個は安い手を数打つ・2 個からは高い手で守る など) を抜き出す。機械学習ではなく計算で。内向きの知見 (notes/)、画面で勧める形にはしない (「自動は無し」10-21)。きっかけ = 金の指輪 sR のトゥル + 上級 (1 回の値段 × 外れ率で比べる)。
- 300 人の幅の 1 行、道を並べて比べる表の数字。
- ⚠ のぶれ: 100 人だと来た回数の少ない箱で点滅する (金の指輪 C で 2 箱)。案「30 回未満は出さない」/「1 割の余裕」→ シミュ部長が UI の合格を取った後に相談 (それまで持ち込まない、ブラック 10-22)。
- playHand に個数を返す口 (onUse) をシミュ部長に足してもらえば、tree-run の中の同じ流れを消せる (要る時に言う)。

