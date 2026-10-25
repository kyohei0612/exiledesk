# エンジン部長 のやる事

1 本目 (10-25 夜、local_18bb97b5)。ジン部長 (emulator/todo.md) から引き継いだコードの仕事もここ。

## やる事
- 持ち物の線引き (ブラック待ち): 案は共有メモ engine-owners-plan.md。owners.txt の書き換えと check-engine-entry.mjs の部の名前 (「ジン」→「エンジン」) は同じ commit で入れる (片方だけだと見張り A・C が 0 件に見えて素通りになる)。
- 貼り付けで値が少し変わる (見本 t7、スピリット 34% → 36%): 読み側は正しい。parseItemText は t7 で `Sceptres/LocalIncreasedSpiritPercent` の values [34] を返す (使い捨ての台本 scratchpad/t7.mjs で確かめた)。36 は完成形のカードを placeMods(…, MID_ROLL) で組むので段の中央になる所。シミュ 29 が画面側で Aim.values を持って上書きする直しを書いている (tree-model・tree-paste・use-tree)。入口の placeMods に値の指定を足すかは、シミュ部長から頼みが来たら。
- ルーンと絆のコード側: ジン 10 本目が 8009423e で入れた (頭から続くルーンの行を、文・値の和・後ろに同じ文の行で見分ける)。残る穴: 同じ能力値の明示が無く絆も無いルーンの行だけの形は明示に混ざりうる (見本が来たら)。
- 貼り付けの残り (ジンから): 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本待ち)。ジュエルの枠 2/2 はエンジンの値で poe2db では未確認。冒涜専用が貼り付けで段 0 かの見本待ち。タリスマンの物理の段 (トレード P6 / エンジン T5、未決、決めはジン)。
- MOD の重みを直せる の中身 (stage-tuning.ts の modWeights・defaultWeightOf・OVERRIDDEN) はエンジン、画面 StageWeightEdit はエミュ部長。
- テストの落ち 5 本はオーナーが言うまで触らない。一時の worktree に node_modules をつながない。

## 済んだ物
- docs/org/engine/README.md・todo.md を作った (10-25 夜)。
