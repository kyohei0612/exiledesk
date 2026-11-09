# 解析君 のやる事

## 前の引き継ぎ (2→3・3→4 本目、回し直しの手順と de6ddf96 の数字はここ)・閉じた物・済み (10-20・10-23) は git の履歴 (10-29 の md の整理で消した): 2026-10-23-todo-archive.md に移した (10-23・10-25 ホワイト)

## 引き継ぎ (2026-10-23、前の解析君がコンテキストが重くなって入れ替え。11/10 が全部の完成の目標)
今の主な仕事 = **ツリーの 100 人回しの核** `src/services/simulator/tree/tree-run.ts` (解析君の物。ワーカーと画面はシミュ部長、**画面に繋ぐのはオーナーの UI/UX の合格の後**)。記録 = notes/2026-10-23-tree-run.md (入口の形・確かめ・追記 1〜3)。
- 入口: `runTree(data, doc, { n, seed, price, startCost?, capDiv?, capSteps?, start?, aims?, onProgress?, every? })` → TreeRunResult (Record と数だけ、ワーカーに渡すので関数・Map・class を入れない、シミュ部長と約束)。箱ごと reach・visits・costIn・remain・warn、全体 perItem・finished・capped・stuck・median・p90・uses・restarts。
- TreeDoc の型は変えずに tree-run の中だけで読む物: `back: "match"` (形の合う箱へ)・`back: "restart"` (作り直し、始めの費用をもう一度)・`split` (分かれ目の箱、条件 heldCount・has・lacks・junk・free)・`next` (結果に関わらずその箱へ)。画面で組めるようにする時はシミュ部長と型を決める (合格の後)。
- 確かめの台本 `node scripts/analysis/check-tree-run.mjs [es|ring|mana|restart|all] [N]` (入口 _tree-run-entry.ts): ES 手袋 105.06 / 105.14 神 (−0.1%)、金の指輪 C 220.46 / 219.76 (+0.3%)、マナ系の指輪 (分かれ目) 1,000 人 1,834 / 1,940 (−5.5%、完成率のぶれで幅の中)、作り直し 見込みと +0.2%。前の台本 = es-gloves-ev.mjs・gold-ring-suffix-ev.mjs・mana-ring-ev.mjs。
- CoE との 1 手の突き合わせ (外の正解はこれが初めて) `node scripts/analysis/check-coe-odds.mjs 50000` (CoE の手元の写しを vm で動かす _coe-load.cjs): 金の指輪の右側の高貴 × 通常/上級/完全 × 触媒あり・なし 15 通り全部 95% の幅の中 (notes/2026-10-23-coe-odds.md)。

## 決まり
- 配信者の名前を notes・見本・記事に出さない (オーナー 10-22)。記事は書かない (記事編集長、照らし合わせも向こうの部下)。報告はブラック (宛先は dev/todo.md の表) へ直接。

## 後回し (シミュレーター完成の後、12/11 まで)
- **勘所の一覧 (オーナー 10-22、シミュレーター完成の後)**: 狙いを 50〜100 通りばらして動的計画法で回し、どの部位にも効く決まり (狙い 0〜1 個は安い手を数打つ・2 個からは高い手で守る など) を抜き出す。機械学習ではなく計算で。内向きの知見 (notes/)、画面で勧める形にはしない (「自動は無し」10-21)。きっかけ = 金の指輪 sR のトゥル + 上級 (1 回の値段 × 外れ率で比べる)。

## 閉じた物 (11-10 棚卸し)
- 10-25 の変わり目: 木の見本 (tree-samples.ts) を消して、tree-samples を読む台本 (_tree-run-entry.ts・_tree-patterns-entry.ts・check-tree-patterns.mjs・gold-ring-midway-ev.mjs・gold-ring-suffix-dp.mjs) が動かない — 古い (回し直しは止め、回す時は見本の代わりの木を決めてから)
- ⑤ 回し直し (11/7〜10、ES 手袋・金の指輪 C・マナ系の指輪・耐性の靴を相場を新しくして表に) — 古い (見本の木を消して台本が動かない・記事も止め = 10-31 オーナー「一旦記事はやめておけ」)
- 300 人の幅の 1 行・道を並べて比べる表の数字 — 古い (100 人回しの見せ方がその後変わった)
- ⚠ のぶれ (100 人だと来た回数の少ない箱で点滅、案「30 回未満は出さない」/「1 割の余裕」) — 古い (同上)
- playHand に個数を返す口 (onUse) — 古い (同上、要る時に言う)
