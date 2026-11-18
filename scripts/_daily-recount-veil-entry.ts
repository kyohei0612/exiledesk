/**
 * _daily-recount-veil-entry.ts — 冒涜・発現の直し (S-35 ad7e0de00・S-33h 18204f43e、0.1.757) で今日のお題の提出を数え直す口 (デイリー部長、11-18)。
 * 16:00 の検算と同じ runCost (打ち方から組み直して 100 人、同じ種・同じ相場の写し) をそのまま呼ぶだけ。
 * _daily-recount-veil.mjs が、この入口を今の src と 0.1.756 の src (git archive の写し) の両方で束ねて、同じ提出の前後を出す。
 */
export { loadPatchSync } from "./_htc-bridge-entry";
export { runCost, topicPrice, perBoxOn, RUN_N } from "../src/views/daily/daily-cost";
export { qualityOfSnap } from "../src/views/daily/daily-quality";
