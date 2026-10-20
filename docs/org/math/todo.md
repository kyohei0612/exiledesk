# 解析君 のやる事

## やる事
- K4 の残り: 入口に無い occupiedFamiliesOf (vendor pool)・ANCIENT_BONE_FLOOR (vendor probability)・REVEAL_SPEC の候補の数 (spec/desecrate-specs) をジン部長に入口へ足してもらい、auto-model・auto-engine の【入口に無い】の import を差し替える
- 範囲 C (グレーターエッセンスの道、essKey あり): 始めの形の道は K3 でできている。見本を作って確かめてから外す
- 靴の計算が +5〜+19% 高い (外れの系統が置き場を減らさない近似。notes の K2c)。mc の完成の割合がエンジンより高い原因
- n ≥ 6 の絞り方の確かめ (6 行以上の見本と redo の値が要る)
- 開発版に手 5 (32e938d9) が未反映: 作業ツリーに他のセッションの書きかけ (paste-read の型エラー) があり deploy:web-dev を見送った。型が通ったら出す

## OK 待ち
- ④ の build が 1.7 秒増えて画面の側で止まる (手 5)。ワーカーで組むならエンジンのデータを渡す要 → シミュ部長の判断
- ③ の白から作る費用のリロールの回数 (式はエンジンの約半分)。magicLoopCounts にするか 1 ÷ (p × 側の割合) にするか → シミュ部長・オーナー (simulator/notes/2026-10-20-step4-formula-entry.md)

## 済み (10-20)
- K2c 靴の ±20%: ⑤ の同じ条件に別の形の答え (消去) が勝ち、発現の後にドッジを失っていた。別名の答えを通った回数で比べる形に → 靴 #3・#4 のずれ −20〜−24% → +5〜+6%
- R1 auto-types.ts (03b30a1c)。シミュ側の import が直ったら auto-solve の buildAutoModel の再輸出を消す
- K2b 靴 #2 の答え無し 422 人 → 0 (一時の台本 check-yafu-actual.mjs の古い rulesOf を src の rulesFromDetail に)
- K4 auto/ の import を入口 (engine.ts) へ。入口にある物は全部付け替え (値は同じ)、無い 3 つは残り
- K3 範囲 A: 始めの形を stepOutcomes で (model.starts)、白からマジックで一緒に揃える道に対応
- K2 auto-rules.ts (rulesFromDetail・methodsFromDetail・answerFor)、手袋・靴で答え無し 0・イレギュラー 0。answerFor はまだ一度も使われていない
- solveOrder の NaN (9f44b722)・カオスの下限を orbFloor に (c8cd7ab5)・手 5 stepOutcomes (32e938d9)・手 4 の突き合わせ (11cbb873)
