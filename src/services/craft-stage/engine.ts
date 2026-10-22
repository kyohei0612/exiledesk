/**
 * engine.ts — エミュ部のエンジンの入口 (2026-10-20 オーナー「エミュ部 = エンジンの核」。案は docs/org/emulator/notes/engine-entry.md)。
 *
 * シミュ・チュートリアル・解析君は、MOD の置き場・重み・段・文、カレンシーとお告げの効果、確率、品質・聖別の式をここから取る (自前の表・式・重みの足し算を作らない)。
 * 足りない物はエミュ部長がここへ足す。ここは名前を並べるだけ (中身は元のファイル)。型は export type、関数は名前ごとに並べ、
 * `export *` の束ねを作らない (ワーカーのバンドルに要らない物を引き込まないため)。
 */

// 形 (型)
export type { StageItem, StageMod, StageSide, StageRarity, StageApply } from "./types";
export type { PlayedStep, StartSpec } from "./run-plan";
export type { CraftStagePlan } from "./contract";
export type { PatchData, ItemBase, Mod } from "../../vendor/poe2htc/engine/types";
export type { Force, Candidate, PoolOpts } from "./stage-core";
export type { PobBlock } from "./stage-pob";

// アイテムを作る・打つ
export { freshItem, startFrom, startItem, playStep, playPlan, runPlan, splitOmens } from "./run-plan";
export { applyCurrency, kindOf, omensFor } from "./apply-currency";
export { omenBlock } from "./omen-block";
export { revealOffers, unrevealedOf } from "./apply-desecrate";
// その手が打てるか (お告げ・触媒の前のカタリスト込み) と、手のお告げを今の手 / 続けて打つ発現に分ける (2026-10-22 シミュの自前の式を入口へ)
export type { UseSpec } from "./can-use";
export { canUse, handOmens, CATALYSING_OMEN } from "./can-use";

// アイテムの今を読む
export { allMods, listOf, room, limitOf, effectiveCls, maxQualityOf, catalystOf, SIDES, sideOfMod, unfracturable } from "./stage-core";
export { socketCapOf } from "./stage-runes";
export { dpsText } from "./stage-pob";
export { DEF } from "./defence";

