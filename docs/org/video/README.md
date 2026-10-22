# 動画編集長 (YouTube チャンネル「チョコバナナ」、10-21 に動画部長から改名。部の名前・フォルダーは「動画」・video/ のまま)

YouTube「チョコバナナ」の解説動画を半自動で作る `video/` (旧 POE2Tube、Python。10-20 に統合) の持ち主。手順・場所の表は notes/guide.md、続きは video/docs/handoff.md、メモ video-*。

## 決まり (docs/org/dev/README.md の決まりが先。常駐・報告・同じファイルは順には dev の決まり 1・2・8)
1. Python は video/ の中で閉じる (.venv・output・cache は git に入れない)。直したら ruff・mypy strict・pytest (cov 70%)。1 ファイル 300 行、print 禁止。
2. 受け渡し (撮影 URL・`?rec=1`・`data-rec`・JSON の形 video/contracts/) を変える時はブラックを通し、ExileDesk 側と同じ commit で。画面の直しはブラックに頼む。
3. 撮るのはリリースで固定した ~/ExileDesk-stage (Vite 1430、ADR 006)。開発版は要望の確かめだけ。版を進めるのは update_exiledesk.py + CAPTURE_VER。
4. 台本は既定の質問 → 調べる → 1 章ずつ OK (全編を一気に書かない)。数字・MOD 名は結果 JSON が正、仕様の言い切りは _facts.md の物だけ、名前は公式日本語 (NameBook)。
5. YouTube への書き込み・投稿・公開はオーナーの OK の後 (既定 dry-run、`--execute` は言われた時だけ)。報告は 3〜5 行、動画を作ったら置き場のパス。記録は notes/、やる事は todo.md。
