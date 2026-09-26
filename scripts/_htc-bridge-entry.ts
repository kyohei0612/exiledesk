/**
 * _htc-bridge-entry.ts — check-htc-bridge.mjs が束ねるための入口 (2026-09-22)
 *
 * アプリ側の patch.ts は動的 import なので、検算では同期に読める入口を別に用意する。
 * 束ねるのは esbuild なので JSON はそのまま import できる。
 *
 * **重ね方は patch.ts の `applyExtras` を借りる。**ここに書き写すと、クライアント由来の追加分を
 * アプリと検算で別々に扱うことになり、検算が通っても本番で繋がらない事態が起きる。
 */
import { indexPatch } from "../src/vendor/poe2htc/engine/indexPatch";
import type { PatchData } from "../src/vendor/poe2htc/engine/types";
import { applyExtras } from "../src/services/htc/patch";
import mods from "../src/vendor/poe2htc/data/mods.json";
import bases from "../src/vendor/poe2htc/data/base_items.json";
import extra from "../src/services/htc/extra-bases.json";

export { matchKey } from "../src/services/htc/bridge-index";
export { bridgeMods, classOfBase, itemBaseFor, baseForSolving, sideLimits } from "../src/services/htc/bridge";
export { buildHtcPrices } from "../src/services/htc/prices";
export { htcBaseInfo, htcBaseLimits, htcModTags, loadHtcPatch, htcPatchExtras } from "../src/services/htc/patch";
export { whiteItem } from "../src/vendor/poe2htc/engine/item";
export { indexPrices, pricesForBase, stepOmenIds, cheapestEssenceLevel, stepCost } from "../src/vendor/poe2htc/optimizer/cost";
export { planExpectedCost } from "../src/vendor/poe2htc/optimizer/cost";
export { tradeFiltersFor, buildFinishedQuery, tradeCategoryOf, buyOrCraft } from "../src/services/htc/buy-or-craft";
export { labelOfAction, labelOfStep, jaOfPriceKey, jaOfOmen } from "../src/services/htc/labels";
export { craftedSurvey, isCraftedMod, ASTRID_RUNE } from "../src/services/htc/craft-slots";
export { htcDropOnly, htcModSides } from "../src/services/htc/patch";
export { parseJaItem, targetsFor } from "../src/services/htc/paste";
export { baseChoices } from "../src/services/htc/base-choice";
export { jaOfMod, jaOfModLine } from "../src/services/htc/mod-text";
export { isPlaceholderWeight, applyWeightOverrides, WEIGHT_OVERRIDE_NOTE } from "../src/services/htc/weight-overrides";
export { treeBuys, treeBuyQuery, fracturedBuys, STRICT_PREFIX, STRICT_SUFFIX } from "../src/services/htc/tree-buy";
export { decide, candidateOf, batchFor, BATCH_TARGET } from "../src/services/htc/tree-decide";
export { selfFracture, expectedAnnuls, itemsFor, FRACTURE_NEEDS } from "../src/services/htc/self-fracture";
export { catalysingOdds, catalysingMultiplier, catalysingBand, CATALYSING_SAMPLES, CATALYSING_CAVEAT, catalysingSetup, withCatalysing, catalystCountFor, catalystPriceKey, maxQualityForBase, QUALITY_PER_CATALYST } from "../src/services/htc/catalysing";
export { exaltProbability } from "../src/vendor/poe2htc/engine/probability";
export { CATALYSTS, catalystsFor, hasCatalysts, boostedBy, displayedValue, rawValue, rawValueOfMod, catalystTagFromLabel, BASE_MAX_QUALITY, RAISED_MAX_QUALITY, INFUSER_OVER_QUALITY, ABSOLUTE_MAX_QUALITY } from "../src/services/htc/quality";
export { markovFromItem } from "../src/vendor/poe2htc/optimizer/markovFromItem";
export { listMods, parseItemText } from "../src/vendor/poe2htc/engine/index";
export { marketStore } from "../src/state/market-store";
export { setDisplayCurrency, displayCurrency } from "../src/state/display-currency";
export { default as priceKeys } from "../src/services/htc/price-keys.json";
export { default as essenceKeys } from "../src/services/htc/essence-keys.json";

export function loadPatchSync(): PatchData {
  const data = indexPatch(
    mods as unknown as Parameters<typeof indexPatch>[0],
    bases as unknown as Parameters<typeof indexPatch>[1],
  );
  return applyExtras(data, extra as unknown as Parameters<typeof applyExtras>[1]);
}
export { stepHelpers } from "../src/services/htc/step-odds";
export { jaOfPastedLine } from "../src/services/htc/mod-text";
export { simulateTree, simHelpers } from "../src/services/htc/sim-route";
export { socketCountFor, socketBlock, effectiveSocket, withSocketLimits, craftedLimitWith, socketCostOf, socketLabel, socketsMinFor, artificerCount, ARTIFICER_KEY, SERLE_RUNE } from "../src/services/htc/sockets";
export { runeIdByName, runePriceKey } from "../src/vendor/poe2htc/engine/runes";
export { mulberry32 } from "../src/services/htc/rng";
export { TREE_PRESETS } from "../src/views/htc-craft/tree-presets";
export { startKindOf } from "../src/views/htc-craft/start-kind";
export { autoTree, chaosSideFor } from "../src/views/htc-craft/tree-auto";
export { pickAutoTree } from "../src/views/htc-craft/auto-pick";
export { planByRedoCost } from "../src/views/htc-craft/redo-cost";
