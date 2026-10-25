# データと入口の目録 (ジン部長 = データセンター、2026-10-25)

オーナー 10-25「ジンは全てのデータに他部署からアクセスできるように準備してあげて」。データとエンジンの答えは、ここに載っている入口から取る。自前で写さない・式を書かない (メモ feedback-sim-no-own-logic・mod-engine-single-source)。足りない物はジン部長へ (入口に出すだけで中身は変えない)。

- 入口は 3 つ: 核 `src/services/craft-stage/engine.ts` (どの部も)・`engine-emu.ts` (エミュだけ)・`engine-sim.ts` (シミュだけ)。核は engine-*/ を読まず、エミュとシミュは互いの入口を読まない (見張り `node scripts/check-engine-entry.mjs`)。
- 細かい使い方は notes/engine-entry.md、地図は README.md。下の「全部」の表は台本で数えた物 (作り直す時は 10-25 の台本の形で: 入口の export ごとに import している所を owner-of で部に)。

## よく聞かれる答えと入口 (呼び方 1 行)
| 何に答えるか | 呼び方 (核 engine.ts) | 使っている部 |
|---|---|---|
| 置き場・重み・段の土台 | `loadHtcPatch()` → `PatchData` (全部の関数の第 1 引数) | シミュ・エミュ・デザイン ほか |
| 白のアイテムを作る | `freshItem(data, base, itemLevel, rarity?)` | シミュ・チュートリアル・モンキー |
| 札の MOD から始めのアイテムを組む | `startFrom(data, base, itemLevel, spec, seed)` | エミュ・シミュ・チュートリアル・解析 |
| 1 手打った結果 (乱数) | `applyCurrency(data, item, key, rng, omens?)` → `{ applied, random, item, added? }`。乱数は `mulberry32(seed)` | シミュ・チュートリアル・モンキー |
| その手が打てるか (棚の判定) | `useReason(data, item, key, omens?)` → 打てない理由 / null | シミュ・モンキー |
| お告げが掛けられるか | `omensAllowedFor(key)` (手に掛かるお告げ)・`omenBlock(data, item, held, omens, omen)` (理由 / null) | シミュ・デザイン・モンキー |
| 1 手で各 MOD が付く確率 (確率の表) | `heldOdds(data, item, key, omens)` → `byMod`・`heldAnyOf(...)` (選んだどれか) | エミュ・シミュ |
| 1 手で狙いが付く割合 | `addHitOdds(data, item, key, omens, targets)` → `{ p, n, side, total }`・`fractureHit(data, item, targets)` | シミュ |
| 1 手の行き先 (枝と確率) | `stepOutcomes(data, item, key, omens?, { merge? })` (engine-sim) → `[{ p, item, added, removed }]` | シミュ・解析 |
| 狙いが付いているか | `aimDone(item, targets)` (全部)・`aimHits(mod, target, { data, sameText })` (1 つの MOD) | エミュ・シミュ・モンキー |
| 狙いが付くまで打った確率 | `aimOdds(data, item, targets, combo, n, seed)`・`aimChain` | エミュ |
| MOD 一覧 (段・重み・文) | `modListFor(data, item)` → `ListRow[]`・`tierDisplayRanges`・`fillModText(mod, ranges)` | エミュ・シミュ・デザイン ほか |
| 段の名前・番号 | `tierIndexOf(data, modId, T)`・`tierRankOf(data, modId, index)`・`cardTierName(data, mod)` (P0/S0 も) | シミュ・デザイン・モンキー |
| エッセンスか合金か | `craftedKindOf(data, mod)` → "essence" / "alloy" / null | デザイン |
| 冒涜の発現の候補 | `revealOffers(data, item, rng)` → `{ first, reroll }` | シミュ・チュートリアル・モンキー |
| 貼り付けたアイテムを読む | `parseItemText(data, text)` | (今はジンの中だけ) |
| ルーン | `RUNES`・`runeOf(key)`・`runeEffectFor(...)`・`withRunes` | シミュ・デザイン・モンキー |
| エッセンス・カレンシーの名前 | `ESSENCE_KEYS` (鍵 → { en, ja })・`PRICE_KEYS` (カレンシー・骨・お告げの名前、10-25 に出した)・`ESSENCE_TABLE` (エッセンスごとの段の鍵、10-25)・`jaOfOmen` | シミュ・デザイン |
| お告げの下の設定・重みの直し | `stageTuning`・`setStageTuning`・`defaultWeightOf`・`OVERRIDDEN` | シミュ・デザイン・エミュ |
| 乱数 (どの部も同じ) | `mulberry32(seed)` | エミュ・シミュ・チュートリアル・モンキー |

