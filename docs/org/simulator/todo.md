# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 30 → 31 の引き継ぎ (10-26、30 本目は会話が長くなったので区切り。宛先はブラック 12 代目 local_feea72b4-b947-4be5-927f-9ff6055ecf7f)
- **今の形 (オーナー 10-26、全部 OK 済み・187b92b3 まで push、v0.1.609 で最終チェック長が出す)**: 結果は全部箱で出し、まとめる・分けるは人 (決まり 2、プレとサフィはまとめない)。箱の結果は箱の形から・戻り先は同じ形の箱だけ (shapeFits)。狙い無しの手も付きうる狙いの当たりの箱を出す。当たりの箱には自動の矢印を引かない (＋・完成・まとめる、未定は静かな「＋ 次の手」)、外れだけ「↩ 再度挑戦 · n 段目へ戻る」(段は画面の段)。箱の題は枠の上の札「○○が付いた」、中はアイテムの枠 (StageItemCard modsOnly) → 次どうするか → 操作。上の帯の「まとめる」→ 箱を選ぶ (光る / 灰色)。手の窓は持った物の絵がカーソルに (HeldCursor)。決めの移り変わりは notes/2026-10-26-failure-behavior.md と 2026-10-26-same-side-hit.md
- **残り**: ① 見本は完成まで回らない (当たり 5 箱が未定。オーナー「A」で今はやらない)。② 長い手の札 (鎖骨 + お告げ等) は上限 340 で … に切れる。③ スマホの切り 5 か所 (TreeMemoFloat 256・285・311、PhoneTreePage 170、TreeHandShelf 241)。④ 猿 7 の残り 8・9・11・20・27・28 (docs/org/monkey/notes/2026-10-26-monkey-sim-flow.md)。⑤ 手の窓で Esc を押すと窓ごと閉じる (持ち物を手放すだけにするか未確認)
- **決まりの道具**: 確かめはアミュ B (メモ feedback-verify-with-amulet-b)、絵は撮る前に整列 (feedback-tidy-before-screenshot)、100%・カオスの所で 5 項目 (幅いっぱい・左右の空白・下の空き・切れ・読める) を自分で見てから送る。台本で開く時は #recipe= の URL、ページが読み直されたら整列し直す。1440 で use-tree を書き換えた後は 2 つの版に注意 (下の行)
- **作りの覚え**: 箱の大きさ BOX_W 316・BOX_H 110 (最低、中身で伸びる)・GAP_Y 360・GAP_X 340、schema 2 (tree-migrate 1 → 2 で縦 1.5 倍・横 340/220 倍)。tree-model-ops.ts (まとめる・分ける・分かれ目)、tree-sample-shape.ts (形に合う見本、割合も)、use-tree-join.ts / TreeJoinBar.vue (まとめるの選び方)、tree-fail.ts の stepOf・backText・isRetry
- 1440 の「use-tree を 2 つの版」: HMR で use-tree.ts が書き換わると、読み直した部品だけ新しい版を持ち木が 2 つに分かれる (画面は古い木)。use-tree を書き換えた後はタブを読み直す、残ればブラックに立て直しを頼む
- 途中の物: 無し (全部 commit・push 済み)。立てた物無し (確認用 Chrome は閉じた)

## 前の引き継ぎ・報告は notes/ に写した: 25 → 26 〜 29 本目の報告と引き継ぎ・次の段 (10-25〜26) は notes/2026-10-26-todo-archive.md、22 → 23・23 → 24・24 → 25 本目の引き継ぎ (10-25) は notes/2026-10-25-todo-archive.md、17 → 18 本目の引き継ぎ (10-23 夜) は notes/2026-10-24-todo-archive.md、4〜17 本目の報告と引き継ぎ (10-22〜23) は notes/2026-10-23-todo-archive.md

## 許可が出る操作 (17 本目の洗い出し、10-23 オーナー「シミュの許可が多い」)
- 避ける (今から): Bash の頭の `cd …;` つなぎ (約 15 回) → `git -C`・`pnpm --dir`・`node "<絶対パス>"` に。python のヒアドキュメントでのファイルの書き換え (約 10 回) → Edit / Write に。台本は scratchpad に Write して絶対パスで node。
- 窓なし Chrome も Bash で (10-23 ブラック、1 回試して許可は出なかった): 起動は Bash の run_in_background で `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9333 --user-data-dir="<scratchpad の絶対パス>/sim17-cdp-profile" about:blank`、立つのを待つのは台本の中 (scratchpad の waitchrome17.mjs、Bash の sleep を繰り返すとコンソールの窓がちらつく、10-23 オーナー)。止めは起動した裏の仕事を TaskStop で止め (自分の Chrome だけが止まる。ポートや PID で探さない: 別のセッションの Chrome も 9333 で待つ事があり、窓なし Chrome は CDP の Browser.getBrowserCommandLine を返さず見分けられない。PowerShell も使わない)、cleanchrome17.mjs で 9333 が空いたのを見て profile を消す。

## 残り (下の報告から、10-23)
- 残り: 取引所の検索・ベースの値段の比べは印が 2 つ以上だと 1 つ目だけ / 比べない (③ の式は ✦ 1 つ)。
- 残り: 死蔵の一覧の要確認の物 (auto/ は解析君・recipe-sim + recipe-pattern-run はジンの mod-bughunt テストが使う・quiz-samples はテストが使う)。下の「次の段」は合格の後なのでブラックの指示待ち。書きかけ無し、触っている行無し、立てた物無し、開発版と 9333 は返した。

## 決まり (身にしみた物)
- スマホのツリーは形ごと作り直す前提、細かい直し (はみ出し・余白) はしない (オーナー 10-24 夜「絶対ツリーとか操作むりやろ縦画面で」。a17d23c1 は残す)。
- ヒネコラの髪束はツリーの棚に入れない (今のまま、説明の 1 行も出さない。オーナー 10-23、モンキー 3 回目の見比べ)。
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

