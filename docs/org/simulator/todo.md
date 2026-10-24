# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 20 本目の最初の仕事 (10-24 夜、オーナー「A は高い、B を完成させんとな」、ブラック経由)
**済み (20 本目、結果 notes/2026-10-24-absent-amulet.md の末尾)**: B = 96.2 神 / 1 個 (A 464.6、同じ相場)。1・2・2b・3 は字幕を読んでオーナーの形で組んだ (3 の技の中身は字幕に無い、今の手で組めた)。4 は前と同じく分かれ目で避けた。stepOutcomes はジン部長 e63f9898 で直った (木は同じ)。満杯の骨は前の冒涜と置き換わらない (オーナー、B 96.2 神で確定)。古代の鎖骨の比べも済み (A 393・B 328 神)。
見本の木 absent-b (src/services/simulator/tree/samples/absent-b.json、?sample=absent-b、結果 notes/2026-10-24-absent-amulet.md) を動画どおりに直して 100 人で回し直し、absent-a と数字を並べる。字幕 data-cache/subs/mjaMYCYl-PI.en.txt。
1. サフィックス (キャストスピード T1): 右側のネクロマンシーのお告げで骨をサフィックスに冒涜 → 外れたら右側の結晶化のお告げ + 無限のパーフェクトエッセンス (Perfect Essence of the Infinite、アミュは % 能力値のサフィックス) で冒涜の MOD を置き換えて消す → また冒涜。光のお告げは使わない (動画 12:47 で infinite・反響・右側のネクロマンシーを買っている)。今の木は光 + 消去で、費用の大半がそこ。
2. プレフィックス: オーナー「肝心のプレはグローバル防御のエッセンスで 50%」= 強化のパーフェクトエッセンス (Perfect Essence of Enhancement、AllDefences) の所が 50% の賭け。字幕の 20:27〜21:06 と 23:57〜27:00 を読み直して手順を合わせる (今の木はルーンワード = ルーンアロイの所を 50/50 にしている)。
3. 反響のお告げで発現を何度も選び直す技 (動画の「heart of the well trick」) をツリーで組めるようにする。今の骨の手は「骨 + 反響 = 発現の候補を 1 回引き直す」だけ (tree-sample.ts の applyHand・revealBy)。動画の技の中身を字幕で確かめ、エンジンの入口に無い所はジン部長 8 本目に口を頼む (シミュに自前の打ち方を作らない、メモ feedback-sim-no-own-logic)。これが無いと B の数字は 6〜8 倍ずれる (サブエージェントの近似で A 73・B 77 神 vs 今の木 467・593 神)。
2b. 50/50 の負け (スピリットが消えた時) の戻り: オーナー「B は光を使わないルート」「スピリット消えたら最初のカオスからやな」= 光のお告げで戻さず、最初のカオススパム (T1 スピリット) の箱へ戻す道にする。
4. ついでに: 手のある当たりの箱に着いた人が settle (tree-run.ts) で深い所の外れの箱へ移されて止まる件 (サブエージェントは当たりの箱の後に分かれ目を挟んで避けた。画面で組む人も同じ所でつまずく)。
- 回し方: scripts/_tree-file-check-probe (SAMPLE=absent-b、値段 0 で精査と 100 人)、相場の費用は猿の口の result() か runTree に値段を渡す (サブエージェントの台本の写し scratchpad/absent/_tmp-absent.test.ts.bak、絶対パスは下の道具の所と同じ scratchpad)。報告はブラックへ 3〜6 行。

