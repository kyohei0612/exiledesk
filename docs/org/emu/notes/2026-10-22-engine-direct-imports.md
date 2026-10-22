# エミュの画面がエンジンの入口を通らずに読んでいる所 (2026-10-22 深夜、エミュ部長 1 本目)

目的: ジン部長が入口 `src/services/craft-stage/engine.ts` に足し、後でエミュの画面を入口だけに寄せる材料。コードは触っていない。

## 数え方
- 台本: `node docs/org/emu/notes/scripts/emu-imports.mjs > <dir>/out.json` → `node docs/org/emu/notes/scripts/emu-md.mjs <dir>` (作業ツリー、owners.txt で「エミュ」の .ts・.vue = src/views/craft-stage/**・src/state/emulator/** の 46 ファイル)。
- 数えるのは import / export from / import() の先が src/services・src/vendor で engine.ts 以外の物。持ち主は scripts/owner-of.mjs。
- 見張り scripts/check-engine-entry.mjs は「シミュ・チュートリアル・解析」だけを数える (WEB_SIDE)。エミュは入っていないので、寄せ終わったらエミュも WEB_SIDE に足す (ジン部長の台本)。

## 合計
- import の行 147 (34 ファイル)。うちジンの仕組み 135 行・共通 (share.ts・trade-search.ts・trade2/open-external・market/legacy-rune・htc/price-keys.json・currency/currency-hover) 10 行・シミュ 2 行 (StageModList.vue → services/simulator/sim-methods・quiz-build)。
- ジンの名前 154 個のうち、入口にもう同じ名前がある (✅ = import の先を engine.ts に替えるだけ) 46・入口にまだ無い 108。
- ファイルごとの多い順: craft-stage-shelf.ts 17・craft-stage-help.ts 13・StageItemCard.vue 12・craft-stage-help-mods.ts 11・CraftStage.vue 8・StageModList / StageQualityBar / StageRoutesPage 6・StageRouteLuck / StageSettings 5。

## 気になる物 (寄せる時に決める)
- シミュの持ち物を読んでいる: StageModList.vue → `methodsFor`・`methodsOff`・`augmentHostOf`・`SimMethod` (シミュの棚で使う時の切り替え?)。エミュとシミュを分ける決まりに反するので、シミュ部長と分け方を決める (ブラック経由)。
- 決まりが画面に来ている疑い (UI/UX だけの決まり 2): StageQualityBar の `qualityCapOf`・`qualityFieldMax`・`inAny`、craft-stage-help-text の `ARCHITECT_DESTROY_P`・`INFUSER_CORRUPT_P`、StageRouteLuck の `medianOf`・`rankOf`・`unluckyOf`、base-values.ts の `boostedMod`・`scaledAugment`・`retext`。画面で計算していないかは寄せる時に読む。
- 名前・絵・文 (`baseArt`・`runeArt`・`jaOfOmen`・`emotionNameOf`・`stepJa/En`・`qualityLabelOf`・`tagLabel`) は「文」として入口にまとめるか、共通に移すかをジン部長が決める。
- 設定の鍵 (`catalystSetKey`・`qualitySetKey`・`itemLevelKey`・`sanctifySetKey` など、CraftStage.vue・StageSettings.vue) は打つ時の入力の形。入口の「手の形」として足すのが良さそう。

## 先ごとの一覧 (行数 = import の行、✅ = 入口にもう同じ名前がある、括弧は使っているファイル)
| 先 | 持ち主 | 行 | 名前 |
|---|---|---|---|
| services/craft-stage/types.ts | ジン | 18 | ✅`StageItem` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts・shelf-context.ts・stage-steps.ts・StageCurrencyCard.vue・StageItemCard.vue・StageItemMini.vue・StageModList.vue・StageQualityBar.vue・StageRouteLuck.vue・StageRoutesPage.vue・StageSanctifyBar.vue・base-values.ts・route-place.ts・use-stage-fx.ts)、✅`StageMod` (CraftStage.vue・RevealPanel.vue・StageItemCard.vue・StageItemMini.vue・StageRouteLuck.vue・base-values.ts)、`StageAugment` (base-values.ts) |
| services/craft-stage/stage-runes.ts | ジン | 9 | ✅`isRune` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts・CraftStage.vue)、✅`runeEffectFor` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts)、✅`runeOf` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts)、`runeNameOf` (craft-stage-help.ts・craft-stage-shelf.ts・CraftStage.vue)、✅`socketCapOf` (craft-stage-help.ts・CurrencyShelf.vue・StageSettings.vue)、`runeCategoryOf` (craft-stage-shelf.ts)、`runeKeys` (craft-stage-shelf.ts)、`baseSocketsOf` (stage-steps.ts)、`unsocketKey` (CraftStage.vue)、`RUNE_PREFIX` (CraftStage.vue)、`EL_JA` (use-stage-fx.ts) |
| services/craft-stage/mod-list.ts | ジン | 8 | ✅`ModGroup` (ModAddPicker.vue・StageAimPicker.vue・StageModList.vue・stage-mod-list-look.ts)、`aimLabel` (StageAimPanel.vue・StageAimPicker.vue)、`groupLabelOf` (StageAimPicker.vue・StageModList.vue)、✅`modListFor` (StageAimPicker.vue・StageFracturePicker.vue・StageModList.vue)、`tierIdOf` (StageAimPicker.vue・StageFracturePicker.vue)、✅`ListRow` (StageAimPicker.vue・StageFracturePicker.vue・StageModList.vue・StageWeightEdit.vue・stage-mod-list-look.ts)、✅`ListTier` (StageAimPicker.vue・StageFracturePicker.vue)、`shownTags` (StageFracturePicker.vue・StageItemCard.vue・StageModList.vue)、`TAG_STYLE` (StageFracturePicker.vue・StageItemCard.vue・StageModList.vue)、`factionOf` (StageModList.vue)、`runeEnOf` (StageModList.vue)、`runeToneOf` (stage-mod-list-look.ts) |
| services/craft-stage/stage-core.ts | ジン | 7 | ✅`maxQualityOf` (craft-stage-help.ts・StageQualityBar.vue)、✅`allMods` (ModAddPicker.vue・StageItemCard.vue・StageSanctifyBar.vue)、`boostedMod` (StageItemCard.vue・base-values.ts)、`hasExtraCatalyst` (StageItemCard.vue・StageQualityBar.vue)、`scaledAugment` (StageItemCard.vue・base-values.ts)、✅`unfracturable` (StageItemCard.vue)、`stageRuneIds` (StageRoutesPage.vue)、`retext` (base-values.ts) |
| vendor/poe2htc/engine/types.ts | ジン | 5 | ✅`Mod` (craft-stage-help-mods.ts)、✅`PatchData` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts・shelf-context.ts・StageBasePicker.vue)、✅`CURRENCY_FLOOR` (craft-stage-help.ts) |
| services/craft-stage/apply-currency.ts | ジン | 5 | `GNAWED_MAX_ILVL` (craft-stage-help.ts)、`catalystSetKey` (CraftStage.vue)、`IMPLICIT_SET` (CraftStage.vue)、`implicitSetKey` (CraftStage.vue)、`isCatalystSet` (CraftStage.vue)、`isQualitySet` (CraftStage.vue)、`QUALITY_CAP` (CraftStage.vue)、`qualityCapKey` (CraftStage.vue)、`qualitySetKey` (CraftStage.vue)、✅`kindOf` (StageAimPanel.vue)、`qualityCapOf` (StageQualityBar.vue)、`qualityFieldMax` (StageQualityBar.vue)、`SANCTIFIED_REASON` (StageQualityBar.vue・StageSettings.vue)、`ITEM_LEVEL_SET` (StageSettings.vue)、`itemLevelKey` (StageSettings.vue) |
| services/craft-stage/base-art.ts | ジン | 5 | `baseArt` (craft-stage-shelf.ts・StageBasePicker.vue・StageItemMini.vue・StageRoutesIntro.vue)、`baseArtFile` (StageRouteLuck.vue) |
| services/craft-stage/apply-emotion.ts | ジン | 4 | `emotionNameOf` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts)、✅`isEmotion` (craft-stage-help-mods.ts・craft-stage-help.ts・craft-stage-shelf.ts)、`emotionKeysFor` (CurrencyShelf.vue) |
| services/craft-stage/run-plan.ts | ジン | 4 | `stepEn` (craft-stage-shelf.ts)、`stepJa` (craft-stage-shelf.ts)、✅`startFrom` (spam-share-open.ts)、✅`PlayedStep` (stage-steps.ts・use-stage-fx.ts) |
| services/craft-stage/stage-bases.ts | ジン | 4 | `isFlask` (craft-stage-shelf.ts・StageItemCard.vue)、✅`isGem` (craft-stage-shelf.ts・StageItemCard.vue・StageQualityBar.vue)、`reqOfItem` (RevealPanel.vue) |
| services/craft-stage/route-race.ts | ジン | 4 | `Grade` (spam-share-open.ts・StageRoutesPage.vue)、✅`RouteKind` (spam-share-open.ts・StageRoutesPage.vue)、`SharedRace` (spam-share-open.ts)、`packRace` (StageRouteLuck.vue)、`routeHitIndex` (StageRouteLuck.vue)、`routeKey` (StageRouteLuck.vue)、`routeRun` (StageRouteLuck.vue・route-place.ts)、`RaceRow` (StageRouteLuck.vue・StageRoutesPage.vue・route-place.ts)、`RaceTarget` (StageRouteLuck.vue・route-place.ts)、`RoutePrep` (StageRouteLuck.vue・route-place.ts)、`RouteRun` (StageRouteLuck.vue)、`GRADE_KEY` (StageRoutesPage.vue)、`raceOne` (StageRoutesPage.vue)、`unpackRace` (StageRoutesPage.vue) |
| services/htc/quality.ts | ジン | 3 | ✅`CATALYSTS` (craft-stage-help-mods.ts・StageQualityBar.vue)、`qualityLabelOf` (StageItemCard.vue) |
| services/htc/patch.ts | ジン | 3 | `jewelEmotionsOf` (craft-stage-help-mods.ts・craft-stage-help.ts)、`jewelEmotionJa` (stage-mod-list-look.ts) |
| services/craft-stage/omens.ts | ジン | 3 | ✅`OMEN_FOR` (craft-stage-shelf.ts・StageAimPanel.vue)、`omenNote` (ShelfButton.vue) |
| services/craft-stage/share.ts | 共通 | 3 | `unpackJson` (spam-share-open.ts)、`encodeShare` (CraftStage.vue)、`SHARE_ENABLED` (CraftStage.vue)、`shareUrl` (CraftStage.vue)、`xIntentUrl` (CraftStage.vue)、`packJson` (use-spam-share.ts) |
| services/mods/tag-ja.ts | ジン | 3 | ✅`tagLabel` (StageFracturePicker.vue・StageItemCard.vue・StageModList.vue) |
| services/htc/mod-text.ts | ジン | 2 | ✅`fillModText` (craft-stage-help-mods.ts・StageRoutesPage.vue) |
| services/mods/stat-scale.ts | ジン | 2 | ✅`tierDisplayRanges` (craft-stage-help-mods.ts・StageRoutesPage.vue) |
| services/craft-stage/apply-essence.ts | ジン | 2 | `ABYSS_FAMILY` (craft-stage-help-mods.ts・craft-stage-help.ts)、`essenceTarget` (craft-stage-help-mods.ts・craft-stage-help.ts) |
| services/mods/mod-rules.ts | ジン | 2 | `hasRawFamily` (craft-stage-help-mods.ts・craft-stage-help.ts)、`sharesRawFamily` (craft-stage-help-mods.ts) |
| vendor/poe2htc/engine/probability.ts | ジン | 2 | `desecrationBoneFor` (craft-stage-help.ts・craft-stage-shelf.ts) |
| services/craft-stage/skill-quality.ts | ジン | 2 | `skillQualityOf` (craft-stage-help.ts・StageItemCard.vue) |
| services/craft-stage/apply-spam.ts | ジン | 2 | `isSpam` (craft-stage-shelf.ts)、`parseSpam` (craft-stage-shelf.ts)、`forcesOf` (route-place.ts)、`spamKey` (route-place.ts) |
| services/htc/game-names.ts | ジン | 2 | `jaOfOmen` (craft-stage-shelf.ts・RevealPanel.vue) |
| services/craft-stage/rune-art.ts | ジン | 2 | `runeArt` (craft-stage-shelf.ts・StageItemCard.vue) |
| services/craft-stage/contract.ts | ジン | 2 | ✅`CraftStagePlan` (stage-extra.ts・stage-steps.ts) |
| services/craft-stage/apply-force.ts | ジン | 2 | ✅`forceKey` (CraftStage.vue・ModAddPicker.vue)、✅`ForceFlag` (ModAddPicker.vue) |
| services/trade2/open-external.ts | 共通 | 2 | `openExternal` (CraftStage.vue・use-spam-share.ts) |
| services/items/base-catalog.ts | ジン | 2 | `baseCatalog` (StageBasePicker.vue)、✅`classLabel` (StageBasePicker.vue・StageItemCard.vue) |
| services/mods/item-classes.ts | ジン | 2 | `inAny` (StageQualityBar.vue)、✅`inGroup` (StageSettings.vue) |
| services/htc/rng.ts | ジン | 2 | ✅`mulberry32` (StageRouteLuck.vue・route-place.ts) |
| services/craft-stage/route-runes.ts | ジン | 2 | `routeRunesFor` (StageRouteRunes.vue・StageRoutesPage.vue)、`routeSocketsOf` (StageRouteRunes.vue)、`runePrep` (StageRoutesPage.vue) |
| services/craft-stage/trade-search.ts | 共通 | 2 | ✅`ModGroup` (StageSettings.vue)、`import()` (StageSettings.vue) |
| vendor/poe2htc/optimizer/cost.ts | ジン | 1 | ✅`essenceLevelOf` (craft-stage-help-mods.ts) |
| services/craft-stage/apply-extra.ts | ジン | 1 | `ARCHITECT_DESTROY_P` (craft-stage-help-text.ts)、`INFUSER_CORRUPT_P` (craft-stage-help-text.ts) |
| services/craft-stage/augment-rules.ts | ジン | 1 | `ruleLines` (craft-stage-help.ts) |
| services/craft-stage/apply-act.ts | ジン | 1 | ✅`isShard` (craft-stage-help.ts)、`JEWELLER_TO` (craft-stage-help.ts)、`QUALITY_MAX` (craft-stage-help.ts)、`QUALITY_STEP` (craft-stage-help.ts)、`QUALITY_TARGET` (craft-stage-help.ts)、`SHARD_TO_ORB` (craft-stage-help.ts)、`SHARDS_PER_ORB` (craft-stage-help.ts) |
| services/htc/sockets.ts | ジン | 1 | `CRAFT_RUNES_EN` (craft-stage-shelf.ts) |
| services/market/legacy-rune.ts | 共通 | 1 | `isLegacyRune` (craft-stage-shelf.ts)、`LEGACY_SOURCE` (craft-stage-shelf.ts) |
| services/htc/price-keys.json | 共通 | 1 | `default:priceKeys` (craft-stage-shelf.ts) |
| services/htc/essence-key-table.ts | ジン | 1 | ✅`ESSENCE_KEYS` (craft-stage-shelf.ts) |
| vendor/poe2htc/data/essences.json | ジン | 1 | `default:essences` (craft-stage-shelf.ts) |
| services/craft-stage/stage-pob.ts | ジン | 1 | ✅`PobBlock` (stage-extra.ts)、`PobStat` (stage-extra.ts) |
| services/craft-stage/defence.ts | ジン | 1 | ✅`DEF` (stage-extra.ts)、`monsterAccuracy` (stage-extra.ts)、`DamageKind` (stage-extra.ts)、`Defender` (stage-extra.ts)、`Outcome` (stage-extra.ts) |
| services/craft-stage/apply-vaal.ts | ジン | 1 | `isSanctifySet` (CraftStage.vue)、`sanctifySetKey` (CraftStage.vue) |
| services/craft-stage/spec/run-spec.ts | ジン | 1 | `planSpec` (RevealPanel.vue) |
| services/craft-stage/aim-odds.ts | ジン | 1 | ✅`aimChain` (StageAimPanel.vue)、✅`aimCombos` (StageAimPanel.vue)、✅`aimDone` (StageAimPanel.vue)、`REVEAL` (StageAimPanel.vue)、✅`AimCombo` (StageAimPanel.vue)、✅`AimOdd` (StageAimPanel.vue) |
| services/currency/currency-hover.ts | 共通 | 1 | `currencyHoverOf` (StageCurrencyCard.vue) |
| services/craft-stage/stage-props.ts | ジン | 1 | `implicitRows` (StageItemCard.vue)、`propRows` (StageItemCard.vue) |
| services/craft-stage/stage-uniques.ts | ジン | 1 | `uniqueLines` (StageItemCard.vue) |
| services/craft-stage/roll-text.ts | ジン | 1 | `rollLines` (StageItemCard.vue) |
| services/craft-stage/held-odds.ts | ジン | 1 | ✅`aimTierKey` (StageModList.vue)、✅`heldAnyOf` (StageModList.vue)、✅`heldOdds` (StageModList.vue) |
| services/simulator/sim-methods.ts | シミュ | 1 | `augmentHostOf` (StageModList.vue)、`methodsFor` (StageModList.vue)、`methodsOff` (StageModList.vue) |
| services/simulator/quiz-build.ts | シミュ | 1 | `SimMethod` (StageModList.vue) |
| services/craft-stage/chaos-spam.ts | ジン | 1 | `medianOf` (StageRouteLuck.vue)、`rankOf` (StageRouteLuck.vue)、`unluckyOf` (StageRouteLuck.vue)、`SpamStats` (StageRouteLuck.vue) |
| vendor/poe2htc/engine/runes.ts | ジン | 1 | `RUNE_BY_ID` (StageRouteRunes.vue) |
| services/htc/weight-overrides.ts | ジン | 1 | `weightOverrideNote` (StageWeightEdit.vue) |
| services/htc/essence-keys.json | ジン | 1 | `default:essenceKeys` (stage-mod-list-look.ts) |

名前 (ジン): 入口にもうある 46・まだ無い 108
