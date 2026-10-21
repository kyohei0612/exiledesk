# MOD の重みを使う人が直せる (2026-10-22、オーナー「1000 で置いて、修正できるようにしたい」、開発版だけ)

背景: 金の指輪のキャストスピードの重みは poe2db が 1 (仮置き)、CoE とエンジンは 1,000 (weight-overrides.ts、math/notes/2026-10-22-cast-speed-weight.md)。正解が誰にも分からない重みは「既定値を置いて、使う人がいじれる」。

## 作り
- エンジン: services/craft-stage/stage-tuning.ts の modWeights (MOD の id → W)。W = その MOD の一番重い段の重み、ほかの段は同じ比で動く (キャストスピードは 5 段とも W)。
  候補を引く stage-core の candidates (打つ処理と確率の表が通る 1 か所) が `weightScaleOf` を掛け、MOD 一覧 (mod-list.ts の rowOf) は `weightedMod` で段に入れて出す。入口 engine.ts に defaultWeightOf・OVERRIDDEN。
  聖別の幅 SANCTIFY_MIN / MAX の置き場を stage-tuning.ts に移した (apply-vaal.ts は同じ名前で出し直す。循環を避けるため)。
- 手順 JSON: 直していれば打てた手全部の tune に `weights` (お告げの設定と同じ withStepTune で再生・共有)。書いていない手は既定。
- 画面: views/craft-stage/StageWeightEdit.vue。行の札 (直した = 「重みを直した」、推定で埋めた = 前からの「重みは推定」)、行を開いた段の表の上に「重み [1000] 既定 1000 ↺ 全部戻す (n)」。系統をまとめた行には出さない。状態 state/emulator/stage-tuning.ts (WEIGHTS_ON = dev / 開発版だけ、ブラウザに覚える stage-mod-weights)。

## 確かめ
- 台本 (scratchpad の w-check.mjs、見張りで外の正解ではない): 金の指輪 (マジック・プレ 1 つ) に増強で、キャストスピードの付く割合 既定 1000 = 表 5.43% / 一覧 5.43% / 打った 4,000 回 5.03%、200 = 1.14 / 1.14 / 1.13%、1 = 0.01 / 0.01 / 0.03%、5000 = 22.30 / 22.30 / 21.80%。1000 と書いても・戻しても既定と同じ。重み 5000 で 錬金 → カオス ×6 を手順にして、画面の重みを 1 にしたまま再生 → 一致、共有の往復の後も一致、既定とは違う結果。
- 画面 (手元の dev、窓なし Chrome 1660×860): 1000 → 200 でキャストスピードの出やすさ 5.4% → 1.1%、札が「重みは推定」→「重みを直した」、段は 0.2% ずつ。英語「Weight / Default 1000 / Reset all (1) / Weight edited」、全部戻すで 5.4%・「Est. weight」に戻り、覚えた値も消える。横はみ出し 0。スナップ 共有メモ omen-tune/5-weight-edit-ja.png。確認用の Chrome は閉じた (残り 0)。
- 型チェック 0。golden・held-odds-parity は回していない (直さなければ倍率 1 で今と同じ)。
