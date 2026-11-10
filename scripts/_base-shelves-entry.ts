/**
 * _base-shelves-entry.ts — check-base-shelves.mjs が束ねる入口 (E-98)。データはアプリと同じ applyExtras を通した物
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { baseCatalog, CATALOG_ROWS, isRemovedBase } from "../src/services/items/base-catalog";
export { htcBaseInfo } from "../src/services/htc/patch";
export { classOfBase } from "../src/services/htc/bridge";
