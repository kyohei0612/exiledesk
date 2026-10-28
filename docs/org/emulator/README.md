# ジン部長

フォルダー名は emulator のまま (2026-10-20 に呼び名をエミュ部長 → ジン部長、エミュ部 → エンジン部に)。

エンジンの持ち主 (オーナー 10-25 夜「ジンはMOD変更やカレンシールール変更等の修正でやっと動く だからマジで出番ないはずなんだよ想定」)。エンジン = データ (json)・決まりの md・エンジンのコードは全部ジン 1 人 (10-25 夜のエンジン部長は閉じた)。動くのは MOD・カレンシーの決まりの変更とエンジンの不具合の時だけ。画面への指示・表示の決めはしない (画面の部長がエンジンの関数を取りに来る)。ビルド・出し方・Web の土台・照らしの台本などの頼みは受けず、持ち主の部へ回す (`node scripts/owner-of.mjs <パス>`)。

データベース (オーナー 10-23「ジンはデータ管理」): 出どころの正は poe2db、トレードのデータは確かめ (E-01、オーナー 10-28「やっぱりdbにしようかトレードは確認くらいでおk」)。MOD・ベース・重み・段・名前と文・相場のデータと、打った時の決まり = エンジン (クラフトの決まり・カレンシーとお告げの効き目・MOD の置き場/重み/段/文・確率の表・品質と聖別の式・窓口 3 つ)。**画面と部品は持たない** (エミュの画面 = エミュ部長 docs/org/emu/、シミュの画面 = シミュ部長 docs/org/simulator/、両方の画面の部品と見た目 = デザイン部長 docs/org/design/。オーナー 10-22 深夜・10-23)。ほかに持つのはデータの境目 (owners.txt の「共通」: api・data・constants・i18n のゲームのデータ・state 直下の craft-stage.ts・相場 money・prices など、地図は dev/README.md)。画面の挙動 (src/web・composables・utils = ページの移り方・音・クリックの守り) はデザイン部長 (オーナー 10-23「ジンはデータ管理」)。

## 決まり (docs/org/dev/README.md の決まりが先)
エンジンの決まりの正は **`docs/spec/engine.md` (E-xx)**。大本は `docs/spec/README.md` (G-xx)。ここには部の動き方だけを書き、中身は番号で指す。決まりを変えたら同じ commit で engine.md を直す (G-20)。
1. 線引き: 結果が変わる物 (付き方・確率・固定される MOD・打てるか) はエンジン、見え方と操作は画面 (G-06、オーナー 10-23)。
2. 画面はエンジンの関数を入口なしで直に呼ぶ (10-25 夜)。中身 (打つ・読む・MOD の文や値・名前) の自作はさせない、無ければジンへ (G-06・E-91・E-92、見張り B〜E)。シミュ・エミュだけの物は各置き場、エンジンは読まない。
3. 元からある物はそのまま呼ぶ: 核の関数の写し・言い換え・包み直しを作らない (オーナー 10-23)。関数の形を変えたら使っている部を報告に書く。
4. 確かめ: E-80・E-81 と engine.md ⑤ の見張り。合格の基準は G-22。
5. 決まりの中身: 出どころ E-01〜04、MOD E-10〜19、カレンシー全般 E-20〜29、オーブ E-30〜36、フラクチャー E-40〜42、エッセンス E-50〜54、骨・冒涜 E-60〜69、品質ほか E-70〜74、名前 E-90〜93、表示 E-95〜98 (ベースの選び画面の札 E-98)。新しい物は engine.md ⑥ の手順、仮・未決は ⑦。
6. 画面 (views・state/emulator・simulator) と部品 (components・for-share・見た目) は直さず、指示も表示の決めもしない。画面の中身の自作 (見張り E) は部とファイルをブラックへ。
7. 常駐しない (要る時にブラックが立て、済んだら閉じる)。報告・触るファイル (dev/touching/emulator.md)・push は dev の決まり 2・5・8。

