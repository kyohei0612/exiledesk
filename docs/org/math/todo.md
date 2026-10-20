# 解析君 のやる事

## やる事
- **止めた所 (10-21 未明、オーナーの指示で途中で止めた)**
  - K8 範囲 C (グレーターエッセンスの道): 下の 3 つの直しを commit 済み。動画の靴 (check-auto-order.mjs の `greater`) で計算とエンジン 1,000 人が 0.0%・+0.8%、答え無し 0
    1. auto-model: グレーターの道を断らない。始めに付くエッセンスの札だけ「完璧以外のエッセンス」でも通す。エッセンスの札が 2 つ以上ならアストリッドの創造性を要るルーンに足す (エンジンの craftedLimitOf)
    2. auto-engine: 表の代表のアイテムに、始めに付く本物のエッセンスの MOD を入れる (エッセンス 1 つまでの決まりが効く)
    3. auto-actions の発現: 候補を戻しなしで引く (エンジンの drawOffers) + 付いている外れが発現の置き場の同じ系統を塞ぐ分を引く (revealBlock)
  - 全部の見本の回し直しは途中で止めた: 手袋・靴・白からは済み (上位 3 は 1 割以内、靴は −4〜−6% に)、**両側 (`split`) と `greater` の全部の行はまだ** → `node scripts/analysis/check-auto-order.mjs all 1000 3` (約 40 分) を回して notes に表を書く
  - 発現の 1 組の当たりを計算とエンジンで並べる台本: `SAMPLE=greater PROBE_REVEAL=1 node scripts/analysis/check-auto-sit.mjs 1 300` (外れ無し 13.1% / 13.7%、外れ 1 つ 17.1% / 16.8%)
  - auto-model の no(...) から外したのは「グレーターエッセンスの道」。完璧以外のエッセンスの狙い (範囲 D) は始めに付く物以外まだ断る
- **頼まれて手を付けていない**: 買い直しの上限 N の案 (オーナー決定 A、シミュの d700b61c の後)。鉄の指輪 + フラクチャー・手袋・靴の自動の答えを ⑥ と同じ回し方 1,000 人 → 買い直しの回数の分布 (中央・90%・99%・最大) → 99% が収まる回数を丸めた N を notes に。check-auto-order.mjs の engine() に r.bases を数える行を足せば出る。鉄の指輪の見本はまだ台本に無い (シミュ部長の S3 の見本と同じ物を足す)
- 両側のどれか: 安い側を先の route にする (quizFromSim の routes の並び、シミュ部長と)
- 範囲 C (グレーターエッセンスの道、essKey あり): 始めの形の道は K3 でできている。見本を作って確かめてから外す
- 靴 #2 だけ計算が +14.7% 高い (K7 の後)。mc の完成の割合がエンジンより高い原因
- n ≥ 6 の絞り方の確かめ (6 行以上の見本と redo の値が要る)
- 開発版に手 5 (32e938d9) が未反映: 作業ツリーに他のセッションの書きかけ (paste-read の型エラー) があり deploy:web-dev を見送った。型が通ったら出す

## OK 待ち
- ④ の build が 1.7 秒増えて画面の側で止まる (手 5)。ワーカーで組むならエンジンのデータを渡す要 → シミュ部長の判断

## 済み (10-20)
- K7 外れの系統の近似 (外れ 1 つごとに平均の重みを引く): 全部の見本の上位 3 が 1 割以内、靴 #1 +13.1% → +0.8%
- K6 範囲 B 両側のどれか: route ごとの model (model.routes)・rulesForOrder。手袋の見本で答え無し 0・上位 3 は計算と +1〜+9%
- K5 ③ の白から作る 1 個 (S1c の後) vs 字のとおり 1,000 人: 手袋 +0.1%・靴 +5.4% (check-sim-start.mjs、simulator/notes/2026-10-20-step4-formula-entry.md)
- K2c 靴の ±20%: ⑤ の同じ条件に別の形の答え (消去) が勝ち、発現の後にドッジを失っていた。別名の答えを通った回数で比べる形に → 靴 #3・#4 のずれ −20〜−24% → +5〜+6%
- R1 auto-types.ts (03b30a1c)。シミュの R1b の後に auto-solve の buildAutoModel の再輸出を消した。K4 の残り (入口の 3 つ) も差し替え
- K2b 靴 #2 の答え無し 422 人 → 0 (一時の台本 check-yafu-actual.mjs の古い rulesOf を src の rulesFromDetail に)
- K4 auto/ の import を入口 (engine.ts) へ。入口にある物は全部付け替え (値は同じ)、無い 3 つは残り
- K3 範囲 A: 始めの形を stepOutcomes で (model.starts)、白からマジックで一緒に揃える道に対応
- K2 auto-rules.ts (rulesFromDetail・methodsFromDetail・answerFor)、手袋・靴で答え無し 0・イレギュラー 0。answerFor はまだ一度も使われていない
- solveOrder の NaN (9f44b722)・カオスの下限を orbFloor に (c8cd7ab5)・手 5 stepOutcomes (32e938d9)・手 4 の突き合わせ (11cbb873)
