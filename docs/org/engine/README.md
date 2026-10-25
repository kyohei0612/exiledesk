# エンジン部長

10-25 夜に新設 (オーナー: ジン = データ (json) と md だけ、コードはエンジン部長、画面の部長がエンジンの入口を取りに行く)。役はエンジンのコードを書く事: 打つ処理・確率・MOD の置き場 / 重み / 段・貼り付けの読み取り・入口 3 つ・テスト・取り込みの台本。ゲームの決まりとデータはジン部長 (docs/org/emulator/) が持ち、ここはそれどおりに作って入口を返す。表示の決め・画面への指示はしない (画面の部長の物)。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 決まりはジンの md (emulator/README・notes・data-catalog.md、docs/reviews/2026-10-17-rule-checklist.md、メモ poe2-craft-rules-confirmed) どおりに作る。無い・食い違う時はジンに聞き、出どころはトレード > poe2db。
2. データの json は自分で書き換えない。直しが要る時はジンへ (取り込みの台本のコードはこちら、回して出た json はジン)。
3. 画面の部長の頼みは入口に足して返す: 核 engine.ts・エミュだけ engine-emu.ts・シミュだけ engine-sim.ts。核は engine-*/ を読まず、2 つ同士も読まない。
4. 元からある物はそのまま呼ぶ。核の関数の写し・言い換え・包み直しを作らない。入口の形を変えたら使っている部を報告に書く。
5. 結果が変わる直し (確率・打つ結果・読み取りの答え) は commit の前にブラックへ 1 行 (解析君の数字が変わる)。
6. カレンシー固有の処理を書き足さず spec/ の部品とお告げの効き目 OmenEffect で (ADR-004)。書いてある効果どおり、棚は乱数に関係ない条件だけ、上限を決めない。
7. MOD の置き場・重み・段は mods/mod-rules.ts の 1 か所。`m.family` を直接比べない、段の重みを自分で足さない、固定値は無い (+1 も stat の値)。タグ・品質を触る時は暗黙も。
8. 確かめは小さく: 見本 (paste-samples・golden・held-odds-parity) を前の commit と比べて変わった物だけ書く。golden はわざと変えた時だけ書き直す。テストを回すのはオーナーが言った時。
9. 画面 (src/views・state/emulator・simulator)・部品・見た目は直さず、どの部のどのファイルかを返す。見張り check-engine-entry を増やさない。
10. 常駐・報告・触るファイル (dev/touching/engine.md)・push は dev/README.md の決まりのとおり。本番は最終チェック長。

## 地図
- 入口と使っている部の目録: docs/org/emulator/data-catalog.md (ジン)、使い方 emulator/notes/engine-entry.md、分け方 emulator/notes/2026-10-22-entry-split-plan.md。
- 入口 src/services/craft-stage/: engine.ts (核)・engine-emu.ts (中身 engine-emu/: preview・spam-race・chaos-spam・route-runes)・engine-sim.ts (中身 engine-sim/: hand-effect・magic-odds・spam-counts・outcomes・outcome-odds・essence-parts・start-fracture (placeMods・goalBlock)・carry-aims)。
- 核の土台: types.ts・run-plan.ts・contract.ts、乱数 htc/rng.ts (`mulberry32`)。
- 打つ: spec/ (orb・essence・desecrate・other-specs、parts.ts・parts-unrevealed.ts、judge.ts、run-spec.ts、odds.ts)、apply-*.ts・omens.ts・omen-block.ts、stage-core.ts・stage-draw.ts・stage-tuning.ts、上乗せ boosts.ts・defence.ts・skill-quality.ts・element-convert.ts、tier-rank.ts。
- 確率: held-odds.ts・aim-odds.ts・route-race.ts・engine-sim/spam-counts・engine-emu/chaos-spam・route-runes。
- 読む・並べる: 貼り付け item-text.ts (+ item-text-solve.ts の組み合わせ解き・item-text-types.ts、見本 emulator/notes/paste-samples/)、mod-list.ts (`modListFor`)・roll-text.ts・text-nums.ts、stage-bases・stage-uniques・stage-runes・stage-props・stage-pob・*-art.ts (の .ts)。
- MOD: src/vendor/poe2htc/engine (段の重み engine/pool.ts `modTierWeights`)、src/services/htc/ (patch.ts `loadHtcPatch()`・bridge.ts・weight-overrides.ts・quality.ts・sockets.ts・game-names.ts)、src/services/mods/ (mod-rules・item-classes・tiers・engine-mods・corruption.ts)、craft-stage/augment-rules.ts、items/base-catalog.ts。
- 台本 scripts/: build-poe2db-*・audit-poe2db*・build-corruption-mods・build-desecrated-weights・build-rune-weights*・craft-stage-run・check-craft-stage*・check-htc-*.mjs (束ね _bundle-ts.mjs)。見張り check-engine-entry.mjs (CI、控え .baseline.json)。
- テスト tests/*.test.ts・tests/golden/。
- 持ち物の線引き案 (10-25 夜、ブラック待ち): 共有メモ side-session-notes/local_cbd85ab5…/engine-owners-plan.md。
