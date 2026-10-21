# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 今 (4 本目、10-22)
- **今の段 = UI / UX の仕上げ。オーナーの最終チェックで合格が出るまで次の段 (計算を画面に繋ぐ) に進まない。** 目標 11/10。
- 入れた物 (全部開発版だけ、?page=sim-tree・見本は &sample=gold-ring-suffix):
  - A 見本の木を作りきる (0b51ff26・7234ab63): 始めの形に乱数の MOD (startRandom)・外れの下の箱の親を外れの箱に・「形の合う箱へ」の判定を tree-run に 1 つ (shapeKey・matchTargets、回す時・精査・画面の線で同じ)・戻りの線は戻り先の打つ手の札の左の端へ・形の合う箱へは自動で線 (複数なら「n か所」)・消えた箱は初めから形の合う箱へ。台本 scripts/_tree-sample-probe: 31 箱全部で見本・精査 ! 0・100 人で完成 100 止まり 0。
  - B 札の編集 (97dd767a): 持ち直すを消す・替える前に「下の n 箱が消える」・編集中の Esc は取り消し。
  - C1 枠の外・Esc (b366528f)、C2 ホイールで拡大縮小 (f58a2a80)、C3 外れ MOD の札 (4e51480b、ジン部長の rowTags)、C4 線の道の作り直し (cafc7253、tree-lines.ts の routeBacks、整列の兄弟の間 64px。台本 scripts/_tree-lines-probe: 見本 18 本で箱を通る 0・同じ所 0・棒と同じ高さ 0、跨ぐ 49)、C5 小さい倍率の編集のポップアップ・＋で棚と同時に箱を色分け (6b4cda86、use-tree-link.ts)。
  - 打てない手 (効かない・消せる物が無いお告げ) は確定させず、置かれていれば精査で ! (2b085e32、tree-sample の handProblem = エンジンの omenBlock + playHand)。
  - 木の設定 (触媒・聖別の倍率・MOD の重み) を木に持ち、レシピ・URL に乗せる (31160444、tree-tune.ts・use-tree-tune.ts)。
- 確かめ (開発版 4e51480b、本物のマウス): tree-mouse.mjs 1 条件 39 件 NG 0、8 条件は回している途中。見本の木の台本 tree-sample-check.mjs (共有メモ local_35782246…/tree-mouse/) はこれから。
- 次: 確かめの結果を見て直す → 開発版の URL と件数をブラックへ → オーナーに触ってもらう。跨ぐ所が多い (49) のは画面で見て詰める。src/views/htc-craft/tree-auto.ts (514 行) を 500 行以下に割る (ブラックの頼み、移動だけの commit と中身は別)。

## 台本 (共有メモ local_35782246-d80a-4c3f-9dff-36103418e719/tree-mouse/)
- tree-mouse.mjs (8 条件の操作、10b はホイール = 拡大縮小に直した)・tree-shelf.mjs (棚とお告げ)・tree-recipe.mjs・tree-trial-wide.mjs・tree-sample-check.mjs (見本の木: 戻りの線の終わり・n か所・精査 0・縮めて押す → ポップアップ → 試し打ち・札の編集と Esc)。
- Chrome は PowerShell の `Start-Process chrome.exe -WindowStyle Hidden -PassThru -ArgumentList --headless=new,--remote-debugging-port=9333,--user-data-dir=<scratchpad>/cdp-profile`、使う前にブラックに一言、終わったら PID で止めて profile を消して「返した」。

## 決まり (身にしみた物)
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

## 次の段 (合格の後)
100 人回し (解析君の tree-run.ts を呼ぶワーカー、入口の形 docs/org/math/notes/2026-10-23-tree-run.md)・全部のベースと保存 / 共有・分かれ目の箱 (マナ系の指輪)・英語・古い工程ページを消す・作り直し (restart) を画面で選べるように。