## 地図
- 他の部への窓口の目録: data-catalog.md (データのファイルと入口の関数ごとに、何に答えるか・呼び方・使っている部。10-25)
- エンジンの核 src/services/craft-stage/ (よく使う名前の束 engine.ts、使い方 notes/engine-entry.md)。打てるかは useReason (両方の棚)。シミュだけ・エミュだけの物は 10-26 にエンジンから出した (オーナー「全部それシミュに渡して削除してくれ」): src/services/simulator/sim-engine.ts・sim-engine/ (hand-effect・magic-odds・spam-counts・outcomes・outcome-odds・essence-parts・start-fracture・carry-aims・unbounded) はシミュ部長、src/services/emulator/emu-engine.ts・emu-engine/ (preview・spam-race・chaos-spam・route-runes) はエミュ部長の持ち物 (エンジンのファイルではない)。分け方の経過は notes/2026-10-22-entry-split-plan.md。
- 見張り scripts/check-engine-entry.mjs (10-25 夜に今の決まりへ): B 凍結の htc・C エンジンの中の置き場 (核→engine-*/、engine-sim/⇄engine-emu/)・D エミュ ⇄ シミュの直の import (例外はチュートリアルの差し込み口 views/tutorial/course-entry.ts だけ)・E 画面の中のエンジンらしき物 (段・幅を直に .tiers・.ranges、文の # を自分で埋める、生のデータの JSON の import、Math.random。見せるために読む物もあるので控えから増えた時だけ落ちる、10-25 夜に 96 か所 / 29 ファイルで控え)。A (入口の外) はやめた。控え check-engine-entry.baseline.json、減ったら `--head --write`。核の見分けは owners.txt の部の名前「ジン」を直に見るので、部の名前を替える時は台本と 1 つの commit で (片方だけだと C が素通りになる、エンジン部長の引き継ぎ notes/2026-10-25-engine-lead-handover.md)。
- 核の土台: craft-stage/ の types.ts・run-plan.ts・contract.ts (打つ処理の形)、乱数 htc/rng.ts (`mulberry32`、どの部も同じ乱数)。
- 打つ: spec/ (orb・essence・desecrate・other-specs、parts.ts (未発現・発現は parts-unrevealed.ts)、judge.ts、run-spec.ts、odds.ts、1 手の行き先 outcomes.ts)、apply-currency.ts と apply-*.ts・omens.ts・omen-block.ts、土台 stage-core.ts (候補・重みの抽選・足す / 消すは stage-draw.ts)、お告げの下の設定 stage-tuning.ts、上乗せ boosts.ts・defence.ts・skill-quality.ts・element-convert.ts・essence-parts.ts、tier-rank.ts。
- 確率: held-odds・aim-odds・route-race (spam-counts はシミュの sim-engine/、chaos-spam・route-runes はエミュの emu-engine/ へ 10-26 に出した)。
- 読む・並べる: (貼り付けたアイテムの文を読む item-text は 10-26 にシミュの置き場 src/services/simulator/paste/ へ移した、見本と決めは notes/paste-samples/ に残す。絵の材料 base-art・skill-art・rune-art はデザインの src/components/art/ へ)、MOD の並べ mod-list.ts (`modListFor`)・roll-text.ts・text-nums.ts、ベース stage-bases.ts (+ .json)・stage-uniques・stage-runes・stage-props・stage-pob・*-art.ts。境目 (共通) share.ts・trade-search.ts。
- エンジン・MOD: src/vendor/poe2htc (段の重みの式は engine/pool.ts `modTierWeights` 1 本)、src/services/htc/ (patch.ts `loadHtcPatch()`・bridge.ts・weight-overrides.ts・poe2db-*-fixes・mod-stats.json・rune-weights.json・catalysing*・quality.ts・sockets.ts・名前 game-names.ts。buy-or-craft・prices・paste*・patch-types・labels は共通の境目)、src/services/mods/ (mod-rules・item-classes・tiers・engine-mods・types.ts・コラプトの表 corruption.ts + corruption-mods.json ← scripts/build-corruption-mods.mjs)、ルーンのはめ方 craft-stage/augment-rules.ts、ベースの一覧 services/items/base-catalog.ts。エンジンが読んでよい外は i18n/ (名前 item-names-ja.ts・ジェムの文 gem-hover.ts) と trade-search の trade2/、本番で隠すスイッチ web/release-flags.ts の `flag` だけ (abyssSuffix・skillPlus・talismanWeight・dntBases・runeMagnitude は 10-24 に本番へ出した) (アプリの craft-v2・trade2/localize を読まない)。
- トレードのデータ (確かめに使う、正は poe2db = E-01。消さない): ベースの一覧 services/items/tradeable-bases.json ← scripts/build-tradeable-bases.mjs、MOD の文と stat の対応 i18n/trade2-stat-text・stat-mapping・stat-kinds・skills.json ← scripts/build-trade2-*.mjs、constants/trade2.ts、検索の URL craft-stage/trade-search.ts。アプリの trade2 (src-tauri・trade2/exchange・open) は凍結で触らない。
- 台本 scripts/: build-poe2db-fixes・audit-poe2db*.mjs (MOD の段・タグ・暗黙・ルーン、結果は notes/2026-10-20-j4-poe2db-audit.md)・build-corruption-mods、build-htc-bases-from-client (+ _htc-*.mjs)・build-gem-hover-ja (+ _gem-csd.mjs)、build-desecrated-weights・build-rune-weights-coe・check-htc-odds-vs-coe、craft-stage-run・check-craft-stage。猿の照らしの台本 check-monkey-engine.mjs・_monkey-* はモンキー隊長の持ち物 (10-25 に移した)
- スキンの一覧 (src/data/mtx-poe1-in-poe2.json・scripts/build-mtx-web.mjs) はスキン部長の持ち物 (10-25 に渡した、作ったのはジン 9 本目 d518b552)。
- テスト tests/: currency-spec-*・held-odds-parity・engine-emulator-parity・desecrate-*・coe-rules-2026-10-16・mod-*・item-classes。
- 画面・部品の地図はここに置かない: エミュ docs/org/emu/README.md、シミュ docs/org/simulator/README.md、部品 docs/org/design/README.md。
- メモ: CLAUDE.md の表 (エンジン・MOD・確率の行) + no-vaal-chance・mod-kind-labels・grasping-mail-ring-mods・poe2tube-handoff。
- 決着済み: docs/spec/engine.md (E-xx、10-28 にここへ集めた)。元の記録は docs/reviews/2026-10-17-rule-checklist.md・2026-10-16-coe-rule-check.md・2026-10-18-tag-audit.md、docs/decisions/001・004。
