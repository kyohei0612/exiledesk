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
- 確かめ (開発版、本物のマウス = CDP の Input): tree-mouse.mjs 8 条件 312 件 NG 0 (4e51480b)、tree-sample-check.mjs 4 条件 44 件 NG 0 (1e58e7ab。途中で見つけて直した: 縮めた時のポップアップが横に広がり試し打ちが枠の外 6c6c553f・戻りの札が押下を止めてポップアップが出ない 09154c98 / 1e58e7ab)。等倍のスナップは目で見た。
- 次: オーナーに触ってもらう (返事待ち)。残りの気付き: 「全体を表示」で横に広い木はミニマップが右下の箱に重なる (fit は空ける幅が足りない時に空けない)、跨ぐ所 49 は見て多ければ詰める、木の設定はページを閉じずにタブを閉じるとクラフトステージの覚えた値が木の値のまま。

## 引き継ぎ (4 本目 → 5 本目、10-22。会話が重くなりブラックの頼みで入れ替え)
- 済んだ物: 上の「入れた物」全部・確かめ 2 本 (NG 0)・頼まれた整理 2 つ (todo の整理 be5f86a9・tree-auto.ts を 482 行に f251f85d)。全部 commit・push 済み、開発版は 1e58e7ab (の後に docs だけ)。Chrome 9333 は止めて profile も消した、dev サーバーは立てていない。
- 途中の物: 無し (書きかけのファイル無し)。
- 決まりの変更 (10-22、7bf65019): 「触っている」は docs/org/dev/touching/simulator.md に自分で書き、自分の commit で消す (dev/todo.md には書かない)。
- 待ち: オーナーに見本の木を触ってもらう返事 (URL は開発版の ?page=sim-tree&sample=gold-ring-suffix、鍵は tree-mouse.mjs の KEY_URL)。
- 次の手 (ブラックの頼み、ツリーの UI が先・区切りで): 点検 docs/org/emulator/notes/2026-10-22-code-audit.md の「直す案 シミュ部長」(84 行目あたり)。
  1 最優先 = use-sim-targets.ts:15・use-sim-search.ts:7 の凍結 (htc-craft・simulator/htc) への import を外す (要る関数はエンジンの入口か共通へ、その時はブラックへ 1 行 → ジン部長)。
  2 重複 → 3 消す (テストだけの 3 本は残す) → 4 持ち主は今の owners.txt のまま。振る舞いは変えない、型チェック + org-lint で確かめる。
  側の式 `mods.get(id)?.type === "suffix" ? …` をエンジンの入口の sideOfMod(data, modId) に替える (ジン部長 acdc1eca): auto-group.ts:16・quiz-build.ts:71,85・recipe-sim.ts:49・sim-odds.ts:33・keep-compare.ts:33・sim-methods.ts の 7 か所・sim-greater.ts:33・target-share.ts:27・use-sim-calc.ts・use-target-plans.ts:109・StageTopicGuide.vue:138。
- 見つけた不具合・気付き: 上の「残りの気付き」(ミニマップが重なる・跨ぐ所 49・タブを閉じた時の設定)。消去 + 左側のお告げは、乱数の MOD が左にあってもエンジンの omenBlock が「今は意味なし」で止める (エンジンの判断、ジン部長の持ち物)。

## 5 本目 (10-22 深夜〜、点検の直す案)
- 済んだ物 (全部 push 済み、振る舞いは同じ。確かめ = 型チェック 0・入口の見張り「増えた所なし」・org-lint、tree-run は check-tree-run all 300 人 種 1 の出力が直す前と同じ、コース 12・チュートリアル・コース・見本は JSON が直す前と同じ。画面は見ていない):
  - sideOfMod へ 20 か所 (8a0768cd)、use-sim-search の AFFIX_COUNT を凍結から外す (6a14275e)、消す 7 つ (d971912e)。テストだけの 3 本 (auto-group・quiz-samples・quiz-tutorial-run) はテストの見本として残す。
  - 重複: fmtDate (7b2c0923)・useRecipeUrl (7e6e2fca・77c883db)・use-sim-shelf (03008958)・membersOf (e1c59357)・recipe-store-util (29196678)・ageText と memoPrice (af7bbfe5)・tree-run の play → playHand (d9266ebf)・topic-steps (cd445aba)・quizSlot (e0b9e245)・urlOff (e4e5225e)。
  - 見送り: 失敗の判定 (recipe-pattern-run と recipe-sim は既に共有の ctx の fixedHit・fail を使い、写しは 1 行の文だけ)。membersOf の auto-model.ts:167 は解析君の持ち物なので触っていない。
