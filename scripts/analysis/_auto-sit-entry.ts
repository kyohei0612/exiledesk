/**
 * _auto-sit-entry.ts — check-auto-sit.mjs が束ねる入口 (解析君、2026-10-20 K2c)
 */
export * from "./_auto-order-entry";
export { whenOf } from "../../src/services/simulator/auto/auto-rules";
export { situationOf, ruleFor, applyQuizAction, routeDone } from "../../src/services/simulator/quiz-recipe";
export { startFrom, mulberry32 } from "../../src/services/craft-stage/engine";
export { Shape, actionsOf } from "../../src/services/simulator/auto/auto-actions";
export { stepOutcomes, candidates } from "../../src/services/craft-stage/engine";
