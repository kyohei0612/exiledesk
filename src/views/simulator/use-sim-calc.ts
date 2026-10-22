/**
 * use-sim-calc.ts — ③ ベースの値段の費用 (calc) を画面の状態から出す。式は services/simulator/start-cost.ts の startCalc (2026-10-22 に出した)。
 * use-sim-run.ts から分けた (2026-10-20、500 行の決まり)
 */
import { computed } from "vue";
import { craftStage, nameOf, priceOf } from "../../state/craft-stage";
import { startCalc } from "../../services/simulator/start-cost";
import type { SimTargetIn } from "../../services/simulator/quiz-build";
import type { SimTargetsCtx } from "./use-sim-targets";

export type { KeepPlan } from "../../services/simulator/start-cost";

export function useSimCalc(d0: SimTargetsCtx, simIn: () => SimTargetIn[]) {
  const { fracMembers, fractureRow, wholeRoute, whiteDivine, fourDivine, num } = d0;
  const s = craftStage;
  /** 計算は start-cost.ts の startCalc (式の説明もそこ)。白から全部 ⑤ で答える時 (増強スパムの狙いがある) は式で出さない (費用は ⑤ の答えで決まる。2026-10-21) */
  const calc = computed(() => {
    const d = s.data.value, it = s.item.value, f = fractureRow.value;
    if (!d || !it || !f || wholeRoute.value) return null;
    return startCalc({ data: d, item: it, itemLevel: s.itemLevel.value, fracModId: f.modId, fracMembers: fracMembers.value, allTargets: s.simTargets.value, targets: simIn(), white: num(whiteDivine.value), four: num(fourDivine.value), price: priceOf, name: nameOf });
  });
  return { calc };
}