- 待ち: use-sim-targets の planByRedoCost (凍結の htc-craft/redo-cost) を外すか → ブラック経由でオーナーに A 外す / B ジンに移す / C 旧工程ページを消すまで据え置き。
- ジン部長の物 (ブラックへ回した): share.ts の xIntentUrl が投稿の文を引数で受ければ recipe-share の recipeXUrl を寄せられる。パターンの初期値 { name: "パターン 1", steps: [], quiz: { v: 3, rules: {} } } は StageSettings・use-stage-base (ジン) と use-sim-steps (シミュ) の 3 か所、置き場は state/craft-stage.ts が良い。
- 直す案 4 (views/craft-stage の 5 本と web/page.ts・state/web-page.ts の持ち主) はブラックに 1 行で返した。
- ツリーの UI/UX (10-22): オーナーが線は案 A・言葉は案 1 を選び、b7d43022・14213d7e で既定に (古い戻りの弧・案 B・印は消した)。試し打ちの欄も消した (メモは箱の鉛筆、× の印は付ける所が無い)。見本の狙いが消えた行き先をカオス (当たるまで) に (1e89ecd8、精査は heldSets)。その後 狙いが消えたら全部「始めに戻る」+ 形が違えば続きから (settle、497f2af2)・触媒はカタリストを選んで先に打つ形 (e67a172e・59ab4c9d)。開発版 59ab4c9d、記録は共有メモ local_ba9fc825…/tree-merge/README.md。点検の残り (planByRedoCost・recipe-share を xIntentUrl へ) は後回し。

## 引き継ぎ (5 本目 → 6 本目、10-22 深夜。会話が 1000 件を超えブラックの頼みで入れ替え)
- 済んだ物: 上の「5 本目」全部。開発版は 59ab4c9d (ツリーの新しい形が既定・試し打ち無し・始めに戻る + settle・触媒はカタリストを選ぶ)。全部 commit・push 済み、書きかけ無し。Chrome 9333 は止めて profile も消した、dev サーバーは立てていない。
- 記録: 共有メモ local_ba9fc825…/tree-merge/README.md (前後の数・スナップ a1〜a4・b1〜b4・台本 shots2.mjs / shots3.mjs = 開発版を窓なし Chrome 9333 で撮る)。形の数は scripts/_tree-merge-probe、見本の回しと精査は scripts/_tree-sample-probe。
- 次の手 (オーナー 10-22、上から順に。全部ツリーの UI/UX、開発版だけ):
  1. 結果の見せ方を 1 通りに揃える: 同じ打つ手の結果なのに、戻りだけの箱は小さな札「→ T1 サフィ 見つ…」、ほかは箱「当たり / T2 以上 …」で見た目が違う (オーナー「何で表示が違うんですかって話もあるわな」)。案 = 札にするなら当たり / 外れの印と色を箱と同じに、箱にするなら続きからの線を箱の下から。どちらが良いかスナップで案を出してから入れる (tree-merge.ts・TreeMergeLayer.vue・tidy の pill)。
  2. 倍率を決まった段だけにする: 自由な値をやめ、例 25・33・50・67・100・125・150% (段は 6 本目が決めてよい)。ホイール・＋−・全体表示もその段に吸い付く (全体表示は収まる一番大きい段、use-tree-flow.ts の clamp・fit・setZoom)。きっかけ = 76% で消去のオーブの下の札「↩ 狙いが消えた」と「外れが消えた」が横にくっついて重なった。確かめ = 開発版の本物の描画で、全部の段で見本の木の箱・札・打つ手の札の矩形の重なり 0 件と間の詰まりを台本で数える + 76% だった所の前後スナップ。
  3. 品質だけ上げる手: カタリストを打つ手は当たり / 外れの箱に分けず、打つ手の札 1 枚 (アイコンの列 + 名前、例「軽快のカタリスト」) で表し、その下に＋で次の手をつなぐ (オーナー「品質だけ上げるくだりがあるでしょ、オーブを打つだけの表示でいいから下に＋」)。tree-model の HandKind / OUTS_OF に「結果の箱無し」の種類が要る (今の free は「打った後」の箱を 1 つ作る)。tree-run・tree-check・tree-sample の playHand も通す。
  4. カタリスト専用ルート: 打つ手を選ぶ所 (TreeHandShelf) に「カタリストを品質の上限まで打つ」決まった道を 1 つ。触媒のお告げを選んだ時のカタリストの選び (今は同じ札の中で先に打つ、59ab4c9d) とつながるように (3 の手を前に足す形にするか、今の同じ札のままかを案に)。
  5. 点検の残り (後回し): use-sim-targets の planByRedoCost (オーナーの A/B/C 待ち)、recipe-share の X の URL を share.ts の xIntentUrl(url, text) に寄せる (ジン部長 1adf9da6 で入った)。
