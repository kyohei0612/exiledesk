# シミュ・チュートリアル・解析の直読みの付け替えの対応表 (2026-10-23、ジン部長 6 本目)

エンジンを核 / engine-emu/ / engine-sim/ に分け切った後 (809039db)、シミュ・チュートリアル・解析の物が入口を通さずエンジンの中を読んでいる 96 行 (見張りの A)。
名前は窓口にもう全部ある (他の側も使う物は engine.ts、シミュ側だけの物は engine-sim.ts)。付け替えはシミュ部長 (チュートリアル含む)・解析君がそれぞれの持ち物で。付け替えたら `node scripts/check-engine-entry.mjs --head --write` で控えを取り直す。

- 仕分けは名前ごとに「シミュ側以外 (エミュ・核・共通・デザイン・アプリ) の import の行に出てくるか」で分けた (コメントの名前は数えない)。シミュ側だけの名前: 防御の計算のチュートリアル用 (armourReduction・esTimeline・attackRow・deflectChance・evadeChance・KIND_COLOR・KIND_JA・layersOf)・factionCandidates・ALL_OMEN_SPECS・NEGATIVE_WORDS・splitOmens・dpsText (後ろ 2 つは engine.ts に元からある)。
- 多いのは旧シミュの recipe-sim・recipe-pattern-run・quiz-*・sim-methods・pattern (死蔵の一覧に載っている物は、消すなら付け替え不要)。

