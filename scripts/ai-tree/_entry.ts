/**
 * _entry.ts — AI 自動ツリー (S-170) が束ねる入口。打つのも読むのもエンジンの入口 (engine.ts) だけ (S-171)。
 * 指名の手 (forceKey・makeStageMod・withMod) はわざと出さない (S-173)
 */
export { loadPatch } from "../../tests/helpers/patch";
export { pricesForBase } from "../../src/vendor/poe2htc/optimizer/cost";
export {
  startFrom, applyCurrency, useReason, omensAllowedFor, omenBlock, revealOffers, unrevealedOf, mulberry32,
  allMods, listOf, limitOf, tierIndexOf, tierRankOf, aimHits, heldOdds, modListFor, htcBaseInfo,
  PRICE_KEYS, ESSENCE_KEYS, runeOf, isRune,
} from "../../src/services/craft-stage/engine";
