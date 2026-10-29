/**
 * engine.ts — エンジンの核の入口 (2026-10-20 オーナー「エンジンの核」。案は docs/org/emulator/notes/engine-entry.md)。
 *
 * どの画面 (エミュ・シミュ・チュートリアル・解析君) も、MOD の置き場・重み・段・文、カレンシーとお告げの効果、確率、品質・聖別の式をここから取る (自前の表・式・重みの足し算を作らない)。
 * 画面はエンジンの関数を何でも直接呼んでよい (オーナー 10-25 夜)。ここはよく使う名前の束 (中身は元のファイル)。どこからも使われない名前は 10-26 に外した。
 * シミュだけ・エミュだけの物は 2026-10-26 にエンジンから出した (オーナー「全部それシミュに渡して削除してくれ」): src/services/simulator/sim-engine.ts・sim-engine/、
 * src/services/emulator/emu-engine.ts・emu-engine/。エンジン (craft-stage) はそれらを読まない (見張り check-engine-entry の C)。型は export type、関数は名前ごとに並べ、
 * `export *` の束ねを作らない (ワーカーのバンドルに要らない物を引き込まないため)。
 */

// 形 (型)
export type { StageItem, StageMod, StageSide, StageApply } from "./types";
export type { PlayedStep } from "./run-plan";
export type { CraftStagePlan } from "./contract";
export type { PatchData, Mod } from "../../vendor/poe2htc/engine/types";
export type { Force } from "./stage-core";
export type { PobBlock } from "./stage-pob";

// アイテムを作る・打つ
export { freshItem, startFrom, playPlan, splitOmens } from "./run-plan";
// omensAllowedFor = その手に付けられるお告げ (骨には後の発現の反響も)
// useReason = その手が今打てない理由 (打てるなら null。乱数で決まる物は打てる扱い。クラフト台とシミュの棚の同じ判定)
export { applyCurrency, kindOf, omensFor, omensAllowedFor, useReason } from "./apply-currency";
export { revealOffers, unrevealedOf } from "./apply-desecrate";
// revealPool = 今の未発現の枠の発現に出うる MOD と段 (シミュの発現の MOD の窓の灰色、S-38)
export { revealPool } from "./spec/parts-unrevealed";
// そのお告げを今掛けられるか (掛けると打てない・意味が無いお告げの理由。棚のお告げの欄の灰色、棚は共通の部品なので核)
export { omenBlock } from "./omen-block";

// アイテムの今を読む
export { allMods, listOf, room, limitOf, effectiveCls, maxQualityOf, catalystOf, SIDES, sideOfMod, unfracturable } from "./stage-core";
// MOD を段から作る (数値の決め方は rng)・アイテムに MOD を足した形 (withMod)・そのカタリストがその MOD を伸ばすか
export { makeStageMod, withMod, catalystBoosts } from "./stage-core";
// ソケットの上限・白の時からあるソケットの数 (規格外。エミュの新品とツリーのスタートが同じ数で始める)
export { socketCapOf, baseSocketsOf } from "./stage-runes";
export { dpsText } from "./stage-pob";
export { DEF } from "./defence";

// 置き場・重み・段
export { loadHtcPatch, htcBaseInfo } from "../htc/patch";
export { candidates } from "./stage-core";
export { modTierWeight, CRAFTED_SOURCES, familiesOf } from "../../vendor/poe2htc/engine/pool";
export { CURRENCY_FLOOR } from "../../vendor/poe2htc/engine/types";
// 段の下限 (カオスを含む。CURRENCY_FLOOR にカオスは無い)
export type { Strength as OrbStrength } from "./spec/orb-specs";
export { orbFloor } from "./spec/orb-specs";
export { familyBlocked, occupiedKeysOf } from "../mods/mod-rules";
// MOD の一覧の行 (段に数の tier)
export type { ListRow, ListTier, ModGroup } from "./mod-list";
export { modListFor } from "./mod-list";
export { tierDisplayRanges } from "../mods/stat-scale";
export { inGroup } from "../mods/item-classes";
export { classLabel } from "../items/base-catalog";

