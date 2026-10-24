# シミュ部長 のやる事

前の引き継ぎ (1〜3 本目、10-21〜23) と止めている物 (①〜⑥・自動・④ の物・OK 待ちの一覧) は notes/2026-10-22-todo-archive.md にそのまま移した。

## 次の部長へ (20 本目 → 21 本目、10-24 夜。ブラック 10 代目の頼みで入れ替え)
- 宛先: ブラック 10 代目 local_b4352604-0717-4065-92a4-7f1ac6ebcc83 (9 代目は止まった)。ほかは docs/org/dev/todo.md の表 (ジン部長は 9 本目に替わっている)。
- 20 本目に済んだ物 (詳しくは notes/2026-10-24-absent-amulet.md の末尾):
  - 不在のアミュ B を動画どおりに (888538a6、光なし・冒涜の外れは右側の結晶化 + 無限のエッセンス・50/50 の負けは最初のカオスへ)。画面の 100 人で B 96.2 神 / A 464.6 (同じ相場)。古代の鎖骨なら A 393・B 328 (c5062ae4)。満杯の骨は前の冒涜と置き換わらない (オーナー、B 96.2 で確定)
  - 外れを消すだけのエッセンスの道 (d85e880b): エッセンスの結果は「狙いが消えた / 当たりの道」の 2 つ、完成形の設定にない札は狙いに数えない、完成の形の精査は分かれ目の行の狙いも数える。ローブの見本の完成形にライフ% を足した
  - 精査: 手も行き先も無い箱に「回すと n 人がここで止まる」を重ねない (640243be、初めての人の回の 5「30 人中 27 人」)
  - レシピのページの上に「見本のレシピ」(e6127a62、TreeShowcase.vue、今は absent-b の 1 枚)。足すのは SHOWCASES に 1 つ
  - 反響で何度も選び直す技は取りやめ (オーナー「シミュは選ぶとかない」)。骨は候補に狙いがあれば当たり + 反響で 1 回引き直し (revealBy)
- 残り:
  - (21 本目、10-24 夜) 初めての人の回で済んだ物: 1 (9347b06f)・3 (ed461745 + a17d23c1 スマホの余白、木の枠 281 → 317px・枠は 510px から、外れ 3 のはみ出しは撮って無かった)・4 (de6c01e3)・5 (8bce3000)・8 (f3057772)・9 の一部 (e5dc59c2)・2 (デザイン部長 193d0440 で直っていた。21 本目が兜・火耐性 T2 フラクチャーのスタートの棚でヒステリーに本物のマウスを乗せ、説明に「使えない」が無くエンジンの shelf も ok で揃うのを見た、台本 hyst.mjs)。残りは 6・7。スマホを撮る台本は 21 本目の scratchpad の phone.mjs (C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/29e4dcf2-ed9c-4a90-a68e-be8adbf99a33/scratchpad/phone.mjs <出す所> [見本] [幅]、EN=1 で英語、Chrome は 9361)
  - 初めての人の回 (notes/2026-10-24-monkey.md の末尾) の 2・3・4・6〜13。2 ヒステリーのエッセンスの説明が「このベースには使えない」なのに兜の行に MOD / 3 スマホ (「＋ 新しいツリー」が切れる・スタートの「外れ 3」がはみ出す・枠が細い・上のボタンが 6 段) / 4 段を選ぶとアイテムレベルが黙って変わる / 6 スタートに無い狙いでも「狙いが消えた」の箱 / 7〜13 は記録
  - 手のある当たりの箱に着いた人が settle (tree-run.ts) で深い外れの箱へ移されて止まる件。見本では分かれ目を挟んで避けているだけ
  - 反響の代金は引き直さなかった回も毎回入る (B で 1 個あたり約 3.8 神)。決まりを聞くならオーナーへ
  - 「ルーンの合金 / Runic Alloy」はデータが正しい (ジン 9 本目: エッセンスではなく遠征の合金、craftedKindOf が "alloy")。見本の文の直しは 21 本目が済ませた (b242d90f、tree-samples.ts 32 行のコメントだけ。TreeShowcase.vue は鍵から名前を引くので元から合金)
- 確かめの道具 (scratchpad 0a2e8462-3a13-487a-a578-b9fabf523334 の絶対パス C:/Users/kyohei/AppData/Local/Temp/claude/C--Users-kyohei-ExileDesk/0a2e8462-3a13-487a-a578-b9fabf523334/scratchpad/): absent-m.mjs <式> (URL= で見本、猿の口 m で回す。窓なし Chrome は port 9361 を Bash の run_in_background で立て、TaskStop と profile 削除)・ab-res.js (100 人の数字と相場)・ab-ancient.js (冒涜の骨を古代に替える)・showcase.mjs (レシピのページを PC・スマホ・英語で撮る)・_tmp-absent-b.test.ts.bak (B を組んだ台本)。**ページを移った直後 0.5 秒のクリックは page.ts の見張りで捨てられる**ので、台本で押す時は 1 秒以上空ける
- 猿の口 (sim-monkey.ts)・照らし (ジン部長の scripts/check-monkey-engine.mjs) は 19 本目の引き継ぎのまま (notes/2026-10-24-todo-archive.md の末尾)

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
