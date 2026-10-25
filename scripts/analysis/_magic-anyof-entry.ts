/**
 * _magic-anyof-entry.ts — check-magic-anyof.mjs が束ねる入口 (解析君、2026-10-22)
 */
export { loadPatch } from "../../tests/helpers/patch";
export { applyCurrency, startFrom, mulberry32, sideOfMod } from "../../src/services/craft-stage/engine";
export { spamCounts } from "../../src/services/simulator/sim-engine";
export { magicAddOdds, anyOfAddOdds, addGradeFor } from "../../src/services/simulator/sim-engine";
export { addOddsBySpec } from "../../src/services/craft-stage/engine";
export { blankWith, fractureOdds } from "../../src/services/simulator/sim-odds";
export { magicLoopCounts } from "../../src/services/simulator/sim-greater";