## 次の部長へ (19 本目 → 20 本目、10-24 夜。会話が長くなったので入れ替え)
- 宛先: ブラック 9 代目 local_52fe22f9-cf1b-45a0-a390-c0d305e6b60a・ジン部長 8 本目 local_a2541814-3a1c-459d-84c0-49be1c773e9f・モンキー隊長 2 本目 local_d69c31e1-a485-4ccc-9816-ec3bf67105fe (表は docs/org/dev/todo.md)。
- 夜にオーナーが dev 1440 のツリーを触る (ブラック「土台固め」)。隊長の「初めての人の回」(notes/2026-10-24-monkey.md の末尾、80606fc6) の 13 件が今の仕事。重い順:
  1. **テストの穴 1 が消えず 100 人回すが押せない** (兜 帝国のグレートヘルム、ライフ T3 狙い・火耐性 T2 フラクチャー → スタートにカオス → 当たり完成 → 外れにカオススパム → 当たり完成)。元は分かった: エンジンの engine-sim/start-fracture.ts の fractureStart が外れ 3 から完成の狙い (ライフ) を除かず、ライフを持ってスタートした人は外れの箱のカオススパムで当たらない (新しく付かない)。ジン部長に「外れに付けない MOD」の口 (例 o.avoid) を頼んだ (返事待ち)。来たら tree-sample.ts の startItemOf で完成の狙い全部を渡す。画面の側も: 穴の文に直し方、押せない理由を title でなく文で (スマホ)。
  2. ヒステリーのエッセンスの説明が「このベースには使えない」なのに兜の行に MOD (説明の持ち主を確かめる。共通の部品ならデザイン部長)。
  3. スマホ: 「＋ 新しいツリー」が切れる・スタートの箱の「外れ 3」がはみ出す・枠が細い・上のボタンが 6 段。
  4〜13: 段を選ぶとアイテムレベルが黙って変わる (適正)・「穴」「!」の意味・何もしないスタートの「30 人中 27 人」・スタートに無い狙いでも「狙いが消えた」の箱・ベース選びに戻るとタブが見えない・設定「レア」とスタート「白」・タブを替えると「1 つ戻す」が灰色・段の出やすさが全部同じ・当たるまでのチェックが付かなかった (1 回)・兜を押した後ページが動く・説明の浮き窓が残る。詳しくは記録。
- 確かめの道具 (scratchpad の台本、絶対パス): C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/f45d08d4-e179-4920-b6f1-52076e45bc83/scratchpad/monkey-goal.mjs <式のファイル> (窓なし Chrome を port 9351 で Bash の run_in_background で立て、localStorage を空にして 1440 のツリーで猿の口 m を使う式を回す。goal4.js が 1 の再現)。終わったら TaskStop と profile 削除。
- 猿の口 (sim-monkey.ts) に足した物: goalCandidates・setGoal (フラクチャーの印も)・setAim・setBack (箱か start)・setDone・check (テストラン)・result (画面と同じ値段の 100 人、moved・unexpected・prices・capDiv・capSteps つき)。
- 10-24 夜に足した物: 初めての人の回の 1・2・3・5・8・9 とオーナー OK の 3 つ (適正の一言・付けられない組を押せない goalBlock・付かない狙いを灰色) は済み (9347b06f〜efb35963)、残りは 4 の「30 人中 27 人」の文だけ。動画の不在のアミュ A・B の見本 (?sample=absent-a / absent-b、結果 notes/2026-10-24-absent-amulet.md) の気づき: 反響で何度も選び直す冒涜がツリーに無い (費用 6〜8 倍)・手のある当たりの箱が形合わせで深い外れの箱へ移されて止まる (分かれ目で逃げた)。
- 照らし: ジン部長の scripts/check-monkey-engine.mjs + scripts/_monkey-tree-walk.ts (形合わせも辿る、決まりの文は共有メモ local_52fe22f9…/tree-shape-rules.md)。g3 の 66 本でずれ 0。

## 19 本目の報告 (10-24、全部手元 1440 で確かめ)
- ede04679: 回しで結果の箱に着いてすぐ形の合う箱へ移った来訪も記録 (pass、照らしの当たり 0% の元)。台本 scripts/_tree-odds-probe。
- fae89d00・6a7f150e: 猿の口に完成形の設定〜結果。da447a84: 形の合う箱の手が打てない時は着いた箱のまま (始めのルーンの外れで全員止まった)、結果に moved。
- bbc77317 (+ ジン部長 76938343): エッセンスの狙いはエッセンス自身の段で、一般の MOD とは別物 (メモ sim-decisions)。
- ae77b58f: 木の中のフラクチャーは必ず選んだ狙いを固定 (結果の箱は当たりだけ)、固定できる MOD が 2 つ以上なら着くまでの個数・始めの値段・フラクチャーを 2 回分足し作り直しに 2、結果の箱を親へ自動でつながない、テストランでフラクチャーの枝を見ない。棚の 1 行の見た目はスナップで未確認。
- ac201d15: タブは別々の木 (＋ = 新しいツリーをベース選びから、完成形も別、名前はベース名、比べは外す)。前のベースの MOD の id を札に出さない (デザイン部長の気づき、元はタブを替える時の完成形の写し)。


