/**
 * _daily-quality-check-entry.ts — 品質のお題 (D-03d) のセルフチェック用に束ねる入口 (デイリー部長 25、11-15)。読むだけ・どこにも書かない。
 * 呼ぶのは scripts/_daily-quality-check.mjs
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { runCost, topicPrice, unmetDone, qualityShort, qualityMet, metBoxes } from "../src/views/daily/daily-cost";
export { fillTopicDoc } from "../src/views/daily/daily-aims";
export { rebuildTree } from "../src/views/simulator/tree/tree-rebuild";
export { healRecipeV1 } from "../src/services/simulator/tree/tree-recipe-v1";
export { sampleOf } from "../src/services/simulator/tree/tree-sample";
