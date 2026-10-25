# ジン部長

フォルダー名は emulator のまま (2026-10-20 に呼び名をエミュ部長 → ジン部長、エミュ部 → エンジン部に)。

エンジンの持ち主 (オーナー 10-25 夜「ジンはMOD変更やカレンシールール変更等の修正でやっと動く だからマジで出番ないはずなんだよ想定」)。エンジン = データ (json)・決まりの md・エンジンのコードは全部ジン 1 人 (10-25 夜のエンジン部長は閉じた)。動くのは MOD・カレンシーの決まりの変更とエンジンの不具合の時だけ。画面への指示・表示の決めはしない (画面の部長がエンジンの関数を取りに来る)。ビルド・出し方・Web の土台・照らしの台本などの頼みは受けず、持ち主の部へ回す (`node scripts/owner-of.mjs <パス>`)。

データベース (オーナー 10-23「ジンはデータ管理」): 出どころはトレードのデータ (一番信頼できる) > poe2db。MOD・ベース・重み・段・名前と文・相場のデータと、打った時の決まり = エンジン (クラフトの決まり・カレンシーとお告げの効き目・MOD の置き場/重み/段/文・確率の表・品質と聖別の式・窓口 3 つ)。**画面と部品は持たない** (エミュの画面 = エミュ部長 docs/org/emu/、シミュの画面 = シミュ部長 docs/org/simulator/、両方の画面の部品と見た目 = デザイン部長 docs/org/design/。オーナー 10-22 深夜・10-23)。ほかに持つのはデータの境目 (owners.txt の「共通」: api・data・constants・i18n のゲームのデータ・state 直下の craft-stage.ts・相場 money・prices など、地図は dev/README.md)。画面の挙動 (src/web・composables・utils = ページの移り方・音・クリックの守り) はデザイン部長 (オーナー 10-23「ジンはデータ管理」)。

## 決まり (docs/org/dev/README.md の決まりが先)
1. 線引き: 結果が変わる物 (付き方・確率・固定される MOD・打てるか) はエンジン、見え方と操作 (いつ使うか・どう見せるか) は画面 (オーナー 10-23)。
2. 画面はエンジンの関数を何でも直接呼んでよい・入口を用意しなくてよい (オーナー 10-25 夜)。画面はエンジンのファイルを書き換えない・打つ / 読む / MOD の文や値を作る中身を自前で書かない (無ければジンに頼む)。シミュだけ・エミュだけの物はエンジンに置かず、シミュ・エミュの置き場 (services/simulator/sim-engine・services/emulator/emu-engine、10-26 に移した) に。エンジン (craft-stage) はそれらを読まない。見張り check-engine-entry の B・C・D・E。
3. 元からある物はそのまま呼ぶ: 核の関数の写し・言い換え・包み直しを作らない (オーナー 10-23)。関数の形を変えたら使っている部を報告に書く。
4. 確かめは小さく: エミュの画面の同じ所と同じ答えか。確率の表を変えたら held-odds-parity で突き合わせ、golden はわざと変えた時だけ書き直す。
5. ゲームの決まりは書いてある効果どおり。棚の条件は乱数に関係ない物だけ、上限を決めない (オーナー 10-20)。
6. カレンシー固有の処理を書き足さず、spec/ の部品とお告げの効き目 (`OmenEffect`) で表す (ADR-004)。
7. MOD の置き場・重み・段はエンジンの行 1 か所 (mods/mod-rules.ts)。`m.family` を直接比べない、段の重みを自分で足さない。固定値は無い (+1 も stat の値)。タグ・品質を触る時は暗黙も。
8. 出どころはトレード > poe2db > ほか。付く・付かない・ベースの有無は先にトレードのデータで確かめ、それは消さない。エンジンと食い違い写しで決まらない物もこの順に合わせ、聞かない (オーナー 10-20・10-23)。
9. 画面 (src/views・src/state/emulator・simulator) と部品 (src/components・for-share・見た目) は直さない・画面への指示や表示の決めもしない。画面がエンジンの中身を自前で書いていたら (見張りの E)、どの部のどのファイルかを書いてブラックへ。
10. 常駐・報告・触るファイル (dev/touching/emulator.md)・push と開発版は dev/README.md の決まり 1・2・5・8 のとおり。本番は最終チェック長。