- シミュの「当たるまで」はスパムシミュレーターを参照しない (オーナー 10-25)。`applyCurrency` を 1 手ずつ繰り返す。
- `reachableAims` はシミュの持ち物 (services/simulator/tree/tree-aim.ts)、エンジンの入口ではない。

## データのファイル (持ち主はジン = 共通。出どころはトレードのデータ > poe2db)
| データ | ファイル | 入口・読み方 |
|---|---|---|
| MOD (置き場・重み・段・文) | src/vendor/poe2htc/data/mods.json + services/htc/ の直し (poe2db-*-fixes・weight-overrides) | `loadHtcPatch()` の PatchData (直に読まない。直しが入らない) |
| ベース | vendor/poe2htc/data/base_items.json + htc/extra-bases.json・jewel-bases.json、一覧 services/items/base-catalog.ts | `loadHtcPatch()`・`baseCatalog`・`htcBaseInfo()` |
| エッセンスの鍵と名前 | htc/essence-keys.json + poe2db-pool-fixes.json の essenceKeys | `ESSENCE_KEYS` (json だけ読むと写した鍵が抜ける)・`ESSENCE_TABLE` |
| カレンシー・骨・お告げの名前 | htc/price-keys.json | `PRICE_KEYS`・`jaOfOmen` |
| ルーン | craft-stage/stage-runes・htc/rune-weights.json | `RUNES`・`runeOf` |
| トレードのデータ (一番信頼できる) | services/items/tradeable-bases.json・i18n/trade2-*.json・constants/trade2.ts | 検索の URL は craft-stage/trade-search.ts |
| MOD の文の日本語 | i18n/mod-text-ja.json・mod-text-ja-htc.json | `fillModText` (入口に無い文の引き方が要る時はジンへ) |
| 名前 (アイテム・ジェム・パッシブ) | i18n/items-ja-*.json・gems-client.json・passives-ja-client.json | i18n/lang.ts の `nameOf` (デザイン部長) |
| コラプト | services/mods/corruption-mods.json | `corruptionRowsFor`・`matchCorruption` |
| 相場 | server/live の /boot.json → services/money.ts・htc/prices.ts | 相場の店 state/market-store |
| スキンの一覧 | src/data/mtx-poe1-in-poe2.json | スキン部長の持ち物 |

## 入口の名前の全部 (台本で数えた。[ ] は今使っている部、空 = ジンの中だけ)

