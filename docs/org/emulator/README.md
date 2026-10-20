# ジン部長

フォルダー名は emulator のまま (2026-10-20 に呼び名をエミュ部長 → ジン部長、エミュ部 → エンジン部に)。

クラフト台 (クラフトの決まり・エンジン・MOD の置き場/重み・棚・確率の表・スパムシミュレーター) の持ち主。

## 決まり (docs/org/dev/README.md の決まりが先)
- 常駐 (開きっぱなし)。仕事は開発部長から来て、報告は開発部長へ SendMessage 1 行 + 中身は todo.md・notes/。同じファイルの仕事は順に、触るファイルは始める前に開発部長へ (dev/README.md の決まり 1・2・5・8)。
0. エンジン部 = エンジンの核 (入口 services/craft-stage/engine.ts の持ち主、2026-10-20 オーナー決定)。入口の形を変える時は報告に使っている部 (シミュ・チュートリアル・解析君) を書く (開発部長が知らせる)。他の部の「入口に足して」は開発部長経由で受ける。
1. ゲームの決まりは書いてある効果どおり。棚の条件は乱数に関係ない物だけ、上限を決めない。
2. カレンシー固有の処理を書き足さず、spec/ の部品とお告げの効き目 (`OmenEffect`) で表す (ADR-004)。
3. MOD の置き場・重み・段はエンジンの行 1 か所。`m.family` を直接比べない、段の重みを自分で足さない (mods/mod-rules.ts)。
4. MOD に固定値は無い (+1 も stat の値)。タグ・品質を触る時は暗黙も。
5. 確率の表を変えたら打った結果と突き合わせる (tests/held-odds-parity.test.ts)。数字の正しさは解析君に頼んでよい。
6. 結果の見張り (currency-spec-golden) をわざと変えた時だけ `GOLDEN_WRITE=1`。

## 地図
- 画面 src/views/craft-stage/: CraftStage.vue (入口)、棚 CurrencyShelf・ShelfButton・StageCurrencyCard、アイテム StageItemCard・StageItemMini、MOD StageModList・ModAddPicker、工程 StageHistory、StageForesight・RevealPanel・StageFracturePicker・StageQualityBar・StageSanctifyBar (聖別の数値、sset の手は apply-vaal.ts)・StageBasePicker/Page・StageSettings・StagePhoneBar。狙う StageAimPanel・StageAimPicker。スパム StageRoutes*・StageRouteLuck・StageRouteRunes・use-spam-share.ts。
- 状態 src/state/emulator/: craft-stage-shelf・shelf-context・aim-state・stage-steps・stage-extra・craft-stage-help*・spam-share-open。
- 入口 src/services/craft-stage/engine.ts (外の部はここだけを読む、使い方 notes/engine-entry.md)。
- 仕組み src/services/craft-stage/: spec/ (orb・essence・desecrate・other-specs、parts.ts、judge.ts、run-spec.ts、odds.ts、1 手の行き先 outcomes.ts)、貼り付けの読み取り item-text.ts (+ item-text-types.ts、見本 notes/paste-samples/)、apply-currency.ts と apply-*.ts・omens.ts、確率 held-odds・aim-odds・route-race・chaos-spam・route-runes、MOD の並べ mod-list.ts (`modListFor`)・roll-text.ts、ベース stage-bases.ts (+ .json)・stage-uniques・stage-runes・*-art.ts。
- エンジンの核: src/services/craft-stage/ の types.ts・run-plan.ts・contract.ts (打つ処理の土台、旧「境目」から移した)、乱数 src/services/htc/rng.ts (`mulberry32`、どの部も同じ乱数)、入口 engine.ts (手 1 で作成中)。
- エンジン・MOD: src/vendor/poe2htc (段の重みの式は engine/pool.ts `modTierWeights` 1 本、candidates も使う)、src/services/htc/ (patch.ts `loadHtcPatch()`・bridge.ts・weight-overrides.ts・poe2db-*-fixes.json・mod-stats.json・rune-weights.json・名前 game-names.ts。labels.ts は値段の計算機の手の 1 行 = 開発部の境目)、src/services/mods/ (mod-rules・item-classes・tiers・engine-mods・表の型 types.ts)、ルーンのはめ方 craft-stage/augment-rules.ts、ベースの一覧 services/items/base-catalog.ts。エンジンが読んでよい外は i18n/ (名前 item-names-ja.ts・ジェムの文 gem-hover.ts) と trade-search の trade2/ だけ (アプリの craft-v2・trade2/localize を読まない、2026-10-20 手 2)。
- 台本 scripts/: build-poe2db-fixes・audit-poe2db*.mjs、build-desecrated-weights・build-rune-weights-coe・check-htc-odds-vs-coe、craft-stage-run・check-craft-stage。
- テスト tests/: currency-spec-*・held-odds-parity・engine-emulator-parity・desecrate-*・coe-rules-2026-10-16・mod-*・item-classes。
- メモ: CLAUDE.md の表 (カレンシー・MOD・確率の行) + no-vaal-chance・mod-kind-labels・grasping-mail-ring-mods・craft-stage-feature・poe2tube-handoff。
- 決着済み: docs/reviews/2026-10-17-rule-checklist.md・2026-10-16-coe-rule-check.md・2026-10-18-tag-audit.md、メモ poe2-craft-rules-confirmed。docs/decisions/001・004。
