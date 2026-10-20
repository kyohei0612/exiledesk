# video/ (旧 POE2Tube)

Path of Exile 2 の初心者向け解説動画 (ずんだもん × 四国めたん、VOICEVOX) を ExileDesk のクラフトステージから半自動で作る Python。
2026-10-20 に ExileDesk へ統合 (git subtree、履歴つき)。

- 動かし方: `cd video` → `uv sync` → `.venv/Scripts/python scripts/<名前>.py`。出力 output/・cache/・.venv/ は git に入れない
- BGM・SE は ~/youtube-pipeline (settings の `youtube_pipeline_root`) の物を流用
- 決まり ../docs/org/video/README.md、手順と場所 ../docs/org/video/notes/guide.md、設計 docs/decisions/
