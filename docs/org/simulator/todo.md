# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 20 本目の最初の仕事 (10-24 夜、オーナー「A は高い、B を完成させんとな」、ブラック経由)
**済み (20 本目、結果 notes/2026-10-24-absent-amulet.md の末尾)**: B = 96.2 神 / 1 個 (A 464.6、同じ相場)。1・2・2b・3 は字幕を読んでオーナーの形で組んだ (3 の技の中身は字幕に無い、今の手で組めた)。4 は前と同じく分かれ目で避けた。stepOutcomes はジン部長 e63f9898 で直った (木は同じ)。満杯の骨は前の冒涜と置き換わらない (オーナー、B 96.2 神で確定)。古代の鎖骨の比べも済み (A 393・B 328 神)。 中身と 19 本目の報告は notes/2026-10-24-todo-archive.md の末尾へ移した。

## 次の部長へ (19 本目 → 20 本目、10-24 夜。会話が長くなったので入れ替え)
- 宛先: ブラック 9 代目 local_52fe22f9-cf1b-45a0-a390-c0d305e6b60a・ジン部長 8 本目 local_a2541814-3a1c-459d-84c0-49be1c773e9f・モンキー隊長 2 本目 local_d69c31e1-a485-4ccc-9816-ec3bf67105fe (表は docs/org/dev/todo.md)。
- 夜にオーナーが dev 1440 のツリーを触る (ブラック「土台固め」)。隊長の「初めての人の回」(notes/2026-10-24-monkey.md の末尾、80606fc6) の 13 件。1 は済み (notes/2026-10-24-todo-archive.md の末尾)、残り:
  2. ヒステリーのエッセンスの説明が「このベースには使えない」なのに兜の行に MOD (説明の持ち主を確かめる。共通の部品ならデザイン部長)。
  3. スマホ: 「＋ 新しいツリー」が切れる・スタートの箱の「外れ 3」がはみ出す・枠が細い・上のボタンが 6 段。
  4〜13: 段を選ぶとアイテムレベルが黙って変わる (適正)・「穴」「!」の意味・何もしないスタートの「30 人中 27 人」・スタートに無い狙いでも「狙いが消えた」の箱・ベース選びに戻るとタブが見えない・設定「レア」とスタート「白」・タブを替えると「1 つ戻す」が灰色・段の出やすさが全部同じ・当たるまでのチェックが付かなかった (1 回)・兜を押した後ページが動く・説明の浮き窓が残る。詳しくは記録。
- 確かめの道具 (scratchpad の台本、絶対パス): C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/f45d08d4-e179-4920-b6f1-52076e45bc83/scratchpad/monkey-goal.mjs <式のファイル> (窓なし Chrome を port 9351 で Bash の run_in_background で立て、localStorage を空にして 1440 のツリーで猿の口 m を使う式を回す。goal4.js が 1 の再現)。終わったら TaskStop と profile 削除。
- 猿の口 (sim-monkey.ts) に足した物: goalCandidates・setGoal (フラクチャーの印も)・setAim・setBack (箱か start)・setDone・check (テストラン)・result (画面と同じ値段の 100 人、moved・unexpected・prices・capDiv・capSteps つき)。
- 10-24 夜に足した物: 初めての人の回の 1・2・3・5・8・9 とオーナー OK の 3 つ (適正の一言・付けられない組を押せない goalBlock・付かない狙いを灰色) は済み (9347b06f〜efb35963)、「30 人中 27 人」の文も済み (20 本目: 27 人は外れに狙いを付けない直しで 30 人に、手の無い箱では回しの止まりを重ねて出さない)。動画の不在のアミュ A・B の見本 (?sample=absent-a / absent-b、結果 notes/2026-10-24-absent-amulet.md) の気づき: 反響で選び直す技は取りやめ (オーナー「シミュは選ぶとかない」、骨は候補に狙いがあれば当たり + 反響で 1 回引き直し)・手のある当たりの箱が形合わせで深い外れの箱へ移されて止まる (分かれ目で逃げた)。
- 照らし: ジン部長の scripts/check-monkey-engine.mjs + scripts/_monkey-tree-walk.ts (形合わせも辿る、決まりの文は共有メモ local_52fe22f9…/tree-shape-rules.md)。g3 の 66 本でずれ 0。

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
- ヒネコラの髪束はツリーの棚に入れない (今のまま、説明の 1 行も出さない。オーナー 10-23、モンキー 3 回目の見比べ)。
- 自分で数える台本は「押して当たるか (elementFromPoint)」まで見る。Tailwind は v4 (コンテナは @min-[N]:、ページの zoom の分 CSS の幅は狭い)。localStorage を空にする時は .bak も。
- Bash の `\` は消える (正規表現は Write / Edit で)。ブラックは入れ替わる: 宛先は dev/todo.md の頭で確かめる。

## 次の段 (合格の後)
100 人回し (解析君の tree-run.ts を呼ぶワーカー、入口の形 docs/org/math/notes/2026-10-23-tree-run.md)・全部のベースと保存 / 共有・分かれ目の箱 (マナ系の指輪)・英語・古い工程ページを消す・作り直し (restart) を画面で選べるように。
