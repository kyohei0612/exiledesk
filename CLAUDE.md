# POE2Tube — PoE2 初心者向け解説動画の半自動生成

ずんだもん (質問役) × 四国めたん (解説役)、VOICEVOX、白背景の図解、ExileDesk クラフトステージの実画面。
**このファイルは新しいセッションが最初に読む地図。** 会話の記憶に頼らず、ここと `docs/` だけで同じ品質が出るようにする。

## 絶対に守ること

1. **台本を書く前に `docs/script_rules/_intake.md` の 10 問を kyohei に聞く**。答えを `data/briefs/<name>.json` に落とし `Brief.problems()` を通す
2. **数字・MOD 名・カレンシー名は結果 JSON (`data/results/<name>.json`) が正**。台本側で作らない。ゲームの仕様は `docs/script_rules/_facts.md` に無い事を断定しない
3. 名前はゲーム公式日本語 (`NameBook`、ExileDesk `price-keys.json` 由来)。「高貴なオーブ」「プレフィックス / サフィックス」。自分で訳さない
4. 台本の型は `docs/script_rules/_all.md`。機械チェック (`script/lint.py`) を通らない台本は使わない
5. 日本語で会話。コード変更は ruff + black + mypy strict + pytest (cov ≥ 70%) を通してからコミット (Conventional Commits)
6. 1 ファイル 300 行目安、print 禁止 (structlog)、subprocess は `creationflags=CREATE_NO_WINDOW`
7. 外部素材は規約を確認してから (VOICEVOX はクレジット表記必須、効果音ラボは再配布禁止)

## 1 本作る手順 (人の手は brief 1 枚)

```bash
python scripts/run_stage.py    data/briefs/<name>.json   # ExileDesk で手順を引く → data/results/<name>.json
python scripts/write_script.py data/briefs/<name>.json   # Claude が台本 (180 秒以上は 構成表→章ごと) → data/scripts/<name>.json
python scripts/build_video.py  data/scripts/<name>.json  # 音声・図解・撮影・合成 → output/<name>.mp4
python scripts/preview_frames.py data/scripts/<name>.json  # 台本チェック用の静止画 → output/preview/
```

- 台本生成は `claude -p` (MAX プラン)。途中で落ちても `output/work/<name>/script_cache/` から再開
- 1 章だけ書き直す: `script_cache/section_NN.json` を消して write_script を再実行
- 尺の目安: **400 字/分** (実測)。8 分 = 3,200 字。台本の中で尺を口にしない

## 場所

| 何 | どこ |
|---|---|
| 設計 (ADR) | `docs/decisions/001-poe2tube-architecture.md`, `002-craft-stage-contract.md` |
| 台本ルール / 既定の質問 / 仕様の事実 | `docs/script_rules/_all.md`, `_intake.md`, `_facts.md` |
| ExileDesk との受け渡し JSON (正) | `src/poe2tube/contracts/craft_stage.py` → `contracts/*.schema.json` |
| 台本モデル / lint / 生成 | `src/poe2tube/script/{model,lint,brief,outline,writer,writer_long}.py` |
| 描画 | `src/poe2tube/render/` (frame / scene_panel / stack / item_card / tachie) |
| 撮影 (ExileDesk 動画モード) | `src/poe2tube/capture/stage.py` (Playwright、Vite 1420 自動起動) |
| 音声 / 音 | `src/poe2tube/audio/{voicevox,mix}.py` |
| 動画化 | `src/poe2tube/video/{timeline,animate,build}.py` |
| 設定 | `src/poe2tube/config/settings.py` (env `POE2TUBE_*`) |
| 素材 | `assets/characters` (坂本アヒル氏 PSD、git 外)、`assets/icons`、`assets/se` |

## 関連リポジトリ

- `C:\Users\kyohei\ExileDesk` — クラフトステージ (`docs/decisions/001-craft-stage.md`、`scripts/craft-stage-run.mjs`)。仕様変更は両方の ADR を同時に更新
- `C:\Users\kyohei\youtube-pipeline` — BGM / SE 素材の流用元。朝 5:00 のニュース本番と Claude CLI の使用枠を食い合わないよう、重い生成は昼〜夜に

## 決まっていること (2026-09-28 時点)

- シリーズ: **PoE2 1.0 正式リリースに向けた基礎知識まとめ**。視聴者: アクト中〜ストーリークリア直後の初心者。値段の話はしない。週 1〜2 本
- 白背景固定、話速 1.2 倍 (遅い声は 7.3 字/秒まで自動で速める)、24fps
- 次回予告はしない、次回の内容にも触れない。導入で完成品を見せてよい。実践は 1 手 = 2 行以上 (宣言 → 結果)、使う瞬間は急がない
- 説明している状態と画面を一致させる (白の話は `item` の `step: 0`)
