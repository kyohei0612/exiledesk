/**
 * tree-frac-dual.ts — フラクチャー予定の MOD の 2 つ持ち (S-10g、スイッチ fracDual、11-13 オーナー
 * 「フラクチャーでのMODもフラクチャーしないMODとしてもう一つ表示してティア決めれるように。ツリーではフラクチャー予定モッドっていう欄があるからそれを狙いとするやろ増強、変性、カオススパムで」)。
 * 狙いは 1 本のまま、✦ の印の狙いに普通側の段 (plainTier) を持つ。tier = ✦ 側 (フラクチャーの候補の段。始まり・フラクチャーの手・確定フラクチャーはこれで見る)。
 * - 当たりの札 (足す・入れ替える・カオススパムの手): 品に ✦ がもう付いている = 固定の後は普通側の段、まだ無い = 固定の前 (予定の MOD を狙う) は ✦ 側の段
 * - 外れの式・残したい MOD: どちらかの段を満たせば狙い (固定の前の候補も、固定の後の残りも外れに数えない) = 2 つのうち下の段
 * 予定外の MOD が固定された枠は今どおり外れ (フラクチャーの判定は変えない)。
 */
import { flag } from "../../../web/release-flags";
import type { StageItem } from "../../craft-stage/engine";
import type { Aim } from "./tree-model";

/** 2 つ持ちが効く狙い (✦ の印があり、普通側の段が ✦ 側と違う) */
const dual = (a: Aim): a is Aim & { plainTier: number } => flag("fracDual") && !!a.fractured && a.plainTier != null && a.plainTier !== a.tier;
/** 普通側の段 (無ければ ✦ 側と同じ) */
export const plainTierOf = (a: Aim): number => (flag("fracDual") && a.fractured && a.plainTier != null ? a.plainTier : a.tier);
/** 外れの式・残したい MOD で使う段 = 2 つのうち下の段 (T の数の大きい方) */
export const looseTierOf = (a: Aim): number => (dual(a) ? Math.max(a.tier, a.plainTier) : a.tier);
/** 品に ✦ (固定された MOD) が付いているか */
const hasFixed = (it: StageItem): boolean => [...it.prefixes, ...it.suffixes].some((m) => m.fractured);
/**
 * 当たりの札の段: 固定の後 (品に ✦) は普通側、固定の前は ✦ 側。goal = 同じ MOD の完成の狙い (無ければ a のまま)。✦ の印は付けない (当たりの箱の札)
 */
export function phaseAim(a: Aim, goal: Aim | undefined, it: StageItem): Aim {
  if (!goal || !dual(goal)) return a;
  return { modId: a.modId, tier: hasFixed(it) ? goal.plainTier : goal.tier };
}
/**
 * 完成形の狙いが品に付いているかを見る時の段 (スイッチ fracPlainMark): 当たりの札 (phaseAim) と同じく、品に ✦ があれば普通側・無ければ ✦ 側。
 * 名前の印 (tree-judge の goalsOn = 箱の中身の比べ・100 人回しの印) に使う。前は ✦ 側の段だけで見て、✦ が付いた後のカオスで普通側の段
 * (T3) の狙いが付いた当たりの箱が、名前の印を落として親のカオスの箱と同じ中身になり、まとめられて消えた (11-18 オーナー「これは明確にバグ」r/7M2JJAoj)
 */
export const heldGoal = <A extends Aim>(goal: A, it: StageItem): A => (flag("fracPlainMark") && dual(goal) && hasFixed(it) ? { ...goal, tier: goal.plainTier } : goal);