- 気付き: 精査 (tree-check) は 5 人を辿るだけなので、行き先が分かれる所の当たりは出たり出なかったりする (heldSets で「もう付いているかもしれない狙い」は数えない形にした)。シミュの台本は vitest の scripts/_*-probe.config.ts で回す (tests/ には入れない)。

## 6 本目 (10-22 深夜〜)
- 済んだ物 (全部 push 済み、開発版 5ae1620d。記録と前後のスナップは共有メモ local_ba9fc825…/tree-merge/README.md の頭):
  - 手 1 結果の見せ方: 2 案 (&res=a / b) をスナップで出し、オーナーが b を選んだ → 全部普通の箱に、札と印のコードは消した (73665b3e)。全部の箱で乗せた時のカード (8b590e1d)、戻り先を選ぶ時の候補の箱のカードは元から出ていた。名前・色・印の表は tree-names.ts の OUT_LOOK 1 つ (0d65541f)。
  - 手 2 倍率の段: 25・33・50・67・75・100・125・150% だけ (7ba62095)、全体表示は収まる一番大きい段で右下を空けると段が下がる時は空けない (4e1a8ddb・5ae1620d)。台本 zoom-steps.mjs で 3 幅 × 8 段の重なり 0 件。
  - 白紙に戻すの 2 回押し (310deb15、use-armed + 枠の外・Esc)。台本 clear2.mjs で 5 つとも決まりどおり。
  - 戻り先は具体的な箱だけ (77beaa5b・025762f1): 箱の下の行はいつも行き先の箱の名前 (複数なら「ほか n か所」)、選ぶ所の「↩ 続きから」は消した。自動のつなぎは外れが消えた = 外れの前の箱・狙いが消えた = 始めに戻る、見本の木も具体的な箱に。
  - 手 3 品質だけ上げる手 (07f2c319): 棚のカタリスト = 結果の箱無し (中は通り抜け pass)、札の下に次の札か＋。台本 _tree-quality-probe (白紙から組んで精査 0・100 人で完成 100、DUMP で木の JSON)。画面は tree-merge/q1-chain・q2-plus (quality-shot.mjs、localStorage に入れて撮った)。
  - 手 4 = 案 A (33352d2d): 触媒の前にカタリストの札を自動で足す、棚の「先に打つカタリスト」と 1 枚札は消した。完成の箱から伸ばすと同じ形の完成の箱が合流 (joinSameShape)。
  - 冒涜 → 発現で選ぶ・プレフィックスをつないだ見本 (e5b0fcd0)、倍率に 20% (48027960)。記録とスナップは共有メモ tree-merge/README.md の最後。精査 0・100 人で完成 100。
- 次の手: 1280 幅で箱の中のボタンが 20px の直す案を 1 行 → 5 (点検の残り)。解析君の案 3 (アビスのエッセンス、c284b3de) を見本に入れるかはブラック次第
- 気付き: 1280 幅は 75%・100% でも箱の中の押せる物が 20px (ページの zoom の分、前から)。全体表示 33% で右端の箱がミニマップに近い (前から)。

## 台本 (共有メモ local_35782246-d80a-4c3f-9dff-36103418e719/tree-mouse/)
- tree-mouse.mjs (8 条件の操作、10b はホイール = 拡大縮小に直した)・tree-shelf.mjs (棚とお告げ)・tree-recipe.mjs・tree-trial-wide.mjs・tree-sample-check.mjs (見本の木: 戻りの線の終わり・n か所・精査 0・縮めて押す → ポップアップ → 試し打ち・札の編集と Esc)。
- Chrome は PowerShell の `Start-Process chrome.exe -WindowStyle Hidden -PassThru -ArgumentList --headless=new,--remote-debugging-port=9333,--user-data-dir=<scratchpad>/cdp-profile`、使う前にブラックに一言、終わったら PID で止めて profile を消して「返した」。

## 決まり (身にしみた物)
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

## 次の段 (合格の後)
100 人回し (解析君の tree-run.ts を呼ぶワーカー、入口の形 docs/org/math/notes/2026-10-23-tree-run.md)・全部のベースと保存 / 共有・分かれ目の箱 (マナ系の指輪)・英語・古い工程ページを消す・作り直し (restart) を画面で選べるように。
