# 解析君 のやる事

## やる事
- K4 エンジンの付け替え手 7 の auto/ 分 (import を入口へ)
- 範囲 C (グレーターエッセンスの道、essKey あり): 始めの形の道は K3 でできている。見本を作って確かめてから外す
- 靴の ±20% の原因 (④ の計算とエンジン 1,000 人。耐性が先は計算が高い、ドッジ・スピリットが先は計算が安い)。mc の完成の割合がエンジンより高い原因 (notes/auto-order-2026-10-20.md の「残り」)
- n ≥ 6 の絞り方の確かめ (6 行以上の見本と redo の値が要る)
- 開発版に手 5 (32e938d9) が未反映: 作業ツリーに他のセッションの書きかけ (paste-read の型エラー) があり deploy:web-dev を見送った。型が通ったら出す

## OK 待ち
- ④ の build が 1.7 秒増えて画面の側で止まる (手 5)。ワーカーで組むならエンジンのデータを渡す要 → シミュ部長の判断
- ③ の白から作る費用のリロールの回数 (式はエンジンの約半分)。magicLoopCounts にするか 1 ÷ (p × 側の割合) にするか → シミュ部長・オーナー (simulator/notes/2026-10-20-step4-formula-entry.md)

## 済み (10-20)
- K3 範囲 A: 始めの形を stepOutcomes で (model.starts)、白からマジックで一緒に揃える道に対応
- K2 auto-rules.ts (rulesFromDetail・methodsFromDetail・answerFor)、手袋・靴で答え無し 0・イレギュラー 0。answerFor はまだ一度も使われていない
- solveOrder の NaN (9f44b722)・カオスの下限を orbFloor に (c8cd7ab5)・手 5 stepOutcomes (32e938d9)・手 4 の突き合わせ (11cbb873)
