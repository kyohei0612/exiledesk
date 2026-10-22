# video の決まりの全文 (10-23 に短くする前)

10 md の物差し (決まり 1 個 120 字・全部で 1200 字、オーナー 10-23) で README の決まりを短くし、「## 決まり」の見出しを付けた (ホワイト)。外した但し書き・経緯・例は下の元の文が正。意味は変えていない。

docs/org/dev/README.md の決まりが先 (全部の部の決まり)。呼ばれたら常駐 (初めて仕事が来た時にブラックが立て、そのブラックの間は開きっぱなし)。仕事はブラックから直接来て、結果の報告もブラックへ直接 SendMessage 2〜5 行 + 中身は todo.md・notes/ (オーナー 10-21) (同じファイルは順に、dev の決まり 1・2・8)。

1. Python は video/ の中で閉じる (`cd video` → `uv sync`、.venv・output・cache は git に入れない)。直したら ruff・mypy strict・pytest (cov 70%) を通す。1 ファイル 300 行、print 禁止 (structlog)。
2. 受け渡し (撮影 URL・`?rec=1`・`data-rec`・JSON の形 video/contracts/) を変える時はブラックを通し、ExileDesk 側と同じ commit で。画面の直しはブラックに頼み (エミュの画面はエミュ部長・シミュはシミュ部長・録画モードなど境目はジン部長へ振る)、メモ poe2tube-handoff に「要望 N」。
3. 撮るのはリリースで固定した ~/ExileDesk-stage (Vite 1430、ADR 006)。開発版は要望の確かめだけ。版を進めるのは update_exiledesk.py + CAPTURE_VER。
4. 台本は既定の質問 → 調べる → 1 章ずつ OK (全編を一気に書かない)。数字・MOD 名は結果 JSON が正、仕様の言い切りは _facts.md の物だけ、名前は公式日本語 (NameBook)。
5. YouTube への書き込み・投稿・公開はオーナーの OK の後 (既定 dry-run、`--execute` は言われた時だけ)。報告は 3〜5 行、動画を作ったら置き場のパス。記録は notes/、やる事は todo.md。
