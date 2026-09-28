# ADR 004: 1 本の動画で複数のアイテムを実演する (demos)

- 状態: 採用 (2026-09-28)
- 決めた人: kyohei (「アクト中に落ちるカレンシーの解説」を作る時)

## 背景

これまでは「1 本 = 1 つの手順 (1 アイテム)」。カレンシー解説では、砥石は武器、端材と熟練工のオーブは防具、
飾り玉はフラスコにしか使えないので、指輪 1 本では見せられない。

## 決めたこと

- **brief** に `demos: {キー: 手順}` (追加の実演) を足す。メインの `plan` はそのまま。
  `Brief.problems()` は追加の実演の手順も同じ基準 (段階の ilvl・カレンシー・ベース) で検査する
- **run_stage** はメインを `data/results/<name>.json`、追加の実演を `data/results/<name>__<キー>.json` に出す
- **台本** は `VideoScript.demos: {キー: 結果 JSON パス}` を持ち、場面 (`Scene.demo`) にキーを入れる。
  キーが無い場面は今までどおりメイン。過去の台本はそのまま動く
- **動画づくり** は `video/results.py` の `ResultSet.of(scene)` で場面ごとに結果を引く (描画・撮影・付く瞬間・SE)
  - 撮影は実演ごとに手順を分けて撮る (キャッシュは手順ごと)
  - 「付く瞬間」は (実演, 手) で数える。別の実演の画面から入った手は、前の行で手つきを流さない (別アイテムの画面に手つきを重ねない)
  - `final_step` (完成) はメインだけ
- **台本チェック** は実演ごとに「実践で手を飛ばしていないか」を見る
- **台本生成** は追加の実演の結果もプロンプトに入れ、`scene.demo` の使い方を指示する

## 影響

`script/{model,brief,lint,writer,writer_long}.py`、`video/{results,clip_timing,animate,build}.py`、
`scripts/{run_stage,write_script,preview_frames}.py`