### 核 engine.ts (どの部も) (194)
- StageItem[エミュ/シミュ/チュートリアル/デザイン/モンキー/解析]・StageMod[エミュ/シミュ/チュートリアル/デザイン/モンキー/解析]・StageSide[シミュ/解析]・StageRarity・StageApply[シミュ]・PlayedStep[チュートリアル/デザイン]・StartSpec・CraftStagePlan[エミュ/シミュ/チュートリアル/デザイン]
- PatchData[エミュ/シミュ/チュートリアル/デザイン/解析]・ItemBase・Mod[エミュ/デザイン]・Force[シミュ/チュートリアル]・Candidate・PoolOpts・PobBlock[エミュ/チュートリアル]・freshItem[シミュ/チュートリアル/モンキー]
- startFrom[エミュ/シミュ/チュートリアル/解析]・startItem・playStep・playPlan[チュートリアル]・runPlan・splitOmens[チュートリアル]・applyCurrency[シミュ/チュートリアル/モンキー]・kindOf[エミュ/シミュ]
- omensFor[シミュ/チュートリアル]・omensAllowedFor[シミュ/モンキー]・useReason[シミュ/モンキー]・revealOffers[シミュ/チュートリアル/モンキー]・unrevealedOf[シミュ/チュートリアル]・omenBlock[シミュ/デザイン/モンキー]・allMods[エミュ/シミュ/チュートリアル/デザイン]・listOf[シミュ]
- room[シミュ]・limitOf[シミュ/解析]・effectiveCls[シミュ/解析]・maxQualityOf[エミュ/シミュ/デザイン]・catalystOf[シミュ/チュートリアル/デザイン]・SIDES[シミュ]・sideOfMod[シミュ/チュートリアル/解析]・unfracturable[デザイン]
- makeStageMod[シミュ]・withMod・catalystBoosts[シミュ/チュートリアル]・socketCapOf[シミュ/デザイン]・baseSocketsOf[シミュ/モンキー]・dpsText[チュートリアル]・DEF[エミュ/チュートリアル]・loadHtcPatch[シミュ]
- htcBaseInfo・htcBaseLimits・classOfBase・candidates[チュートリアル/解析]・modTierWeight[シミュ]・floorKeepIndex・CRAFTED_SOURCES[シミュ]・familiesOf[チュートリアル/解析]
- CURRENCY_FLOOR[シミュ/チュートリアル/デザイン]・OrbStrength[解析]・orbFloor[解析]・CHAOS_FLOOR・familyBlocked[シミュ]・occupiedKeysOf[シミュ]・ListRow[エミュ/デザイン]・ListTier[エミュ/デザイン]
- ModGroup[エミュ/シミュ/デザイン]・modListFor[エミュ/シミュ/チュートリアル/デザイン/モンキー]・tierDisplayRanges[エミュ/デザイン]・inGroup[エミュ]・isRemovedBase・classLabel[エミュ/デザイン]・AddOdds・AddHit
- OddsTarget[シミュ]・addOddsBySpec[シミュ]・addCands・addHitOdds[シミュ]・hitShare[シミュ]・fractureHit[シミュ]・RouteKind[エミュ]・RouteGrade[シミュ]
- Grade[エミュ]・routeRun[エミュ]・routeKey[エミュ]・GRADE_KEY[エミュ]・occupiedFamiliesOf[解析]・ANCIENT_BONE_FLOOR[解析]・REVEAL_SPEC[解析]・ForceFlag[エミュ]
- forceKey[エミュ/シミュ/モンキー]・HeldOdds[シミュ]・heldOdds[エミュ/シミュ]・heldAnyOf[エミュ]・aimTierKey[エミュ]・AimTarget[シミュ]・AimCombo[エミュ]・AimOdd[エミュ]
- AimHitOpts[シミュ]・aimCombos[エミュ]・aimOdds・aimChain[エミュ]・aimDone[エミュ]・aimHits[シミュ/モンキー]・tierIndexOf[シミュ/モンキー]・tierRankOf[シミュ/モンキー]
- tierNoOf・minIlvlFor[シミュ]・tierRankLabel[シミュ]・cardTierName[デザイン]・craftedKindOf[デザイン]・DESECRATION_EXCLUSIVE_COUNT[解析]・bossOmenAllowed・desecrationOmenForMod
- OMEN_FOR[エミュ/シミュ/デザイン]・RuneRow・RuneEffect・RUNES[シミュ]・runeOf[シミュ/デザイン/モンキー]・isRune[エミュ/デザイン]・runeEffectFor[シミュ/デザイン/モンキー]・withRunes[シミュ]
- runeIdByName[シミュ]・ESSENCE_KEYS[シミュ/デザイン]・PRICE_KEYS・ESSENCE_TABLE・essenceLevelOf[シミュ/デザイン]・CATALYSTS[エミュ/シミュ/デザイン]・isEmotion[デザイン]・isShard[チュートリアル/デザイン]
- isGem[エミュ/デザイン]・BoostKind・ModBoost・ItemBoost・boostsOf・modBoostsOf[シミュ]・baseValueOf・unboost
- ItemTextResult・ItemTextMod・ItemTextImplicit・ItemTextSkip・ItemTextSkipCode・ItemTextSource・ItemTextWords・ItemTextCorruption
- ItemTextBoost・parseItemText・CorruptionRow・corruptionRowsFor・matchCorruption・anointNotables・anointOfLine・StageTuning[シミュ]
- stageTuning[シミュ]・setStageTuning[シミュ/デザイン]・tunedCatalysingMultiplier[デザイン]・CATALYSING_PER_PCT[デザイン]・defaultWeightOf[エミュ]・OVERRIDDEN[エミュ]・SANCTIFY_MIN[デザイン]・SANCTIFY_MAX[デザイン]
- fillModText[エミュ/デザイン]・jaUniqueText・tagLabel[デザイン]・mulberry32[エミュ/シミュ/チュートリアル/モンキー]・RUNE_BY_ID[エミュ]・inAny[エミュ]・baseCatalog[エミュ/シミュ]・jaOfOmen[エミュ]
- runeNameOf[エミュ]・RUNE_PREFIX[エミュ]・hasExtraCatalyst[エミュ]・stageRuneIds[エミュ]・reqOfItem[エミュ]・planSpec[エミュ]・aimLabel[エミュ/チュートリアル]・groupLabelOf[エミュ]
- DamageKind[エミュ/チュートリアル]・Defender[エミュ/チュートリアル]・Outcome[エミュ/チュートリアル]・baseArt[エミュ/シミュ/チュートリアル]・isSanctifySet[エミュ]・IMPLICIT_SET[エミュ]・isCatalystSet[エミュ]・isQualitySet[エミュ]
- QUALITY_CAP[エミュ]・qualityFieldMax[エミュ]・SANCTIFIED_REASON[エミュ]・ITEM_LEVEL_SET[エミュ]・qualityLabelOf[チュートリアル]・boostedMod[チュートリアル]・skillIcon[チュートリアル]・shownTags[チュートリアル]
- TAG_STYLE[チュートリアル]・SHARDS_PER_ORB[チュートリアル]

