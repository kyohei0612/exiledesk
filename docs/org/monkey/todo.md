# モンキー隊長 のやる事

## 今 (6 本目、10-25 21:00)
- 指輪の猿 5 匹 (今の UI で、サファイアの指輪、型 = 簡単・道・エッセンス消去・お告げ・分かれ多め) を 2 回 = 10 匹。記録 notes/2026-10-25-monkey-ring.md (不具合 5・迷う所 4)。照らしの台本の戻り先の読みを 0734ed32 で直した。Chrome 9335 は止めて空き。
- 済み (10-25 21:20): 指輪の猿 100 手 × 5 匹 + レシピ。記録 notes/2026-10-25-monkey-ring-100.md (新しい不具合 3: ベースが必ず金の指輪・スタートの窓が閉じない・レシピが戻らない)。残り: 既知の 4 件の再現 (ベースの件が直ってから)。台本 monkey-scripts の free100.mjs・repro-*.mjs・ui-monkey6.mjs の RECIPE2。
- 残り: レシピの「開く」「URL をコピー」(画面がシミュ部長の作業で変わり sim-base の部位が出なくなったので止めた)、台本のエッセンスの段選び。台本は monkey-scripts の ui-monkey6.mjs・jobs-ring5.json。

## 前 (5 本目、10-25 16:00)
- 指示待ち。オーナー「猿回さなくて OK」で、カオススパムオーブの後の 3 ベースの回し直しは無し。1461・Chrome 9335 は止めて使用表は空き。
- 済み: 画面の木 → 照らしの形 (check-monkey-engine の fromScreen・aimOf、walk のカオススパムの先に高貴 1 回)。全ベースは 360 匹で止めた (合格 125/360、棚・お告げ・100 人・箱ともずれ 0、記録は notes/2026-10-25-monkey.md の末尾)。次に回す時は決まり 14 (3 ベース × 3 匹、monkey-scripts の mk-parts.mjs <回の番号> → jobs-3.json、run5.sh・agg5.mjs)。
- 残り (台本): でたらめの猿のエッセンスの段選び (選んだ手がエンジンの棚に無い 30 手)、4 行の MOD の狙いの文を aimOf で引けない (g-0/m-57)、checkTree の当たるまでの個数に高貴の先打ちが入っていない。
- 猿の台本 (monkey-scripts) の直し: ui-monkey.mjs は sim-mods の押せないボタン (冒涜の MOD は 1 つまで など) を押さず goalUi に ok:false・why = title (ui-lib.mjs の find が title も返す)。照らしの台本は窓が「先に完成の MOD でフラクチャーを決めて」の手を印の無い木として比べる。

