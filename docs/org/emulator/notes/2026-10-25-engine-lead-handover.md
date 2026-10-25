# エンジン部長 1 本目 → ジン部長 (2026-10-25 夜、エンジン部長は今日で閉じた)

オーナー 10-25 夜の決め (「おｋ１」): エンジンの持ち主はジン 1 人に戻す、画面はエンジンの関数を直接呼んでよい (入口の用意は要らない)。エンジン部長 (local_18bb97b5) は 10-25 夜に作って同じ夜に閉じた。docs/org/engine/ の README・todo はここに 1 本にまとめて消した。

## やった事 (commit)
- 85033d67: engine-sim.ts に `retext` (stage-core.ts、MOD の値を替えた時の textJa / textEn) を出した。シミュ 29 の頼み (完成形のカードに貼り付けの素の値を出す)。名前を出すだけで結果は変わらない。
- 58b0e29c・4132c283: docs/org/engine/ を作った (このファイルで消した)。

## 確かめた事
- 貼り付けで値が少し変わる件 (見本 t7、スピリット 34% → 36%): 読み側は正しい。parseItemText は t7 で `Sceptres/LocalIncreasedSpiritPercent` の values [34] を返す (使い捨ての台本: loadHtcPatch + parseItemText を _bundle-ts.mjs で束ねて paste-samples を読む)。36 は完成形のカードを placeMods(…, MID_ROLL) で組むので段の真ん中になる所。シミュ 29 が画面側で Aim.values を持って上書きする直し (tree-model・tree-paste・use-tree) と retext で直し中。盛られた MOD (品質・反対側の効果) は values が素の値で貼った値は shownValues、どちらを出すかは画面の決め。

## 見つけた残り
1. **tree-paste.ts の見張り**: HEAD (fd359480 から) で check-engine-entry の A が 0 → 1。src/views/simulator/tree/tree-paste.ts:13 が item-text-types を直に読む (同じ型は engine.ts 96 行から出ている)。シミュ 29 に直し方を返した。画面が直接呼んでよい形に変えるなら、見張りの A の決まりと控え (check-engine-entry.baseline.json) を合わせて替える時にこれも消える。
2. **線引き案で気付いた事** (共有メモ side-session-notes/local_cbd85ab5…/engine-owners-plan.md にも):
   - check-engine-entry.mjs は owners.txt の部の名前「ジン」を直に見ている (62 行 `who === "ジン"`・86 行 `tw === "ジン"`・110 行の文)。owners.txt の部の名前を替える時は台本と 1 つの commit で (片方だけだと A・C が 0 件に見えて素通りになる)。
   - 「共通」(`**` の受け皿) は持ち主ジンだが、中身の多くはコード (state/craft-stage.ts・share.ts・trade-search.ts・money.ts・htc/paste*.ts・buy-or-craft.ts・prices.ts・patch-types.ts・trade2 の共通の物・api/)。scripts/ の check-htc-*・_htc-*・_bundle-ts・check-engine-entry・build-htc-bases-from-client・build-gem-hover-ja・_gem-csd・build-trade2-*・build-tradeable-bases・build-rune-weights-coe も owners.txt に行が無く「共通」に落ちている。
   - owner-of の glob は `**/*.json` が使えるので、データとコードを拡張子で分けたくなったら行を足すだけで済む。
3. ジン 10 本目の引き継ぎ (2026-10-25-jin10-to-engine-lead.md) の残りはそのまま: item-text.ts は 497 行で 500 の手前 (次に足す時は splitImplicits を別ファイルへ)・ルーンの行の見分けの穴 (同じ能力値の明示も絆も無いルーンの行だけの形、見本待ち)・t4 の「パペットマスターの最大スタック数 +6」が段に収まらない印 (未調査)・普通 ⇄ エッセンスの出どころだけ違う読みは候補にしていない (未決)。
4. emulator/todo.md から写した残り (元の所に残っている): 日本語の Ctrl+Alt+C の見出し・日本語の注記の形 (見本待ち)、ジュエルの枠 2/2 は poe2db で未確認、冒涜専用が貼り付けで段 0 か (見本待ち)、タリスマンの物理の段 (未決)、テストの落ち 5 本はオーナーが言うまで触らない。

## 片付け
- docs/org/engine/ と docs/org/dev/touching/engine.md を消した。dev/todo.md の宛先の行 (エンジン部長) と docs/org/README の図はブラックの持ち物なので触っていない。owners.txt・check-engine-entry も触っていない。立てた物 (サーバー・Chrome) は無し。
