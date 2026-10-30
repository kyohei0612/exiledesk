/**
 * _entry.ts — AI 自動ツリー (S-170) が束ねる入口。打つのも読むのもエンジンの入口 (engine.ts) だけ (S-171)。
 * 指名の手 (forceKey・makeStageMod・withMod) はわざと出さない (S-173)
 */
export { loadPatch } from "../../tests/helpers/patch";
export { pricesForBase } from "../../src/vendor/poe2htc/optimizer/cost";
export {
  startFrom, applyCurrency, useReason, omensAllowedFor, omenBlock, revealOffers, unrevealedOf, mulberry32,
  allMods, listOf, limitOf, tierIndexOf, tierRankOf, aimHits, heldOdds, modListFor, htcBaseInfo,
  PRICE_KEYS, ESSENCE_KEYS, RUNES, runeOf, isRune, stageRuneIds,
} from "../../src/services/craft-stage/engine";
// 棚の正 (E-28・E-29) と、一緒に掛けられないお告げの組。engine.ts が出していない物だけ元から読む (読むだけ)
export { ORBS } from "../../src/state/for-share/craft-stage-shelf";
export { OMEN_EXCLUSIVE } from "../../src/services/craft-stage/omens";
