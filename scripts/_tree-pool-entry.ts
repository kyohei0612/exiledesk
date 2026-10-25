/**
 * _tree-pool-entry.ts — check-tree-pool.mjs が束ねる入口 (シミュ部長 25 本目、2026-10-25)。ツリーの回し (tree-run) と、照らしのエンジンの割合 (_monkey-engine-entry の oddsOf・untilOf)
 */
export { loadPatch } from "../tests/helpers/patch";
export { runTree } from "../src/services/simulator/tree/tree-run";
export { load, oddsOf, untilOf } from "./_monkey-engine-entry";
