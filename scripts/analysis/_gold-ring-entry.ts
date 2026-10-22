/**
 * _gold-ring-entry.ts — gold-ring-suffix-ev.mjs が束ねる入口 (解析君、2026-10-21)。打つのはエンジンの入口 (engine.ts) だけ
 */
export { loadPatch } from "../../tests/helpers/patch";
export { startFrom, applyCurrency, catalystOf, maxQualityOf, mulberry32, candidates, modTierWeight, CATALYSTS, orbFloor, htcBaseInfo, socketCapOf, revealOffers } from "../../src/services/craft-stage/engine";
// 入口 (engine.ts) に無い物。始めの形 (重み 0 の創生の樹のスペルダメージをフラクチャー済みで置く) を作るためだけに使う
export { makeStageMod, withMod } from "../../src/services/craft-stage/engine";