## 前の引き継ぎ・報告は notes/ に写した: 17 → 18 本目の引き継ぎ (10-23 夜) は notes/2026-10-24-todo-archive.md、4〜17 本目の報告と引き継ぎ (10-22〜23) は notes/2026-10-23-todo-archive.md

## 許可が出る操作 (17 本目の洗い出し、10-23 オーナー「シミュの許可が多い」)
- 避ける (今から): Bash の頭の `cd …;` つなぎ (約 15 回) → `git -C`・`pnpm --dir`・`node "<絶対パス>"` に。python のヒアドキュメントでのファイルの書き換え (約 10 回) → Edit / Write に。台本は scratchpad に Write して絶対パスで node。
- 窓なし Chrome も Bash で (10-23 ブラック、1 回試して許可は出なかった): 起動は Bash の run_in_background で `"C:/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=9333 --user-data-dir="<scratchpad の絶対パス>/sim17-cdp-profile" about:blank`、立つのを待つのは台本の中 (scratchpad の waitchrome17.mjs、Bash の sleep を繰り返すとコンソールの窓がちらつく、10-23 オーナー)。止めは起動した裏の仕事を TaskStop で止め (自分の Chrome だけが止まる。ポートや PID で探さない: 別のセッションの Chrome も 9333 で待つ事があり、窓なし Chrome は CDP の Browser.getBrowserCommandLine を返さず見分けられない。PowerShell も使わない)、cleanchrome17.mjs で 9333 が空いたのを見て profile を消す。

## 残り (下の報告から、10-23)
- 残り: 取引所の検索・ベースの値段の比べは印が 2 つ以上だと 1 つ目だけ / 比べない (③ の式は ✦ 1 つ)。
- 残り: 死蔵の一覧の要確認の物 (auto/ は解析君・recipe-sim + recipe-pattern-run はジンの mod-bughunt テストが使う・quiz-samples はテストが使う)。下の「次の段」は合格の後なのでブラックの指示待ち。書きかけ無し、触っている行無し、立てた物無し、開発版と 9333 は返した。

## 台本 (共有メモ local_35782246-d80a-4c3f-9dff-36103418e719/tree-mouse/)
- tree-mouse.mjs (8 条件の操作、10b はホイール = 拡大縮小に直した)・tree-shelf.mjs (棚とお告げ)・tree-recipe.mjs・tree-trial-wide.mjs・tree-sample-check.mjs (見本の木: 戻りの線の終わり・n か所・精査 0・縮めて押す → ポップアップ → 試し打ち・札の編集と Esc)。
- Chrome は PowerShell の `Start-Process chrome.exe -WindowStyle Hidden -PassThru -ArgumentList --headless=new,--remote-debugging-port=9333,--user-data-dir=<scratchpad>/cdp-profile`、使う前にブラックに一言、終わったら PID で止めて profile を消して「返した」。

## 決まり (身にしみた物)
- ヒネコラの髪束はツリーの棚に入れない (今のまま、説明の 1 行も出さない。オーナー 10-23、モンキー 3 回目の見比べ)。
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

## 次の段 (合格の後)
100 人回し (解析君の tree-run.ts を呼ぶワーカー、入口の形 docs/org/math/notes/2026-10-23-tree-run.md)・全部のベースと保存 / 共有・分かれ目の箱 (マナ系の指輪)・英語・古い工程ページを消す・作り直し (restart) を画面で選べるように。
