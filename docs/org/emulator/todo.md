# ジン部長 のやる事

## やる事
- エンジンの中の `family` の直の比べ (決まり 3): apply-essence.ts:31 (BREACH_FAMILY)・51 (normalTierOf)、spec/essence-specs.ts:103 (ABYSS_FAMILY) を mod-rules の hasRawFamily・sharesRawFamily に。打つ処理の数字に効くので currency-spec-golden を回して一緒に。名前で MOD を探す所 (stage-core:424・468、run-plan:265、StageItemCard:49 の `family === key`) は系統の決まりではなく指名の探し方なのでそのまま。

- (シミュ部長から、10-20) 貼り付けの読み取り (paste-parse) が入口に来たら、シミュの services/simulator/paste-read.ts の readPaste の中身を差し替える (画面は PasteRead の形を読むだけ)。今の htc/paste の読みで見本 3・8 (グラスピングリング) を貼ると: 暗黙 3 行 (ソケットを手袋扱い・ダメージ 56%・ゴールド 10%) が「読めない」に、コラプトの暗黙「品質の最大値 +20%」がクラフト MOD の狙い (P T1?) に入る。未発現・二重コラプト・「コラプト」の行は paste-read.ts で【仮】に拾っている。入口で欲しい物: 暗黙 (ベース・コラプト) と MOD の区別、MOD ごとの段・側・フラクチャー・冒涜、未発現の側と数、コラプトの回数、読めない行と理由。

## OK 待ち