## 対応表
| ファイル | 今の import 先 | engine.ts から | engine-sim.ts から | 窓口に無い |
|---|---|---|---|---|
| services/simulator/auto/auto-order.worker.ts | ../../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/simulator/pattern.ts | ../../vendor/poe2htc/engine/runes | runeIdByName |  |  |
| services/simulator/pattern.ts | ../craft-stage/stage-runes | RUNES |  |  |
| services/simulator/quiz-build.ts | ../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/simulator/quiz-build.ts | ../craft-stage/types | StageItem, StageSide |  |  |
| services/simulator/quiz-build.ts | ../craft-stage/stage-core | Force |  |  |
| services/simulator/quiz-build.ts | ../../vendor/poe2htc/engine/pool | CRAFTED_SOURCES |  |  |
| services/simulator/quiz-recipe.ts | ../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/simulator/quiz-recipe.ts | ../craft-stage/types | StageItem, StageMod, StageSide |  |  |
| services/simulator/quiz-recipe.ts | ../craft-stage/apply-currency | applyCurrency |  |  |
| services/simulator/quiz-recipe.ts | ../craft-stage/apply-desecrate | revealOffers |  |  |
| services/simulator/quiz-recipe.ts | ../craft-stage/stage-core | catalystOf, limitOf, listOf, maxQualityOf, SIDES, type Force |  |  |
| services/simulator/quiz-recipe.ts | ../craft-stage/run-plan | freshItem, startFrom |  |  |
| services/simulator/quiz-recipe.ts | ../htc/rng | mulberry32 |  |  |
| services/simulator/recipe-defs.ts | ../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/simulator/recipe-defs.ts | ../craft-stage/types | StageItem, StageMod, StageSide |  |  |
| services/simulator/recipe-defs.ts | ../htc/essence-key-table | ESSENCE_KEYS |  |  |
| services/simulator/recipe-pattern-run.ts | ../../vendor/poe2htc/engine/types | CURRENCY_FLOOR |  |  |
| services/simulator/recipe-pattern-run.ts | ../craft-stage/apply-desecrate | unrevealedOf |  |  |
| services/simulator/recipe-pattern-run.ts | ../craft-stage/stage-core | allMods, limitOf, listOf, room |  |  |
| services/simulator/recipe-pattern-run.ts | ../craft-stage/types | StageItem, StageMod, StageSide |  |  |
| services/simulator/recipe-sim.ts | ../../vendor/poe2htc/optimizer/cost | essenceLevelOf |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/apply-currency | applyCurrency |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/apply-desecrate | revealOffers, unrevealedOf |  |  |
| services/simulator/recipe-sim.ts | ../htc/rng | mulberry32 |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/run-plan | freshItem, startFrom |  |  |
| services/simulator/recipe-sim.ts | ../../vendor/poe2htc/engine/runes | runeIdByName |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/stage-runes | RUNES |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/stage-core | allMods, listOf, room |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/types | StageItem, StageMod, StageSide |  |  |
| services/simulator/recipe-sim.ts | ../craft-stage/contract | CraftStagePlan |  |  |
| services/simulator/sim-methods.ts | ../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/simulator/sim-methods.ts | ../craft-stage/run-plan | freshItem |  |  |
| services/simulator/sim-methods.ts | ../craft-stage/stage-core | limitOf |  |  |
| services/tutorial/compare.ts | ../craft-stage/types | StageItem |  |  |
| services/tutorial/compare.ts | ../craft-stage/stage-core | allMods |  |  |
| services/tutorial/craft-courses.ts | ../craft-stage/types | StageItem |  |  |
| services/tutorial/quiz-tutorial-run.ts | ../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/tutorial/quiz-tutorial-run.ts | ../craft-stage/types | StageItem, StageMod |  |  |
| services/tutorial/quiz-tutorial-run.ts | ../craft-stage/apply-currency | applyCurrency |  |  |
| services/tutorial/quiz-tutorial-run.ts | ../craft-stage/apply-desecrate | revealOffers |  |  |
| services/tutorial/quiz-tutorial-run.ts | ../htc/rng | mulberry32 |  |  |
| services/tutorial/topic-courses-adv.ts | ../craft-stage/stage-core | Force |  |  |
| services/tutorial/topic-courses-guide.ts | ../craft-stage/stage-core | Force |  |  |
| services/tutorial/topic-courses.ts | ../../vendor/poe2htc/engine/types | PatchData |  |  |
| services/tutorial/topic-courses.ts | ../craft-stage/types | StageItem |  |  |
| services/tutorial/topic-courses.ts | ../craft-stage/stage-core | Force |  |  |
| services/tutorial/topic-steps.ts | ../craft-stage/types | StageItem |  |  |
| state/tutorial/craft-course.ts | ../../services/craft-stage/run-plan | startFrom |  |  |
| state/tutorial/craft-course.ts | ../../services/htc/rng | mulberry32 |  |  |
| state/tutorial/craft-course.ts | ../../services/craft-stage/stage-core | Force |  |  |
| state/tutorial/craft-lesson.ts | ../../services/craft-stage/run-plan | freshItem, startFrom |  |  |
| state/tutorial/craft-lesson.ts | ../../services/craft-stage/apply-currency | applyCurrency, omensFor |  |  |
| state/tutorial/craft-lesson.ts | ../../services/htc/rng | mulberry32 |  |  |
| state/tutorial/craft-lesson.ts | ../../services/craft-stage/types | StageItem |  |  |
| state/tutorial/craft-lesson.ts | ../../services/craft-stage/stage-core | catalystBoosts |  |  |
| state/tutorial/craft-lesson.ts | ../../services/craft-stage/apply-desecrate | revealOffers, unrevealedOf |  |  |
| state/tutorial/craft-topic.ts | ../../services/craft-stage/run-plan | splitOmens |  |  |
| views/simulator/StageRecipesPage.vue | ../../services/craft-stage/base-art | baseArt |  |  |
| views/tutorial/StageCourseGuide.vue | ../../services/craft-stage/mod-list | aimLabel |  |  |
| views/tutorial/StageCourses.vue | ../../services/craft-stage/run-plan | freshItem |  |  |
| views/tutorial/StageTopicGuide.vue | ../../services/craft-stage/mod-list | aimLabel, modListFor |  |  |
| views/tutorial/StageTopicGuide.vue | ../../services/craft-stage/spec/parts |  | factionCandidates |  |
| views/tutorial/StageTopicGuide.vue | ../../services/craft-stage/stage-core | allMods, boostedMod, catalystOf |  |  |
| views/tutorial/StageTopicGuide.vue | ../../services/htc/quality | qualityLabelOf |  |  |
| views/tutorial/StageTopicGuide.vue | ../../services/craft-stage/spec/run-spec |  | ALL_OMEN_SPECS |  |
| views/tutorial/StageTopicGuide.vue | ../../services/craft-stage/run-plan | freshItem |  |  |
| views/tutorial/StageTopicGuide.vue | ../../services/craft-stage/types | StageMod |  |  |
| views/tutorial/VideoArmour.vue | ../../services/craft-stage/defence | DEF | armourReduction |  |
| views/tutorial/VideoBases.vue | ../../services/craft-stage/defence | DEF |  |  |
| views/tutorial/VideoCompare.vue | ../../services/craft-stage/run-plan | playPlan |  |  |
| views/tutorial/VideoCompare.vue | ../../services/craft-stage/stage-core |  | NEGATIVE_WORDS |  |
| views/tutorial/VideoCompare.vue | ../../services/craft-stage/contract | CraftStagePlan |  |  |
| views/tutorial/VideoCompare.vue | ../../services/craft-stage/stage-pob | dpsText, type PobBlock |  |  |
| views/tutorial/VideoDps.vue | ../../services/craft-stage/stage-pob | PobBlock |  |  |
| views/tutorial/VideoDps.vue | ../../services/craft-stage/stage-pob | dpsText |  |  |
| views/tutorial/VideoDps.vue | ../../services/craft-stage/skill-art | skillIcon |  |  |
| views/tutorial/VideoEs.vue | ../../services/craft-stage/defence | DEF | esTimeline |  |
| views/tutorial/VideoEvasion.vue | ../../services/craft-stage/defence | DEF | attackRow, deflectChance, evadeChance |  |
| views/tutorial/VideoHit.vue | ../../services/craft-stage/stage-pob | PobBlock |  |  |
| views/tutorial/VideoLayers.vue | ../../services/craft-stage/defence | type DamageKind, type Defender, type Outcome | KIND_COLOR, KIND_JA, layersOf |  |
| views/tutorial/VideoPob.vue | ../../services/craft-stage/stage-pob | PobBlock |  |  |
| views/tutorial/VideoPob.vue | ../../services/craft-stage/stage-pob | dpsText |  |  |
| views/tutorial/VideoPob.vue | ../../services/craft-stage/skill-art | skillIcon |  |  |
| views/tutorial/VideoStage.vue | ../../services/craft-stage/run-plan | PlayedStep |  |  |
| views/tutorial/VideoTiers.vue | ../../services/craft-stage/mod-list | shownTags, TAG_STYLE |  |  |
| views/tutorial/VideoTiers.vue | ../../services/craft-stage/base-art | baseArt |  |  |
| views/tutorial/VideoTray.vue | ../../services/craft-stage/types | StageItem |  |  |
| views/tutorial/VideoTray.vue | ../../services/craft-stage/apply-act | isShard, SHARDS_PER_ORB |  |  |
| views/tutorial/VideoTtk.vue | ../../services/craft-stage/stage-pob | PobBlock |  |  |
| views/tutorial/VideoTtk.vue | ../../services/craft-stage/stage-pob | dpsText |  |  |
| views/tutorial/use-video-hand.ts | ../../services/craft-stage/apply-desecrate | revealOffers |  |  |
| views/tutorial/use-video-hand.ts | ../../services/htc/rng | mulberry32 |  |  |
| views/tutorial/use-video-hand.ts | ../../services/craft-stage/apply-act | isShard |  |  |
| views/tutorial/use-video-hand.ts | ../../services/craft-stage/run-plan | PlayedStep |  |  |
| views/tutorial/use-video-hand.ts | ../../services/craft-stage/types | StageMod |  |  |
