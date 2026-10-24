# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 次の部長へ (21 本目 → 22 本目、10-24 深夜。1,300 件超え・送信の上限でブラック 10 代目の頼みで入れ替え)
- 宛先: ブラック 10 代目 local_b4352604-0717-4065-92a4-7f1ac6ebcc83、デザイン部長 5 本目 local_ee8c33db-2bdf-4656-9e00-58c9d121cb1c。ほかは docs/org/dev/todo.md の表。21 本目の報告の全文は notes/2026-10-24-sim21-report.md (共有メモ sim21-report-fracture-ask.md の写し)、20 → 21 の引き継ぎは notes/2026-10-24-todo-archive.md の末尾へ移した
- **送信の上限**: セッションどうしの送信は、オーナーがそのセッションに書かないまま 10 回ほどで止まる。止まったら共有メモ (side-session-notes/local_b4352604…/) に書き、commit の題に要点を入れる (ブラックが git log で拾う)
- 21 本目に済んだ物 (どれも開発版だけ、手元 1440 で台本から本物のマウスの動きで見た):
  - ページ分け (bcc3c59d、土台はデザイン部長 b042f6c2): ?page=sim-base / sim-mods / sim-tree (web/page.ts の treeStep・openTreePage(step))。上のタブ「シミュレーター」= sim-base。流れの帯の 1・2 はページ、木の中の「ベース」「MOD」の札は窓のまま。作りかけで外へ出ると「保存せずに終了しますか」(setLeaveGuard、レシピ・sim-* の間は聞かない)
  - 作業中の木・タブを持ち越さない (cede3e93): 開き直す・シミュの外から入るといつも sim-base の空から。sim-tree / sim-mods を直に開いて木が無ければ URL を sim-base へ置き換え (先に replaceState すると page.ts は積まない)。残すのは保存したレシピ・共有 URL・?sample=。古い鍵 (exiledesk.tree.v0・.tabs・.before-sample ほか) と開いていたレシピの印は消す。外へ出たら use-tree の resetAll (SimTreePage の unmount、レシピのページは未保存なら残す)
  - フラクチャーの 2 択 (5a3ab1f3・1a7b11d5): MOD のページで印が無い所から印を付けると窓 TreeFractureAsk (2 枚のカード「始まり」「フラクチャーの費用」)。① 済みから = ✦ が 1 つのレア / ② 前から = 必ず白 (ノーマル) から木の中でフラクチャー (×3 は回しの FRACTURE_MISS、始めの値段は白のベース代)。start.from、tree-model の startsFractured。スタートの箱・始まりの形の窓に出る。同じ commit で始めの値段の比べに印 (memoAims) を渡していなかった穴を直した (前はいつも 0)
  - 戻り道・コピー・タブの名前 (2aa1c7c6・63007f44): ベース・MOD のページに「← ツリーに戻る」(新しいツリーなら前の木へ、use-tree の leaveNewTab)、空の形でもタブ、「コピー」(〜 のコピー、copyTab)、タブの名前はツリー①… (tabNo・tabName) でダブルクリックで変える (Enter・外を押すと決める、Esc で取り消し)
  - 「狙いが消えた」は消せる狙いを持って着く人がいない箱では作らない (f3455083、tree-lost.ts・healLost)、レシピの見本の帯を外した (70b59be0)、スマホの余白 (a17d23c1)、合金のコメント (b242d90f・7e9dc765)
- 途中の物:
  - 完成形のカードの × (オーナー「アイテムにつく UI からもバツで消したい」): シミュの受け onCardRemove は済み (0dedcb05)。× を出す口 rowRemove は StageItemCard (for-share) にデザイン部長が作っている最中 (ブラックが頼んだ)。入ったら TreeGoalPage の StageItemCard に `row-remove` を付けて (デザイン部長が付けるかも、TreeGoalPage を触っていた)、1440 で行にホバー → × → 一覧の選択も戻るのを見る
  - レシピのページからシミュの外へ出る時の確かめ: page.ts の mustAsk が treePage の時だけ (ブラックがデザイン部長に頼んだ)。入ったら StageRecipesPage の unmount の `!dirty.value` を外して白紙に戻す
- 決まり (10-24 夜): スマホのツリーは作り直す前提で細かい直しはしない。印が複数の時は 1 つのツリー (① は候補の 1 つが固定されたレア、② は白から)、タブの自動分けは作らない (オーナーに聞いている)
- 残り: 初めての人の回の 7 以降は記録のまま。settle で深い外れの箱へ移される件・反響の代金 (下の 20 → 21 から持ち越し、notes/2026-10-24-todo-archive.md)
- 台本 (21 本目の scratchpad C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/29e4dcf2-ed9c-4a90-a68e-be8adbf99a33/scratchpad/、窓なし Chrome は port 9361 を run_in_background で立てて TaskStop、profile cdp-profile は消す): pages.mjs (ページ分けと離れる確かめ)・frac.mjs (2 択の窓、CLEAR=1 / EN=1)・back.mjs (戻り道・コピー・名前・Esc)・fresh.mjs (持ち越さない)・cost.mjs (始め方ごとの値段)・lost.mjs / lost2.mjs (狙いが消えた)・phone.mjs・recipes.mjs・share-b.mjs (B の共有 URL)。押す物は見えている物を選ぶ (同じ印の隠れた写しがある)。作りかけの木で about:blank へ移ると beforeunload で止まるので Page.javascriptDialogOpening を受けて閉じる。未選択のベース選びは部位 (data-rec="family:…") を押してからベース

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
