# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 次の部長へ (22 本目 → 23 本目、10-25 深夜。会話 1,100 件超え・送信の上限でブラック 10 代目の頼みで入れ替え)
- 宛先: ブラック 10 代目 local_b4352604-0717-4065-92a4-7f1ac6ebcc83、デザイン部長 5 本目 local_ee8c33db-2bdf-4656-9e00-58c9d121cb1c。ほかは docs/org/dev/todo.md の表。21 → 22 の引き継ぎは notes/2026-10-24-todo-archive.md の末尾、22 本目の後半の報告の全文は notes/2026-10-25-sim22-report.md
- **送信の上限**: 10 回ほどで止まる (22 本目は 11 回目から止まった)。止まったら共有メモ (side-session-notes/local_b4352604…/) に書き、commit の題に要点を入れる
- 22 本目に済んだ物 (どれも開発版だけ、手元 1440 で台本から本物のマウスの動きで見た):
  - 完成形のカード: 行の × (rowRemove、デザイン 2099294b) をつないで見た。値は幅の真ん中に固定 (c0a93ef2、1 本の乱数を順に使っていて外すと値がずれた)。段の札は「S2 以上 / S2+」(tierAtLeast、デザイン 386dd690)
  - レシピのページからシミュの外へ出る時は未保存でも白紙に (c0a93ef2、page.ts の mustAsk はデザイン 2099294b)
  - 「← ツリーに戻る」は、ほかのタブに手か狙いの入った木があるか、今の木に手が入っている時だけ (0c7e6213・3e5502b0。手を打った木から流れの 2 で来た時は出す = オーナー OK)
  - 穴: 札「穴 n」はスイッチ (既定オン = 赤・箱の !、押すとオフで灰色、オフは組み替えても「テストで回す」でも続く・タブを替えるとオン)。一覧の窓は既定で出さず、箱の ! か札の横の ▾ で開く (761c7773・7141bc0d・6fec5469・7a32750e)。自動のテストランは合格を決めるだけ
  - 次に打つ手の窓のカードにも「外れ MOD」(9bc8c647、初めから渡していなかった)
  - **フラクチャー済みからのスタートは ✦ の MOD 1 つだけ** (544f1241、START_JUNK 3 → 0、10-23 の決めをオーナーが 10-25 に変えた。README も直した 6205891b)。「打たずに分ける (分かれ目)」のボタンは外した (c02bf7c1、見本の分かれ目と TreeSplitPick は残す)
  - 見本 5 本は ✦ だけ → 高貴の適当打ち × 3 で外れを付けてから前の手順 (8c9d4f5e、tree-samples の withFill。tree-run の settle は「打った後」の箱へ戻って手が打てない時も形の合う箱へ)。精査は 5 本合格、ローブの b3「お告げが効かない人がいる (手は打てる)」1 件は直さない (ブラック OK)。100 人は 6 本とも完成 100%・止まり 0
- 途中の物: 無し。書きかけ無し、触っている行無し、立てた物無し (窓なし Chrome は止めて profile は消した)
- 決まり (10-25): 窓なし Chrome は必ず Bash の run_in_background で立てて TaskStop で止める (22 本目は 2 回 & で立ててしまい、PowerShell で自分の profile の物だけ止めた)。Bash の中でバッククォートを含む node -e は崩れる、台本は Write / Edit で
- 台本 (22 本目の scratchpad C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/a7e26644-3873-4467-aa63-d41bdca54609/scratchpad/、port 9362): rowx.mjs (カードの ×)・tier.mjs (段の札)・leave.mjs (レシピから外へ)・back.mjs / back2.mjs (ツリーに戻る)・holes.mjs (穴の札と窓)・miss.mjs (棚の外れ MOD)・fracstart.mjs (✦ だけのスタートと分かれ目のボタン)・samples.mjs (見本 6 本の精査と 100 人)

## 前の引き継ぎ・報告は notes/ に写した: 17 → 18 本目の引き継ぎ (10-23 夜) は notes/2026-10-24-todo-archive.md、4〜17 本目の報告と引き継ぎ (10-22〜23) は notes/2026-10-23-todo-archive.md

## 許可が出る操作 (17 本目の洗い出し、10-23 オーナー「シミュの許可が多い」)
- 避ける (今から): Bash の頭の `cd …;` つなぎ (約 15 回) → `git -C`・`pnpm --dir`・`node "<絶対パス>"` に。python のヒアドキュメントでのファイルの書き換え (約 10 回) → Edit / Write に。台本は scratchpad に Write して絶対パスで node。
- 窓なし Chrome も Bash で (10-23 ブラック、1 回試して許可は出なかった): 起動は Bash の run_in_background で `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9333 --user-data-dir="<scratchpad の絶対パス>/sim17-cdp-profile" about:blank`、立つのを待つのは台本の中 (scratchpad の waitchrome17.mjs、Bash の sleep を繰り返すとコンソールの窓がちらつく、10-23 オーナー)。止めは起動した裏の仕事を TaskStop で止め (自分の Chrome だけが止まる。ポートや PID で探さない: 別のセッションの Chrome も 9333 で待つ事があり、窓なし Chrome は CDP の Browser.getBrowserCommandLine を返さず見分けられない。PowerShell も使わない)、cleanchrome17.mjs で 9333 が空いたのを見て profile を消す。

## 残り (下の報告から、10-23)
- 残り: 取引所の検索・ベースの値段の比べは印が 2 つ以上だと 1 つ目だけ / 比べない (③ の式は ✦ 1 つ)。
- 残り: 死蔵の一覧の要確認の物 (auto/ は解析君・recipe-sim + recipe-pattern-run はジンの mod-bughunt テストが使う・quiz-samples はテストが使う)。下の「次の段」は合格の後なのでブラックの指示待ち。書きかけ無し、触っている行無し、立てた物無し、開発版と 9333 は返した。

## 台本 (共有メモ local_35782246-d80a-4c3f-9dff-36103418e719/tree-mouse/)
- tree-mouse.mjs (8 条件の操作、10b はホイール = 拡大縮小に直した)・tree-shelf.mjs (棚とお告げ)・tree-recipe.mjs・tree-trial-wide.mjs・tree-sample-check.mjs (見本の木: 戻りの線の終わり・n か所・精査 0・縮めて押す → ポップアップ → 試し打ち・札の編集と Esc)。

## 決まり (身にしみた物)
- スマホのツリーは形ごと作り直す前提、細かい直し (はみ出し・余白) はしない (オーナー 10-24 夜「絶対ツリーとか操作むりやろ縦画面で」。a17d23c1 は残す)。
- ヒネコラの髪束はツリーの棚に入れない (今のまま、説明の 1 行も出さない。オーナー 10-23、モンキー 3 回目の見比べ)。
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

## 次の段 (合格の後)
100 人回し (解析君の tree-run.ts を呼ぶワーカー、入口の形 docs/org/math/notes/2026-10-23-tree-run.md)・全部のベースと保存 / 共有・分かれ目の箱 (マナ系の指輪)・英語・古い工程ページを消す・作り直し (restart) を画面で選べるように。
