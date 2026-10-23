# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 18 本目の報告 (10-24、全部手元 1440 で確かめ、開発版には出していない)
- 6c52abd9・0946d322・457ab956: 完成形の設定 = 押せない段は灰色 (デザイン部長 178daf1b の共通 g-tab)・狙いは「選んだ段以上」の MOD 1 つ (当たりの判定は前から以上 = aimHeldOn → 核 aimHits の minTierIndex、フラクチャーの候補は印の段から上を全部)・ベース替えで狙いを残す (ジン部長の carryAims 3599bd0b、指輪→手袋でライフ T1 ✦ → 手袋 T2 ✦)・説明の箇条書き・「決めた」はカードの下 (スマホは一覧の下に貼り付け)・送りは 1 つ (初手のページはページ全体)・✦ の印の文は「T2 以上」・ツリーの右上の ← 戻るを消しレシピ一覧は題の横に「← ツリーへ」・流れの 4 段の帯 TreeFlowSteps。
- 再読み込みは今の作りで合っていた (木と完成形はそのまま、消すのは白紙に戻すだけ、出し直しの白紙は VITE_DEV_PREVIEW=1 の時だけ)。
- 残り: SimTreePage.vue が 514 行 (前から 511 で 500 超え、分けるのは別の commit で)。確認用の窓なし Chrome は PowerShell を使わない決まりで止められず about:blank に戻しただけ。chrome-devtools の take_snapshot を filePath に書くと uid が使えない (押す前は文字で受け取る)。

## 引き継ぎ (17 本目 → 18 本目、10-23 夜。会話 2300 件超えでブラックが入れ替え)
- 開発版の今の版: a23050a4 (デザイン部長の fitZoom の直し)。シミュの直しは全部入っている。本番には何も出していない (シミュレーターは本番の予定なし、UI はオーナーの OK の後)。書きかけ無し・触っている行無し・使用表は全部空き。
- 今日の直し (全部開発版、詳しくは下の報告 4〜6 つ目と notes/2026-10-23-monkey.md):
  - スタートとフラクチャーの形: 印 (完成の狙いの Aim.fractured) あり = 候補のどれかが ✦ のレア + 外れ 3 (エンジンの fractureStart、＋の MOD は extra)、印なし = 白。スタートの枠の＋で狙いの MOD を足す。ソケットはエミュの新品と同じ規格外の数から (エンジンの baseSocketsOf)。見本 4 本は新しいスタートで 100 人とも完成。
  - 完成形の設定: 木の箱をやめて枠の左上の札 (TreeGoalNode、「ベース」「MOD」で開く)。木の一番上はスタート。フラクチャーは狙いにした段だけ「狙いにする」の右。初手 (ベース未選択 = use-tree の needBase) は窓でなくページ (共通の BasePickBody、帯はシミュの説明・英語つき、× 無し、2 の段のタブは押せない、段のタブの右端にレシピ)。選ばずに閉じたら空の形 (真ん中に「ベースを選ぶ」、帯はレシピとメモだけ)。ベースを選んだ印は TreeDoc.baseChosen。「決めた」は赤 (g-btn-red) で右下。
  - モンキー 15 件 + 2・3 回目: 見本を開くのは新しく始める扱い + やり直し (Ctrl+Shift+Z / Ctrl+Y)・Esc でページを出ない・スマホの枠 7 割・飛ばすの間・値段を 1 回だけ引く・メモの的・回している間は精査を押せない・カオススパムはカオスが打てる箱だけ・段の目印は 1 つ以上。
  - レシピの一覧を見分けやすく (recipe-summary.ts: ベースの絵・狙い・✦・空の木)。開発版だけ、出した版が変わったら前の木をレシピ「前の木 (日時)」に入れて白紙から (use-tree の resetTreesOnNewBuild)。
  - 重さ: 初手のページから木へ戻ると拡大率が 1 と 0.994 を毎フレーム行き来して CPU が回りっぱなしだった → ツリーの枠の高さに余り (ROW_BOTTOM 54、dd6bf89d)、共通の側もデザイン部長が直した (a23050a4)。データが読めている時は箱を段ごとに出さない (cc592d9b)、塊の先読みはデザイン部長 (4f58312f)。
