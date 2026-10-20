/**
 * _yafu-entry.ts — check-yafu-actual.mjs が束ねる入口 (解析君、2026-10-20)。④ の計算と ⑤ の回し方に、③ の白からの式の 1 手の確率 (sim-odds) を足す
 */
export * from "./_auto-order-entry";
export { blankWith, fractureOdds, magicAugOdds } from "../../src/services/simulator/sim-odds";
export { startFrom } from "../../src/services/craft-stage/run-plan";