## 地図
- 他の部への窓口の目録: data-catalog.md (データのファイルと入口の関数ごとに、何に答えるか・呼び方・使っている部。10-25)
- エンジンの核 src/services/craft-stage/ (よく使う名前の束 engine.ts、使い方 notes/engine-entry.md)。打てるかは useReason (両方の棚)。シミュだけ・エミュだけの物は 10-26 にエンジンから出した (オーナー「全部それシミュに渡して削除してくれ」): src/services/simulator/sim-engine.ts・sim-engine/ (hand-effect・magic-odds・spam-counts・outcomes・outcome-odds・essence-parts・start-fracture・carry-aims・unbounded) はシミュ部長、src/services/emulator/emu-engine.ts・emu-engine/ (preview・spam-race・chaos-spam・route-runes) はエミュ部長の持ち物 (エンジンのファイルではない)。分け方の経過は notes/2026-10-22-entry-split-plan.md。
- 見張り scripts/check-engine-entry.mjs (10-25 夜に今の決まりへ): B 凍結の htc・C エンジンの中の置き場 (核→engine-*/、engine-sim/⇄engine-emu/)・D エミュ ⇄ シミュの直の import (例外はチュートリアルの差し込み口 views/tutorial/course-entry.ts だけ)・E 画面の中のエンジンらしき物 (段・幅を直に .tiers・.ranges、文の # を自分で埋める、生のデータの JSON の import、Math.random。見せるために読む物もあるので控えから増えた時だけ落ちる、10-25 夜に 96 か所 / 29 ファイルで控え)。A (入口の外) はやめた。控え check-engine-entry.baseline.json、減ったら `--head --write`。核の見分けは owners.txt の部の名前「ジン」を直に見るので、部の名前を替える時は台本と 1 つの commit で (片方だけだと C が素通りになる、エンジン部長の引き継ぎ notes/2026-10-25-engine-lead-handover.md)。
- 核の土台: craft-stage/ の types.ts・run-plan.ts・contract.ts (打つ処理の形)、乱数 htc/rng.ts (`mulberry32`、どの部も同じ乱数)。
- 打つ: spec/ (orb・essence・desecrate・other-specs、parts.ts (未発現・発現は parts-unrevealed.ts)、judge.ts、run-spec.ts、odds.ts、1 手の行き先 outcomes.ts)、apply-currency.ts と apply-*.ts・omens.ts・omen-block.ts、土台 stage-core.ts (候補・重みの抽選・足す / 消すは stage-draw.ts)、お告げの下の設定 stage-tuning.ts、上乗せ boosts.ts・defence.ts・skill-quality.ts・element-convert.ts・essence-parts.ts、tier-rank.ts。
- 確率: held-odds・aim-odds・route-race・spam-counts (始めのアイテムからの平均)・chaos-spam・route-runes。
- 読む・並べる: 貼り付け item-text.ts (+ item-text-types.ts、見本 notes/paste-samples/)、MOD の並べ mod-list.ts (`modListFor`)・roll-text.ts・text-nums.ts、ベース stage-bases.ts (+ .json)・stage-uniques・stage-runes・stage-props・stage-pob・*-art.ts。境目 (共通) share.ts・trade-search.ts。
- エンジン・MOD: src/vendor/poe2htc (段の重みの式は engine/pool.ts `modTierWeights` 1 本)、src/services/htc/ (patch.ts `loadHtcPatch()`・bridge.ts・weight-overrides.ts・poe2db-*-fixes・mod-stats.json・rune-weights.json・catalysing*・quality.ts・sockets.ts・名前 game-names.ts。buy-or-craft・prices・paste*・patch-types・labels は共通の境目)、src/services/mods/ (mod-rules・item-classes・tiers・engine-mods・types.ts・コラプトの表 corruption.ts + corruption-mods.json ← scripts/build-corruption-mods.mjs)、ルーンのはめ方 craft-stage/augment-rules.ts、ベースの一覧 services/items/base-catalog.ts。エンジンが読んでよい外は i18n/ (名前 item-names-ja.ts・ジェムの文 gem-hover.ts) と trade-search の trade2/、本番で隠すスイッチ web/release-flags.ts の `flag` だけ (OK 待ち abyssSuffix・skillPlus・talismanWeight・dntBases・runeMagnitude、10-24) (アプリの craft-v2・trade2/localize を読まない)。
- トレードのデータ (出どころの 1 番、消さない): ベースの一覧 services/items/tradeable-bases.json ← scripts/build-tradeable-bases.mjs、MOD の文と stat の対応 i18n/trade2-stat-text・stat-mapping・stat-kinds・skills.json ← scripts/build-trade2-*.mjs、constants/trade2.ts、検索の URL craft-stage/trade-search.ts。アプリの trade2 (src-tauri・trade2/exchange・open) は凍結で触らない。
- 台本 scripts/: build-poe2db-fixes・audit-poe2db*.mjs (MOD の段・タグ・暗黙・ルーン、結果は notes/2026-10-20-j4-poe2db-audit.md)・build-corruption-mods、build-htc-bases-from-client (+ _htc-*.mjs)・build-gem-hover-ja (+ _gem-csd.mjs)、build-desecrated-weights・build-rune-weights-coe・check-htc-odds-vs-coe、craft-stage-run・check-craft-stage。猿の照らしの台本 check-monkey-engine.mjs・_monkey-* はモンキー隊長の持ち物 (10-25 に移した)
- スキンの一覧 (src/data/mtx-poe1-in-poe2.json・scripts/build-mtx-web.mjs) はスキン部長の持ち物 (10-25 に渡した、作ったのはジン 9 本目 d518b552)。
- テスト tests/: currency-spec-*・held-odds-parity・engine-emulator-parity・desecrate-*・coe-rules-2026-10-16・mod-*・item-classes。
- 画面・部品の地図はここに置かない: エミュ docs/org/emu/README.md、シミュ docs/org/simulator/README.md、部品 docs/org/design/README.md。
- メモ: CLAUDE.md の表 (エンジン・MOD・確率の行) + no-vaal-chance・mod-kind-labels・grasping-mail-ring-mods・poe2tube-handoff。
- 決着済み: docs/reviews/2026-10-17-rule-checklist.md・2026-10-16-coe-rule-check.md・2026-10-18-tag-audit.md、メモ poe2-craft-rules-confirmed。docs/decisions/001・004。
