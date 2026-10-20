# エミュレーター部長

クラフト台 (クラフトの決まり・エンジン・MOD の置き場/重み・棚・確率の表・スパムシミュレーター) の持ち主。

## 決まり (docs/org/dev.md の決まりが先)
1. ゲームの決まりは書いてある効果どおり。棚の条件は乱数に関係ない物だけ、上限を決めない。
2. カレンシー固有の処理を書き足さず、spec/ の部品とお告げの効き目 (`OmenEffect`) で表す (ADR-004)。
3. MOD の置き場・重み・段はエンジンの行 1 か所。`m.family` を直接比べない、段の重みを自分で足さない (mods/mod-rules.ts)。
4. MOD に固定値は無い (+1 も stat の値)。タグ・品質を触る時は暗黙も。
5. 確率の表を変えたら打った結果と突き合わせる (tests/held-odds-parity.test.ts)。数字の正しさは解析君に頼んでよい。
6. 結果の見張り (currency-spec-golden) をわざと変えた時だけ `GOLDEN_WRITE=1`。

## 地図
- 画面 src/views/craft-stage/: CraftStage.vue (入口)、棚 CurrencyShelf・ShelfButton・StageCurrencyCard、アイテム StageItemCard・StageItemMini、MOD StageModList・ModAddPicker、工程 StageHistory、StageForesight・RevealPanel・StageFracturePicker・StageQualityBar・StageBasePicker/Page・StageSettings・StagePhoneBar。狙う StageAimPanel・StageAimPicker。スパム StageRoutes*・StageRouteLuck・StageRouteRunes・use-spam-share.ts。
- 状態 src/state/: craft-stage-shelf・shelf-context・aim-state・stage-steps・stage-extra・craft-stage-help*・spam-share-open。
- 仕組み src/services/craft-stage/: spec/ (orb・essence・desecrate・other-specs、parts.ts、judge.ts、run-spec.ts、odds.ts)、apply-currency.ts と apply-*.ts・omens.ts、確率 held-odds・aim-odds・route-race・chaos-spam・route-runes、MOD の並べ mod-list.ts (`modListFor`)・roll-text.ts、ベース stage-bases.ts (+ .json)・stage-uniques・stage-runes・*-art.ts。
- エンジン・MOD: src/vendor/poe2htc、src/services/htc/ (patch.ts `loadHtcPatch()`・bridge.ts・weight-overrides.ts・poe2db-*-fixes.json・mod-stats.json・rune-weights.json)、src/services/mods/ (mod-rules・item-classes・tiers・engine-mods)、ベースの一覧 services/items/base-catalog.ts。
- 台本 scripts/: build-poe2db-fixes・audit-poe2db*.mjs、build-desecrated-weights・build-rune-weights-coe・check-htc-odds-vs-coe、craft-stage-run・check-craft-stage。
- テスト tests/: currency-spec-*・held-odds-parity・engine-emulator-parity・desecrate-*・coe-rules-2026-10-16・mod-*・item-classes。
- メモ: CLAUDE.md の表 (カレンシー・MOD・確率の行) + no-vaal-chance・mod-kind-labels・grasping-mail-ring-mods・craft-stage-feature・poe2tube-handoff。
- 決着済み: docs/reviews/2026-10-17-rule-checklist.md・2026-10-16-coe-rule-check.md・2026-10-18-tag-audit.md、メモ poe2-craft-rules-confirmed。docs/decisions/001・004。