## 次の隊長へ (4 本目 → 5 本目、10-25 午後。今の画面だけで回す形に作り替え中)
- オーナーの決め (10-25、README 決まり 11〜13): まず 1 ベース → ブラックへ 1 行 → OK で広げる。今の画面だけで組む・読む (猿の口 __simMonkey は答え合わせの boxItem だけ)。木を仕上げ、テストで ✓ 合格した木だけ「100 人回す」で比べ、合格しない木は棚・お告げ・穴の一覧の文だけ照らす (合格の割合も)。猿の半分 (偶数番) は「道の形」(スタートに錬金術・狙い ☑ → 当たりは完成にする、外れにカオスの当たるまで・狙い ☑ → 当たりは完成にする)、半分はでたらめ (ブラック OK)。
- 今の結果 (ハンマー 12 匹、1461・8457bb23 のビルド): 合格 6/12 (道 6/6・でたらめ 0/6)。棚 48 手・お告げ 45 手はエンジンと一致 (e592b8eb で「印の無い木はフラクチャーオーブを出さない」を照らしに入れた後)。合格した 6 本は 100 人の数が画面から取れた (h-4/m-<偶数>.json の ui.boxes・ui.report・ui.after100)。
- やる事 (残り): 合格した木の 100 人の数をエンジンと比べる口。照らしの台本 check-monkey-engine の checkTree・checkWalk は rec.tree.dump (箱・手の鍵・お告げの鍵・aim の modId/tier・repeat・outs・back) と rec.tree.run / result (n・boxes[id].visits・edges["a>b"]・uses・finished) を受ける。画面の猿は rec.tree.screen (箱の文・out・back) と rec.steps (pick の札の名前・omen・checks・newNodes) と rec.ui (boxes[id].treeRunReach「n 人」・report の「使った物 (1 人あたり)」・after100 の「完成 n%」) を書くので、これを dump / run / result の形に組み立てる関数を台本に足す: 手の鍵は engine.pickKey (照らしの手ごとに出している)、お告げの鍵は E.omensOf の key、aim は当たりの箱の文「T10 以上 プレ <文の型>」→ 入口に「文の型 → modId」の引きを足す (_monkey-engine-entry.ts、# を数に置き換えて modListFor の文と合わせる)、repeat は checks の「当たるまで ☑」、線の人数は子の箱の「n 人」(戻りの無い木)。比べの仕方は今の checkTree (4σ) と checkWalk のまま。
- 台本 (共有メモ local_52fe22f9…/monkey-scripts/): ui-monkey.mjs (前の形は ui-monkey-v4〜v4e.mjs に控え)、jobs-hammer12.json、出力 h-4/。走らせ方 `MONKEY_TARGET=dev CDP_PORT=9335 FROM=0 TO=12 node ui-monkey.mjs jobs-hammer12.json h-5 6 6` → `node scripts/check-monkey-engine.mjs <出力>`。Chrome は自分の番号 (9335)・自分の profile で立てる (lib2 の CDP_PORT)。
- 分かった画面の作り: 箱の下の行はボタン (「↩」戻す・「完成」title 完成にする → 押した後 title 完成・[data-tree-spam]「カオススパム」・[data-tree-next] 次の手・[data-tree-add-hit])。箱の文はこれらを除いて読む (NODES)。縮めている間はボタンが描かれないので右下の ＋ で 75% 以上に寄せる。テスト中は「テスト中…」、結果は「100 人回す」の手前の「✓ 合格 / 穴 n」。穴の一覧 [data-tree-issues] は ▾ で開く。100 人は少しずつ増えて出る (「100 人: … 完成 n%」まで待つ)。箱ごとの数は箱の外の層 [data-tree-run-reach][data-box-id]、結果の窓 [data-tree-run-report]。
- 1440 は他の部の保存で読み直しが続くので、回すのは 1461 (使用表で取る)。読み直しの重なり (木が 2 つ) で「このベースには使えないエッセンス」「上の段が金の指輪」が出たのは 1440 の立て直しで消えた (数えない)。
- でたらめの猿のエッセンスの札「全 3 段」は押した後の段の選びに台本が対応しておらず「使っても手にならない」になる (台本側、未対応)。

## 前の隊長へ (4 本目、10-25 朝。全ベースの照らしは済んだ、結果は notes/2026-10-25-monkey.md)
- 済み: 全 764 ベース × 3 匹 = 2,292 匹を 1461 (シミュ 24 の直し 7 本入り) で、画面の操作だけで組んで照らした。棚 13,157 手・お告げ 13,090 手はエンジンとずれ 0 (棚の 84 はジュエルの液化した感情 = 既知の外れ)。完成・個数 157 本ずれ 2 (打ち止めの数え方だけ)。固まり 0。ツリーの数字は 3,360 箱中 247 箱ずれ、止まる 12 本 → どちらもシミュ 25 の最初の仕事 (simulator/todo.md の頭)。
- 台本 (共有メモ local_52fe22f9…/monkey-scripts/): ui-monkey.mjs (1 匹 1 タブ・画面の棚とお告げを照らす・防具の能力の札・帯は [data-tree-pick-start]・部位が開かなければ押し直す)、ui-lib.mjs (半分切れの物は動かしてから押す・画面の外は textContent で探す)、run-all.sh (`sh run-all.sh <始め> <終わり> <頭>`、120 匹ずつ回して照らす、stop-all を置くと区切りで止まる)、agg.mjs (`node agg.mjs <頭>` でずれを手の種類ごと)。出力 e-<始め>/・e-fix/ (各 engine/)、d-*/ は前の版 (数に入れない)。全部で 471MB、要らなくなったら消してよい。
- ジン部長の返事 (共有メモ local_52fe22f9…/jin9-replies-2026-10-25.md): カオスの当たるまではエンジンが正、残りは全部ツリーが多い側。指名の無いフラクチャーはエンジンの 25% が正 → シミュ 25 へ送った。打ち止めの 2 本は照らしの台本の直し (1fd9f27f) で一致。
- 残り: ベース「指輪」(部位と同じ名前) の 3 匹は台本で押せず未確認。シミュ 25 が直したら、回の区切りで 1461 を作り直して e と同じ台本で回し直す (`sh run-all.sh 0 2292 f`)。
- Chrome 9333・1461 は止めて profile を消し、使用表を空きにした。

## 前の隊長 (3 本目 → 4 本目、10-25 未明。全文は共有メモ local_52fe22f9…/monkey3-handover.md)
- 仕事: 照らしの本番 = 全 764 ベース × 猿 3 匹 (jobs-all.json) がツリーを自由に組み、エンジンと照らす (ブラック 10 代目)。オーナー 10-25「シミュレーターの動きそのまま」= 猿は画面の操作だけで組む (sim-base → sim-mods → ツリー)。猿の口 window.__simMonkey は読むだけ (棚・お告げ・boxItem・dump・check・run・result)、setBase・setGoal・add などの近道は使わない。分かれは「100 人の確率がエンジンの幅に入るか」で見る (オーナー OK)。エッセンス・冒涜・お告げ・カオス・高貴・フラクチャーの 2 択・当たりの箱にする MOD のチェックを混ぜる。
- 台本: 共有メモ monkey-scripts/ui-monkey.mjs (画面で組む猿) + ui-lib.mjs (押す道具: 位置が止まるまで待つ・画面の外なら動かす・pressUntil で押し直す)。`FROM=a TO=b RUN=100 RESULT=100 node ui-monkey.mjs jobs-all.json <出力> <並列> <手の数>`、TRACE=1 で進み、SHOT=1 で撮る。出力は check-monkey-engine.mjs の形。free-monkey.mjs は口で組む形 (使わない)。
- 分かった画面の動き: sim-base は読み込み後に 24px ずれる・部位の直後のベースのカードは 1 回目が効かない事が多い (押し直し)。sim-mods は行の文を押すと段の一覧と「狙いにする」「フラクチャー」、フラクチャーがあると「決めた」で 2 択の窓。ツリーは縮めると ＋ が消え、箱を押すと大きな箱と ＋・「↩ 戻る」が出る。一番下の ＋ が枠の外に出たら枠を引っ張る。窓: 左にアイテムのカード (押すと使う)・当たりの箱にする MOD・狙い無し・カオスは「どれでも」「当たるまで繰り返す」、右に棚と持った物のお告げ。エッセンスの札は押すと段 (レッサー・ふつう・グレーター) の選び。
- 見つけた物: [ツリー・固まる] 外れの箱に 2 つ目のカオススパム (どれでも・当たるまで) を足すとページが固まる (3 回中 3 回。「4 手目の後 18 秒止まる」も同じ 1 件)。再現の手順はシミュ部長 24 本目へ送った (FROM=301 TO=302 の猿)。台本は返事 5 秒超えで frozen として止めタブを作り直す。直るまでは固まる形を避けて回して良い (ブラック)。
- まだ: 完成の印の付け方 (当たりの葉の窓に「完成」が無い)・戻り先 (「↩ 既にある箱へ戻す」→ スタートを押しても back が付かない)・テスト / 100 人の結果の読み取り・全ベースの本番・照らし。
- 場所: 1440 は他の部長の保存で読み直しが入り木が消える (台本は 2 回までやり直す)。本番は手元の開発版 (preview:prod -- --dev、1461) をブラックが貸す、最終チェック長が使い終わって「返した」が来てから。窓なし Chrome 9333 は止めて profile を消し、使用表を空きにした。

## 前の隊長 (2 本目、10-24 夜)
- 台本の置き場: C:/Users/kyohei/AppData/Roaming/Claude/side-session-notes/local_52fe22f9-cf1b-45a0-a390-c0d305e6b60a/monkey-scripts/ (lib2 の DIR はここ、出力もここに出る)。lib2.mjs (CDP・タブ・止める通信)、api-monkey.mjs (棚・お告げ・確率)、goal-monkey.mjs (完成の MOD つき)、goal-list.mjs (完成の MOD の一覧 md)、drive.mjs + watch.mjs (初めての人の回: 本物の入力で 1 タブ、見張りが外の通信を止めてエラーを watch.log に)、hover-shot.mjs (押した直後の浮き窓を撮る)、jobs-all.json (764 ベース × 3)・jobs-p.json (代表 22 × 3)。
- Chrome: 使用表に書いてから自分で窓なしで立てる `chrome.exe --headless=new --remote-debugging-port=9333 --user-data-dir=<scratchpad>/chrome-prof --host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"`。止めるのは CDP の Browser.close → profile とスクショを消す → 使用表を「空き」に (commit)。
- 止める通信: 名前解決で localhost 以外を潰し、さらに lib2 の tab() / watch.mjs が CDP の Fetch で localhost 以外を止めて数える。1 回でも外へ出たら止めてブラックへ。絵 (poecdn)・フォント・広告・boot.json が出ないのは止めたため (不具合に数えない)。
- 回し方: 棚・お告げ = `node api-monkey.mjs jobs-all.json <出力> 20 12` (5 分)。確率 = `RUN=100 node api-monkey.mjs jobs-p.json <出力> 16 12`。完成・個数 = `ESS=1 node goal-monkey.mjs jobs-p.json <出力> 16 8` (2 分、ESS=1 でエッセンスの行も入れる、10-24 夜に数え方が直った)。goal-monkey の出力は照らしの前に steps へ card・mods を足す (記録の 7 回目)。
- 照らし: リポジトリの根で `node scripts/check-monkey-engine.mjs <出力>` (ジン部長、<出力>/engine/)。正はエンジン。形の合う箱へ移した木と打ち止めの木は台本が比べない。
- 猿の口 = 手元 1440 の ?page=sim-tree の window.__simMonkey (使い方は src/views/simulator/tree/sim-monkey.ts の頭の注釈だけ読む)。dev サーバーが読み直すと一時消える (Cannot read properties of undefined) → 回し直す。
- 気を付ける: 用語は推測で訳さない (MOD の種類・ルーン・お告げは英語のキーのまま)。浮き窓など見た目の確かめは文字で探さず撮って目で見る (見本で拾えるか先に確かめる)。他のセッションへの送りは要る物だけ。猿は 10 分以内。
- 今の残り: 無し (7 回目 エッセンスありは比べた 48 本ずれ 0、初めての人の回 13 件はシミュ部長が直した、浮き窓は 38177e55 で直った)。記録は docs/org/simulator/notes/2026-10-24-monkey.md と -monkey-goals.md。

指示待ち。仕事はブラックから来る (docs/org/monkey/README.md の決まり 10)。宛先は dev/todo.md の表。

## やる事
- 無し

## 先の予定
- 照らし合わせ係: シミュが出来上がったら、ベースごとに猿 3 匹でツリーを組ませ、エミュの画面と照らす (README の頭・決まり 7、オーナー 10-23)。