- 決め (オーナー 10-23): ヒネコラの髪束はツリーに入れない / 棚はエミュと同じ (共通の CurrencyShelf、出さないのは SIM_HIDDEN だけ) / 初手のページはエミュのベースのページと同じ作り / 9 (白紙で開くたびに完成形の設定) は直さない。
- 残り・気づき: 白のスタートで錬金を持つと 0.4 秒の長いタスク (TreeHandShelf の結果の計算、今日の変更より前からかは未調べ)。取引所の検索・ベースの値段の比べは印が 2 つ以上だと 1 つ目だけ / 比べない。見本の木は 1000 人で 0.1〜0.3% 止まる (オーナー「アミュは一旦いい」)。前の形で木を組む台本 (_tree-check-probe など) は満杯で止まる所がある。開発版を出し直した直後の最初の読み込みで前の版の塊が 404 になる事が何度かあった (原因は未調べ)。
- 確かめの台本は scratchpad (このセッションの物は消える) に置いた。形は「窓なし Chrome を run_in_background で立てる → waitchrome17.mjs で待つ → 台本 → TaskStop → cleanchrome17.mjs」。使用表は取る前に case 文で空きを確かめてから (ぶつかった事が 2 回あった)。

## 許可が出る操作 (17 本目の洗い出し、10-23 オーナー「シミュの許可が多い」)
- 避ける (今から): Bash の頭の `cd …;` つなぎ (約 15 回) → `git -C`・`pnpm --dir`・`node "<絶対パス>"` に。python のヒアドキュメントでのファイルの書き換え (約 10 回) → Edit / Write に。台本は scratchpad に Write して絶対パスで node。
- 窓なし Chrome も Bash で (10-23 ブラック、1 回試して許可は出なかった): 起動は Bash の run_in_background で `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9333 --user-data-dir="<scratchpad の絶対パス>/sim17-cdp-profile" about:blank`、立つのを待つのは台本の中 (scratchpad の waitchrome17.mjs、Bash の sleep を繰り返すとコンソールの窓がちらつく、10-23 オーナー)。止めは起動した裏の仕事を TaskStop で止め (自分の Chrome だけが止まる。ポートや PID で探さない: 別のセッションの Chrome も 9333 で待つ事があり、窓なし Chrome は CDP の Browser.getBrowserCommandLine を返さず見分けられない。PowerShell も使わない)、cleanchrome17.mjs で 9333 が空いたのを見て profile を消す。

## 残り (下の報告から、10-23)
- 残り: 取引所の検索・ベースの値段の比べは印が 2 つ以上だと 1 つ目だけ / 比べない (③ の式は ✦ 1 つ)。
- 残り: 死蔵の一覧の要確認の物 (auto/ は解析君・recipe-sim + recipe-pattern-run はジンの mod-bughunt テストが使う・quiz-samples はテストが使う)。下の「次の段」は合格の後なのでブラックの指示待ち。書きかけ無し、触っている行無し、立てた物無し、開発版と 9333 は返した。

## 17 本目の報告 4〜6 つ目・16 本目の報告と記録・15 → 16 本目の引き継ぎ (10-23) は notes/2026-10-23-todo-archive.md の頭にそのまま移した (10-23 夜 ホワイト)

## 前の報告・引き継ぎ (報告 1〜34、4〜15 本目、10-22) は notes/2026-10-23-todo-archive.md にそのまま移した (10-23 ホワイト)

## 台本 (共有メモ local_35782246-d80a-4c3f-9dff-36103418e719/tree-mouse/)
- tree-mouse.mjs (8 条件の操作、10b はホイール = 拡大縮小に直した)・tree-shelf.mjs (棚とお告げ)・tree-recipe.mjs・tree-trial-wide.mjs・tree-sample-check.mjs (見本の木: 戻りの線の終わり・n か所・精査 0・縮めて押す → ポップアップ → 試し打ち・札の編集と Esc)。
- Chrome は PowerShell の `Start-Process chrome.exe -WindowStyle Hidden -PassThru -ArgumentList --headless=new,--remote-debugging-port=9333,--user-data-dir=<scratchpad>/cdp-profile`、使う前にブラックに一言、終わったら PID で止めて profile を消して「返した」。

## 決まり (身にしみた物)
- ヒネコラの髪束はツリーの棚に入れない (今のまま、説明の 1 行も出さない。オーナー 10-23、モンキー 3 回目の見比べ)。
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

## 次の段 (合格の後)
100 人回し (解析君の tree-run.ts を呼ぶワーカー、入口の形 docs/org/math/notes/2026-10-23-tree-run.md)・全部のベースと保存 / 共有・分かれ目の箱 (マナ系の指輪)・英語・古い工程ページを消す・作り直し (restart) を画面で選べるように。
