# エミュの画面がエンジンの入口を通らずに読んでいる所 (2026-10-22 深夜、エミュ部長 1 本目)

目的: ジン部長が入口 `src/services/craft-stage/engine.ts` に足し、後でエミュの画面を入口だけに寄せる材料。コードは触っていない。

## 数え方
- 台本: `node docs/org/emu/notes/scripts/emu-imports.mjs > <dir>/out.json` → `node docs/org/emu/notes/scripts/emu-md.mjs <dir>` (作業ツリー、owners.txt で「エミュ」の .ts・.vue = src/views/craft-stage/**・src/state/emulator/** の 46 ファイル)。
- 数えるのは import / export from / import() の先が src/services・src/vendor で engine.ts 以外の物。持ち主は scripts/owner-of.mjs。
- 見張り scripts/check-engine-entry.mjs は「シミュ・チュートリアル・解析」だけを数える (WEB_SIDE)。エミュは入っていないので、寄せ終わったらエミュも WEB_SIDE に足す (ジン部長の台本)。

## 今 (10-23、ジン部長が棚・カード・MOD 一覧を for-share へ移した後)
- エミュの画面は 24 ファイル、入口を通らない import は 40 行 (ジン 32・共通 8)。シミュへの import は 0。ジンの名前 60 個は全部、入口にまだ無い (下の表が今の形)。
- 寄せ方: 結果が変わる物はジン部長が engine.ts か for-emu/ (engine-emu.ts) に、見え方の物 (名前・絵・文) はジン部長が共通か入口に。要望はブラック経由。

## 10-22 深夜の合計 (移す前、記録)
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
| services/craft-stage/route-race.ts | ジン | 4 | `Grade` (spam-share-open.ts・StageRoutesPage.vue)、`SharedRace` (spam-share-open.ts)、`packRace` (StageRouteLuck.vue)、`routeHitIndex` (StageRouteLuck.vue)、`routeKey` (StageRouteLuck.vue)、`routeRun` (StageRouteLuck.vue・route-place.ts)、`RaceRow` (StageRouteLuck.vue・StageRoutesPage.vue・route-place.ts)、`RaceTarget` (StageRouteLuck.vue・route-place.ts)、`RoutePrep` (StageRouteLuck.vue・route-place.ts)、`RouteRun` (StageRouteLuck.vue)、`GRADE_KEY` (StageRoutesPage.vue)、`raceOne` (StageRoutesPage.vue)、`unpackRace` (StageRoutesPage.vue) |
| services/craft-stage/base-art.ts | ジン | 4 | `baseArt` (StageBasePicker.vue・StageItemMini.vue・StageRoutesIntro.vue)、`baseArtFile` (StageRouteLuck.vue) |
| services/craft-stage/share.ts | 共通 | 3 | `unpackJson` (spam-share-open.ts)、`encodeShare` (CraftStage.vue)、`SHARE_ENABLED` (CraftStage.vue)、`shareUrl` (CraftStage.vue)、`xIntentUrl` (CraftStage.vue)、`packJson` (use-spam-share.ts) |
| services/craft-stage/apply-currency.ts | ジン | 3 | `catalystSetKey` (CraftStage.vue)、`IMPLICIT_SET` (CraftStage.vue)、`implicitSetKey` (CraftStage.vue)、`isCatalystSet` (CraftStage.vue)、`isQualitySet` (CraftStage.vue)、`QUALITY_CAP` (CraftStage.vue)、`qualityCapKey` (CraftStage.vue)、`qualitySetKey` (CraftStage.vue)、`qualityCapOf` (StageQualityBar.vue)、`qualityFieldMax` (StageQualityBar.vue)、`SANCTIFIED_REASON` (StageQualityBar.vue・StageSettings.vue)、`ITEM_LEVEL_SET` (StageSettings.vue)、`itemLevelKey` (StageSettings.vue) |
| services/craft-stage/stage-runes.ts | ジン | 2 | `unsocketKey` (CraftStage.vue)、`runeNameOf` (CraftStage.vue)、`RUNE_PREFIX` (CraftStage.vue) |
| services/trade2/open-external.ts | 共通 | 2 | `openExternal` (CraftStage.vue・use-spam-share.ts) |
| services/craft-stage/mod-list.ts | ジン | 2 | `aimLabel` (StageAimPanel.vue・StageAimPicker.vue)、`groupLabelOf` (StageAimPicker.vue)、`tierIdOf` (StageAimPicker.vue) |
| services/craft-stage/stage-core.ts | ジン | 2 | `hasExtraCatalyst` (StageQualityBar.vue)、`stageRuneIds` (StageRoutesPage.vue) |
| services/craft-stage/route-runes.ts | ジン | 2 | `routeRunesFor` (StageRouteRunes.vue・StageRoutesPage.vue)、`routeSocketsOf` (StageRouteRunes.vue)、`runePrep` (StageRoutesPage.vue) |
| services/craft-stage/trade-search.ts | 共通 | 2 | ✅`ModGroup` (StageSettings.vue)、`import()` (StageSettings.vue) |
| services/craft-stage/stage-pob.ts | ジン | 1 | `PobStat` (stage-extra.ts) |
| services/craft-stage/defence.ts | ジン | 1 | `monsterAccuracy` (stage-extra.ts)、`DamageKind` (stage-extra.ts)、`Defender` (stage-extra.ts)、`Outcome` (stage-extra.ts) |
| services/craft-stage/apply-vaal.ts | ジン | 1 | `isSanctifySet` (CraftStage.vue)、`sanctifySetKey` (CraftStage.vue) |
| services/craft-stage/engine-emu.ts | ジン | 1 | `previewUse` (CraftStage.vue) |
| services/htc/game-names.ts | ジン | 1 | `jaOfOmen` (RevealPanel.vue) |
| services/craft-stage/stage-bases.ts | ジン | 1 | `reqOfItem` (RevealPanel.vue) |
| services/craft-stage/spec/run-spec.ts | ジン | 1 | `planSpec` (RevealPanel.vue) |
| services/craft-stage/aim-odds.ts | ジン | 1 | `REVEAL` (StageAimPanel.vue) |
| services/items/base-catalog.ts | ジン | 1 | `baseCatalog` (StageBasePicker.vue) |
| services/currency/currency-hover.ts | 共通 | 1 | `currencyHoverOf` (StageCurrencyCard.vue) |
| services/mods/item-classes.ts | ジン | 1 | `inAny` (StageQualityBar.vue) |
| services/craft-stage/chaos-spam.ts | ジン | 1 | `medianOf` (StageRouteLuck.vue)、`rankOf` (StageRouteLuck.vue)、`unluckyOf` (StageRouteLuck.vue)、`SpamStats` (StageRouteLuck.vue) |
| vendor/poe2htc/engine/runes.ts | ジン | 1 | `RUNE_BY_ID` (StageRouteRunes.vue) |
| services/craft-stage/apply-spam.ts | ジン | 1 | `forcesOf` (route-place.ts)、`spamKey` (route-place.ts) |

名前 (ジン): 入口にもうある 0・まだ無い 60