// 1 手の確率 (addHitOdds = 1 回で狙いが付く割合、fractureHit = フラクチャーの当たり)
export type { OddsTarget } from "./spec/odds";
export { addOddsBySpec, addHitOdds, hitShare, fractureHit } from "./spec/odds";
export type { RouteKind, Grade as RouteGrade, Grade } from "./route-race";
// スパムの道の打ち手 (増強・カオス・高貴の 1 人分。シミュの spam-counts とエミュのスパムシミュが同じ打ち方)
export { routeRun, routeKey, GRADE_KEY } from "./route-race";
// 解析君の頼み (K4): 系統の塞ぎ・古の骨の段の下限・発現の手 (候補の数は REVEAL_SPEC.actions の reveal.offers)
export { occupiedFamiliesOf } from "../../vendor/poe2htc/engine/pool";
export { ANCIENT_BONE_FLOOR } from "../../vendor/poe2htc/engine/probability";
export { REVEAL_SPEC } from "./spec/desecrate-specs";
// 指名で付ける手の鍵 (force:<modId>|<段>|<印>。印 n = 普通・f = フラクチャー・e = エッセンス・d = 冒涜)
export type { ForceFlag } from "./apply-force";
export { forceKey } from "./apply-force";
// 持った瞬間の % (クラフト台の MOD 一覧と同じ) と狙う
export type { HeldOdds } from "./held-odds";
export { heldOdds, heldAnyOf, aimTierKey } from "./held-odds";
export type { AimTarget, AimCombo, AimOdd, AimHitOpts } from "./aim-odds";
// aimHits = その MOD が狙い (段の番号以上) に当たるか (sameText = 同じ系統で文も同じ別の modId も当たり)
export { aimCombos, aimChain, aimDone, hits as aimHits } from "./aim-odds";
// 段の換算 (段の番号 ↔ 段の名前の T・狙いが全部付く一番低いアイテムレベル・段の札の文字)
export { tierIndexOf, tierRankOf, minIlvlFor, tierRankLabel, cardTierName, craftedKindOf } from "./tier-rank";
export { DESECRATION_EXCLUSIVE_COUNT } from "../../vendor/poe2htc/engine/probability";

// 名簿
export { OMEN_FOR } from "./omens";
export { RUNES, runeOf, isRune, runeEffectFor } from "./stage-runes";
export { withRunes, runeIdByName } from "../../vendor/poe2htc/engine/runes";
export { ESSENCE_KEYS } from "../htc/essence-key-table";
// データの表をそのまま (棚の並び・名前。中身は元の JSON、10-25 データの窓口揃え。目録 docs/org/emulator/data-catalog.md)
export { default as PRICE_KEYS } from "../htc/price-keys.json";
export { default as ESSENCE_TABLE } from "../../vendor/poe2htc/data/essences.json";
export { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
export { CATALYSTS } from "../htc/quality";
export { isEmotion } from "./apply-emotion";
export { isShard } from "./apply-act";
export { isGem } from "./stage-bases";

// MOD の値の上乗せ (品質・側の効果・聖別) の一覧 (J8、MOD の数字は素の値で出す。画面はこれを呼ぶだけ)
export { modBoostsOf } from "./boosts";

// 使う人が決める設定 (触媒の高貴の品質 1% ごとの倍率・聖別の倍率。null = 既定。打つ処理と確率の表が同じ値を読む)
export type { StageTuning } from "./stage-tuning";
export { stageTuning, setStageTuning, tunedCatalysingMultiplier, CATALYSING_PER_PCT, defaultWeightOf } from "./stage-tuning";
// 重みを推定で埋めた MOD の印 (MOD 一覧の重みの札。一覧は共通の部品なので核)
export { OVERRIDDEN } from "../htc/weight-overrides";
// 聖別の数値の下限・上限 (棚のお告げの下の設定・聖別の帯)
export { SANCTIFY_MIN, SANCTIFY_MAX } from "./apply-vaal";
// 文
export { fillModText } from "../htc/mod-text";
export { tagLabel } from "../mods/tag-ja";

// 乱数 (どの部も同じ乱数)
export { mulberry32 } from "../htc/rng";

// エミュの画面が読んでいた物 (2026-10-23 エンジンの仕分け、付け替えの対応表 docs/org/emulator/notes/2026-10-23-emu-import-map.md)
export { RUNE_BY_ID } from "../../vendor/poe2htc/engine/runes";
export { inAny } from "../mods/item-classes";
export { baseCatalog } from "../items/base-catalog";
export { jaOfOmen } from "../htc/game-names";
export { runeNameOf, RUNE_PREFIX } from "./stage-runes";
export { hasExtraCatalyst, stageRuneIds } from "./stage-core";
export { reqOfItem } from "./stage-bases";
export { planSpec } from "./spec/run-spec";
export { aimLabel, groupLabelOf } from "./mod-list";
export type { DamageKind, Defender, Outcome } from "./defence";
export { isSanctifySet } from "./apply-vaal";
export { IMPLICIT_SET, isCatalystSet, isQualitySet, QUALITY_CAP, qualityFieldMax, SANCTIFIED_REASON, ITEM_LEVEL_SET } from "./apply-currency";

// シミュ・チュートリアル・解析が読んでいた物 (2026-10-23 エンジンの仕分け、付け替えの対応表 docs/org/emulator/notes/2026-10-23-sim-import-map.md)
export { qualityLabelOf } from "../htc/quality";
export { boostedMod } from "./stage-core";
export { shownTags, TAG_STYLE } from "./mod-list";
export { SHARDS_PER_ORB } from "./apply-act";
