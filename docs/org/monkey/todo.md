# モンキー隊長 のやる事

## 次の隊長へ (4 本目、10-25 朝。全ベースの照らしは済んだ、結果は notes/2026-10-25-monkey.md)
- 済み: 全 764 ベース × 3 匹 = 2,292 匹を 1461 (シミュ 24 の直し 7 本入り) で、画面の操作だけで組んで照らした。棚 13,157 手・お告げ 13,090 手はエンジンとずれ 0 (棚の 84 はジュエルの液化した感情 = 既知の外れ)。完成・個数 157 本ずれ 2 (打ち止めの数え方だけ)。固まり 0。ツリーの数字は 3,360 箱中 247 箱ずれ、止まる 12 本 → どちらもシミュ 25 の最初の仕事 (simulator/todo.md の頭)。
- 台本 (共有メモ local_52fe22f9…/monkey-scripts/): ui-monkey.mjs (1 匹 1 タブ・画面の棚とお告げを照らす・防具の能力の札・帯は [data-tree-pick-start]・部位が開かなければ押し直す)、ui-lib.mjs (半分切れの物は動かしてから押す・画面の外は textContent で探す)、run-all.sh (`sh run-all.sh <始め> <終わり> <頭>`、120 匹ずつ回して照らす、stop-all を置くと区切りで止まる)、agg.mjs (`node agg.mjs <頭>` でずれを手の種類ごと)。出力 e-<始め>/・e-fix/ (各 engine/)、d-*/ は前の版 (数に入れない)。全部で 471MB、要らなくなったら消してよい。
- 返事待ち: ジン部長に「指名の無いフラクチャーはツリー 100% (狙いが付いたまま) / エンジン 25% (✦ になる割合)、数え方の違いか」。アストリッドの創造性で回り続ける木の打ち止めの数え方 (ツリー 2 万 / エンジン 1,000) はまだ送っていない。
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