// 置き場・重み・段
export { loadHtcPatch, htcBaseInfo, htcBaseLimits } from "../htc/patch";
export { classOfBase } from "../htc/bridge";
export { candidates } from "./stage-core";
export { modTierWeight, floorKeepIndex, CRAFTED_SOURCES, familiesOf } from "../../vendor/poe2htc/engine/pool";
export { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
// 段の下限 (カオスを含む。CURRENCY_FLOOR にカオスは無い)
export type { Strength as OrbStrength } from "./spec/orb-specs";
export { orbFloor, CHAOS_FLOOR } from "./spec/orb-specs";
export { familyBlocked, occupiedKeysOf } from "../mods/mod-rules";
export { modListFor } from "./mod-list";
export { tierDisplayRanges } from "../mods/stat-scale";
export { inGroup } from "../mods/item-classes";
export { isRemovedBase, classLabel } from "../items/base-catalog";

// 1 手の確率 (addHitOdds = 1 回で狙いが付く割合、fractureHit = フラクチャーの当たり)
export type { AddOdds, AddHit, OddsTarget } from "./spec/odds";
export { addOddsBySpec, addCands, addHitOdds, hitShare, fractureHit } from "./spec/odds";
// スパムの道 (増強・カオス・高貴) で始めのアイテムから狙いに着くまでの平均の使った物と着いた割合 (route-race の routeRun と同じ打ち方)
export type { SpamCounts, SpamTarget } from "./spam-counts";
export type { RouteKind, Grade as RouteGrade } from "./route-race";
export { spamCounts } from "./spam-counts";
// 解析君の頼み (K4): 系統の塞ぎ・古の骨の段の下限・発現の手 (候補の数は REVEAL_SPEC.actions の reveal.offers)
export { occupiedFamiliesOf } from "../../vendor/poe2htc/engine/pool";
export { ANCIENT_BONE_FLOOR } from "../../vendor/poe2htc/engine/probability";
export { REVEAL_SPEC } from "./spec/desecrate-specs";
// 1 手の行き先の一覧 (消える・付く・未発現・フラクチャーの枝ごとの割合と打った後のアイテム)
export type { StepOutcome } from "./spec/outcomes";
export { stepOutcomes } from "./spec/outcomes";
// 持っている物を打つ前に光らせる物 (変わる候補の MOD と付く空き。クラフト台とシミュの試し打ち、2026-10-22)
export type { UsePreview } from "./spec/preview";
export { previewUse } from "./spec/preview";
export type { HeldOdds } from "./held-odds";
export { heldOdds, heldAnyOf, aimTierKey } from "./held-odds";
export type { AimTarget, AimCombo, AimOdd, AimHitOpts } from "./aim-odds";
export { aimCombos, aimOdds, aimChain, aimDone, hits as aimHits, aimHeldOn, isAimMod, junkOf, heldSetOf } from "./aim-odds";
// 段の換算 (段の番号 ↔ 段の名前の T・狙いが全部付く一番低いアイテムレベル・段の札の文字。2026-10-22 シミュの自前の式を入口へ)
export { tierIndexOf, tierRankOf, tierNoOf, minIlvlFor, tierRankLabel } from "./tier-rank";
// 手の働き (足す・入れ替え・消す…) とカタリストを最大まで入れる (2026-10-22 シミュの自前の式を入口へ)
export type { CurrencyEffect } from "./hand-effect";
export { effectOf, catalystTagOf, catalystFull, fillCatalyst, catalystForMod } from "./hand-effect";
// MOD の無いマジックに 1 回足す時の候補の組 (どれか 1 つ) の付きやすさと等級の落とし方 (2026-10-22 シミュの start-cost の式を入口へ)
export type { MagicAddOdds, AddGrade } from "./magic-odds";
export { magicAddOdds, anyOfAddOdds, addGradeFor, ADD_GRADES } from "./magic-odds";
export { DESECRATION_EXCLUSIVE_COUNT, bossOmenAllowed, desecrationOmenForMod } from "../../vendor/poe2htc/engine/probability";

// 名簿
export { OMEN_FOR } from "./omens";
export { RUNES, runeOf, isRune, runeEffectFor } from "./stage-runes";
export { withRunes, runeIdByName } from "../../vendor/poe2htc/engine/runes";
export { ESSENCE_KEYS } from "../htc/essence-key-table";
export { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
export { CATALYSTS } from "../htc/quality";
export { isEmotion } from "./apply-emotion";
export { isShard } from "./apply-act";
export { isGem } from "./stage-bases";

// MOD の値の上乗せ (品質・側の効果・聖別) の一覧と割り戻し (J8、MOD の数字は素の値で出す。画面はこれを呼ぶだけ)
export type { BoostKind, ModBoost, ItemBoost } from "./boosts";
export { boostsOf, modBoostsOf, baseValueOf, unboost } from "./boosts";

// 貼り付けたアイテムの文を読む (トレード・poe.ninja・ゲームの Ctrl+C / Ctrl+Alt+C、日英。形は item-text-types.ts)
export type { ItemTextResult, ItemTextMod, ItemTextImplicit, ItemTextSkip, ItemTextSkipCode, ItemTextSource, ItemTextWords, ItemTextCorruption, ItemTextBoost } from "./item-text-types";
export { parseItemText } from "./item-text";
// コラプト (ヴァールのオーブ) で付く MOD の表 (poe2db の部位のページ。enchant = エンチャント、upgrade = 強まったコラプトの行)
export type { CorruptionRow } from "../mods/corruption";
export { corruptionRowsFor, matchCorruption } from "../mods/corruption";
// 注油 (アミュレットにノータブルを割り当てる) の一覧と、貼り付けの 1 行が注油か
export { anointNotables, anointOfLine } from "../mods/anoint";

// 使う人が決める設定 (触媒の高貴の品質 1% ごとの倍率・聖別の倍率。null = 既定。打つ処理と確率の表が同じ値を読む)
export type { StageTuning } from "./stage-tuning";
export { stageTuning, setStageTuning, tunedCatalysingMultiplier, CATALYSING_PER_PCT, defaultWeightOf } from "./stage-tuning";
// 重みを直せる MOD の印 (重みを推定で埋めた MOD = 仮置き 1 を CoE・借用で埋めた物)
export { OVERRIDDEN } from "../htc/weight-overrides";
export { SANCTIFY_MIN, SANCTIFY_MAX } from "./apply-vaal";

// 文
export { fillModText } from "../htc/mod-text";
export { jaUniqueText } from "../mods/unique-mod-ja";
export { tagLabel } from "../mods/tag-ja";

// 乱数 (どの部も同じ乱数)
export { mulberry32 } from "../htc/rng";
