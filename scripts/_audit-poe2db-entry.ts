/**
 * _audit-poe2db-entry.ts — audit-poe2db.mjs が束ねる入口 (2026-10-09)。データはアプリと同じ applyExtras を通した物
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { baseCatalog } from "../src/services/items/base-catalog";
export { jaOfMod } from "../src/services/htc/mod-text";