### エミュだけ engine-emu.ts (35)
- UsePreview・previewUse[エミュ]・weightOverrideNote[エミュ]・RaceRow[エミュ]・RaceStats・SharedRace[エミュ]・raceOne[エミュ]・packRace[エミュ]
- unpackRace[エミュ]・RaceTarget[エミュ]・RoutePrep[エミュ]・RouteRun[エミュ]・routeHitIndex[エミュ]・unsocketKey[エミュ]・PobStat[エミュ]・routeRunesFor[エミュ]
- routeSocketsOf[エミュ]・runePrep[エミュ]・tierIdOf[エミュ]・monsterAccuracy[エミュ]・SpamStats[エミュ]・medianOf[エミュ]・rankOf[エミュ]・unluckyOf[エミュ]
- baseArtFile[エミュ]・sanctifySetKey[エミュ]・forcesOf[エミュ]・spamKey[エミュ]・catalystSetKey[エミュ]・implicitSetKey[エミュ]・qualityCapKey[エミュ]・qualitySetKey[エミュ]
- qualityCapOf[エミュ]・itemLevelKey[エミュ]・REVEAL[エミュ]

### シミュだけ engine-sim.ts (35)
- catalystTagOf[シミュ]・catalystFull[シミュ]・fillCatalyst[シミュ]・MagicAddOdds・AddGrade・magicAddOdds・anyOfAddOdds[シミュ]・addGradeFor[シミュ]
- ADD_GRADES・SpamCounts[シミュ]・SpamTarget・spamCounts[シミュ]・StepOutcome・stepOutcomes[シミュ/解析]・stepOutcomesOrTooMany[モンキー]・STEP_OUTCOMES_MAX
- essenceNameEn[チュートリアル]・headingHits[チュートリアル]・NEGATIVE_WORDS[チュートリアル]・ALL_OMEN_SPECS[チュートリアル]・factionCandidates[チュートリアル]・armourReduction[チュートリアル]・esTimeline[チュートリアル]・attackRow[チュートリアル]
- deflectChance[チュートリアル]・evadeChance[チュートリアル]・KIND_COLOR[チュートリアル]・KIND_JA[チュートリアル]・layersOf[チュートリアル]・TierMod・fractureStart[シミュ]・placeMods[シミュ/モンキー]
- goalBlock[シミュ]・CarriedAims・carryAims[シミュ]

## データのファイルを直に読んでいる部 (ジン・共通の外、台本で数えた)
- package.json: アプリ/エミュ/デザイン
- src/components/items/fam-glow.json: デザイン
- src/data/base-info.json: デザイン
- src/data/flow-seed.json: アプリ
- src/data/granted-skills.json: デザイン
- src/data/mtx-poe1-in-poe2.json: スキン
- src/data/popular-bases.json: デザイン
- src/data/stat-order.json: デザイン
- src/i18n/augment-kinds.json: アプリ
- src/i18n/gems-client.json: アプリ
- src/i18n/inherent-skills.json: アプリ
- src/i18n/items-ja-client.json: アプリ/チュートリアル
- src/i18n/items-ja.json: アプリ
- src/i18n/mod-tier-and-group.json: アプリ
- src/i18n/mods-bundle.json: アプリ
- src/i18n/passives-ja-client.json: アプリ/デザイン
- src/i18n/poe2-flavour-ja.json: アプリ
- src/i18n/trade2-stat-mapping.json: アプリ
- src/i18n/unique-mods-ja.json: アプリ
- src/i18n/unique-names-ja.json: アプリ
- src/services/htc/essence-keys.json: デザイン
- src/services/htc/extra-bases.json: モンキー
- src/services/htc/jewel-bases.json: モンキー
- src/services/htc/price-keys.json: デザイン
- src/vendor/poe2htc/data/base_items.json: モンキー
- src/vendor/poe2htc/data/essences.json: デザイン
- src/vendor/poe2htc/data/mods.json: モンキー
- src/views/skins/groups.json: スキン
