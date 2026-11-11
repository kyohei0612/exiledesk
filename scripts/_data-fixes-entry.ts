/**
 * _data-fixes-entry.ts — check-data-fixes.mjs が束ねる入口 (E-06)。データは画面と同じ applyExtras を通した物
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { fixMisses } from "../src/services/htc/fix-misses";
