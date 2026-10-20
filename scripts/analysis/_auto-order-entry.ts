/**
 * _auto-order-entry.ts — check-auto-order.mjs が束ねる入口 (解析君、2026-10-20)。
 * 計算 (src/services/simulator/auto/) と、⑤ の回し方 (quizFromSim + runQuizOnce) を同じ束に入れる
 */
export { loadPatch } from "../../tests/helpers/patch";
export { buildAutoModel } from "../../src/services/simulator/auto/auto-model";
export { orderDetail, solveOrder } from "../../src/services/simulator/auto/auto-solve";
export { quizActionOf } from "../../src/services/simulator/auto/auto-actions";
export { quizFromSim } from "../../src/services/simulator/quiz-build";
export { runQuizOnce } from "../../src/services/simulator/quiz-recipe";
export { orderCandidates } from "../../src/services/simulator/auto/auto-order";
export { runeEnForId } from "../../src/services/simulator/pattern";
